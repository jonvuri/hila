import type { Database } from '@sqlite.org/sqlite-wasm'

import { parseKey } from './lexorank'
import {
  dropChangeTrackingTriggers,
  installDataTableTriggers,
  reinstallDataTableTriggers,
} from './sync'
import { createTreePosition, removeTreePosition } from './tree'
import { ensureTrait, hasTrait } from './traits'
import { withTransaction } from './transaction'

/**
 * SQL expression that generates a random positive integer fitting in
 * JavaScript's Number.MAX_SAFE_INTEGER (2^53 − 1).
 *
 * SQLite's random() returns a 64-bit signed integer. abs() makes it positive
 * (63 bits). The >> 10 right-shift drops the low 10 bits, leaving 53 bits —
 * the maximum integer precision of a JS double. The + 1 guarantees the result
 * is always ≥ 1 (never zero).
 *
 * Use as a SQL value expression (e.g. in INSERT) or as a column DEFAULT.
 */
export const SQL_RANDOM_ID = '(abs(random()) >> 10) + 1'

// Initialize database with the core tables required for matrixes
export const initMatrixSchema = (db: Database) => {
  // Set pragmas for better behavior and performance
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
  `)

  // Create core matrix tables
  db.exec(`
    -- ------------------------------------------------------------
    -- Plugin registry
    -- ------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS plugins (
      id       TEXT PRIMARY KEY,
      name     TEXT NOT NULL,
      version  TEXT NOT NULL,
      enabled  INTEGER NOT NULL DEFAULT 1,
      metadata TEXT
    ) STRICT;

    -- ------------------------------------------------------------
    -- Matrix registry
    -- ------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS matrix (
      id               INTEGER PRIMARY KEY DEFAULT (${SQL_RANDOM_ID}),
      title            TEXT NOT NULL DEFAULT '',
      source_plugin_id TEXT REFERENCES plugins(id) ON DELETE SET NULL
    ) STRICT;

    -- ------------------------------------------------------------
    -- Column definitions (normalized, one row per column)
    -- ------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS matrix_columns (
      matrix_id    INTEGER NOT NULL REFERENCES matrix(id) ON DELETE CASCADE,
      name         TEXT    NOT NULL,
      type         TEXT    NOT NULL,
      display_type TEXT    NOT NULL DEFAULT 'text',
      "order"      INTEGER NOT NULL,
      options      TEXT,
      formula      TEXT,
      PRIMARY KEY (matrix_id, name)
    ) STRICT;

    -- ------------------------------------------------------------
    -- Global rank table
    -- ------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS rank (
      key           BLOB PRIMARY KEY,  -- global sort key, or position id
      matrix_id     INTEGER NOT NULL REFERENCES matrix(id) ON DELETE CASCADE,
      row_kind      INTEGER NOT NULL CHECK (row_kind IN (0,1)),  -- 0=row, 1=child_matrix_ref
      row_id        INTEGER NOT NULL,  -- rowid in the matrix data table, or matrix id of the child matrix

      -- minimal key validity: must end with a single terminator
      CHECK (length(key) > 0 AND substr(key, length(key), 1) = x'00')
    ) STRICT;

    -- ------------------------------------------------------------
    -- Trait provisioning registry
    -- ------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS matrix_traits (
      matrix_id  INTEGER NOT NULL REFERENCES matrix(id),
      trait_type TEXT NOT NULL CHECK (trait_type IN ('rank', 'closure')),
      PRIMARY KEY (matrix_id, trait_type)
    ) STRICT;

    -- ------------------------------------------------------------
    -- Global join table (cross-matrix row references)
    -- ------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS joins (
      source_matrix_id  INTEGER NOT NULL,
      source_row_id     INTEGER NOT NULL,
      target_matrix_id  INTEGER NOT NULL,
      target_row_id     INTEGER NOT NULL,
      kind              TEXT NOT NULL DEFAULT 'ref',
      PRIMARY KEY (source_matrix_id, source_row_id, target_matrix_id, target_row_id)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS joins_by_target
      ON joins(target_matrix_id, target_row_id);

    -- ------------------------------------------------------------
    -- Sync state (device identity, high-water marks, etc.)
    -- ------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS _sync_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;

    -- ------------------------------------------------------------
    -- Sync changelog (trigger-based mutation log)
    -- seq uses AUTOINCREMENT intentionally: monotonic sequence
    -- number for ordering changes, never reused after deletion.
    -- ------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS _sync_changelog (
      seq        INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id  TEXT NOT NULL,
      timestamp  TEXT NOT NULL DEFAULT (datetime('now')),
      table_name TEXT NOT NULL,
      row_id     INTEGER NOT NULL,
      operation  TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
      data       TEXT
    ) STRICT;

    -- ------------------------------------------------------------
    -- Sync conflicts (LWW conflict records with losing version)
    -- ------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS _sync_conflicts (
      id           INTEGER PRIMARY KEY DEFAULT (abs(random())),
      table_name   TEXT NOT NULL,
      row_id       INTEGER NOT NULL,
      winner       TEXT NOT NULL CHECK (winner IN ('local', 'remote')),
      losing_data  TEXT NOT NULL,
      winning_data TEXT NOT NULL,
      detected_at  TEXT NOT NULL DEFAULT (datetime('now')),
      resolved     INTEGER NOT NULL DEFAULT 0
    ) STRICT;

    -- ------------------------------------------------------------
    -- Face configurations (face type bound to matrix with slot bindings)
    -- ------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS face_configs (
      id               TEXT PRIMARY KEY,
      face_type_id     TEXT NOT NULL,
      matrix_id        INTEGER NOT NULL REFERENCES matrix(id),
      query            TEXT NOT NULL,
      slot_bindings    TEXT NOT NULL,  -- JSON
      settings         TEXT,           -- JSON
      created_by_plugin TEXT REFERENCES plugins(id)
    ) STRICT;

    -- ------------------------------------------------------------
    -- Sync applying flag (presence of a row suppresses triggers)
    -- ------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS _sync_applying (
      flag INTEGER PRIMARY KEY DEFAULT 1
    ) STRICT;
  `)

  // Migration: add source_plugin_id to existing matrix tables that lack it
  try {
    db.exec(
      'ALTER TABLE matrix ADD COLUMN source_plugin_id TEXT REFERENCES plugins(id) ON DELETE SET NULL',
    )
  } catch {
    // Column already exists (new database or previously migrated)
  }

  // Migration: add formula column to matrix_columns
  try {
    db.exec('ALTER TABLE matrix_columns ADD COLUMN formula TEXT')
  } catch {
    // Column already exists (new database or previously migrated)
  }

  // Migration: add kind column to joins table
  try {
    db.exec("ALTER TABLE joins ADD COLUMN kind TEXT NOT NULL DEFAULT 'ref'")
  } catch {
    // Column already exists (new database or previously migrated)
  }
}

/**
 * Retrieve the persistent device ID from `_sync_state`, creating one on first
 * run via `crypto.randomUUID()`. The result is cached in-process so subsequent
 * calls skip the database round-trip.
 */
let cachedDeviceId: string | null = null
export const getOrCreateDeviceId = (db: Database): string => {
  if (cachedDeviceId) return cachedDeviceId

  const stmt = db.prepare("SELECT value FROM _sync_state WHERE key = 'device_id'")
  if (stmt.step()) {
    const row = stmt.get({}) as { value: string }
    cachedDeviceId = row.value
    stmt.finalize()
    return cachedDeviceId
  }
  stmt.finalize()

  const id = crypto.randomUUID()
  db.exec("INSERT INTO _sync_state (key, value) VALUES ('device_id', ?)", {
    bind: [id],
  })
  cachedDeviceId = id
  return id
}

/**
 * Reset the cached device ID. Intended for tests only — lets a fresh
 * `getOrCreateDeviceId` call read from the database again.
 */
export const resetDeviceIdCache = (): void => {
  cachedDeviceId = null
}

// Stored column definition (includes display order)
export type ColumnDefinition = {
  name: string
  type: string
  displayType: string
  order: number
  options: string | null
  formula: string | null
}

const sqliteTypeToDisplayType = (sqliteType: string): string => {
  const upper = sqliteType.toUpperCase()
  if (upper === 'INTEGER') return 'number'
  if (upper === 'REAL') return 'number'
  return 'text'
}

type SqlValue = string | number | null | Uint8Array | bigint

const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`

// Create a new matrix with its associated per-matrix tables
export const createMatrix = (
  db: Database,
  title: string,
  columns: { name: string; type: string }[] = [{ name: 'title', type: 'TEXT' }],
): number => {
  return withTransaction(db, () => {
    const insertStmt = db.prepare(
      `INSERT INTO matrix (id, title) VALUES (${SQL_RANDOM_ID}, ?) RETURNING id`,
    )
    insertStmt.bind([title])
    if (!insertStmt.step()) {
      insertStmt.finalize()
      throw new Error('Failed to insert matrix record')
    }
    const result = insertStmt.get({}) as unknown as { id: number }
    const matrixId = result.id
    insertStmt.finalize()

    // Store column definitions in the normalized table
    const colStmt = db.prepare(
      'INSERT INTO matrix_columns (matrix_id, name, type, display_type, "order") VALUES (?, ?, ?, ?, ?)',
    )
    for (let i = 0; i < columns.length; i++) {
      colStmt.bind([
        matrixId,
        columns[i]!.name,
        columns[i]!.type,
        sqliteTypeToDisplayType(columns[i]!.type),
        i,
      ])
      colStmt.step()
      colStmt.reset()
    }
    colStmt.finalize()

    const columnDefs = columns
      .map((col) => `${quoteIdent(col.name)} ${col.type}`)
      .join(',\n        ')

    db.exec(`
      CREATE TABLE IF NOT EXISTS "mx_${matrixId}_data" (
        id INTEGER PRIMARY KEY DEFAULT (${SQL_RANDOM_ID}),
        ${columnDefs}
      ) STRICT;
    `)

    const deviceId = getOrCreateDeviceId(db)
    installDataTableTriggers(db, matrixId, deviceId, columns)

    return matrixId
  })
}

// Ensure the root matrix exists (creates it if it doesn't)
export const ensureRootMatrix = (db: Database): number => {
  // Check if matrix with ID = 1 exists
  const checkStmt = db.prepare('SELECT id FROM matrix WHERE id = 1')
  const exists = checkStmt.step()
  checkStmt.finalize()

  if (exists) {
    const deviceId = getOrCreateDeviceId(db)
    const columns = getColumns(db, 1)
    installDataTableTriggers(db, 1, deviceId, columns)
    ensureTrait(db, 'rank', 1)
    ensureTrait(db, 'closure', 1)
    return 1
  }

  return withTransaction(db, () => {
    const insertStmt = db.prepare('INSERT INTO matrix (id, title) VALUES (1, ?) RETURNING id')
    insertStmt.bind(['Root'])
    if (!insertStmt.step()) {
      insertStmt.finalize()
      throw new Error('Failed to insert root matrix record')
    }
    insertStmt.finalize()

    db.exec(
      `INSERT INTO matrix_columns (matrix_id, name, type, display_type, "order") VALUES (1, 'content', 'TEXT', 'text', 0)`,
    )

    const matrixId = 1

    db.exec(`
      CREATE TABLE IF NOT EXISTS "mx_${matrixId}_data" (
        id INTEGER PRIMARY KEY DEFAULT (${SQL_RANDOM_ID}),
        content TEXT
      ) STRICT;
    `)

    const deviceId = getOrCreateDeviceId(db)
    installDataTableTriggers(db, matrixId, deviceId, [{ name: 'content', type: 'TEXT' }])

    ensureTrait(db, 'rank', matrixId)
    ensureTrait(db, 'closure', matrixId)

    return matrixId
  })
}

/**
 * Insert a new data row into a matrix's data table.
 *
 * @returns The new row's id
 */
export const insertDataRow = (
  db: Database,
  matrixId: number,
  values?: Record<string, unknown>,
): number => {
  const entries = Object.entries(values || {})

  if (entries.length > 0) {
    const columns = ['id', ...entries.map(([name]) => quoteIdent(name))].join(', ')
    const placeholders = [SQL_RANDOM_ID, ...entries.map(() => '?')].join(', ')
    const stmt = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (${columns}) VALUES (${placeholders}) RETURNING id`,
    )
    stmt.bind(entries.map(([, value]) => value as SqlValue))
    if (!stmt.step()) {
      stmt.finalize()
      throw new Error('Failed to insert data row')
    }
    const rowId = (stmt.get({}) as { id: number }).id
    stmt.finalize()
    return rowId
  } else {
    const stmt = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (id) VALUES (${SQL_RANDOM_ID}) RETURNING id`,
    )
    if (!stmt.step()) {
      stmt.finalize()
      throw new Error('Failed to insert data row')
    }
    const rowId = (stmt.get({}) as { id: number }).id
    stmt.finalize()
    return rowId
  }
}

/**
 * Update column values for a data row in a matrix.
 * Validates column names against the matrix schema before executing.
 * Rejects writes to formula (computed) columns.
 */
export const updateRow = (
  db: Database,
  params: {
    matrixId: number
    rowId: number
    values: Record<string, unknown>
  },
): void => {
  const { matrixId, rowId, values } = params
  const entries = Object.entries(values)
  if (entries.length === 0) return

  const columns = getColumns(db, matrixId)
  const columnMap = new Map(columns.map((c) => [c.name, c]))
  for (const [name] of entries) {
    const col = columnMap.get(name)
    if (!col) {
      throw new Error(`Column "${name}" does not exist in matrix ${matrixId}`)
    }
    if (col.formula !== null) {
      throw new Error(`Column "${name}" is a formula column and cannot be edited`)
    }
  }

  const setClauses = entries.map(([name]) => `${quoteIdent(name)} = ?`).join(', ')
  const bindValues = [...entries.map(([, value]) => value as SqlValue), rowId]

  db.exec(`UPDATE "mx_${matrixId}_data" SET ${setClauses} WHERE id = ?`, {
    bind: bindValues,
  })
}

/**
 * Unified row insert: creates a data row and auto-handles provisioned traits.
 *
 * If the matrix has the rank trait, a rank entry is created. Pass positioning
 * params (parentKey, prevKey, nextKey) for explicit tree placement; if omitted,
 * the row is appended at root level.
 *
 * If the matrix has the closure trait, closure entries are created based on the
 * parentKey (or as a root-level row if no parentKey).
 *
 * @returns The new row's data ID and rank key (null if no rank trait).
 */
export const insertRow = (
  db: Database,
  matrixId: number,
  opts?: {
    values?: Record<string, unknown>
    parentKey?: Uint8Array
    prevKey?: Uint8Array
    nextKey?: Uint8Array
  },
): { rowId: number; key: Uint8Array | null } => {
  return withTransaction(db, () => {
    const rowId = insertDataRow(db, matrixId, opts?.values)
    let key: Uint8Array | null = null

    if (hasTrait(db, matrixId, 'rank')) {
      key = createTreePosition(db, matrixId, rowId, {
        parentKey: opts?.parentKey,
        prevKey: opts?.prevKey,
        nextKey: opts?.nextKey,
      })
    }

    return { rowId, key }
  })
}

// -- Inline ref reverse cleanup -----------------------------------------------

type FilterResult = { doc: unknown; changed: boolean }

/**
 * Recursively walk a PM JSON doc, removing `inlineref` nodes whose attrs
 * match the given target. Returns a new doc tree and a `changed` flag.
 */
const filterInlineRefNode = (
  node: unknown,
  targetMatrixId: number,
  targetRowId: number,
): FilterResult => {
  if (node == null || typeof node !== 'object') return { doc: node, changed: false }
  if (Array.isArray(node)) {
    let changed = false
    const out: unknown[] = []
    for (const child of node) {
      const r = filterInlineRefNode(child, targetMatrixId, targetRowId)
      if (r.changed) changed = true
      if (r.doc !== undefined) out.push(r.doc)
    }
    return { doc: out, changed }
  }

  const obj = node as Record<string, unknown>

  if (
    obj.type === 'inlineref' &&
    obj.attrs &&
    typeof obj.attrs === 'object' &&
    (obj.attrs as Record<string, unknown>).targetMatrixId === targetMatrixId &&
    (obj.attrs as Record<string, unknown>).targetRowId === targetRowId
  ) {
    return { doc: undefined, changed: true }
  }

  let changed = false
  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(obj)) {
    if (key === 'content' && Array.isArray(val)) {
      const filtered = filterInlineRefNode(val, targetMatrixId, targetRowId)
      result[key] = filtered.doc
      if (filtered.changed) changed = true
    } else {
      result[key] = val
    }
  }
  return { doc: result, changed }
}

