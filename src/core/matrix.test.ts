import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  initMatrixSchema,
  createMatrix,
  addSampleRowsToMatrix,
  insertRow,
  ensureRootMatrix,
  insertJoin,
  deleteJoin,
  getTargets,
  getSources,
  getColumns,
  addColumn,
  removeColumn,
  renameColumn,
} from './matrix'
import { compareKeys } from './lexorank'

describe('Root Matrix Initialization', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {}, // Suppress logs in tests
      printErr: () => {},
    })

    // Use in-memory database for tests
    db = new sqlite3.oo1.DB(':memory:', 'c')

    // Initialize the matrix schema
    initMatrixSchema(db)
  })

  test('ensureRootMatrix should create root matrix with ID = 1', () => {
    const rootId = ensureRootMatrix(db)

    // Verify root matrix has ID = 1
    expect(rootId).toBe(1)

    // Verify the matrix exists in the database
    const checkStmt = db.prepare('SELECT id, title FROM matrix WHERE id = 1')
    expect(checkStmt.step()).toBe(true)
    const result = checkStmt.get({}) as { id: number; title: string }
    expect(result.id).toBe(1)
    expect(result.title).toBe('Root')
    checkStmt.finalize()
  })

  test('ensureRootMatrix should create data table with only title column', () => {
    ensureRootMatrix(db)

    // Verify data table exists
    const dataTableExists = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='mx_1_data'`,
    )
    expect(dataTableExists.step()).toBe(true)
    dataTableExists.finalize()

    // Verify data table schema has 'id' and 'title' columns
    const schemaStmt = db.prepare(`PRAGMA table_info(mx_1_data)`)
    const columns: { name: string; type: string }[] = []
    while (schemaStmt.step()) {
      const col = schemaStmt.get({}) as { name: string; type: string }
      columns.push({ name: col.name, type: col.type })
    }
    schemaStmt.finalize()

    expect(columns).toHaveLength(2)
    expect(columns[0]).toEqual({ name: 'id', type: 'INTEGER' })
    expect(columns[1]).toEqual({ name: 'title', type: 'TEXT' })
  })

  test('ensureRootMatrix should create closure table', () => {
    ensureRootMatrix(db)

    // Verify closure table exists
    const closureTableExists = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='mx_1_closure'`,
    )
    expect(closureTableExists.step()).toBe(true)
    closureTableExists.finalize()
  })

  test('ensureRootMatrix should be idempotent', () => {
    // Call ensureRootMatrix twice
    const rootId1 = ensureRootMatrix(db)
    const rootId2 = ensureRootMatrix(db)

    // Both should return ID = 1
    expect(rootId1).toBe(1)
    expect(rootId2).toBe(1)

    // Verify only one matrix with ID = 1 exists
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM matrix WHERE id = 1')
    countStmt.step()
    const count = (countStmt.get({}) as { count: number }).count
    expect(count).toBe(1)
    countStmt.finalize()
  })
})

describe('Matrix Operations', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {}, // Suppress logs in tests
      printErr: () => {},
    })

    // Use in-memory database for tests
    db = new sqlite3.oo1.DB(':memory:', 'c')

    // Initialize the matrix schema
    initMatrixSchema(db)
  })

  test('createMatrix should create a new matrix and return its ID', () => {
    // Test creating a matrix
    const matrixId = createMatrix(db, 'Test Matrix')

    // Verify the matrix was created
    expect(matrixId).toBeTypeOf('number')
    expect(matrixId).toBeGreaterThan(0)

    // Verify the matrix exists in the database
    const checkStmt = db.prepare('SELECT id, title FROM matrix WHERE id = ?')
    checkStmt.bind([matrixId])
    expect(checkStmt.step()).toBe(true)
    const result = checkStmt.get({}) as { id: number; title: string }
    expect(result.id).toBe(matrixId)
    expect(result.title).toBe('Test Matrix')
    checkStmt.finalize()

    // Verify per-matrix tables were created
    const dataTableExists = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='mx_${matrixId}_data'`,
    )
    expect(dataTableExists.step()).toBe(true)
    dataTableExists.finalize()

    const closureTableExists = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='mx_${matrixId}_closure'`,
    )
    expect(closureTableExists.step()).toBe(true)
    closureTableExists.finalize()
  })

  test('createMatrix should handle multiple matrices', () => {
    const matrix1Id = createMatrix(db, 'First Matrix')
    const matrix2Id = createMatrix(db, 'Second Matrix')

    expect(matrix1Id).not.toBe(matrix2Id)
    expect(matrix2Id).toBeGreaterThan(matrix1Id)

    // Verify both matrices exist
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM matrix')
    countStmt.step()
    const count = (countStmt.get({}) as { count: number }).count
    expect(count).toBe(2)
    countStmt.finalize()
  })

  test('addSampleRowsToMatrix should add rows with proper relationships', () => {
    const matrixId = createMatrix(db, 'Test Matrix')

    // Add sample rows
    addSampleRowsToMatrix(db, matrixId)

    // Verify data was added to the data table
    const dataStmt = db.prepare(`SELECT COUNT(*) as count FROM "mx_${matrixId}_data"`)
    dataStmt.step()
    const dataCount = (dataStmt.get({}) as { count: number }).count
    expect(dataCount).toBeGreaterThanOrEqual(2)
    expect(dataCount).toBeLessThanOrEqual(3)
    dataStmt.finalize()

    // Verify rank entries were created
    const rankStmt = db.prepare(`SELECT COUNT(*) as count FROM rank WHERE matrix_id = ?`)
    rankStmt.bind([matrixId])
    rankStmt.step()
    const rankCount = (rankStmt.get({}) as { count: number }).count
    expect(rankCount).toBe(dataCount)
    rankStmt.finalize()

    // Verify closure table has self-references (minimum)
    const closureStmt = db.prepare(`SELECT COUNT(*) as count FROM "mx_${matrixId}_closure"`)
    closureStmt.step()
    const closureCount = (closureStmt.get({}) as { count: number }).count
    expect(closureCount).toBeGreaterThanOrEqual(dataCount) // At least self-references
    closureStmt.finalize()
  })

  test('addSampleRowsToMatrix should create hierarchical relationships on subsequent calls', () => {
    const matrixId = createMatrix(db, 'Test Matrix')

    // Add first batch of sample rows
    addSampleRowsToMatrix(db, matrixId)

    // Add second batch (should create some child relationships)
    addSampleRowsToMatrix(db, matrixId)

    // Verify we have more closure relationships than just self-references
    const closureStmt = db.prepare(`
      SELECT COUNT(*) as count 
      FROM "mx_${matrixId}_closure" 
      WHERE depth > 0
    `)
    closureStmt.step()
    const hierarchicalCount = (closureStmt.get({}) as { count: number }).count
    expect(hierarchicalCount).toBeGreaterThan(0) // Should have some parent-child relationships
    closureStmt.finalize()
  })
})

