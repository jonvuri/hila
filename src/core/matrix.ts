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
      title      TEXT NOT NULL DEFAULT '',
      columns    TEXT NOT NULL DEFAULT '[]'
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

const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`

// Create a new matrix with its associated per-matrix tables
export const createMatrix = (
  db: Database,
  title: string,
  columns: { name: string; type: string }[] = [{ name: 'title', type: 'TEXT' }],
): number => {
  db.exec('BEGIN TRANSACTION')

  try {
    const storedColumns: ColumnDefinition[] = columns.map((col, i) => ({
      name: col.name,
      type: col.type,
      order: i,
    }))

    // Insert the matrix record with column definitions and get the new ID
    const insertStmt = db.prepare(
      'INSERT INTO matrix (title, columns) VALUES (?, ?) RETURNING id',
    )
    insertStmt.bind([title, JSON.stringify(storedColumns)])
    if (!insertStmt.step()) {
      insertStmt.finalize()
      throw new Error('Failed to insert matrix record')
    }
    const result = insertStmt.get({}) as unknown as { id: number }
    const matrixId = result.id
    insertStmt.finalize()

    const columnDefs = columns
      .map((col) => `${quoteIdent(col.name)} ${col.type}`)
      .join(',\n        ')

    // Create per-matrix data table with specified columns
    db.exec(`
      CREATE TABLE IF NOT EXISTS "mx_${matrixId}_data" (
        id INTEGER PRIMARY KEY,
        ${columnDefs}
      ) STRICT;
    `)

    // Create per-matrix closure table
    db.exec(`
      CREATE TABLE IF NOT EXISTS "mx_${matrixId}_closure" (
        ancestor_key    BLOB NOT NULL,   -- key from rank (must belong to this matrix)
        descendant_key  BLOB NOT NULL,   -- key from rank (must belong to this matrix)
        depth           INTEGER NOT NULL CHECK (depth >= 0),
        PRIMARY KEY (ancestor_key, descendant_key)
      ) STRICT;

      -- Index for descendant lookups
      CREATE INDEX IF NOT EXISTS "mx_${matrixId}_closure_by_descendant"
        ON "mx_${matrixId}_closure"(descendant_key);
    `)

    // Commit transaction
    db.exec('COMMIT')
    return matrixId
  } catch (error) {
    // Rollback on error
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

  // Create root matrix with a single 'title' column
  db.exec('BEGIN TRANSACTION')

  try {
    // Insert the root matrix record with fixed ID = 1
    const rootColumns: ColumnDefinition[] = [{ name: 'title', type: 'TEXT', order: 0 }]
    const insertStmt = db.prepare(
      'INSERT INTO matrix (id, title, columns) VALUES (1, ?, ?) RETURNING id',
    )
    insertStmt.bind(['Root', JSON.stringify(rootColumns)])
    if (!insertStmt.step()) {
      insertStmt.finalize()
      throw new Error('Failed to insert root matrix record')
    }
    insertStmt.finalize()

    const matrixId = 1

    // Create per-matrix data table with single 'title' column
    db.exec(`
      CREATE TABLE IF NOT EXISTS "mx_${matrixId}_data" (
        id INTEGER PRIMARY KEY,
        title TEXT
      ) STRICT;
    `)

    // Create per-matrix closure table
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
      // Insert at root level with no siblings specified
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

    const rowsToAdd = Math.floor(Math.random() * 2) + 2 // 2-3 rows

    for (let i = 0; i < rowsToAdd; i++) {
      // Generate random data for the matrix data table
      const randomSuffix = Math.floor(Math.random() * 1000)
      const title = `Sample row ${randomSuffix}`

      // Insert into matrix data table
      const dataInsertStmt = db.prepare(`
        INSERT INTO "mx_${matrixId}_data" (title) 
        VALUES (?) RETURNING id
      `)
      dataInsertStmt.bind([title])
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
  const stmt = db.prepare('SELECT columns FROM matrix WHERE id = ?')
  stmt.bind([matrixId])

  if (!stmt.step()) {
    stmt.finalize()
    throw new Error(`Matrix ${matrixId} not found`)
  }

  const row = stmt.get({}) as { columns: string }
  stmt.finalize()
  return (JSON.parse(row.columns) as ColumnDefinition[]).sort((a, b) => a.order - b.order)
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
    const updated = [...current, { name: column.name, type: column.type, order: nextOrder }]
    db.exec('UPDATE matrix SET columns = ? WHERE id = ?', {
      bind: [JSON.stringify(updated), matrixId],
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

    const updated = current.filter((c) => c.name !== columnName)
    db.exec('UPDATE matrix SET columns = ? WHERE id = ?', {
      bind: [JSON.stringify(updated), matrixId],
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

    const updated = current.map((c) => (c.name === oldName ? { ...c, name: newName } : c))
    db.exec('UPDATE matrix SET columns = ? WHERE id = ?', {
      bind: [JSON.stringify(updated), matrixId],
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