/**
 * Remove an `inlineref` node from a source row's PM JSON content.
 *
 * Loads the source row, parses the content/body column as PM JSON, filters
 * out the matching `inlineref` node, and saves the modified doc. If the
 * source row has no rich text column or the content is not PM JSON, this is
 * a no-op.
 */
export const removeInlineRefFromDoc = (
  db: Database,
  sourceMatrixId: number,
  sourceRowId: number,
  targetMatrixId: number,
  targetRowId: number,
): void => {
  const columns = getColumns(db, sourceMatrixId)
  const contentCol = columns.find((c) => c.name === 'content' || c.name === 'body')
  if (!contentCol) return

  const colName = contentCol.name
  const stmt = db.prepare(
    `SELECT ${quoteIdent(colName)} FROM "mx_${sourceMatrixId}_data" WHERE id = ?`,
  )
  stmt.bind([sourceRowId])
  if (!stmt.step()) {
    stmt.finalize()
    return
  }
  const raw = (stmt.get({}) as Record<string, unknown>)[colName]
  stmt.finalize()
  if (typeof raw !== 'string') return

  let doc: unknown
  try {
    doc = JSON.parse(raw)
  } catch {
    return
  }

  const modified = filterInlineRefNode(doc, targetMatrixId, targetRowId)
  if (!modified.changed) return

  db.exec(`UPDATE "mx_${sourceMatrixId}_data" SET ${quoteIdent(colName)} = ? WHERE id = ?`, {
    bind: [JSON.stringify(modified.doc), sourceRowId],
  })
}

