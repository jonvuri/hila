import type { Database } from '@sqlite.org/sqlite-wasm'

import { between, makeKey, nextPrefix, parseKey } from './lexorank'

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
    -- Matrix registry
    -- ------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS matrix (
      id         INTEGER PRIMARY KEY,
      title      TEXT NOT NULL DEFAULT ''
    ) STRICT;

    -- ------------------------------------------------------------
    -- Column definitions (normalized, one row per column)
    -- ------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS matrix_columns (
      matrix_id  INTEGER NOT NULL REFERENCES matrix(id) ON DELETE CASCADE,
      name       TEXT    NOT NULL,
      type       TEXT    NOT NULL,
      "order"    INTEGER NOT NULL,
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
  `)
}

// Stored column definition (includes display order)
export type ColumnDefinition = {
  name: string
  type: string
  order: number
}

type SqlValue = string | number | null | Uint8Array | bigint

const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`

// Create a new matrix with its associated per-matrix tables
export const createMatrix = (
  db: Database,
  title: string,
  columns: { name: string; type: string }[] = [{ name: 'title', type: 'TEXT' }],
): number => {
  db.exec('BEGIN TRANSACTION')

  try {
    const insertStmt = db.prepare('INSERT INTO matrix (title) VALUES (?) RETURNING id')
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
      'INSERT INTO matrix_columns (matrix_id, name, type, "order") VALUES (?, ?, ?, ?)',
    )
    for (let i = 0; i < columns.length; i++) {
      colStmt.bind([matrixId, columns[i]!.name, columns[i]!.type, i])
      colStmt.step()
      colStmt.reset()
    }
    colStmt.finalize()

    const columnDefs = columns
      .map((col) => `${quoteIdent(col.name)} ${col.type}`)
      .join(',\n        ')

    db.exec(`
      CREATE TABLE IF NOT EXISTS "mx_${matrixId}_data" (
        id INTEGER PRIMARY KEY,
        ${columnDefs}
      ) STRICT;
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS "mx_${matrixId}_closure" (
        ancestor_key    BLOB NOT NULL,
        descendant_key  BLOB NOT NULL,
        depth           INTEGER NOT NULL CHECK (depth >= 0),
        PRIMARY KEY (ancestor_key, descendant_key)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS "mx_${matrixId}_closure_by_descendant"
        ON "mx_${matrixId}_closure"(descendant_key);
    `)

    db.exec('COMMIT')
    return matrixId
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

// Ensure the root matrix exists (creates it if it doesn't)
export const ensureRootMatrix = (db: Database): number => {
  // Check if matrix with ID = 1 exists
  const checkStmt = db.prepare('SELECT id FROM matrix WHERE id = 1')
  const exists = checkStmt.step()
  checkStmt.finalize()

  if (exists) {
    // Root matrix already exists
    return 1
  }

  db.exec('BEGIN TRANSACTION')

  try {
    const insertStmt = db.prepare('INSERT INTO matrix (id, title) VALUES (1, ?) RETURNING id')
    insertStmt.bind(['Root'])
    if (!insertStmt.step()) {
      insertStmt.finalize()
      throw new Error('Failed to insert root matrix record')
    }
    insertStmt.finalize()

    db.exec(
      `INSERT INTO matrix_columns (matrix_id, name, type, "order") VALUES (1, 'content', 'TEXT', 0)`,
    )

    const matrixId = 1

    db.exec(`
      CREATE TABLE IF NOT EXISTS "mx_${matrixId}_data" (
        id INTEGER PRIMARY KEY,
        content TEXT
      ) STRICT;
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS "mx_${matrixId}_closure" (
        ancestor_key    BLOB NOT NULL,
        descendant_key  BLOB NOT NULL,
        depth           INTEGER NOT NULL CHECK (depth >= 0),
        PRIMARY KEY (ancestor_key, descendant_key)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS "mx_${matrixId}_closure_by_descendant"
        ON "mx_${matrixId}_closure"(descendant_key);
    `)

    db.exec('COMMIT')
    return matrixId
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
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

  db.exec('BEGIN TRANSACTION')

  try {
    // Compute the rank key
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
        // No parent specified, find next root-level row
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

          // If candidateKey has more segments, it might be a child of prevKey
          // We want to skip over all children of prevKey
          if (candidateSegments.length > prevSegments.length) {
            // candidateKey might be in prevKey's subtree, use empty upperBound
            upperBound = new Uint8Array(0)
          } else {
            upperBound = candidateKey
          }
        }
        nextSiblingStmt.finalize()
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
        // No parent specified, find previous root-level row
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
      // First check this matrix's last key; if the matrix is empty, fall back
      // to the global last single-segment key to avoid rank key collisions
      // when multiple matrices are inserted into with no positioning.
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

      if (lastKey.length === 0) {
        // No rows in this matrix yet. Find the global last single-segment key
        // (single-segment = no 0x00 byte except the final terminator) so the
        // new key stays in root-level key space and is globally unique.
        const globalLastStmt = db.prepare(`
          SELECT key FROM rank
          WHERE instr(substr(key, 1, length(key) - 1), X'00') = 0
          ORDER BY key DESC
          LIMIT 1
        `)
        if (globalLastStmt.step()) {
          const result = globalLastStmt.get({}) as { key: Uint8Array }
          lastKey = new Uint8Array(result.key)
        }
        globalLastStmt.finalize()
      }

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

    // Insert into closure table
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
      // Get all ancestors of the parent
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

    db.exec('COMMIT')
    return rankKey
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
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
    const columns = entries.map(([name]) => quoteIdent(name)).join(', ')
    const placeholders = entries.map(() => '?').join(', ')
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
    const stmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" DEFAULT VALUES RETURNING id`)
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
  const validNames = new Set(columns.map((c) => c.name))
  for (const [name] of entries) {
    if (!validNames.has(name)) {
      throw new Error(`Column "${name}" does not exist in matrix ${matrixId}`)
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

  db.exec('BEGIN TRANSACTION')

  try {
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
            upperBound = new Uint8Array(0)
          } else {
            upperBound = candidateKey
          }
        }
        stmt.finalize()
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

    db.exec('COMMIT')
    return newKey
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
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

  db.exec('BEGIN TRANSACTION')

  try {
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

    // 2. Delete all closure entries where key is ancestor or descendant
    db.exec(
      `DELETE FROM "mx_${matrixId}_closure"
       WHERE ancestor_key = ? OR descendant_key = ?`,
      { bind: [key, key] },
    )

    // 3. Delete from data table (only for data rows, not child matrix refs)
    if (rowKind === 0) {
      db.exec(`DELETE FROM "mx_${matrixId}_data" WHERE id = ?`, {
        bind: [rowId],
      })
    }

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
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

  db.exec('BEGIN TRANSACTION')

  try {
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

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
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
  db.exec('BEGIN TRANSACTION')

  try {
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

      const colNames = columns.map((c) => quoteIdent(c.name)).join(', ')
      const placeholders = columns.map(() => '?').join(', ')
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

    // Commit transaction
    db.exec('COMMIT')
  } catch (error) {
    // Rollback on error
    db.exec('ROLLBACK')
    throw error
  }
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
    'SELECT name, type, "order" FROM matrix_columns WHERE matrix_id = ? ORDER BY "order"',
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
  column: { name: string; type: string },
): void => {
  db.exec('BEGIN TRANSACTION')

  try {
    const current = getColumns(db, matrixId)

    if (current.some((c) => c.name === column.name)) {
      throw new Error(`Column "${column.name}" already exists in matrix ${matrixId}`)
    }

    db.exec(
      `ALTER TABLE "mx_${matrixId}_data" ADD COLUMN ${quoteIdent(column.name)} ${column.type}`,
    )

    const nextOrder = current.length > 0 ? Math.max(...current.map((c) => c.order)) + 1 : 0
    db.exec('INSERT INTO matrix_columns (matrix_id, name, type, "order") VALUES (?, ?, ?, ?)', {
      bind: [matrixId, column.name, column.type, nextOrder],
    })

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

/** Remove a column from a matrix's data table and registry. */
export const removeColumn = (db: Database, matrixId: number, columnName: string): void => {
  db.exec('BEGIN TRANSACTION')

  try {
    const current = getColumns(db, matrixId)

    if (!current.some((c) => c.name === columnName)) {
      throw new Error(`Column "${columnName}" not found in matrix ${matrixId}`)
    }

    db.exec(`ALTER TABLE "mx_${matrixId}_data" DROP COLUMN ${quoteIdent(columnName)}`)

    db.exec('DELETE FROM matrix_columns WHERE matrix_id = ? AND name = ?', {
      bind: [matrixId, columnName],
    })

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

/** Rename a column in a matrix's data table and registry. */
export const renameColumn = (
  db: Database,
  matrixId: number,
  oldName: string,
  newName: string,
): void => {
  db.exec('BEGIN TRANSACTION')

  try {
    const current = getColumns(db, matrixId)

    if (!current.some((c) => c.name === oldName)) {
      throw new Error(`Column "${oldName}" not found in matrix ${matrixId}`)
    }
    if (current.some((c) => c.name === newName)) {
      throw new Error(`Column "${newName}" already exists in matrix ${matrixId}`)
    }

    db.exec(
      `ALTER TABLE "mx_${matrixId}_data" RENAME COLUMN ${quoteIdent(oldName)} TO ${quoteIdent(newName)}`,
    )

    db.exec('UPDATE matrix_columns SET name = ? WHERE matrix_id = ? AND name = ?', {
      bind: [newName, matrixId, oldName],
    })

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
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
