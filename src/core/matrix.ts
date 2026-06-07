import type { Database } from '@sqlite.org/sqlite-wasm'

import { compileFormula, parseFormulaRefs } from '../table/formula'

import { ROOT_MATRIX_ID, ROOT_ROW_ID } from './ids'
import {
  dropChangeTrackingTriggers,
  installDataTableTriggers,
  reinstallDataTableTriggers,
} from './sync'
import {
  computeSiblingKey,
  createTreePosition,
  getOwnChildren,
  removeTreePosition,
  type NodeRef,
} from './tree'
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

// Re-exported from the dependency-free `ids` module (avoids a matrix<->tree
// import cycle while keeping the documented home of these constants here).
export { ROOT_MATRIX_ID, ROOT_ROW_ID }

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
      id           INTEGER PRIMARY KEY DEFAULT (${SQL_RANDOM_ID}),
      matrix_id    INTEGER NOT NULL REFERENCES matrix(id) ON DELETE CASCADE,
      name         TEXT    NOT NULL,
      type         TEXT    NOT NULL,
      display_type TEXT    NOT NULL DEFAULT 'text',
      "order"      INTEGER NOT NULL,
      options      TEXT,
      formula      TEXT,
      UNIQUE (matrix_id, name)
    ) STRICT;

    -- ------------------------------------------------------------
    -- Global closure table (transitive closure of own-edges)
    --
    -- A derived cache keyed by row identity. Every (ancestor, descendant)
    -- pair reachable via own-edges is stored with its depth. Maintained
    -- incrementally on structural edits; rebuildable from own-edges.
    -- ------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS closure (
      ancestor_matrix_id    INTEGER NOT NULL,
      ancestor_row_id       INTEGER NOT NULL,
      descendant_matrix_id  INTEGER NOT NULL,
      descendant_row_id     INTEGER NOT NULL,
      depth                 INTEGER NOT NULL CHECK (depth > 0),
      PRIMARY KEY (ancestor_matrix_id, ancestor_row_id, descendant_matrix_id, descendant_row_id)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS closure_by_descendant
      ON closure(descendant_matrix_id, descendant_row_id);

    -- ------------------------------------------------------------
    -- Global pre-order scroll index (materialized pre-order keys)
    --
    -- The global_lexkey is the concatenation of sibling edge_keys from
    -- the root sentinel down to the node. Pre-order = parent immediately
    -- precedes its first child; a subtree is a contiguous range.
    -- Drives windowed scrolling as a single keyset range scan.
    -- ------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS scroll_index (
      global_lexkey  BLOB NOT NULL PRIMARY KEY,
      matrix_id      INTEGER NOT NULL,
      row_id         INTEGER NOT NULL,
      depth          INTEGER NOT NULL DEFAULT 0
    ) STRICT;

    CREATE UNIQUE INDEX IF NOT EXISTS scroll_index_identity
      ON scroll_index(matrix_id, row_id);

    -- ------------------------------------------------------------
    -- Global join table (cross-matrix row references + the own-forest)
    --
    -- An own-edge is the universal tree edge: source = parent, target =
    -- child, and edge_key is the child's sibling-local lexorank order key
    -- (unique among the siblings sharing that own-parent, NOT global). A
    -- ref-edge is an unordered association and carries no edge_key.
    -- ------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS joins (
      source_matrix_id  INTEGER NOT NULL,
      source_row_id     INTEGER NOT NULL,
      target_matrix_id  INTEGER NOT NULL,
      target_row_id     INTEGER NOT NULL,
      kind              TEXT NOT NULL DEFAULT 'ref',
      edge_key          BLOB,
      PRIMARY KEY (source_matrix_id, source_row_id, target_matrix_id, target_row_id),

      -- own-edges carry a valid sibling key (non-empty, single 0x00 terminator);
      -- non-own edges carry none.
      CHECK (
        (kind = 'own'  AND edge_key IS NOT NULL
                        AND length(edge_key) > 0
                        AND substr(edge_key, length(edge_key), 1) = x'00')
        OR
        (kind != 'own' AND edge_key IS NULL)
      )
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

  // Migration: add edge_key column to joins table. The validity CHECK lives in
  // the fresh-DB CREATE TABLE only (SQLite cannot add a CHECK via ADD COLUMN);
  // existing databases are disposable/reset rather than data-migrated.
  try {
    db.exec('ALTER TABLE joins ADD COLUMN edge_key BLOB')
  } catch {
    // Column already exists (new database or previously migrated)
  }

  // Migration: add constraints column to matrix_columns
  try {
    db.exec('ALTER TABLE matrix_columns ADD COLUMN constraints TEXT')
  } catch {
    // Column already exists (new database or previously migrated)
  }

  // Migration: add managed_by column to matrix_columns
  try {
    db.exec(
      'ALTER TABLE matrix_columns ADD COLUMN managed_by TEXT REFERENCES plugins(id) ON DELETE SET NULL',
    )
  } catch {
    // Column already exists (new database or previously migrated)
  }

  // Migration: add role column to matrix_columns
  try {
    db.exec(
      "ALTER TABLE matrix_columns ADD COLUMN role TEXT CHECK (role IN ('label', 'content'))",
    )
  } catch {
    // Column already exists (new database or previously migrated)
  }

  // At most one column per role per matrix (null roles are unrestricted)
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS matrix_columns_role_unique
      ON matrix_columns (matrix_id, role)
      WHERE role IS NOT NULL;
  `)

  // Own-forest indexes (created after the edge_key migration so the column
  // exists on previously-created databases too).
  //
  //  - joins_own_children: makes "ordered children of parent P" a fast index
  //    range/sort (sibling keys are scoped per own-parent).
  //  - joins_single_owner: the schema-level single-parent tree property -- a
  //    target row may have at most one inbound own-edge.
  db.exec(`
    CREATE INDEX IF NOT EXISTS joins_own_children
      ON joins (source_matrix_id, source_row_id, edge_key)
      WHERE kind = 'own';

    CREATE UNIQUE INDEX IF NOT EXISTS joins_single_owner
      ON joins (target_matrix_id, target_row_id)
      WHERE kind = 'own';
  `)

  // -- Formula column dependency tracking -------------------------------------

  db.exec(`
    CREATE TABLE IF NOT EXISTS formula_column_deps (
      formula_col_id INTEGER NOT NULL REFERENCES matrix_columns(id) ON DELETE CASCADE,
      dep_col_id     INTEGER NOT NULL REFERENCES matrix_columns(id) ON DELETE RESTRICT,
      PRIMARY KEY (formula_col_id, dep_col_id)
    ) STRICT;
  `)

  // -- Normalized face config tables ------------------------------------------

  db.exec(`
    CREATE TABLE IF NOT EXISTS face_slot_bindings (
      face_config_id TEXT    NOT NULL REFERENCES face_configs(id) ON DELETE CASCADE,
      slot_name      TEXT    NOT NULL,
      column_id      INTEGER REFERENCES matrix_columns(id) ON DELETE SET NULL,
      PRIMARY KEY (face_config_id, slot_name)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS face_sort_config (
      face_config_id TEXT    NOT NULL REFERENCES face_configs(id) ON DELETE CASCADE,
      column_id      INTEGER NOT NULL REFERENCES matrix_columns(id) ON DELETE CASCADE,
      direction      TEXT    NOT NULL CHECK (direction IN ('ASC', 'DESC')),
      PRIMARY KEY (face_config_id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS face_filter_configs (
      id             INTEGER PRIMARY KEY,
      face_config_id TEXT    NOT NULL REFERENCES face_configs(id) ON DELETE CASCADE,
      column_id      INTEGER NOT NULL REFERENCES matrix_columns(id) ON DELETE CASCADE,
      operator       TEXT    NOT NULL,
      value          TEXT    NOT NULL
    ) STRICT;
  `)
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
  id: number
  name: string
  type: string
  displayType: string
  order: number
  options: string | null
  formula: string | null
  constraints: string | null
  managedBy: string | null
  role: 'label' | 'content' | null
}

/**
 * Typed error for SQLite constraint violations (NOT NULL, UNIQUE, CHECK).
 * The UI can distinguish this from generic errors to show user-friendly messages.
 */
export class ConstraintViolationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConstraintViolationError'
  }
}

const wrapConstraintError = (err: unknown): never => {
  if (err instanceof Error && /constraint/i.test(err.message)) {
    throw new ConstraintViolationError(err.message)
  }
  throw err
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
  columns: {
    name: string
    type: string
    constraints?: string
    role?: 'label' | 'content'
  }[] = [{ name: 'title', type: 'TEXT' }],
  options?: { managedBy?: string },
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
      'INSERT INTO matrix_columns (matrix_id, name, type, display_type, "order", constraints, managed_by, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (let i = 0; i < columns.length; i++) {
      colStmt.bind([
        matrixId,
        columns[i]!.name,
        columns[i]!.type,
        sqliteTypeToDisplayType(columns[i]!.type),
        i,
        columns[i]!.constraints ?? null,
        options?.managedBy ?? null,
        columns[i]!.role ?? null,
      ])
      colStmt.step()
      colStmt.reset()
    }
    colStmt.finalize()

    const columnDefs = columns
      .map((col) => {
        const def = `${quoteIdent(col.name)} ${col.type}`
        return col.constraints ? `${def} ${col.constraints}` : def
      })
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

  try {
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
  } catch (err) {
    return wrapConstraintError(err)
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

  try {
    db.exec(`UPDATE "mx_${matrixId}_data" SET ${setClauses} WHERE id = ?`, {
      bind: bindValues,
    })
  } catch (err) {
    wrapConstraintError(err)
  }
}

/**
 * Unified row insert: creates a data row and attaches it to the own-forest.
 *
 * Every row lives in the forest unconditionally -- an inbound own-edge is
 * created to `parent` (defaulting to the root sentinel) with a sibling-local
 * order key derived from the surrounding siblings. Pass `prevSiblingKey` /
 * `nextSiblingKey` (the edge keys of the neighbors under that parent) for
 * explicit placement; if omitted, the row is appended at the end of the
 * parent's children.
 *
 * @returns The new row's data ID and its sibling-local edge key.
 */
export const insertRow = (
  db: Database,
  matrixId: number,
  opts?: {
    values?: Record<string, unknown>
    parent?: NodeRef
    prevSiblingKey?: Uint8Array
    nextSiblingKey?: Uint8Array
  },
): { rowId: number; edgeKey: Uint8Array } => {
  return withTransaction(db, () => {
    const rowId = insertDataRow(db, matrixId, opts?.values)
    const edgeKey = createTreePosition(db, matrixId, rowId, {
      parent: opts?.parent,
      prevSiblingKey: opts?.prevSiblingKey,
      nextSiblingKey: opts?.nextSiblingKey,
    })
    return { rowId, edgeKey }
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
 * Unified row delete: removes a single node from the own-forest.
 *
 * Same-matrix own-children (outline bullets nested under this row) are promoted
 * to this row's own-parent, preserving order. Cross-matrix owned children (tag
 * aspect rows and other dedicated/hosted aspects) are cascade-deleted
 * recursively. The row's own-/ref-edges are then severed and its data row
 * removed.
 *
 * (The promote-vs-cascade split preserves today's behavior -- bullets promote,
 * owned aspects cascade -- and converges into one own-descendant walk in
 * Phase 8b.)
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

  // Cascade-delete cross-matrix owned children (e.g. tag aspect rows). Same-
  // matrix own-children are promoted by removeTreePosition below, not deleted.
  const crossMatrixChildren = getOwnChildren(db, { matrixId, rowId }).filter(
    (c) => c.matrixId !== matrixId,
  )
  for (const child of crossMatrixChildren) {
    deleteRowCascade(db, child.matrixId, child.rowId, depth + 1)
  }

  // Reverse cleanup: if a cross-matrix source owns this row via an own-edge,
  // remove the inlineref node from that source's rich text content. Excludes
  // the root sentinel (which is never a real matrix) and same-matrix parents.
  const sourceStmt = db.prepare(
    `SELECT source_matrix_id, source_row_id FROM joins
     WHERE target_matrix_id = ? AND target_row_id = ? AND kind = 'own'
       AND source_matrix_id != ?
       AND NOT (source_matrix_id = ${ROOT_MATRIX_ID} AND source_row_id = ${ROOT_ROW_ID})`,
  )
  sourceStmt.bind([matrixId, rowId, matrixId])
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

  // Promote same-matrix own-children to the grandparent and sever this node's
  // own-edges.
  removeTreePosition(db, matrixId, rowId)

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
    // Existing rows already in the own-forest (candidates to nest under).
    const existingStmt = db.prepare(
      `SELECT target_row_id AS row_id FROM joins
       WHERE target_matrix_id = ? AND kind = 'own'`,
    )
    existingStmt.bind([matrixId])
    const existingRowIds: number[] = []
    while (existingStmt.step()) {
      existingRowIds.push((existingStmt.get({}) as { row_id: number }).row_id)
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
        if (col.name === 'content' || col.name === 'label') {
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

    const rowsToAdd = Math.floor(Math.random() * 2) + 2 // 2-3 rows

    for (let i = 0; i < rowsToAdd; i++) {
      if (existingRowIds.length > 0 && i === rowsToAdd - 1) {
        // Make the last row a child of a random existing row.
        const parentRowId = existingRowIds[Math.floor(Math.random() * existingRowIds.length)]!
        const { rowId } = insertRow(db, matrixId, {
          values: makeSampleValues(),
          parent: { matrixId, rowId: parentRowId },
        })
        existingRowIds.push(rowId)
      } else {
        // Append as a top-level row (child of the root sentinel).
        const { rowId } = insertRow(db, matrixId, { values: makeSampleValues() })
        existingRowIds.push(rowId)
      }
    }
  })
}

/** Update a matrix's user-visible title. */
export const renameMatrix = (db: Database, matrixId: number, title: string): void => {
  db.exec('UPDATE matrix SET title = ? WHERE id = ?', { bind: [title, matrixId] })
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
    'SELECT id, name, type, display_type AS displayType, "order", options, formula, constraints, managed_by AS managedBy, role FROM matrix_columns WHERE matrix_id = ? ORDER BY "order"',
  )
  stmt.bind([matrixId])

  const cols: ColumnDefinition[] = []
  while (stmt.step()) {
    cols.push(stmt.get({}) as ColumnDefinition)
  }
  stmt.finalize()
  return cols
}

/** Add a column to a matrix's data table and registry. Returns the new column's stable ID. */
export const addColumn = (
  db: Database,
  matrixId: number,
  column: {
    name: string
    type: string
    displayType?: string
    options?: string
    constraints?: string
    role?: 'label' | 'content'
  },
): number => {
  return withTransaction(db, () => {
    const current = getColumns(db, matrixId)

    if (current.some((c) => c.name === column.name)) {
      throw new Error(`Column "${column.name}" already exists in matrix ${matrixId}`)
    }

    // SQLite's ALTER TABLE ADD COLUMN doesn't support UNIQUE or NOT NULL
    // (without a default). Constraints are stored in matrix_columns but only
    // fully enforced at CREATE TABLE time (createMatrix).
    db.exec(
      `ALTER TABLE "mx_${matrixId}_data" ADD COLUMN ${quoteIdent(column.name)} ${column.type}`,
    )

    const displayType = column.displayType ?? sqliteTypeToDisplayType(column.type)
    const nextOrder = current.length > 0 ? Math.max(...current.map((c) => c.order)) + 1 : 0
    const stmt = db.prepare(
      'INSERT INTO matrix_columns (matrix_id, name, type, display_type, "order", options, constraints, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    )
    stmt.bind([
      matrixId,
      column.name,
      column.type,
      displayType,
      nextOrder,
      column.options ?? null,
      column.constraints ?? null,
      column.role ?? null,
    ])
    if (!stmt.step()) {
      stmt.finalize()
      throw new Error('Failed to insert column definition')
    }
    const colId = (stmt.get({}) as { id: number }).id
    stmt.finalize()

    const deviceId = getOrCreateDeviceId(db)
    reinstallDataTableTriggers(db, matrixId, deviceId, [...current, column])

    return colId
  })
}

/** Remove a column from a matrix's data table and registry. */
export const removeColumn = (
  db: Database,
  matrixId: number,
  columnName: string,
  options?: { force?: boolean },
): void => {
  withTransaction(db, () => {
    const current = getColumns(db, matrixId)
    const col = current.find((c) => c.name === columnName)

    if (!col) {
      throw new Error(`Column "${columnName}" not found in matrix ${matrixId}`)
    }

    if (col.managedBy && !options?.force) {
      throw new Error(
        `Column "${columnName}" is managed by plugin "${col.managedBy}" and cannot be removed. Pass force: true to override.`,
      )
    }

    const isFormula = col.formula !== null

    if (!isFormula) {
      // Drop triggers before ALTER TABLE — existing triggers reference the
      // column being dropped and SQLite validates them after DROP COLUMN.
      dropChangeTrackingTriggers(db, `mx_${matrixId}_data`)

      db.exec(`ALTER TABLE "mx_${matrixId}_data" DROP COLUMN ${quoteIdent(columnName)}`)
    }

    try {
      db.exec('DELETE FROM matrix_columns WHERE matrix_id = ? AND name = ?', {
        bind: [matrixId, columnName],
      })
    } catch (err) {
      // ON DELETE RESTRICT on formula_column_deps.dep_col_id rejects deletion
      // of columns that formulas depend on. Surface a user-friendly message.
      if (err instanceof Error && /FOREIGN KEY constraint failed/i.test(err.message)) {
        const depNames = getFormulaDependents(db, col.id)
        const depList =
          depNames.length > 0 ? depNames.map((n) => `"${n}"`).join(', ') : 'unknown'
        throw new Error(
          `Column "${columnName}" cannot be removed because formula column ${depList} depends on it.`,
        )
      }
      throw err
    }

    if (!isFormula) {
      const deviceId = getOrCreateDeviceId(db)
      const remaining = current.filter((c) => c.name !== columnName)
      installDataTableTriggers(db, matrixId, deviceId, remaining)
    }
  })
}

/** Query which formula columns depend on a given column. */
const getFormulaDependents = (db: Database, columnId: number): string[] => {
  const stmt = db.prepare(
    `SELECT mc.name FROM formula_column_deps fcd
     JOIN matrix_columns mc ON mc.id = fcd.formula_col_id
     WHERE fcd.dep_col_id = ?`,
  )
  stmt.bind([columnId])
  const names: string[] = []
  while (stmt.step()) {
    names.push((stmt.get({}) as { name: string }).name)
  }
  stmt.finalize()
  return names
}

/** Rename a column in a matrix's data table and registry. */
export const renameColumn = (
  db: Database,
  matrixId: number,
  oldName: string,
  newName: string,
  options?: { force?: boolean },
): void => {
  withTransaction(db, () => {
    const current = getColumns(db, matrixId)
    const col = current.find((c) => c.name === oldName)

    if (!col) {
      throw new Error(`Column "${oldName}" not found in matrix ${matrixId}`)
    }
    if (current.some((c) => c.name === newName)) {
      throw new Error(`Column "${newName}" already exists in matrix ${matrixId}`)
    }

    if (col.managedBy && !options?.force) {
      throw new Error(
        `Column "${oldName}" is managed by plugin "${col.managedBy}" and cannot be renamed. Pass force: true to override.`,
      )
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

/** Update the role of a column (set, change, or clear). */
export const updateColumnRole = (
  db: Database,
  matrixId: number,
  columnName: string,
  role: 'label' | 'content' | null,
): void => {
  const current = getColumns(db, matrixId)
  const col = current.find((c) => c.name === columnName)
  if (!col) {
    throw new Error(`Column "${columnName}" not found in matrix ${matrixId}`)
  }

  try {
    db.exec('UPDATE matrix_columns SET role = ? WHERE matrix_id = ? AND name = ?', {
      bind: [role, matrixId, columnName],
    })
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint/i.test(err.message)) {
      const conflicting = current.find((c) => c.role === role && c.name !== columnName)
      throw new Error(
        `Matrix already has a column with role '${role}': ${conflicting?.name ?? 'unknown'}`,
      )
    }
    throw err
  }
}

/** Add a formula (computed) column. No physical column is created. Returns the new column's stable ID. */
export const addFormulaColumn = (
  db: Database,
  matrixId: number,
  name: string,
  formula: string,
): number => {
  return withTransaction(db, () => {
    const current = getColumns(db, matrixId)

    if (current.some((c) => c.name === name)) {
      throw new Error(`Column "${name}" already exists in matrix ${matrixId}`)
    }

    // Parse {{id}} references and validate all referenced columns exist
    const refs = parseFormulaRefs(formula)
    const colById = new Map(current.map((c) => [c.id, c]))
    for (const refId of refs) {
      if (!colById.has(refId)) {
        throw new Error(`Formula references unknown column ID ${refId}`)
      }
    }

    // Compile {{id}} to current column names for the probe query
    const compiled = refs.length > 0 ? compileFormula(formula, current) : formula

    // Validate the compiled formula by attempting a read-only probe query
    try {
      const probeStmt = db.prepare(`SELECT (${compiled}) FROM "mx_${matrixId}_data" LIMIT 0`)
      probeStmt.step()
      probeStmt.finalize()
    } catch (err) {
      throw new Error(
        `Invalid formula expression: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    // Store the original {{id}}-based formula (not the compiled form)
    const nextOrder = current.length > 0 ? Math.max(...current.map((c) => c.order)) + 1 : 0
    const stmt = db.prepare(
      'INSERT INTO matrix_columns (matrix_id, name, type, display_type, "order", formula) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
    )
    stmt.bind([matrixId, name, 'TEXT', 'text', nextOrder, formula])
    if (!stmt.step()) {
      stmt.finalize()
      throw new Error('Failed to insert formula column definition')
    }
    const colId = (stmt.get({}) as { id: number }).id
    stmt.finalize()

    // Populate formula_column_deps
    if (refs.length > 0) {
      const depStmt = db.prepare(
        'INSERT INTO formula_column_deps (formula_col_id, dep_col_id) VALUES (?, ?)',
      )
      for (const refId of new Set(refs)) {
        depStmt.bind([colId, refId])
        depStmt.step()
        depStmt.reset()
      }
      depStmt.finalize()
    }

    return colId
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
  if (kind === 'own') {
    // An own-edge carries a sibling-local order key; append the target as the
    // last child of the source. Single-ownership is enforced by the partial
    // unique index (a conflicting own-edge is a silent no-op under OR IGNORE).
    const edgeKey = computeSiblingKey(db, { matrixId: sourceMatrixId, rowId: sourceRowId })
    db.exec(
      `INSERT OR IGNORE INTO joins
         (source_matrix_id, source_row_id, target_matrix_id, target_row_id, kind, edge_key)
       VALUES (?, ?, ?, ?, 'own', ?)`,
      { bind: [sourceMatrixId, sourceRowId, targetMatrixId, targetRowId, edgeKey] },
    )
    return
  }

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
    // The target is created as an own-child of the host: a single own-edge
    // (host -> target) carrying a sibling key. A hosted aspect row is just a
    // cross-matrix child -- identical machinery to an outline bullet.
    const { rowId: targetRowId } = insertRow(db, targetMatrixId, {
      values: columnValues,
      parent: { matrixId: sourceMatrixId, rowId: sourceRowId },
    })

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