const MAX_CASCADE_DEPTH = 100

/**
 * Unified row delete: removes a data row and auto-cleans provisioned traits.
 *
 * If the matrix has rank+closure traits, children are reparented to the deleted
 * row's parent (or promoted to root) before the rank and closure entries are
 * removed. Join references involving the row are also cleaned up.
 *
 * Owned targets (joins with kind='own' where this row is the source) are
 * cascade-deleted recursively before the row itself is removed.
 */
export const deleteRow = (db: Database, matrixId: number, rowId: number): void => {
  withTransaction(db, () => {
    deleteRowCascade(db, matrixId, rowId, 0)
  })
}

const deleteRowCascade = (
  db: Database,
  matrixId: number,
  rowId: number,
  depth: number,
): void => {
  if (depth >= MAX_CASCADE_DEPTH) {
    throw new Error(`Cascade deletion depth exceeded ${MAX_CASCADE_DEPTH} — possible cycle`)
  }

  const ownedStmt = db.prepare(
    `SELECT target_matrix_id, target_row_id FROM joins
     WHERE source_matrix_id = ? AND source_row_id = ? AND kind = 'own'`,
  )
  ownedStmt.bind([matrixId, rowId])
  const ownedTargets: { matrixId: number; rowId: number }[] = []
  while (ownedStmt.step()) {
    const row = ownedStmt.get({}) as {
      target_matrix_id: number
      target_row_id: number
    }
    ownedTargets.push({ matrixId: row.target_matrix_id, rowId: row.target_row_id })
  }
  ownedStmt.finalize()

  for (const target of ownedTargets) {
    deleteRowCascade(db, target.matrixId, target.rowId, depth + 1)
  }

  // Reverse cleanup: if this row is an own-kind target, remove the inlineref
  // node from each source row's rich text content.
  const sourceStmt = db.prepare(
    `SELECT source_matrix_id, source_row_id FROM joins
     WHERE target_matrix_id = ? AND target_row_id = ? AND kind = 'own'`,
  )
  sourceStmt.bind([matrixId, rowId])
  const ownSources: { sourceMatrixId: number; sourceRowId: number }[] = []
  while (sourceStmt.step()) {
    const src = sourceStmt.get({}) as {
      source_matrix_id: number
      source_row_id: number
    }
    ownSources.push({ sourceMatrixId: src.source_matrix_id, sourceRowId: src.source_row_id })
  }
  sourceStmt.finalize()

  for (const src of ownSources) {
    removeInlineRefFromDoc(db, src.sourceMatrixId, src.sourceRowId, matrixId, rowId)
  }

  if (hasTrait(db, matrixId, 'rank')) {
    removeTreePosition(db, matrixId, rowId)
  }

  db.exec(`DELETE FROM "mx_${matrixId}_data" WHERE id = ?`, {
    bind: [rowId],
  })

  db.exec(
    `DELETE FROM joins
     WHERE (source_matrix_id = ? AND source_row_id = ?)
        OR (target_matrix_id = ? AND target_row_id = ?)`,
    { bind: [matrixId, rowId, matrixId, rowId] },
  )
}

