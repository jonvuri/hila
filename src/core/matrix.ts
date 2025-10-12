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
    -- Global ordering table
    -- ------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS ordering (
      key           BLOB PRIMARY KEY,  -- global sort key, or position id
      matrix_id     INTEGER NOT NULL REFERENCES matrix(id) ON DELETE CASCADE,
      element_kind  INTEGER NOT NULL CHECK (element_kind IN (0,1)),  -- 0=row, 1=child_matrix_ref
      element_id    INTEGER NOT NULL,  -- rowid of the element in the matrix data table, or matrix id of the child matrix

      -- minimal key validity: must end with a single terminator
      CHECK (length(key) > 0 AND substr(key, length(key), 1) = x'00')
    ) STRICT;
  `)
}

// Create a new matrix with its associated per-matrix tables
export const createMatrix = (db: Database, title: string): number => {
  db.exec('BEGIN TRANSACTION')

  try {
    // Insert the matrix record and get the new ID
    const insertStmt = db.prepare('INSERT INTO matrix (title) VALUES (?) RETURNING id')
    insertStmt.bind([title])
    if (!insertStmt.step()) {
      insertStmt.finalize()
      throw new Error('Failed to insert matrix record')
    }
    const result = insertStmt.get({}) as unknown as { id: number }
    const matrixId = result.id
    insertStmt.finalize()

    // Create per-matrix data table with sample columns
    db.exec(`
      CREATE TABLE IF NOT EXISTS "mx_${matrixId}_data" (
        id INTEGER PRIMARY KEY,
        data1 TEXT,
        data2 TEXT
      ) STRICT;
    `)

    // Create per-matrix closure table
    db.exec(`
      CREATE TABLE IF NOT EXISTS "mx_${matrixId}_closure" (
        ancestor_key    BLOB NOT NULL,   -- key from ordering (must belong to this matrix)
        descendant_key  BLOB NOT NULL,   -- key from ordering (must belong to this matrix)
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

/**
 * Insert an element into a matrix with proper ordering and closure relationships.
 *
 * @param db - Database instance
 * @param params - Insert parameters
 * @param params.matrixId - ID of the matrix to insert into
 * @param params.parentKey - Key of the parent element (optional for root-level elements)
 * @param params.prevKey - Key of the element to insert after (optional)
 * @param params.nextKey - Key of the element to insert before (optional)
 * @param params.elementKind - 0 for data row, 1 for child matrix reference
 * @param params.elementId - ID of the element (data row ID or child matrix ID)
 * @returns The generated ordering key for the new element
 */
export const insertElement = (
  db: Database,
  params: {
    matrixId: number
    parentKey?: Uint8Array
    prevKey?: Uint8Array
    nextKey?: Uint8Array
    elementKind: 0 | 1
    elementId: number
  },
): Uint8Array => {
  const { matrixId, parentKey, prevKey, nextKey, elementKind, elementId } = params

  db.exec('BEGIN TRANSACTION')

  try {
    // Compute the ordering key
    let orderingKey: Uint8Array

    if (prevKey && nextKey) {
      // Insert between two siblings
      orderingKey = between(prevKey, nextKey)
    } else if (prevKey) {
      // Insert after prevKey
      // Need to find what comes after prevKey to use as upper bound
      let upperBound = new Uint8Array(0)

      if (parentKey) {
        // We have a parent, so we need to stay within the parent's subtree
        const parentUpperBound = nextPrefix(parentKey)
        const nextSiblingStmt = db.prepare(`
          SELECT key FROM ordering
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
        // No parent specified, find next root-level element
        const nextSiblingStmt = db.prepare(`
          SELECT key FROM ordering
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

      orderingKey = between(prevKey, upperBound)
    } else if (nextKey) {
      // Insert before nextKey
      // Need to find what comes before nextKey to use as lower bound
      let lowerBound = new Uint8Array(0)

      if (parentKey) {
        // We have a parent, so we need to stay within the parent's subtree
        const prevSiblingStmt = db.prepare(`
          SELECT key FROM ordering
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
        // No parent specified, find previous root-level element
        const prevSiblingStmt = db.prepare(`
          SELECT key FROM ordering
          WHERE matrix_id = ? AND key < ?
          ORDER BY key DESC
          LIMIT 1
        `)
        prevSiblingStmt.bind([matrixId, nextKey])

        if (prevSiblingStmt.step()) {
          const result = prevSiblingStmt.get({}) as { key: Uint8Array }
          lowerBound = new Uint8Array(result.key)

          // Check if this previous element might have children between it and nextKey
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

      orderingKey = between(lowerBound, nextKey)
    } else if (parentKey) {
      // Insert as first child of parent
      // Find first existing child
      const firstChildStmt = db.prepare(`
        SELECT key FROM ordering
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
        orderingKey = between(parentKey, nextChild)
      } else {
        // No existing children, create first child by extending parent key
        firstChildStmt.finalize()
        // Parse parent key segments and add a new segment
        const parentSegments = parseKey(parentKey)
        const newSegment = new Uint8Array([0x80]) // Midpoint value for first child
        orderingKey = makeKey([...parentSegments, newSegment])
      }
    } else {
      // Insert at root level with no siblings specified
      // Find the last root-level element (elements with only one segment)
      const lastRootStmt = db.prepare(`
        SELECT key FROM ordering
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

      orderingKey = between(lastKey, new Uint8Array(0))
    }

    // Insert into ordering table
    db.exec(
      `
      INSERT INTO ordering (key, matrix_id, element_kind, element_id)
      VALUES (?, ?, ?, ?)
    `,
      {
        bind: [orderingKey, matrixId, elementKind, elementId],
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
        bind: [orderingKey, orderingKey],
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
            bind: [ancestor.ancestor_key, orderingKey, ancestor.depth + 1],
          },
        )
      }
    }

    db.exec('COMMIT')
    return orderingKey
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

// Simple utility to generate ordering keys (lexicographic BLOB order)
// For now, using a simple counter-based approach with proper termination
const generateOrderingKey = (prefix: string = '', counter: number = 1): Uint8Array => {
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
      SELECT COUNT(*) as count FROM ordering 
      WHERE matrix_id = ? AND element_kind = 0
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
      const data1 = `Sample data 1 - ${randomSuffix}`
      const data2 = `Sample data 2 - ${randomSuffix}`

      // Insert into matrix data table
      const dataInsertStmt = db.prepare(`
        INSERT INTO "mx_${matrixId}_data" (data1, data2) 
        VALUES (?, ?) RETURNING id
      `)
      dataInsertStmt.bind([data1, data2])
      if (!dataInsertStmt.step()) {
        dataInsertStmt.finalize()
        throw new Error('Failed to insert data row')
      }
      const dataResult = dataInsertStmt.get({}) as unknown as { id: number }
      const dataRowId = dataResult.id
      dataInsertStmt.finalize()

      // Determine if this should be a child of an existing row
      let orderingKey: Uint8Array
      let parentKey: Uint8Array | null = null

      if (existingCount > 0 && i === rowsToAdd - 1) {
        // Make the last row a child of an existing row
        const parentStmt = db.prepare(`
          SELECT key FROM ordering 
          WHERE matrix_id = ? AND element_kind = 0 
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
          orderingKey = generateOrderingKey(parentKeyStr + '_', i + 1)
        } else {
          orderingKey = generateOrderingKey('root_', existingCount + i + 1)
        }
      } else {
        // Create root-level entry
        orderingKey = generateOrderingKey('root_', existingCount + i + 1)
      }

      // Insert into ordering table
      db.exec(
        `
        INSERT INTO ordering (key, matrix_id, element_kind, element_id)
        VALUES (?, ?, 0, ?)
      `,
        {
          bind: [orderingKey, matrixId, dataRowId],
        },
      )

      // Insert into closure table (self-reference with depth 0)
      db.exec(
        `
        INSERT INTO "mx_${matrixId}_closure" (ancestor_key, descendant_key, depth)
        VALUES (?, ?, 0)
      `,
        {
          bind: [orderingKey, orderingKey],
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
              bind: [ancestor.ancestor_key, orderingKey, ancestor.depth + 1],
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

  const orderingStmt = db.prepare(`
    SELECT key, element_kind, element_id 
    FROM ordering 
    WHERE matrix_id = ? 
    ORDER BY key
  `)
  const ordering: unknown[] = []
  orderingStmt.bind([matrixId])
  while (orderingStmt.step()) {
    ordering.push(orderingStmt.get({}))
  }
  orderingStmt.finalize()

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

  return { data, ordering, closure }
}