describe('insertRow API', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {}, // Suppress logs in tests
      printErr: () => {},
    })

    // Use in-memory database for tests
    db = new sqlite3.oo1.DB(':memory:', 'c')

    // Initialize the matrix schema
    initMatrixSchema(db)
  })

  test('should insert row at root level with no existing rows', () => {
    const matrixId = createMatrix(db, 'Test Matrix')

    // Create a data row
    const dataStmt = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`,
    )
    dataStmt.bind(['First row'])
    dataStmt.step()
    const dataRowId = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    // Insert row
    const key = insertRow(db, {
      matrixId,
      rowKind: 0,
      rowId: dataRowId,
    })

    // Verify rank entry was created
    const rankStmt = db.prepare('SELECT * FROM rank WHERE matrix_id = ?')
    rankStmt.bind([matrixId])
    expect(rankStmt.step()).toBe(true)
    const rankRow = rankStmt.get({}) as {
      key: Uint8Array
      matrix_id: number
      row_kind: number
      row_id: number
    }
    expect(rankRow.matrix_id).toBe(matrixId)
    expect(rankRow.row_kind).toBe(0)
    expect(rankRow.row_id).toBe(dataRowId)
    expect(compareKeys(rankRow.key, key)).toBe(0)
    rankStmt.finalize()

    // Verify closure entry was created (self-reference)
    const closureStmt = db.prepare(`SELECT * FROM "mx_${matrixId}_closure"`)
    expect(closureStmt.step()).toBe(true)
    const closureRow = closureStmt.get({}) as {
      ancestor_key: Uint8Array
      descendant_key: Uint8Array
      depth: number
    }
    expect(compareKeys(closureRow.ancestor_key, key)).toBe(0)
    expect(compareKeys(closureRow.descendant_key, key)).toBe(0)
    expect(closureRow.depth).toBe(0)
    expect(closureStmt.step()).toBe(false) // Should only have one entry
    closureStmt.finalize()
  })

  test('should insert multiple rows in order with only prevKey', () => {
    const matrixId = createMatrix(db, 'Test Matrix')

    let dataStmt = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`,
    )
    dataStmt.bind(['First'])
    dataStmt.step()
    const dataRowId1 = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key1 = insertRow(db, {
      matrixId,
      rowKind: 0,
      rowId: dataRowId1,
    })

    // Insert second row after first
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`)
    dataStmt.bind(['Second'])
    dataStmt.step()
    const dataRowId2 = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key2 = insertRow(db, {
      matrixId,
      prevKey: key1,
      rowKind: 0,
      rowId: dataRowId2,
    })

    // Insert third row after second
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`)
    dataStmt.bind(['Third'])
    dataStmt.step()
    const dataRowId3 = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key3 = insertRow(db, {
      matrixId,
      prevKey: key2,
      rowKind: 0,
      rowId: dataRowId3,
    })

    // Verify ordering: key1 < key2 < key3
    expect(compareKeys(key1, key2)).toBe(-1)
    expect(compareKeys(key2, key3)).toBe(-1)
    expect(compareKeys(key1, key3)).toBe(-1)

    // Verify rows appear in order in the database
    const rankStmt = db.prepare('SELECT row_id FROM rank WHERE matrix_id = ? ORDER BY key')
    rankStmt.bind([matrixId])

    expect(rankStmt.step()).toBe(true)
    expect((rankStmt.get({}) as { row_id: number }).row_id).toBe(dataRowId1)

    expect(rankStmt.step()).toBe(true)
    expect((rankStmt.get({}) as { row_id: number }).row_id).toBe(dataRowId2)

    expect(rankStmt.step()).toBe(true)
    expect((rankStmt.get({}) as { row_id: number }).row_id).toBe(dataRowId3)

    expect(rankStmt.step()).toBe(false)
    rankStmt.finalize()
  })

  test('should insert multiple rows in order with only nextKey', () => {
    const matrixId = createMatrix(db, 'Test Matrix')

    let dataStmt = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`,
    )
    dataStmt.bind(['Third'])
    dataStmt.step()
    const dataRowId3 = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key3 = insertRow(db, {
      matrixId,
      rowKind: 0,
      rowId: dataRowId3,
    })

    // Insert second row before third
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`)
    dataStmt.bind(['Second'])
    dataStmt.step()
    const dataRowId2 = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key2 = insertRow(db, {
      matrixId,
      nextKey: key3,
      rowKind: 0,
      rowId: dataRowId2,
    })

    // Insert first row before second
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`)
    dataStmt.bind(['First'])
    dataStmt.step()
    const dataRowId1 = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key1 = insertRow(db, {
      matrixId,
      nextKey: key2,
      rowKind: 0,
      rowId: dataRowId1,
    })

    // Verify ordering: key1 < key2 < key3
    expect(compareKeys(key1, key2)).toBe(-1)
    expect(compareKeys(key2, key3)).toBe(-1)
    expect(compareKeys(key1, key3)).toBe(-1)

    // Verify rows appear in order in the database
    const rankStmt = db.prepare('SELECT row_id FROM rank WHERE matrix_id = ? ORDER BY key')
    rankStmt.bind([matrixId])

    expect(rankStmt.step()).toBe(true)
    expect((rankStmt.get({}) as { row_id: number }).row_id).toBe(dataRowId1)

    expect(rankStmt.step()).toBe(true)
    expect((rankStmt.get({}) as { row_id: number }).row_id).toBe(dataRowId2)

    expect(rankStmt.step()).toBe(true)
    expect((rankStmt.get({}) as { row_id: number }).row_id).toBe(dataRowId3)

    expect(rankStmt.step()).toBe(false)
    rankStmt.finalize()
  })

  test('should insert row between two existing rows', () => {
    const matrixId = createMatrix(db, 'Test Matrix')

    let dataStmt = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`,
    )
    dataStmt.bind(['First'])
    dataStmt.step()
    const dataRowId1 = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key1 = insertRow(db, {
      matrixId,
      rowKind: 0,
      rowId: dataRowId1,
    })

    // Insert third row
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`)
    dataStmt.bind(['Third'])
    dataStmt.step()
    const dataRowId3 = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key3 = insertRow(db, {
      matrixId,
      prevKey: key1,
      rowKind: 0,
      rowId: dataRowId3,
    })

    // Insert middle row
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`)
    dataStmt.bind(['Second'])
    dataStmt.step()
    const dataRowId2 = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key2 = insertRow(db, {
      matrixId,
      prevKey: key1,
      nextKey: key3,
      rowKind: 0,
      rowId: dataRowId2,
    })

    // Verify ordering: key1 < key2 < key3
    expect(compareKeys(key1, key2)).toBe(-1)
    expect(compareKeys(key2, key3)).toBe(-1)
    expect(compareKeys(key1, key3)).toBe(-1)

    // Verify rows appear in order in the database
    const rankStmt = db.prepare('SELECT row_id FROM rank WHERE matrix_id = ? ORDER BY key')
    rankStmt.bind([matrixId])

    expect(rankStmt.step()).toBe(true)
    expect((rankStmt.get({}) as { row_id: number }).row_id).toBe(dataRowId1)

    expect(rankStmt.step()).toBe(true)
    expect((rankStmt.get({}) as { row_id: number }).row_id).toBe(dataRowId2)

    expect(rankStmt.step()).toBe(true)
    expect((rankStmt.get({}) as { row_id: number }).row_id).toBe(dataRowId3)

    expect(rankStmt.step()).toBe(false)
    rankStmt.finalize()
  })

  test('should insert child rows with parentKey', () => {
    const matrixId = createMatrix(db, 'Test Matrix')

    // Create and insert parent row
    let dataStmt = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`,
    )
    dataStmt.bind(['Parent'])
    dataStmt.step()
    const parentRowId = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const parentKey = insertRow(db, {
      matrixId,
      rowKind: 0,
      rowId: parentRowId,
    })

    // Create and insert first child
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`)
    dataStmt.bind(['Child 1'])
    dataStmt.step()
    const childRowId1 = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const childKey1 = insertRow(db, {
      matrixId,
      parentKey,
      rowKind: 0,
      rowId: childRowId1,
    })

    // Create and insert second child
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`)
    dataStmt.bind(['Child 2'])
    dataStmt.step()
    const childRowId2 = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const childKey2 = insertRow(db, {
      matrixId,
      parentKey,
      prevKey: childKey1,
      rowKind: 0,
      rowId: childRowId2,
    })

    // Verify ordering: parentKey < childKey1 < childKey2
    expect(compareKeys(parentKey, childKey1)).toBe(-1)
    expect(compareKeys(childKey1, childKey2)).toBe(-1)
    expect(compareKeys(parentKey, childKey2)).toBe(-1)

    // Verify closure relationships for first child
    const closure1Stmt = db.prepare(`
      SELECT ancestor_key, depth FROM "mx_${matrixId}_closure"
      WHERE descendant_key = ?
      ORDER BY depth
    `)
    closure1Stmt.bind([childKey1])

    expect(closure1Stmt.step()).toBe(true)
    let closureRow = closure1Stmt.get({}) as { ancestor_key: Uint8Array; depth: number }
    expect(compareKeys(closureRow.ancestor_key, childKey1)).toBe(0)
    expect(closureRow.depth).toBe(0) // Self-reference

    expect(closure1Stmt.step()).toBe(true)
    closureRow = closure1Stmt.get({}) as { ancestor_key: Uint8Array; depth: number }
    expect(compareKeys(closureRow.ancestor_key, parentKey)).toBe(0)
    expect(closureRow.depth).toBe(1) // Parent relationship

    expect(closure1Stmt.step()).toBe(false)
    closure1Stmt.finalize()

    // Verify closure relationships for second child
    const closure2Stmt = db.prepare(`
      SELECT ancestor_key, depth FROM "mx_${matrixId}_closure"
      WHERE descendant_key = ?
      ORDER BY depth
    `)
    closure2Stmt.bind([childKey2])

    expect(closure2Stmt.step()).toBe(true)
    closureRow = closure2Stmt.get({}) as { ancestor_key: Uint8Array; depth: number }
    expect(compareKeys(closureRow.ancestor_key, childKey2)).toBe(0)
    expect(closureRow.depth).toBe(0) // Self-reference

    expect(closure2Stmt.step()).toBe(true)
    closureRow = closure2Stmt.get({}) as { ancestor_key: Uint8Array; depth: number }
    expect(compareKeys(closureRow.ancestor_key, parentKey)).toBe(0)
    expect(closureRow.depth).toBe(1) // Parent relationship

    expect(closure2Stmt.step()).toBe(false)
    closure2Stmt.finalize()
  })

  test('should handle nested parent-child relationships', () => {
    const matrixId = createMatrix(db, 'Test Matrix')

    // Create and insert root row
    let dataStmt = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`,
    )
    dataStmt.bind(['Root'])
    dataStmt.step()
    const rootRowId = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const rootKey = insertRow(db, {
      matrixId,
      rowKind: 0,
      rowId: rootRowId,
    })

    // Create and insert child row
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`)
    dataStmt.bind(['Child'])
    dataStmt.step()
    const childRowId = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const childKey = insertRow(db, {
      matrixId,
      parentKey: rootKey,
      rowKind: 0,
      rowId: childRowId,
    })

    // Create and insert grandchild row
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`)
    dataStmt.bind(['Grandchild'])
    dataStmt.step()
    const grandchildRowId = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const grandchildKey = insertRow(db, {
      matrixId,
      parentKey: childKey,
      rowKind: 0,
      rowId: grandchildRowId,
    })

    // Verify ordering: rootKey < childKey < grandchildKey
    expect(compareKeys(rootKey, childKey)).toBe(-1)
    expect(compareKeys(childKey, grandchildKey)).toBe(-1)
    expect(compareKeys(rootKey, grandchildKey)).toBe(-1)

    // Verify closure relationships for grandchild
    const closureStmt = db.prepare(`
      SELECT ancestor_key, depth FROM "mx_${matrixId}_closure"
      WHERE descendant_key = ?
      ORDER BY depth
    `)
    closureStmt.bind([grandchildKey])

    expect(closureStmt.step()).toBe(true)
    let closureRow = closureStmt.get({}) as { ancestor_key: Uint8Array; depth: number }
    expect(compareKeys(closureRow.ancestor_key, grandchildKey)).toBe(0)
    expect(closureRow.depth).toBe(0) // Self-reference

    expect(closureStmt.step()).toBe(true)
    closureRow = closureStmt.get({}) as { ancestor_key: Uint8Array; depth: number }
    expect(compareKeys(closureRow.ancestor_key, childKey)).toBe(0)
    expect(closureRow.depth).toBe(1) // Parent relationship

    expect(closureStmt.step()).toBe(true)
    closureRow = closureStmt.get({}) as { ancestor_key: Uint8Array; depth: number }
    expect(compareKeys(closureRow.ancestor_key, rootKey)).toBe(0)
    expect(closureRow.depth).toBe(2) // Grandparent relationship

    expect(closureStmt.step()).toBe(false)
    closureStmt.finalize()
  })

  test('should insert two children of the same parent correctly', () => {
    const matrixId = createMatrix(db, 'Test Matrix')

    // Create parent
    let dataStmt = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`,
    )
    dataStmt.bind(['Parent'])
    dataStmt.step()
    const parentId = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const parentKey = insertRow(db, {
      matrixId,
      rowKind: 0,
      rowId: parentId,
    })

    // Create first child
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`)
    dataStmt.bind(['Child 1'])
    dataStmt.step()
    const child1Id = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const child1Key = insertRow(db, {
      matrixId,
      parentKey,
      rowKind: 0,
      rowId: child1Id,
    })

    // Create second child
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`)
    dataStmt.bind(['Child 2'])
    dataStmt.step()
    const child2Id = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const child2Key = insertRow(db, {
      matrixId,
      parentKey,
      prevKey: child1Key,
      rowKind: 0,
      rowId: child2Id,
    })

    // Verify keys are different
    expect(compareKeys(child1Key, child2Key)).toBe(-1)

    // Verify both are children of parent
    expect(compareKeys(parentKey, child1Key)).toBe(-1)
    expect(compareKeys(parentKey, child2Key)).toBe(-1)

    // Verify they appear in order in the database
    const rankStmt = db.prepare('SELECT row_id FROM rank WHERE matrix_id = ? ORDER BY key')
    rankStmt.bind([matrixId])

    expect(rankStmt.step()).toBe(true)
    expect((rankStmt.get({}) as { row_id: number }).row_id).toBe(parentId)

    expect(rankStmt.step()).toBe(true)
    expect((rankStmt.get({}) as { row_id: number }).row_id).toBe(child1Id)

    expect(rankStmt.step()).toBe(true)
    expect((rankStmt.get({}) as { row_id: number }).row_id).toBe(child2Id)

    expect(rankStmt.step()).toBe(false)
    rankStmt.finalize()
  })

  test('should maintain correct ordering with multiple inserts at different levels', () => {
    const matrixId = createMatrix(db, 'Test Matrix')

    // Create root level rows
    const dataStmt1 = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`,
    )
    dataStmt1.bind(['Root 1'])
    dataStmt1.step()
    const rootId1 = (dataStmt1.get({}) as { id: number }).id
    dataStmt1.finalize()

    const rootKey1 = insertRow(db, {
      matrixId,
      rowKind: 0,
      rowId: rootId1,
    })

    const dataStmt2 = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`,
    )
    dataStmt2.bind(['Root 2'])
    dataStmt2.step()
    const rootId2 = (dataStmt2.get({}) as { id: number }).id
    dataStmt2.finalize()

    const rootKey2 = insertRow(db, {
      matrixId,
      prevKey: rootKey1,
      rowKind: 0,
      rowId: rootId2,
    })

    // Create children for Root 1
    const dataStmt3 = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`,
    )
    dataStmt3.bind(['Child 1.1'])
    dataStmt3.step()
    const childId1_1 = (dataStmt3.get({}) as { id: number }).id
    dataStmt3.finalize()

    const childKey1_1 = insertRow(db, {
      matrixId,
      parentKey: rootKey1,
      rowKind: 0,
      rowId: childId1_1,
    })

    const dataStmt4 = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`,
    )
    dataStmt4.bind(['Child 1.2'])
    dataStmt4.step()
    const childId1_2 = (dataStmt4.get({}) as { id: number }).id
    dataStmt4.finalize()

    const childKey1_2 = insertRow(db, {
      matrixId,
      parentKey: rootKey1,
      prevKey: childKey1_1,
      rowKind: 0,
      rowId: childId1_2,
    })

    // Verify all keys are in correct order
    const keys = [rootKey1, childKey1_1, childKey1_2, rootKey2]
    for (let i = 0; i < keys.length - 1; i++) {
      expect(compareKeys(keys[i]!, keys[i + 1]!)).toBe(-1)
    }

    // Verify they appear in order in the database
    const rankStmt = db.prepare('SELECT row_id FROM rank WHERE matrix_id = ? ORDER BY key')
    rankStmt.bind([matrixId])

    const expectedOrder = [rootId1, childId1_1, childId1_2, rootId2]
    for (const expectedId of expectedOrder) {
      expect(rankStmt.step()).toBe(true)
      expect((rankStmt.get({}) as { row_id: number }).row_id).toBe(expectedId)
    }

    expect(rankStmt.step()).toBe(false)
    rankStmt.finalize()
  })
})

describe('Join table', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })

    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('joins table and index exist after schema init', () => {
    const tableStmt = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='joins'`,
    )
    expect(tableStmt.step()).toBe(true)
    tableStmt.finalize()

    const indexStmt = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='index' AND name='joins_by_target'`,
    )
    expect(indexStmt.step()).toBe(true)
    indexStmt.finalize()
  })

  test('insertJoin creates a join and getTargets returns it', () => {
    const m1 = createMatrix(db, 'Source')
    const m2 = createMatrix(db, 'Target')

    insertJoin(db, m1, 1, m2, 10)

    const targets = getTargets(db, m1, 1)
    expect(targets).toEqual([{ targetMatrixId: m2, targetRowId: 10 }])
  })

  test('getTargets returns empty array when no joins exist', () => {
    const m1 = createMatrix(db, 'Source')
    expect(getTargets(db, m1, 1)).toEqual([])
  })

  test('getSources returns reverse lookup results', () => {
    const m1 = createMatrix(db, 'Source')
    const m2 = createMatrix(db, 'Target')

    insertJoin(db, m1, 1, m2, 10)

    const sources = getSources(db, m2, 10)
    expect(sources).toEqual([{ sourceMatrixId: m1, sourceRowId: 1 }])
  })

  test('getSources returns empty array when no joins exist', () => {
    const m2 = createMatrix(db, 'Target')
    expect(getSources(db, m2, 10)).toEqual([])
  })

  test('deleteJoin removes a join', () => {
    const m1 = createMatrix(db, 'Source')
    const m2 = createMatrix(db, 'Target')

    insertJoin(db, m1, 1, m2, 10)
    expect(getTargets(db, m1, 1)).toHaveLength(1)

    deleteJoin(db, m1, 1, m2, 10)
    expect(getTargets(db, m1, 1)).toEqual([])
    expect(getSources(db, m2, 10)).toEqual([])
  })

  test('deleteJoin on non-existent join is a no-op', () => {
    const m1 = createMatrix(db, 'Source')
    const m2 = createMatrix(db, 'Target')

    // Should not throw
    deleteJoin(db, m1, 1, m2, 10)
  })

  test('duplicate insertJoin is idempotent (no error, single row)', () => {
    const m1 = createMatrix(db, 'Source')
    const m2 = createMatrix(db, 'Target')

    insertJoin(db, m1, 1, m2, 10)
    insertJoin(db, m1, 1, m2, 10)

    const targets = getTargets(db, m1, 1)
    expect(targets).toEqual([{ targetMatrixId: m2, targetRowId: 10 }])
  })

  test('many-to-many: one source row can reference multiple targets', () => {
    const m1 = createMatrix(db, 'Notes')
    const m2 = createMatrix(db, 'Tags')
    const m3 = createMatrix(db, 'People')

    insertJoin(db, m1, 1, m2, 10)
    insertJoin(db, m1, 1, m2, 20)
    insertJoin(db, m1, 1, m3, 5)

    const targets = getTargets(db, m1, 1)
    expect(targets).toHaveLength(3)
    expect(targets).toContainEqual({ targetMatrixId: m2, targetRowId: 10 })
    expect(targets).toContainEqual({ targetMatrixId: m2, targetRowId: 20 })
    expect(targets).toContainEqual({ targetMatrixId: m3, targetRowId: 5 })
  })

  test('many-to-many: one target row can be referenced by multiple sources', () => {
    const m1 = createMatrix(db, 'Notes A')
    const m2 = createMatrix(db, 'Notes B')
    const mTag = createMatrix(db, 'Tags')

    insertJoin(db, m1, 1, mTag, 10)
    insertJoin(db, m1, 2, mTag, 10)
    insertJoin(db, m2, 5, mTag, 10)

    const sources = getSources(db, mTag, 10)
    expect(sources).toHaveLength(3)
    expect(sources).toContainEqual({ sourceMatrixId: m1, sourceRowId: 1 })
    expect(sources).toContainEqual({ sourceMatrixId: m1, sourceRowId: 2 })
    expect(sources).toContainEqual({ sourceMatrixId: m2, sourceRowId: 5 })
  })

  test('deleting one join does not affect other joins from the same source', () => {
    const m1 = createMatrix(db, 'Source')
    const m2 = createMatrix(db, 'Target')

    insertJoin(db, m1, 1, m2, 10)
    insertJoin(db, m1, 1, m2, 20)

    deleteJoin(db, m1, 1, m2, 10)

    const targets = getTargets(db, m1, 1)
    expect(targets).toEqual([{ targetMatrixId: m2, targetRowId: 20 }])
  })

  test('joins between different source rows are independent', () => {
    const m1 = createMatrix(db, 'Source')
    const m2 = createMatrix(db, 'Target')

    insertJoin(db, m1, 1, m2, 10)
    insertJoin(db, m1, 2, m2, 20)

    expect(getTargets(db, m1, 1)).toEqual([{ targetMatrixId: m2, targetRowId: 10 }])
    expect(getTargets(db, m1, 2)).toEqual([{ targetMatrixId: m2, targetRowId: 20 }])
  })
})

describe('Column schema management', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })

    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  // -- getColumns / createMatrix integration ----------------------------------

  test('createMatrix stores column definitions in registry', () => {
    const id = createMatrix(db, 'M')
    const cols = getColumns(db, id)

    expect(cols).toEqual([{ name: 'title', type: 'TEXT', order: 0 }])
  })

  test('createMatrix with custom columns stores them correctly', () => {
    const id = createMatrix(db, 'Custom', [
      { name: 'name', type: 'TEXT' },
      { name: 'score', type: 'INTEGER' },
      { name: 'active', type: 'INTEGER' },
    ])

    const cols = getColumns(db, id)
    expect(cols).toEqual([
      { name: 'name', type: 'TEXT', order: 0 },
      { name: 'score', type: 'INTEGER', order: 1 },
      { name: 'active', type: 'INTEGER', order: 2 },
    ])
  })

  test('createMatrix data table schema matches registry', () => {
    const id = createMatrix(db, 'M', [
      { name: 'a', type: 'TEXT' },
      { name: 'b', type: 'INTEGER' },
    ])

    const pragmaStmt = db.prepare(`PRAGMA table_info("mx_${id}_data")`)
    const tableCols: { name: string; type: string }[] = []
    while (pragmaStmt.step()) {
      const row = pragmaStmt.get({}) as { name: string; type: string }
      tableCols.push({ name: row.name, type: row.type })
    }
    pragmaStmt.finalize()

    expect(tableCols).toEqual([
      { name: 'id', type: 'INTEGER' },
      { name: 'a', type: 'TEXT' },
      { name: 'b', type: 'INTEGER' },
    ])
  })

  test('ensureRootMatrix stores column definitions', () => {
    ensureRootMatrix(db)
    const cols = getColumns(db, 1)
    expect(cols).toEqual([{ name: 'title', type: 'TEXT', order: 0 }])
  })

  test('getColumns throws for non-existent matrix', () => {
    expect(() => getColumns(db, 999)).toThrow('Matrix 999 not found')
  })

  test('getColumns returns columns sorted by order', () => {
    const id = createMatrix(db, 'M')

    // Clear default column and insert out-of-order rows to verify sorting
    db.exec('DELETE FROM matrix_columns WHERE matrix_id = ?', { bind: [id] })
    db.exec(
      `INSERT INTO matrix_columns (matrix_id, name, type, "order") VALUES (?, 'z', 'TEXT', 2)`,
      { bind: [id] },
    )
    db.exec(
      `INSERT INTO matrix_columns (matrix_id, name, type, "order") VALUES (?, 'a', 'TEXT', 0)`,
      { bind: [id] },
    )
    db.exec(
      `INSERT INTO matrix_columns (matrix_id, name, type, "order") VALUES (?, 'm', 'TEXT', 1)`,
      { bind: [id] },
    )

    const cols = getColumns(db, id)
    expect(cols.map((c) => c.name)).toEqual(['a', 'm', 'z'])
  })

  // -- addColumn --------------------------------------------------------------

  test('addColumn adds column to data table and registry', () => {
    const id = createMatrix(db, 'M')

    addColumn(db, id, { name: 'notes', type: 'TEXT' })

    const cols = getColumns(db, id)
    expect(cols).toEqual([
      { name: 'title', type: 'TEXT', order: 0 },
      { name: 'notes', type: 'TEXT', order: 1 },
    ])

    // Verify actual table schema
    const pragmaStmt = db.prepare(`PRAGMA table_info("mx_${id}_data")`)
    const names: string[] = []
    while (pragmaStmt.step()) {
      names.push((pragmaStmt.get({}) as { name: string }).name)
    }
    pragmaStmt.finalize()

    expect(names).toContain('notes')
  })

  test('addColumn preserves existing data', () => {
    const id = createMatrix(db, 'M')

    db.exec(`INSERT INTO "mx_${id}_data" (title) VALUES ('hello')`)

    addColumn(db, id, { name: 'extra', type: 'TEXT' })

    const stmt = db.prepare(`SELECT title, extra FROM "mx_${id}_data"`)
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { title: string; extra: string | null }
    expect(row.title).toBe('hello')
    expect(row.extra).toBeNull()
    stmt.finalize()
  })

  test('addColumn throws on duplicate column name', () => {
    const id = createMatrix(db, 'M')

    expect(() => addColumn(db, id, { name: 'title', type: 'TEXT' })).toThrow(
      'Column "title" already exists',
    )
  })

  // -- removeColumn -----------------------------------------------------------

  test('removeColumn removes column from data table and registry', () => {
    const id = createMatrix(db, 'M', [
      { name: 'a', type: 'TEXT' },
      { name: 'b', type: 'INTEGER' },
      { name: 'c', type: 'TEXT' },
    ])

    removeColumn(db, id, 'b')

    const cols = getColumns(db, id)
    expect(cols.map((c) => c.name)).toEqual(['a', 'c'])

    // Verify actual table schema
    const pragmaStmt = db.prepare(`PRAGMA table_info("mx_${id}_data")`)
    const names: string[] = []
    while (pragmaStmt.step()) {
      names.push((pragmaStmt.get({}) as { name: string }).name)
    }
    pragmaStmt.finalize()

    expect(names).toContain('a')
    expect(names).toContain('c')
    expect(names).not.toContain('b')
  })

  test('removeColumn preserves data in remaining columns', () => {
    const id = createMatrix(db, 'M', [
      { name: 'keep', type: 'TEXT' },
      { name: 'drop', type: 'TEXT' },
    ])

    db.exec(`INSERT INTO "mx_${id}_data" ("keep", "drop") VALUES ('yes', 'no')`)

    removeColumn(db, id, 'drop')

    const stmt = db.prepare(`SELECT "keep" FROM "mx_${id}_data"`)
    expect(stmt.step()).toBe(true)
    expect((stmt.get({}) as { keep: string }).keep).toBe('yes')
    stmt.finalize()
  })

  test('removeColumn throws for non-existent column', () => {
    const id = createMatrix(db, 'M')

    expect(() => removeColumn(db, id, 'nope')).toThrow('Column "nope" not found')
  })

  // -- renameColumn -----------------------------------------------------------

  test('renameColumn renames column in data table and registry', () => {
    const id = createMatrix(db, 'M')

    renameColumn(db, id, 'title', 'name')

    const cols = getColumns(db, id)
    expect(cols).toEqual([{ name: 'name', type: 'TEXT', order: 0 }])

    // Verify actual table schema
    const pragmaStmt = db.prepare(`PRAGMA table_info("mx_${id}_data")`)
    const names: string[] = []
    while (pragmaStmt.step()) {
      names.push((pragmaStmt.get({}) as { name: string }).name)
    }
    pragmaStmt.finalize()

    expect(names).toContain('name')
    expect(names).not.toContain('title')
  })

  test('renameColumn preserves data', () => {
    const id = createMatrix(db, 'M')

    db.exec(`INSERT INTO "mx_${id}_data" (title) VALUES ('kept')`)

    renameColumn(db, id, 'title', 'label')

    const stmt = db.prepare(`SELECT label FROM "mx_${id}_data"`)
    expect(stmt.step()).toBe(true)
    expect((stmt.get({}) as { label: string }).label).toBe('kept')
    stmt.finalize()
  })

  test('renameColumn preserves order', () => {
    const id = createMatrix(db, 'M', [
      { name: 'a', type: 'TEXT' },
      { name: 'b', type: 'TEXT' },
      { name: 'c', type: 'TEXT' },
    ])

    renameColumn(db, id, 'b', 'beta')

    const cols = getColumns(db, id)
    expect(cols.map((c) => c.name)).toEqual(['a', 'beta', 'c'])
    expect(cols[1]!.order).toBe(1)
  })

  test('renameColumn throws for non-existent old name', () => {
    const id = createMatrix(db, 'M')

    expect(() => renameColumn(db, id, 'nope', 'x')).toThrow('Column "nope" not found')
  })

  test('renameColumn throws when new name already exists', () => {
    const id = createMatrix(db, 'M', [
      { name: 'a', type: 'TEXT' },
      { name: 'b', type: 'TEXT' },
    ])

    expect(() => renameColumn(db, id, 'a', 'b')).toThrow('Column "b" already exists')
  })

  // -- Combined operations ----------------------------------------------------

  test('add then remove column round-trips cleanly', () => {
    const id = createMatrix(db, 'M')

    addColumn(db, id, { name: 'temp', type: 'INTEGER' })
    expect(getColumns(db, id)).toHaveLength(2)

    removeColumn(db, id, 'temp')
    expect(getColumns(db, id)).toEqual([{ name: 'title', type: 'TEXT', order: 0 }])
  })

  test('multiple addColumn calls assign incrementing order', () => {
    const id = createMatrix(db, 'M')

    addColumn(db, id, { name: 'x', type: 'TEXT' })
    addColumn(db, id, { name: 'y', type: 'INTEGER' })
    addColumn(db, id, { name: 'z', type: 'REAL' })

    const cols = getColumns(db, id)
    expect(cols.map((c) => c.order)).toEqual([0, 1, 2, 3])
    expect(cols.map((c) => c.name)).toEqual(['title', 'x', 'y', 'z'])
  })

  test('data survives add, insert, rename, remove sequence', () => {
    const id = createMatrix(db, 'M')

    addColumn(db, id, { name: 'score', type: 'INTEGER' })
    db.exec(`INSERT INTO "mx_${id}_data" (title, score) VALUES ('row1', 42)`)

    renameColumn(db, id, 'score', 'points')

    const stmt1 = db.prepare(`SELECT title, points FROM "mx_${id}_data"`)
    expect(stmt1.step()).toBe(true)
    const r1 = stmt1.get({}) as { title: string; points: number }
    expect(r1.title).toBe('row1')
    expect(r1.points).toBe(42)
    stmt1.finalize()

    addColumn(db, id, { name: 'tag', type: 'TEXT' })
    removeColumn(db, id, 'tag')

    const stmt2 = db.prepare(`SELECT title, points FROM "mx_${id}_data"`)
    expect(stmt2.step()).toBe(true)
    const r2 = stmt2.get({}) as { title: string; points: number }
    expect(r2.title).toBe('row1')
    expect(r2.points).toBe(42)
    stmt2.finalize()
  })
})