export const addSampleRowsToMatrix = (db: Database, matrixId: number) => {
  withTransaction(db, () => {
    // Get existing rank keys to determine parent candidates and insertion points
    const existingStmt = db.prepare(
      'SELECT key FROM rank WHERE matrix_id = ? AND row_kind = 0 ORDER BY key',
    )
    existingStmt.bind([matrixId])
    const existingKeys: Uint8Array[] = []
    while (existingStmt.step()) {
      existingKeys.push(new Uint8Array((existingStmt.get({}) as { key: Uint8Array }).key))
    }
    existingStmt.finalize()

    // Look up matrix columns to generate appropriate sample data
    const colStmt = db.prepare(
      'SELECT name, type FROM matrix_columns WHERE matrix_id = ? ORDER BY "order"',
    )
    colStmt.bind([matrixId])
    const columns: { name: string; type: string }[] = []
    while (colStmt.step()) {
      columns.push(colStmt.get({}) as unknown as { name: string; type: string })
    }
    colStmt.finalize()

    if (columns.length === 0) {
      throw new Error(`Matrix ${matrixId} has no columns`)
    }

    const makeSampleValues = (): Record<string, unknown> => {
      const randomSuffix = Math.floor(Math.random() * 1000)
      const values: Record<string, unknown> = {}
      for (const col of columns) {
        if (col.name === 'content') {
          values[col.name] = JSON.stringify({
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: `Sample row ${randomSuffix}` }],
              },
            ],
          })
        } else {
          values[col.name] = `Sample row ${randomSuffix}`
        }
      }
      return values
    }

    // Root-level keys have exactly one segment (no parent in the closure table).
    // Using a child key as prevKey for root-level insertion would place the new
    // key inside a subtree's key range, breaking SQL-side collapse filtering.
    const rootKeys = existingKeys.filter((k) => parseKey(k).length === 1)

    const rowsToAdd = Math.floor(Math.random() * 2) + 2 // 2-3 rows
    let lastInsertedRootKey: Uint8Array | undefined

    for (let i = 0; i < rowsToAdd; i++) {
      const dataRowId = insertDataRow(db, matrixId, makeSampleValues())

      if (existingKeys.length > 0 && i === rowsToAdd - 1) {
        // Make the last row a child of a random existing row
        const parentKey = existingKeys[Math.floor(Math.random() * existingKeys.length)]!
        const key = createTreePosition(db, matrixId, dataRowId, { parentKey })
        existingKeys.push(key)
      } else {
        // Append as a root-level row after the last root-level key
        const prevKey = lastInsertedRootKey ?? rootKeys[rootKeys.length - 1]
        const key = createTreePosition(db, matrixId, dataRowId, { prevKey })
        existingKeys.push(key)
        rootKeys.push(key)
        lastInsertedRootKey = key
      }
    }
  })
}

