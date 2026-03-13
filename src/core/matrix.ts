import type { Database } from '@sqlite.org/sqlite-wasm'

import { between, compareKeys, makeKey, nextPrefix, parseKey } from './lexorank'
import {
  dropChangeTrackingTriggers,
  installDataTableTriggers,
  reinstallDataTableTriggers,
} from './sync'
import { ensureTrait, hasTrait, requireTraits } from './traits'
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
 * Insert a row into a matrix with proper rank and closure relationships.
 *
 * @param db - Database instance
 * @param params - Insert parameters
 * @param params.matrixId - ID of the matrix to insert into
 * @param params.parentKey - Key of the parent row (optional for root-level rows)
 * @param params.prevKey - Key of the row to insert after (optional)
 * @param params.nextKey - Key of the row to insert before (optional)
 * @param params.rowKind - 0 for data row, 1 for child matrix reference
 * @param params.rowId - ID of the row (data row ID or child matrix ID)
 * @returns The generated rank key for the new row
 */
export const insertRow = (
  db: Database,
  params: {
    matrixId: number
    parentKey?: Uint8Array
    prevKey?: Uint8Array
    nextKey?: Uint8Array
    rowKind: 0 | 1
    rowId: number
  },
): Uint8Array => {
  const { matrixId, parentKey, prevKey, nextKey, rowKind, rowId } = params

  return withTransaction(db, () => {
    requireTraits(db, matrixId, ['rank'])
    const closureProvisioned = hasTrait(db, matrixId, 'closure')

    let rankKey: Uint8Array

    if (prevKey && nextKey) {
      // Insert between two siblings
      rankKey = between(prevKey, nextKey)
    } else if (prevKey) {
      // Insert after prevKey
      // Need to find what comes after prevKey to use as upper bound
      let upperBound = new Uint8Array(0)

      if (parentKey) {
        // We have a parent, so we need to stay within the parent's subtree
        const parentUpperBound = nextPrefix(parentKey)
        const nextSiblingStmt = db.prepare(`
          SELECT key FROM rank
          WHERE matrix_id = ? AND key > ? AND key < ?
          ORDER BY key ASC
          LIMIT 1
        `)
        nextSiblingStmt.bind([matrixId, prevKey, parentUpperBound])

        if (nextSiblingStmt.step()) {
          const result = nextSiblingStmt.get({}) as { key: Uint8Array }
          const candidateKey = new Uint8Array(result.key)

          // Check if this is a direct sibling (same parent)
          const candidateSegments = parseKey(candidateKey)
          const parentSegments = parseKey(parentKey)
          if (candidateSegments.length === parentSegments.length + 1) {
            // It's a direct child of the same parent
            upperBound = candidateKey
          }
          // Otherwise, upperBound remains empty (insert at end of parent's children)
        }
        nextSiblingStmt.finalize()
      } else {
        // No parent specified, find next root-level row in this matrix.
        // globalLowerBound tracks the minimum key the global collision
        // check should search from (advanced past subtrees if needed).
        let globalLowerBound = prevKey
        const nextSiblingStmt = db.prepare(`
          SELECT key FROM rank
          WHERE matrix_id = ? AND key > ?
          ORDER BY key ASC
          LIMIT 1
        `)
        nextSiblingStmt.bind([matrixId, prevKey])

        if (nextSiblingStmt.step()) {
          const result = nextSiblingStmt.get({}) as { key: Uint8Array }
          const candidateKey = new Uint8Array(result.key)

          // Check if prevKey is a parent of candidateKey
          const prevSegments = parseKey(prevKey)
          const candidateSegments = parseKey(candidateKey)

          if (candidateSegments.length > prevSegments.length) {
            // candidateKey is in prevKey's subtree. We need to insert
            // AFTER the entire subtree. Advance the global search past
            // the subtree boundary.
            globalLowerBound = nextPrefix(prevKey)
          } else {
            upperBound = candidateKey
          }
        }
        nextSiblingStmt.finalize()

        if (upperBound.length === 0) {
          // No local upper bound found. The rank table is global, so
          // check for any key beyond the current position (or subtree)
          // to avoid cross-matrix key collisions.
          const globalNextStmt = db.prepare(`
            SELECT key FROM rank
            WHERE key > ?
            ORDER BY key ASC
            LIMIT 1
          `)
          globalNextStmt.bind([globalLowerBound])
          if (globalNextStmt.step()) {
            const gResult = globalNextStmt.get({}) as { key: Uint8Array }
            upperBound = new Uint8Array(gResult.key)
          }
          globalNextStmt.finalize()
        }
      }

      rankKey = between(prevKey, upperBound)
    } else if (nextKey) {
      // Insert before nextKey
      // Need to find what comes before nextKey to use as lower bound
      let lowerBound = new Uint8Array(0)

      if (parentKey) {
        // We have a parent, so we need to stay within the parent's subtree
        const prevSiblingStmt = db.prepare(`
          SELECT key FROM rank
          WHERE matrix_id = ? AND key < ? AND key > ?
          ORDER BY key DESC
          LIMIT 1
        `)
        prevSiblingStmt.bind([matrixId, nextKey, parentKey])

        if (prevSiblingStmt.step()) {
          const result = prevSiblingStmt.get({}) as { key: Uint8Array }
          const candidateKey = new Uint8Array(result.key)

          // Check if this is a direct sibling (same parent)
          const candidateSegments = parseKey(candidateKey)
          const parentSegments = parseKey(parentKey)
          if (candidateSegments.length === parentSegments.length + 1) {
            // It's a direct child of the same parent
            lowerBound = candidateKey
          } else {
            // Use parent key as lower bound (insert as first child)
            lowerBound = new Uint8Array(parentKey)
          }
        } else {
          // No previous sibling, use parent key as lower bound
          lowerBound = new Uint8Array(parentKey)
        }
        prevSiblingStmt.finalize()
      } else {
        // No parent specified, find previous root-level row in this matrix
        const prevSiblingStmt = db.prepare(`
          SELECT key FROM rank
          WHERE matrix_id = ? AND key < ?
          ORDER BY key DESC
          LIMIT 1
        `)
        prevSiblingStmt.bind([matrixId, nextKey])

        if (prevSiblingStmt.step()) {
          const result = prevSiblingStmt.get({}) as { key: Uint8Array }
          lowerBound = new Uint8Array(result.key)

          // Check if this previous row might have children between it and nextKey
          const lowerBoundSegments = parseKey(lowerBound)
          const nextKeySegments = parseKey(nextKey)

          // If they have different numbers of segments, we might be crossing levels
          if (lowerBoundSegments.length !== nextKeySegments.length) {
            // Use empty lower bound to be safe
            lowerBound = new Uint8Array(0)
          }
        }
        prevSiblingStmt.finalize()

        // Check the global rank table for a closer lower bound to avoid
        // generating a key that collides with another matrix's key.
        const globalPrevStmt = db.prepare(`
          SELECT key FROM rank
          WHERE key < ?
          ORDER BY key DESC
          LIMIT 1
        `)
        globalPrevStmt.bind([nextKey])
        if (globalPrevStmt.step()) {
          const gResult = globalPrevStmt.get({}) as { key: Uint8Array }
          const globalPrevKey = new Uint8Array(gResult.key)
          if (compareKeys(globalPrevKey, lowerBound) > 0) {
            lowerBound = globalPrevKey
          }
        }
        globalPrevStmt.finalize()
      }

      rankKey = between(lowerBound, nextKey)
    } else if (parentKey) {
      // Insert as first child of parent
      // Find first existing child
      const firstChildStmt = db.prepare(`
        SELECT key FROM rank
        WHERE matrix_id = ? AND key > ? AND key < ?
        ORDER BY key ASC
        LIMIT 1
      `)
      const upperBound = nextPrefix(parentKey)
      firstChildStmt.bind([matrixId, parentKey, upperBound])

      if (firstChildStmt.step()) {
        // There's an existing first child, insert before it
        const result = firstChildStmt.get({}) as { key: Uint8Array }
        const nextChild = new Uint8Array(result.key)
        firstChildStmt.finalize()
        rankKey = between(parentKey, nextChild)
      } else {
        // No existing children, create first child by extending parent key
        firstChildStmt.finalize()
        // Parse parent key segments and add a new segment
        const parentSegments = parseKey(parentKey)
        const newSegment = new Uint8Array([0x80]) // Midpoint value for first child
        rankKey = makeKey([...parentSegments, newSegment])
      }
    } else {
      // Insert at root level with no siblings specified.
      // Check both the matrix-local last key and the global last
      // single-segment key, using whichever is greater. The rank table
      // is global so keys must be unique across all matrices.
      const lastRootStmt = db.prepare(`
        SELECT key FROM rank
        WHERE matrix_id = ?
        ORDER BY key DESC
        LIMIT 1
      `)
      lastRootStmt.bind([matrixId])

      let lastKey = new Uint8Array(0)
      if (lastRootStmt.step()) {
        const result = lastRootStmt.get({}) as { key: Uint8Array }
        lastKey = new Uint8Array(result.key)
      }
      lastRootStmt.finalize()

      const globalLastStmt = db.prepare(`
        SELECT key FROM rank
        WHERE instr(substr(key, 1, length(key) - 1), X'00') = 0
        ORDER BY key DESC
        LIMIT 1
      `)
      if (globalLastStmt.step()) {
        const result = globalLastStmt.get({}) as { key: Uint8Array }
        const globalLast = new Uint8Array(result.key)
        if (compareKeys(globalLast, lastKey) > 0) {
          lastKey = globalLast
        }
      }
      globalLastStmt.finalize()

      rankKey = between(lastKey, new Uint8Array(0))
    }

    // Insert into rank table
    db.exec(
      `
      INSERT INTO rank (key, matrix_id, row_kind, row_id)
      VALUES (?, ?, ?, ?)
    `,
      {
        bind: [rankKey, matrixId, rowKind, rowId],
      },
    )

    if (closureProvisioned) {
      // 1. Self-reference (depth 0)
      db.exec(
        `
        INSERT INTO "mx_${matrixId}_closure" (ancestor_key, descendant_key, depth)
        VALUES (?, ?, 0)
      `,
        {
          bind: [rankKey, rankKey],
        },
      )

      // 2. If there's a parent, add closure entries for all ancestors
      if (parentKey) {
        const ancestorsStmt = db.prepare(`
          SELECT ancestor_key, depth FROM "mx_${matrixId}_closure"
          WHERE descendant_key = ?
        `)

        const ancestors: { ancestor_key: Uint8Array; depth: number }[] = []
        ancestorsStmt.bind([parentKey])
        while (ancestorsStmt.step()) {
          ancestors.push(ancestorsStmt.get({}) as { ancestor_key: Uint8Array; depth: number })
        }
        ancestorsStmt.finalize()

        for (const ancestor of ancestors) {
          db.exec(
            `
            INSERT INTO "mx_${matrixId}_closure" (ancestor_key, descendant_key, depth)
            VALUES (?, ?, ?)
          `,
            {
              bind: [ancestor.ancestor_key, rankKey, ancestor.depth + 1],
            },
          )
        }
      }
    }

    return rankKey
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
 * Reparent a row (and its subtree) to a new parent/position.
 *
 * This rewrites rank keys for the entire subtree, updates the closure table
 * (removes old ancestor links, grafts onto new parent), all in one transaction.
 *
 * @param db - Database instance
 * @param params - Reparent parameters
 * @param params.matrixId - ID of the matrix
 * @param params.nodeKey - Current rank key of the node to reparent
 * @param params.newParentKey - Key of the new parent (omit to reparent to root)
 * @param params.prevSiblingKey - Key of the sibling to place after (at destination)
 * @param params.nextSiblingKey - Key of the sibling to place before (at destination)
 * @returns The new rank key for the reparented node
 */
export const reparentRow = (
  db: Database,
  params: {
    matrixId: number
    nodeKey: Uint8Array
    newParentKey?: Uint8Array
    prevSiblingKey?: Uint8Array
    nextSiblingKey?: Uint8Array
  },
): Uint8Array => {
  const { matrixId, nodeKey, newParentKey, prevSiblingKey, nextSiblingKey } = params

  return withTransaction(db, () => {
    const oldKey = nodeKey
    const oldUpperBound = nextPrefix(oldKey)

    // Guard: cannot reparent a node under one of its own descendants
    if (newParentKey) {
      const cycleStmt = db.prepare(`
        SELECT 1 FROM "mx_${matrixId}_closure"
        WHERE ancestor_key = ? AND descendant_key = ? AND depth > 0
      `)
      cycleStmt.bind([oldKey, newParentKey])
      if (cycleStmt.step()) {
        cycleStmt.finalize()
        throw new Error('Cannot reparent a node under one of its own descendants')
      }
      cycleStmt.finalize()
    }

    // --- Step 1: Compute new rank key at destination ---
    let newKey: Uint8Array

    if (prevSiblingKey && nextSiblingKey) {
      newKey = between(prevSiblingKey, nextSiblingKey)
    } else if (prevSiblingKey) {
      let upperBound = new Uint8Array(0)

      if (newParentKey) {
        const parentUpper = nextPrefix(newParentKey)
        const stmt = db.prepare(`
          SELECT key FROM rank
          WHERE matrix_id = ? AND key > ? AND key < ?
            AND NOT (key >= ? AND key < ?)
          ORDER BY key ASC
          LIMIT 1
        `)
        stmt.bind([matrixId, prevSiblingKey, parentUpper, oldKey, oldUpperBound])

        if (stmt.step()) {
          const result = stmt.get({}) as { key: Uint8Array }
          const candidateKey = new Uint8Array(result.key)
          const candidateSegments = parseKey(candidateKey)
          const parentSegments = parseKey(newParentKey)
          if (candidateSegments.length === parentSegments.length + 1) {
            upperBound = candidateKey
          }
        }
        stmt.finalize()
      } else {
        let globalLowerBound = prevSiblingKey
        const stmt = db.prepare(`
          SELECT key FROM rank
          WHERE matrix_id = ? AND key > ?
            AND NOT (key >= ? AND key < ?)
          ORDER BY key ASC
          LIMIT 1
        `)
        stmt.bind([matrixId, prevSiblingKey, oldKey, oldUpperBound])

        if (stmt.step()) {
          const result = stmt.get({}) as { key: Uint8Array }
          const candidateKey = new Uint8Array(result.key)
          const prevSegments = parseKey(prevSiblingKey)
          const candidateSegments = parseKey(candidateKey)
          if (candidateSegments.length > prevSegments.length) {
            globalLowerBound = nextPrefix(prevSiblingKey)
          } else {
            upperBound = candidateKey
          }
        }
        stmt.finalize()

        if (upperBound.length === 0) {
          const globalStmt = db.prepare(`
            SELECT key FROM rank
            WHERE key > ?
              AND NOT (key >= ? AND key < ?)
            ORDER BY key ASC
            LIMIT 1
          `)
          globalStmt.bind([globalLowerBound, oldKey, oldUpperBound])
          if (globalStmt.step()) {
            const gResult = globalStmt.get({}) as { key: Uint8Array }
            upperBound = new Uint8Array(gResult.key)
          }
          globalStmt.finalize()
        }
      }

      newKey = between(prevSiblingKey, upperBound)
    } else if (nextSiblingKey) {
      let lowerBound = new Uint8Array(0)

      if (newParentKey) {
        const stmt = db.prepare(`
          SELECT key FROM rank
          WHERE matrix_id = ? AND key < ? AND key > ?
            AND NOT (key >= ? AND key < ?)
          ORDER BY key DESC
          LIMIT 1
        `)
        stmt.bind([matrixId, nextSiblingKey, newParentKey, oldKey, oldUpperBound])

        if (stmt.step()) {
          const result = stmt.get({}) as { key: Uint8Array }
          const candidateKey = new Uint8Array(result.key)
          const candidateSegments = parseKey(candidateKey)
          const parentSegments = parseKey(newParentKey)
          if (candidateSegments.length === parentSegments.length + 1) {
            lowerBound = candidateKey
          } else {
            lowerBound = new Uint8Array(newParentKey)
          }
        } else {
          lowerBound = new Uint8Array(newParentKey)
        }
        stmt.finalize()
      } else {
        const stmt = db.prepare(`
          SELECT key FROM rank
          WHERE matrix_id = ? AND key < ?
            AND NOT (key >= ? AND key < ?)
          ORDER BY key DESC
          LIMIT 1
        `)
        stmt.bind([matrixId, nextSiblingKey, oldKey, oldUpperBound])

        if (stmt.step()) {
          const result = stmt.get({}) as { key: Uint8Array }
          lowerBound = new Uint8Array(result.key)
        }
        stmt.finalize()
      }

      newKey = between(lowerBound, nextSiblingKey)
    } else if (newParentKey) {
      // Insert as first/only child of new parent
      const parentUpper = nextPrefix(newParentKey)
      const stmt = db.prepare(`
        SELECT key FROM rank
        WHERE matrix_id = ? AND key > ? AND key < ?
          AND NOT (key >= ? AND key < ?)
        ORDER BY key ASC
        LIMIT 1
      `)
      stmt.bind([matrixId, newParentKey, parentUpper, oldKey, oldUpperBound])

      if (stmt.step()) {
        const result = stmt.get({}) as { key: Uint8Array }
        const nextChild = new Uint8Array(result.key)
        stmt.finalize()
        newKey = between(newParentKey, nextChild)
      } else {
        stmt.finalize()
        const parentSegments = parseKey(newParentKey)
        const newSegment = new Uint8Array([0x80])
        newKey = makeKey([...parentSegments, newSegment])
      }
    } else {
      // Reparent to root level, no positioning: insert at end
      const stmt = db.prepare(`
        SELECT key FROM rank
        WHERE matrix_id = ?
          AND NOT (key >= ? AND key < ?)
        ORDER BY key DESC
        LIMIT 1
      `)
      stmt.bind([matrixId, oldKey, oldUpperBound])

      let lastKey = new Uint8Array(0)
      if (stmt.step()) {
        const result = stmt.get({}) as { key: Uint8Array }
        lastKey = new Uint8Array(result.key)
      }
      stmt.finalize()

      newKey = between(lastKey, new Uint8Array(0))
    }

    // --- Step 2: Delete old external closure relationships ---
    // Preserves subtree-internal links (where both ancestor and descendant are in the subtree)
    db.exec(
      `
      DELETE FROM "mx_${matrixId}_closure"
      WHERE descendant_key IN (
          SELECT descendant_key FROM "mx_${matrixId}_closure" WHERE ancestor_key = ?
        )
        AND ancestor_key NOT IN (
          SELECT descendant_key FROM "mx_${matrixId}_closure" WHERE ancestor_key = ?
        )
    `,
      { bind: [oldKey, oldKey] },
    )

    // --- Step 3: Graft onto new parent ---
    // Cross-join: new parent's ancestors × node's subtree descendants
    if (newParentKey) {
      db.exec(
        `
        INSERT INTO "mx_${matrixId}_closure" (ancestor_key, descendant_key, depth)
        SELECT a.ancestor_key, d.descendant_key, a.depth + d.depth + 1
        FROM "mx_${matrixId}_closure" a
        CROSS JOIN "mx_${matrixId}_closure" d
        WHERE a.descendant_key = ?
          AND d.ancestor_key = ?
      `,
        { bind: [newParentKey, oldKey] },
      )
    }

    // --- Step 4: Rewrite rank keys for the subtree ---
    // SQLite's || operator always produces TEXT, even with BLOB operands.
    // Round-trip through HEX/UNHEX to get proper BLOB concatenation in STRICT tables.
    const substrStart = oldKey.length + 1
    db.exec(
      `
      UPDATE rank
      SET key = UNHEX(HEX(?) || HEX(substr(key, ?)))
      WHERE matrix_id = ? AND key >= ? AND key < ?
    `,
      { bind: [newKey, substrStart, matrixId, oldKey, oldUpperBound] },
    )

    // --- Step 5: Rewrite closure keys for the subtree ---
    // Entries where both keys are in the subtree (subtree-internal)
    db.exec(
      `
      UPDATE "mx_${matrixId}_closure"
      SET ancestor_key = UNHEX(HEX(?) || HEX(substr(ancestor_key, ?))),
          descendant_key = UNHEX(HEX(?) || HEX(substr(descendant_key, ?)))
      WHERE (ancestor_key >= ? AND ancestor_key < ?)
        AND (descendant_key >= ? AND descendant_key < ?)
    `,
      {
        bind: [
          newKey,
          substrStart,
          newKey,
          substrStart,
          oldKey,
          oldUpperBound,
          oldKey,
          oldUpperBound,
        ],
      },
    )
    // Entries where only descendant_key is in the subtree (graft entries from step 3)
    db.exec(
      `
      UPDATE "mx_${matrixId}_closure"
      SET descendant_key = UNHEX(HEX(?) || HEX(substr(descendant_key, ?)))
      WHERE (descendant_key >= ? AND descendant_key < ?)
        AND NOT (ancestor_key >= ? AND ancestor_key < ?)
    `,
      {
        bind: [newKey, substrStart, oldKey, oldUpperBound, oldKey, oldUpperBound],
      },
    )

    return newKey
  })
}

/**
 * Delete a single row from a matrix. Removes the rank entry, all closure
 * relationships involving the key, and the data table row.
 *
 * Does NOT delete children -- orphan handling is a policy decision for the
 * caller. The outline will re-parent children to the deleted row's parent
 * before calling delete.
 */
export const deleteRow = (
  db: Database,
  params: {
    matrixId: number
    key: Uint8Array
  },
): void => {
  const { matrixId, key } = params

  withTransaction(db, () => {
    // Look up row_id so we can delete from the data table
    const rowStmt = db.prepare(
      'SELECT row_id, row_kind FROM rank WHERE matrix_id = ? AND key = ?',
    )
    rowStmt.bind([matrixId, key])
    if (!rowStmt.step()) {
      rowStmt.finalize()
      throw new Error('Row not found in rank table')
    }
    const { row_id: rowId, row_kind: rowKind } = rowStmt.get({}) as {
      row_id: number
      row_kind: number
    }
    rowStmt.finalize()

    // 1. Delete from rank table
    db.exec('DELETE FROM rank WHERE matrix_id = ? AND key = ?', {
      bind: [matrixId, key],
    })

    // 2. Delete closure entries if closure trait is provisioned
    if (hasTrait(db, matrixId, 'closure')) {
      db.exec(
        `DELETE FROM "mx_${matrixId}_closure"
         WHERE ancestor_key = ? OR descendant_key = ?`,
        { bind: [key, key] },
      )
    }

    // 3. Delete from data table (only for data rows, not child matrix refs)
    if (rowKind === 0) {
      db.exec(`DELETE FROM "mx_${matrixId}_data" WHERE id = ?`, {
        bind: [rowId],
      })
    }
  })
}

/**
 * Delete a row and all its descendants from a matrix. Removes rank entries,
 * all closure relationships involving any subtree key, and data table rows.
 *
 * Uses the subtree range query [key, nextPrefix(key)) for efficient bulk deletion.
 */
export const deleteSubtree = (
  db: Database,
  params: {
    matrixId: number
    key: Uint8Array
  },
): void => {
  const { matrixId, key } = params
  const upperBound = nextPrefix(key)

  withTransaction(db, () => {
    // 1. Collect row_ids for data rows in the subtree (need these before deleting rank)
    const subtreeStmt = db.prepare(`
      SELECT row_id, row_kind FROM rank
      WHERE matrix_id = ? AND key >= ? AND key < ?
    `)
    subtreeStmt.bind([matrixId, key, upperBound])

    const dataRowIds: number[] = []
    while (subtreeStmt.step()) {
      const row = subtreeStmt.get({}) as { row_id: number; row_kind: number }
      if (row.row_kind === 0) {
        dataRowIds.push(row.row_id)
      }
    }
    subtreeStmt.finalize()

    if (dataRowIds.length === 0) {
      // No rows found in subtree -- check if the key itself doesn't exist
      const existsStmt = db.prepare('SELECT 1 FROM rank WHERE matrix_id = ? AND key = ?')
      existsStmt.bind([matrixId, key])
      if (!existsStmt.step()) {
        existsStmt.finalize()
        throw new Error('Row not found in rank table')
      }
      existsStmt.finalize()
    }

    // 2. Delete all closure entries where ancestor or descendant is in the subtree
    db.exec(
      `DELETE FROM "mx_${matrixId}_closure"
       WHERE ancestor_key >= ? AND ancestor_key < ?`,
      { bind: [key, upperBound] },
    )
    db.exec(
      `DELETE FROM "mx_${matrixId}_closure"
       WHERE descendant_key >= ? AND descendant_key < ?`,
      { bind: [key, upperBound] },
    )

    // 3. Delete from rank table (all rows in subtree range)
    db.exec('DELETE FROM rank WHERE matrix_id = ? AND key >= ? AND key < ?', {
      bind: [matrixId, key, upperBound],
    })

    // 4. Delete from data table
    for (const rowId of dataRowIds) {
      db.exec(`DELETE FROM "mx_${matrixId}_data" WHERE id = ?`, {
        bind: [rowId],
      })
    }
  })
}

/**
 * Get direct children of a node in rank order.
 * Queries the closure table for depth=1 descendants and joins with the rank
 * table for ordering.
 *
 * @returns Array of child keys in rank (display) order, empty if no children
 */
export const getChildren = (
  db: Database,
  matrixId: number,
  parentKey: Uint8Array,
): Uint8Array[] => {
  const stmt = db.prepare(`
    SELECT c.descendant_key
    FROM "mx_${matrixId}_closure" c
    JOIN rank r ON r.key = c.descendant_key AND r.matrix_id = ?
    WHERE c.ancestor_key = ? AND c.depth = 1
    ORDER BY r.key
  `)
  stmt.bind([matrixId, parentKey])

  const children: Uint8Array[] = []
  while (stmt.step()) {
    const row = stmt.get({}) as { descendant_key: Uint8Array }
    children.push(new Uint8Array(row.descendant_key))
  }
  stmt.finalize()
  return children
}

/**
 * Get the parent key of a node, or null if the node is at root level.
 * Queries the closure table for the ancestor at depth=1.
 */
export const getParent = (
  db: Database,
  matrixId: number,
  childKey: Uint8Array,
): Uint8Array | null => {
  const stmt = db.prepare(`
    SELECT ancestor_key
    FROM "mx_${matrixId}_closure"
    WHERE descendant_key = ? AND depth = 1
  `)
  stmt.bind([childKey])

  if (stmt.step()) {
    const row = stmt.get({}) as { ancestor_key: Uint8Array }
    const result = new Uint8Array(row.ancestor_key)
    stmt.finalize()
    return result
  }

  stmt.finalize()
  return null
}

/**
 * Get the depth of a node in the hierarchy.
 * Returns the max depth in the closure table where descendant_key = key.
 * Root nodes return 0 (only the self-reference at depth 0 exists).
 * Returns null if the key has no closure entries (not found).
 */
export const getDepth = (db: Database, matrixId: number, key: Uint8Array): number | null => {
  const stmt = db.prepare(`
    SELECT MAX(depth) as max_depth
    FROM "mx_${matrixId}_closure"
    WHERE descendant_key = ?
  `)
  stmt.bind([key])

  if (stmt.step()) {
    const row = stmt.get({}) as { max_depth: number | null }
    stmt.finalize()
    return row.max_depth
  }

  stmt.finalize()
  return null
}

// Simple utility to generate rank keys (lexicographic BLOB order)
const generateRankKey = (prefix: string = '', counter: number = 1): Uint8Array => {
  // Convert prefix and counter to bytes, ensuring lexicographic ordering
  const prefixBytes = new TextEncoder().encode(prefix)
  const counterStr = counter.toString().padStart(8, '0')
  const counterBytes = new TextEncoder().encode(counterStr)

  // Create key with terminator
  const key = new Uint8Array(prefixBytes.length + counterBytes.length + 1)
  key.set(prefixBytes, 0)
  key.set(counterBytes, prefixBytes.length)
  key[key.length - 1] = 0x00 // terminator

  return key
}

// Add sample rows to a matrix
export const addSampleRowsToMatrix = (db: Database, matrixId: number) => {
  withTransaction(db, () => {
    // Get existing rows count to determine if we should create children
    const existingRowsStmt = db.prepare(`
      SELECT COUNT(*) as count FROM rank 
      WHERE matrix_id = ? AND row_kind = 0
    `)
    existingRowsStmt.bind([matrixId])
    if (!existingRowsStmt.step()) {
      existingRowsStmt.finalize()
      throw new Error('Failed to get existing rows count')
    }
    const existingCount = (existingRowsStmt.get({}) as unknown as { count: number }).count
    existingRowsStmt.finalize()

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

    const rowsToAdd = Math.floor(Math.random() * 2) + 2 // 2-3 rows

    for (let i = 0; i < rowsToAdd; i++) {
      const randomSuffix = Math.floor(Math.random() * 1000)

      const colNames = ['id', ...columns.map((c) => quoteIdent(c.name))].join(', ')
      const placeholders = [SQL_RANDOM_ID, ...columns.map(() => '?')].join(', ')
      const values = columns.map((c) => {
        if (c.name === 'content') {
          const text = `Sample row ${randomSuffix}`
          return JSON.stringify({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
          })
        }
        return `Sample row ${randomSuffix}`
      })

      const dataInsertStmt = db.prepare(`
        INSERT INTO "mx_${matrixId}_data" (${colNames})
        VALUES (${placeholders}) RETURNING id
      `)
      dataInsertStmt.bind(values)
      if (!dataInsertStmt.step()) {
        dataInsertStmt.finalize()
        throw new Error('Failed to insert data row')
      }
      const dataResult = dataInsertStmt.get({}) as unknown as { id: number }
      const dataRowId = dataResult.id
      dataInsertStmt.finalize()

      // Determine if this should be a child of an existing row
      let rankKey: Uint8Array
      let parentKey: Uint8Array | null = null

      if (existingCount > 0 && i === rowsToAdd - 1) {
        // Make the last row a child of an existing row
        const parentStmt = db.prepare(`
          SELECT key FROM rank 
          WHERE matrix_id = ? AND row_kind = 0 
          ORDER BY RANDOM() LIMIT 1
        `)
        parentStmt.bind([matrixId])
        let parentResult: { key: Uint8Array } | undefined
        if (parentStmt.step()) {
          parentResult = parentStmt.get({}) as unknown as { key: Uint8Array }
        }
        parentStmt.finalize()

        if (parentResult) {
          parentKey = parentResult.key
          // Create child key by extending parent key
          const parentKeyStr = new TextDecoder().decode(parentResult.key.slice(0, -1)) // remove terminator
          rankKey = generateRankKey(parentKeyStr + '_', i + 1)
        } else {
          rankKey = generateRankKey('root_', existingCount + i + 1)
        }
      } else {
        // Create root-level entry
        rankKey = generateRankKey('root_', existingCount + i + 1)
      }

      // Insert into rank table
      db.exec(
        `
        INSERT INTO rank (key, matrix_id, row_kind, row_id)
        VALUES (?, ?, 0, ?)
      `,
        {
          bind: [rankKey, matrixId, dataRowId],
        },
      )

      // Insert into closure table (self-reference with depth 0)
      db.exec(
        `
        INSERT INTO "mx_${matrixId}_closure" (ancestor_key, descendant_key, depth)
        VALUES (?, ?, 0)
      `,
        {
          bind: [rankKey, rankKey],
        },
      )

      // If this is a child, add closure entries for all ancestors
      if (parentKey) {
        // Get all ancestors of the parent
        const ancestorsStmt = db.prepare(`
          SELECT ancestor_key, depth FROM "mx_${matrixId}_closure"
          WHERE descendant_key = ?
        `)

        const ancestors: { ancestor_key: Uint8Array; depth: number }[] = []
        ancestorsStmt.bind([parentKey])
        while (ancestorsStmt.step()) {
          ancestors.push(
            ancestorsStmt.get({}) as unknown as { ancestor_key: Uint8Array; depth: number },
          )
        }
        ancestorsStmt.finalize()

        // Add closure entries for each ancestor -> this new node
        for (const ancestor of ancestors) {
          db.exec(
            `
            INSERT INTO "mx_${matrixId}_closure" (ancestor_key, descendant_key, depth)
            VALUES (?, ?, ?)
          `,
            {
              bind: [ancestor.ancestor_key, rankKey, ancestor.depth + 1],
            },
          )
        }
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

// Get matrix data for debugging
export const getMatrixDebugData = (db: Database, matrixId: number) => {
  const dataStmt = db.prepare(`SELECT * FROM "mx_${matrixId}_data"`)
  const data: unknown[] = []
  while (dataStmt.step()) {
    data.push(dataStmt.get({}))
  }
  dataStmt.finalize()

  const rankStmt = db.prepare(`
    SELECT key, row_kind, row_id 
    FROM rank 
    WHERE matrix_id = ? 
    ORDER BY key
  `)
  const rank: unknown[] = []
  rankStmt.bind([matrixId])
  while (rankStmt.step()) {
    rank.push(rankStmt.get({}))
  }
  rankStmt.finalize()

  const closureStmt = db.prepare(`
    SELECT ancestor_key, descendant_key, depth 
    FROM "mx_${matrixId}_closure" 
    ORDER BY ancestor_key, depth
  `)
  const closure: unknown[] = []
  closureStmt.bind([matrixId])
  while (closureStmt.step()) {
    closure.push(closureStmt.get({}))
  }
  closureStmt.finalize()

  return { data, rank, closure }
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

export type JoinRow = {
  source_matrix_id: number
  source_row_id: number
  target_matrix_id: number
  target_row_id: number
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
): void => {
  db.exec(
    `INSERT OR IGNORE INTO joins (source_matrix_id, source_row_id, target_matrix_id, target_row_id)
     VALUES (?, ?, ?, ?)`,
    { bind: [sourceMatrixId, sourceRowId, targetMatrixId, targetRowId] },
  )
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

/** Forward lookup: all targets for a source row. */
export const getTargets = (
  db: Database,
  sourceMatrixId: number,
  sourceRowId: number,
): { targetMatrixId: number; targetRowId: number }[] => {
  const stmt = db.prepare(
    `SELECT target_matrix_id, target_row_id FROM joins
     WHERE source_matrix_id = ? AND source_row_id = ?`,
  )
  stmt.bind([sourceMatrixId, sourceRowId])

  const results: { targetMatrixId: number; targetRowId: number }[] = []
  while (stmt.step()) {
    const row = stmt.get({}) as { target_matrix_id: number; target_row_id: number }
    results.push({ targetMatrixId: row.target_matrix_id, targetRowId: row.target_row_id })
  }
  stmt.finalize()
  return results
}

/** Reverse lookup: all sources referencing a target row. */
export const getSources = (
  db: Database,
  targetMatrixId: number,
  targetRowId: number,
): { sourceMatrixId: number; sourceRowId: number }[] => {
  const stmt = db.prepare(
    `SELECT source_matrix_id, source_row_id FROM joins
     WHERE target_matrix_id = ? AND target_row_id = ?`,
  )
  stmt.bind([targetMatrixId, targetRowId])

  const results: { sourceMatrixId: number; sourceRowId: number }[] = []
  while (stmt.step()) {
    const row = stmt.get({}) as { source_matrix_id: number; source_row_id: number }
    results.push({ sourceMatrixId: row.source_matrix_id, sourceRowId: row.source_row_id })
  }
  stmt.finalize()
  return results
}
