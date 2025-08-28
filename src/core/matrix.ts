import type { Database } from '@sqlite.org/sqlite-wasm'

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