// Get all matrices for the debug UI
export const getAllMatrices = (db: Database) => {
  const stmt = db.prepare('SELECT id, title FROM matrix ORDER BY id')
  const matrices: { id: number; title: string }[] = []
  while (stmt.step()) {
    matrices.push(stmt.get({}) as unknown as { id: number; title: string })
  }
  stmt.finalize()
  return matrices
}

// -- Column schema management -------------------------------------------------

/** Return the ordered column definitions for a matrix. */
export const getColumns = (db: Database, matrixId: number): ColumnDefinition[] => {
  // Verify the matrix exists
  const existsStmt = db.prepare('SELECT 1 FROM matrix WHERE id = ?')
  existsStmt.bind([matrixId])
  if (!existsStmt.step()) {
    existsStmt.finalize()
    throw new Error(`Matrix ${matrixId} not found`)
  }
  existsStmt.finalize()

  const stmt = db.prepare(
    'SELECT name, type, display_type AS displayType, "order", options, formula FROM matrix_columns WHERE matrix_id = ? ORDER BY "order"',
  )
  stmt.bind([matrixId])

  const cols: ColumnDefinition[] = []
  while (stmt.step()) {
    cols.push(stmt.get({}) as ColumnDefinition)
  }
  stmt.finalize()
  return cols
}

/** Add a column to a matrix's data table and registry. */
export const addColumn = (
  db: Database,
  matrixId: number,
  column: { name: string; type: string; displayType?: string; options?: string },
): void => {
  withTransaction(db, () => {
    const current = getColumns(db, matrixId)

    if (current.some((c) => c.name === column.name)) {
      throw new Error(`Column "${column.name}" already exists in matrix ${matrixId}`)
    }

    db.exec(
      `ALTER TABLE "mx_${matrixId}_data" ADD COLUMN ${quoteIdent(column.name)} ${column.type}`,
    )

    const displayType = column.displayType ?? sqliteTypeToDisplayType(column.type)
    const nextOrder = current.length > 0 ? Math.max(...current.map((c) => c.order)) + 1 : 0
    db.exec(
      'INSERT INTO matrix_columns (matrix_id, name, type, display_type, "order", options) VALUES (?, ?, ?, ?, ?, ?)',
      {
        bind: [
          matrixId,
          column.name,
          column.type,
          displayType,
          nextOrder,
          column.options ?? null,
        ],
      },
    )

    const deviceId = getOrCreateDeviceId(db)
    reinstallDataTableTriggers(db, matrixId, deviceId, [...current, column])
  })
}

/** Remove a column from a matrix's data table and registry. */
export const removeColumn = (db: Database, matrixId: number, columnName: string): void => {
  withTransaction(db, () => {
    const current = getColumns(db, matrixId)
    const col = current.find((c) => c.name === columnName)

    if (!col) {
      throw new Error(`Column "${columnName}" not found in matrix ${matrixId}`)
    }

    const isFormula = col.formula !== null

    if (!isFormula) {
      // Drop triggers before ALTER TABLE — existing triggers reference the
      // column being dropped and SQLite validates them after DROP COLUMN.
      dropChangeTrackingTriggers(db, `mx_${matrixId}_data`)

      db.exec(`ALTER TABLE "mx_${matrixId}_data" DROP COLUMN ${quoteIdent(columnName)}`)
    }

    db.exec('DELETE FROM matrix_columns WHERE matrix_id = ? AND name = ?', {
      bind: [matrixId, columnName],
    })

    if (!isFormula) {
      const deviceId = getOrCreateDeviceId(db)
      const remaining = current.filter((c) => c.name !== columnName)
      installDataTableTriggers(db, matrixId, deviceId, remaining)
    }
  })
}

/** Rename a column in a matrix's data table and registry. */
export const renameColumn = (
  db: Database,
  matrixId: number,
  oldName: string,
  newName: string,
): void => {
  withTransaction(db, () => {
    const current = getColumns(db, matrixId)

    if (!current.some((c) => c.name === oldName)) {
      throw new Error(`Column "${oldName}" not found in matrix ${matrixId}`)
    }
    if (current.some((c) => c.name === newName)) {
      throw new Error(`Column "${newName}" already exists in matrix ${matrixId}`)
    }

    // Drop triggers before RENAME — existing triggers reference the old
    // column name which becomes invalid after ALTER TABLE RENAME COLUMN.
    dropChangeTrackingTriggers(db, `mx_${matrixId}_data`)

    db.exec(
      `ALTER TABLE "mx_${matrixId}_data" RENAME COLUMN ${quoteIdent(oldName)} TO ${quoteIdent(newName)}`,
    )

    db.exec('UPDATE matrix_columns SET name = ? WHERE matrix_id = ? AND name = ?', {
      bind: [newName, matrixId, oldName],
    })

    const deviceId = getOrCreateDeviceId(db)
    const updated = current.map((c) => (c.name === oldName ? { ...c, name: newName } : c))
    installDataTableTriggers(db, matrixId, deviceId, updated)
  })
}

/** Update the display type of a column. */
export const updateColumnDisplayType = (
  db: Database,
  matrixId: number,
  columnName: string,
  displayType: string,
): void => {
  const current = getColumns(db, matrixId)
  if (!current.some((c) => c.name === columnName)) {
    throw new Error(`Column "${columnName}" not found in matrix ${matrixId}`)
  }
  db.exec('UPDATE matrix_columns SET display_type = ? WHERE matrix_id = ? AND name = ?', {
    bind: [displayType, matrixId, columnName],
  })
}

/** Update the options (for select type) of a column. */
export const updateColumnOptions = (
  db: Database,
  matrixId: number,
  columnName: string,
  options: string | null,
): void => {
  const current = getColumns(db, matrixId)
  if (!current.some((c) => c.name === columnName)) {
    throw new Error(`Column "${columnName}" not found in matrix ${matrixId}`)
  }
  db.exec('UPDATE matrix_columns SET options = ? WHERE matrix_id = ? AND name = ?', {
    bind: [options, matrixId, columnName],
  })
}

/** Add a formula (computed) column. No physical column is created. */
export const addFormulaColumn = (
  db: Database,
  matrixId: number,
  name: string,
  formula: string,
): void => {
  withTransaction(db, () => {
    const current = getColumns(db, matrixId)

    if (current.some((c) => c.name === name)) {
      throw new Error(`Column "${name}" already exists in matrix ${matrixId}`)
    }

    // Validate the formula by attempting a read-only probe query
    try {
      const probeStmt = db.prepare(`SELECT (${formula}) FROM "mx_${matrixId}_data" LIMIT 0`)
      probeStmt.step()
      probeStmt.finalize()
    } catch (err) {
      throw new Error(
        `Invalid formula expression: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    const nextOrder = current.length > 0 ? Math.max(...current.map((c) => c.order)) + 1 : 0
    db.exec(
      'INSERT INTO matrix_columns (matrix_id, name, type, display_type, "order", formula) VALUES (?, ?, ?, ?, ?, ?)',
      {
        bind: [matrixId, name, 'TEXT', 'text', nextOrder, formula],
      },
    )
  })
}

/** Reorder columns by updating their order values. */
export const reorderColumns = (db: Database, matrixId: number, columnNames: string[]): void => {
  withTransaction(db, () => {
    const current = getColumns(db, matrixId)
    const existingNames = new Set(current.map((c) => c.name))
    for (const name of columnNames) {
      if (!existingNames.has(name)) {
        throw new Error(`Column "${name}" not found in matrix ${matrixId}`)
      }
    }
    const stmt = db.prepare(
      'UPDATE matrix_columns SET "order" = ? WHERE matrix_id = ? AND name = ?',
    )
    for (let i = 0; i < columnNames.length; i++) {
      stmt.bind([i, matrixId, columnNames[i]!])
      stmt.step()
      stmt.reset()
    }
    stmt.finalize()
  })
}

// -- Join operations ----------------------------------------------------------

export type JoinKind = 'ref' | 'own'

export type JoinRow = {
  source_matrix_id: number
  source_row_id: number
  target_matrix_id: number
  target_row_id: number
  kind: JoinKind
}

/**
 * Insert a join (cross-matrix row reference). Uses INSERT OR IGNORE so
 * re-inserting the same link is a silent no-op.
 */
export const insertJoin = (
  db: Database,
  sourceMatrixId: number,
  sourceRowId: number,
  targetMatrixId: number,
  targetRowId: number,
  kind: JoinKind = 'ref',
): void => {
  db.exec(
    `INSERT OR IGNORE INTO joins (source_matrix_id, source_row_id, target_matrix_id, target_row_id, kind)
     VALUES (?, ?, ?, ?, ?)`,
    { bind: [sourceMatrixId, sourceRowId, targetMatrixId, targetRowId, kind] },
  )
}

/**
 * Atomically create a new row in the target matrix and an `own`-kind join
 * from the source row to it. Enforces single-ownership: a target row may
 * have at most one `own` join pointing to it.
 *
 * @returns The new target row's id.
 */
export const createDependentRow = (
  db: Database,
  sourceMatrixId: number,
  sourceRowId: number,
  targetMatrixId: number,
  columnValues: Record<string, unknown> = {},
): number => {
  return withTransaction(db, () => {
    const { rowId: targetRowId } = insertRow(db, targetMatrixId, {
      values: columnValues,
    })

    insertJoin(db, sourceMatrixId, sourceRowId, targetMatrixId, targetRowId, 'own')

    return targetRowId
  })
}

/** Insert a ref-kind join (explicit alias for insertJoin with kind='ref'). */
export const createRefJoin = (
  db: Database,
  sourceMatrixId: number,
  sourceRowId: number,
  targetMatrixId: number,
  targetRowId: number,
): void => {
  insertJoin(db, sourceMatrixId, sourceRowId, targetMatrixId, targetRowId, 'ref')
}

/** Delete a specific join. */
export const deleteJoin = (
  db: Database,
  sourceMatrixId: number,
  sourceRowId: number,
  targetMatrixId: number,
  targetRowId: number,
): void => {
  db.exec(
    `DELETE FROM joins
     WHERE source_matrix_id = ? AND source_row_id = ?
       AND target_matrix_id = ? AND target_row_id = ?`,
    { bind: [sourceMatrixId, sourceRowId, targetMatrixId, targetRowId] },
  )
}

/**
 * Delete an owned target row, triggering its own cascades. Called when an
 * `own`-kind join is removed without deleting the source row (e.g. a `#`-tag
 * removed from rich text, or an own-kind cell cleared).
 */
export const deleteOwnedTarget = (
  db: Database,
  targetMatrixId: number,
  targetRowId: number,
): void => {
  deleteRow(db, targetMatrixId, targetRowId)
}

/**
 * Find and remove the `own`-kind join pointing to a target row. Returns the
 * join info so the calling plugin can clean up the source-side reference.
 * Returns null if no own-kind join targets this row.
 */
export const deleteJoinByTarget = (
  db: Database,
  targetMatrixId: number,
  targetRowId: number,
): JoinRow | null => {
  return withTransaction(db, () => {
    const stmt = db.prepare(
      `SELECT source_matrix_id, source_row_id, target_matrix_id, target_row_id, kind
       FROM joins
       WHERE target_matrix_id = ? AND target_row_id = ? AND kind = 'own'
       LIMIT 1`,
    )
    stmt.bind([targetMatrixId, targetRowId])

    if (!stmt.step()) {
      stmt.finalize()
      return null
    }

    const row = stmt.get({}) as {
      source_matrix_id: number
      source_row_id: number
      target_matrix_id: number
      target_row_id: number
      kind: JoinKind
    }
    stmt.finalize()

    const joinRow: JoinRow = {
      source_matrix_id: row.source_matrix_id,
      source_row_id: row.source_row_id,
      target_matrix_id: row.target_matrix_id,
      target_row_id: row.target_row_id,
      kind: row.kind,
    }

    removeInlineRefFromDoc(
      db,
      joinRow.source_matrix_id,
      joinRow.source_row_id,
      joinRow.target_matrix_id,
      joinRow.target_row_id,
    )

    deleteJoin(
      db,
      joinRow.source_matrix_id,
      joinRow.source_row_id,
      joinRow.target_matrix_id,
      joinRow.target_row_id,
    )

    return joinRow
  })
}

/** Forward lookup: all targets for a source row. */
export const getTargets = (
  db: Database,
  sourceMatrixId: number,
  sourceRowId: number,
): { targetMatrixId: number; targetRowId: number; kind: JoinKind }[] => {
  const stmt = db.prepare(
    `SELECT target_matrix_id, target_row_id, kind FROM joins
     WHERE source_matrix_id = ? AND source_row_id = ?`,
  )
  stmt.bind([sourceMatrixId, sourceRowId])

  const results: { targetMatrixId: number; targetRowId: number; kind: JoinKind }[] = []
  while (stmt.step()) {
    const row = stmt.get({}) as {
      target_matrix_id: number
      target_row_id: number
      kind: JoinKind
    }
    results.push({
      targetMatrixId: row.target_matrix_id,
      targetRowId: row.target_row_id,
      kind: row.kind,
    })
  }
  stmt.finalize()
  return results
}

/** Reverse lookup: all sources referencing a target row. */
export const getSources = (
  db: Database,
  targetMatrixId: number,
  targetRowId: number,
): { sourceMatrixId: number; sourceRowId: number; kind: JoinKind }[] => {
  const stmt = db.prepare(
    `SELECT source_matrix_id, source_row_id, kind FROM joins
     WHERE target_matrix_id = ? AND target_row_id = ?`,
  )
  stmt.bind([targetMatrixId, targetRowId])

  const results: { sourceMatrixId: number; sourceRowId: number; kind: JoinKind }[] = []
  while (stmt.step()) {
    const row = stmt.get({}) as {
      source_matrix_id: number
      source_row_id: number
      kind: JoinKind
    }
    results.push({
      sourceMatrixId: row.source_matrix_id,
      sourceRowId: row.source_row_id,
      kind: row.kind,
    })
  }
  stmt.finalize()
  return results
}
