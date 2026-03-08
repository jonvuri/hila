import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  initMatrixSchema,
  createMatrix,
  addSampleRowsToMatrix,
  insertRow,
  insertDataRow,
  updateRow,
  reparentRow,
  deleteRow,
  deleteSubtree,
  getChildren,
  getParent,
  getDepth,
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
import { compareKeys, parseKey } from './lexorank'

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

  test('ensureRootMatrix should create data table with content column', () => {
    ensureRootMatrix(db)

    // Verify data table exists
    const dataTableExists = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='mx_1_data'`,
    )
    expect(dataTableExists.step()).toBe(true)
    dataTableExists.finalize()

    // Verify data table schema has 'id' and 'content' columns
    const schemaStmt = db.prepare(`PRAGMA table_info(mx_1_data)`)
    const columns: { name: string; type: string }[] = []
    while (schemaStmt.step()) {
      const col = schemaStmt.get({}) as { name: string; type: string }
      columns.push({ name: col.name, type: col.type })
    }
    schemaStmt.finalize()

    expect(columns).toHaveLength(2)
    expect(columns[0]).toEqual({ name: 'id', type: 'INTEGER' })
    expect(columns[1]).toEqual({ name: 'content', type: 'TEXT' })
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

describe('reparentRow', () => {
  let db: Database
  let matrixId: number

  // Helper: create a data row and insert it into the outline
  const makeRow = (
    title: string,
    opts: { parentKey?: Uint8Array; prevKey?: Uint8Array; nextKey?: Uint8Array } = {},
  ) => {
    const dataStmt = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`,
    )
    dataStmt.bind([title])
    dataStmt.step()
    const rowId = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key = insertRow(db, {
      matrixId,
      parentKey: opts.parentKey,
      prevKey: opts.prevKey,
      nextKey: opts.nextKey,
      rowKind: 0,
      rowId,
    })
    return { key, rowId }
  }

  // Helper: get all ancestors (including self) for a key, sorted by depth
  const getAncestors = (key: Uint8Array) => {
    const stmt = db.prepare(`
      SELECT ancestor_key, depth FROM "mx_${matrixId}_closure"
      WHERE descendant_key = ?
      ORDER BY depth
    `)
    stmt.bind([key])
    const ancestors: { ancestor_key: Uint8Array; depth: number }[] = []
    while (stmt.step()) {
      const row = stmt.get({}) as { ancestor_key: Uint8Array; depth: number }
      ancestors.push({ ancestor_key: new Uint8Array(row.ancestor_key), depth: row.depth })
    }
    stmt.finalize()
    return ancestors
  }

  // Helper: get all rank row_ids in order
  const getRankOrder = () => {
    const stmt = db.prepare('SELECT row_id FROM rank WHERE matrix_id = ? ORDER BY key')
    stmt.bind([matrixId])
    const ids: number[] = []
    while (stmt.step()) {
      ids.push((stmt.get({}) as { row_id: number }).row_id)
    }
    stmt.finalize()
    return ids
  }

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    matrixId = createMatrix(db, 'Test')
  })

  test('reparent leaf node to a new parent', () => {
    // root1, root2, child1 (under root1)
    const root1 = makeRow('Root 1')
    const root2 = makeRow('Root 2', { prevKey: root1.key })
    const child1 = makeRow('Child 1', { parentKey: root1.key })

    // Reparent child1 under root2
    const newKey = reparentRow(db, {
      matrixId,
      nodeKey: child1.key,
      newParentKey: root2.key,
    })

    // Verify ordering: root1 < root2 < child1 (now under root2)
    const order = getRankOrder()
    expect(order).toEqual([root1.rowId, root2.rowId, child1.rowId])

    // Verify new key is a child of root2 (more segments)
    const newSegments = parseKey(newKey)
    const root2Segments = parseKey(root2.key)
    expect(newSegments.length).toBe(root2Segments.length + 1)

    // Verify closure: child1 now has root2 as parent, no link to root1
    const ancestors = getAncestors(newKey)
    expect(ancestors).toHaveLength(2) // self + root2
    expect(ancestors[0]!.depth).toBe(0) // self
    expect(compareKeys(ancestors[1]!.ancestor_key, root2.key)).toBe(0)
    expect(ancestors[1]!.depth).toBe(1)
  })

  test('reparent subtree (node with children)', () => {
    // root1, root2, child (under root1), grandchild (under child)
    const root1 = makeRow('Root 1')
    const root2 = makeRow('Root 2', { prevKey: root1.key })
    const child = makeRow('Child', { parentKey: root1.key })
    const grandchild = makeRow('Grandchild', { parentKey: child.key })

    // Reparent child (and its subtree) under root2
    const newChildKey = reparentRow(db, {
      matrixId,
      nodeKey: child.key,
      newParentKey: root2.key,
    })

    // Verify ordering: root1 < root2 < child < grandchild
    const order = getRankOrder()
    expect(order).toEqual([root1.rowId, root2.rowId, child.rowId, grandchild.rowId])

    // Verify child's closure: root2 at depth 1, self at depth 0
    const childAncestors = getAncestors(newChildKey)
    expect(childAncestors).toHaveLength(2)
    expect(childAncestors[0]!.depth).toBe(0)
    expect(compareKeys(childAncestors[1]!.ancestor_key, root2.key)).toBe(0)
    expect(childAncestors[1]!.depth).toBe(1)

    // Find grandchild's new key (it was rewritten with the new prefix)
    const rankStmt = db.prepare('SELECT key FROM rank WHERE matrix_id = ? AND row_id = ?')
    rankStmt.bind([matrixId, grandchild.rowId])
    rankStmt.step()
    const newGrandchildKey = new Uint8Array((rankStmt.get({}) as { key: Uint8Array }).key)
    rankStmt.finalize()

    // Verify grandchild's closure: root2 at depth 2, child at depth 1, self at depth 0
    const gcAncestors = getAncestors(newGrandchildKey)
    expect(gcAncestors).toHaveLength(3)
    expect(gcAncestors[0]!.depth).toBe(0) // self
    expect(compareKeys(gcAncestors[1]!.ancestor_key, newChildKey)).toBe(0)
    expect(gcAncestors[1]!.depth).toBe(1) // parent
    expect(compareKeys(gcAncestors[2]!.ancestor_key, root2.key)).toBe(0)
    expect(gcAncestors[2]!.depth).toBe(2) // grandparent
  })

  test('reparent to root (no newParentKey)', () => {
    // root, child (under root)
    const root = makeRow('Root')
    const child = makeRow('Child', { parentKey: root.key })

    // Reparent child to root level
    const newKey = reparentRow(db, {
      matrixId,
      nodeKey: child.key,
    })

    // Verify new key has single segment (root level)
    const newSegments = parseKey(newKey)
    expect(newSegments.length).toBe(1)

    // Verify closure: only self-reference, no parent
    const ancestors = getAncestors(newKey)
    expect(ancestors).toHaveLength(1)
    expect(ancestors[0]!.depth).toBe(0)
  })

  test('reparent subtree to root preserves subtree-internal closure', () => {
    // root, child (under root), grandchild (under child)
    const root = makeRow('Root')
    const child = makeRow('Child', { parentKey: root.key })
    const grandchild = makeRow('Grandchild', { parentKey: child.key })

    // Reparent child (with grandchild) to root level
    const newChildKey = reparentRow(db, {
      matrixId,
      nodeKey: child.key,
    })

    // Find grandchild's new key
    const rankStmt = db.prepare('SELECT key FROM rank WHERE matrix_id = ? AND row_id = ?')
    rankStmt.bind([matrixId, grandchild.rowId])
    rankStmt.step()
    const newGcKey = new Uint8Array((rankStmt.get({}) as { key: Uint8Array }).key)
    rankStmt.finalize()

    // Grandchild should still have child as parent at depth 1
    const gcAncestors = getAncestors(newGcKey)
    expect(gcAncestors).toHaveLength(2) // self + child (no root ancestor)
    expect(gcAncestors[0]!.depth).toBe(0)
    expect(compareKeys(gcAncestors[1]!.ancestor_key, newChildKey)).toBe(0)
    expect(gcAncestors[1]!.depth).toBe(1)
  })

  test('reparent with prevSiblingKey positions correctly', () => {
    // parent, child1 (under parent), child2 (under parent)
    // Move a root node under parent, after child1
    const parent = makeRow('Parent')
    const child1 = makeRow('Child 1', { parentKey: parent.key })
    const child2 = makeRow('Child 2', { parentKey: parent.key, prevKey: child1.key })
    const loner = makeRow('Loner', { prevKey: parent.key })

    // Reparent loner under parent, between child1 and child2
    const newKey = reparentRow(db, {
      matrixId,
      nodeKey: loner.key,
      newParentKey: parent.key,
      prevSiblingKey: child1.key,
      nextSiblingKey: child2.key,
    })

    // Verify ordering: parent < child1 < loner < child2
    const order = getRankOrder()
    expect(order).toEqual([parent.rowId, child1.rowId, loner.rowId, child2.rowId])

    // Verify new key sorts between child1 and child2
    expect(compareKeys(child1.key, newKey)).toBe(-1)
    expect(compareKeys(newKey, child2.key)).toBe(-1)
  })

  test('reparent with only prevSiblingKey (outdent pattern)', () => {
    // Simulates Shift-Tab: child becomes sibling of its parent
    // grandparent, parent (under grandparent), child (under parent), uncle (under grandparent)
    const grandparent = makeRow('Grandparent')
    const parent = makeRow('Parent', { parentKey: grandparent.key })
    const child = makeRow('Child', { parentKey: parent.key })
    const uncle = makeRow('Uncle', { parentKey: grandparent.key, prevKey: parent.key })

    // Outdent child: reparent under grandparent, after parent
    const newKey = reparentRow(db, {
      matrixId,
      nodeKey: child.key,
      newParentKey: grandparent.key,
      prevSiblingKey: parent.key,
    })

    // Verify ordering: grandparent < parent < child < uncle
    const order = getRankOrder()
    expect(order).toEqual([grandparent.rowId, parent.rowId, child.rowId, uncle.rowId])

    // Verify child is now at same depth as parent (child of grandparent)
    const newSegments = parseKey(newKey)
    const parentSegments = parseKey(parent.key)
    expect(newSegments.length).toBe(parentSegments.length)

    // Verify closure: grandparent at depth 1, self at depth 0
    const ancestors = getAncestors(newKey)
    expect(ancestors).toHaveLength(2)
    expect(ancestors[0]!.depth).toBe(0)
    expect(compareKeys(ancestors[1]!.ancestor_key, grandparent.key)).toBe(0)
    expect(ancestors[1]!.depth).toBe(1)
  })

  test('reparent as first child (indent pattern)', () => {
    // Simulates Tab: row becomes child of previous sibling
    // row1, row2 (both root level)
    const row1 = makeRow('Row 1')
    const row2 = makeRow('Row 2', { prevKey: row1.key })

    // Indent row2: reparent under row1
    const newKey = reparentRow(db, {
      matrixId,
      nodeKey: row2.key,
      newParentKey: row1.key,
    })

    // Verify ordering: row1 < row2
    const order = getRankOrder()
    expect(order).toEqual([row1.rowId, row2.rowId])

    // Verify row2 is now a child of row1
    const newSegments = parseKey(newKey)
    const row1Segments = parseKey(row1.key)
    expect(newSegments.length).toBe(row1Segments.length + 1)

    // Verify closure
    const ancestors = getAncestors(newKey)
    expect(ancestors).toHaveLength(2)
    expect(ancestors[0]!.depth).toBe(0)
    expect(compareKeys(ancestors[1]!.ancestor_key, row1.key)).toBe(0)
    expect(ancestors[1]!.depth).toBe(1)
  })

  test('data table is unaffected by reparent', () => {
    const root1 = makeRow('Root 1')
    const root2 = makeRow('Root 2', { prevKey: root1.key })
    const child = makeRow('Child', { parentKey: root1.key })

    // Reparent child under root2
    reparentRow(db, {
      matrixId,
      nodeKey: child.key,
      newParentKey: root2.key,
    })

    // Verify data rows are unchanged
    const dataStmt = db.prepare(`SELECT id, title FROM "mx_${matrixId}_data" ORDER BY id`)
    const rows: { id: number; title: string }[] = []
    while (dataStmt.step()) {
      rows.push(dataStmt.get({}) as { id: number; title: string })
    }
    dataStmt.finalize()

    expect(rows).toHaveLength(3)
    expect(rows[0]!.title).toBe('Root 1')
    expect(rows[1]!.title).toBe('Root 2')
    expect(rows[2]!.title).toBe('Child')
  })

  test('throws when reparenting under own descendant', () => {
    const root = makeRow('Root')
    const child = makeRow('Child', { parentKey: root.key })
    const grandchild = makeRow('Grandchild', { parentKey: child.key })

    expect(() =>
      reparentRow(db, {
        matrixId,
        nodeKey: root.key,
        newParentKey: grandchild.key,
      }),
    ).toThrow('Cannot reparent a node under one of its own descendants')

    // Verify nothing changed (transaction rolled back)
    const order = getRankOrder()
    expect(order).toEqual([root.rowId, child.rowId, grandchild.rowId])
  })

  test('reparent with nextSiblingKey positions correctly', () => {
    const parent = makeRow('Parent')
    const child1 = makeRow('Child 1', { parentKey: parent.key })
    const child2 = makeRow('Child 2', { parentKey: parent.key, prevKey: child1.key })
    const loner = makeRow('Loner', { prevKey: parent.key })

    // Reparent loner under parent, before child1
    const newKey = reparentRow(db, {
      matrixId,
      nodeKey: loner.key,
      newParentKey: parent.key,
      nextSiblingKey: child1.key,
    })

    // Verify ordering: parent < loner < child1 < child2
    const order = getRankOrder()
    expect(order).toEqual([parent.rowId, loner.rowId, child1.rowId, child2.rowId])

    // Verify new key sorts before child1
    expect(compareKeys(newKey, child1.key)).toBe(-1)
  })

  test('reparent deep subtree preserves all internal relationships', () => {
    // Build: root > A > B > C
    const root = makeRow('Root')
    const a = makeRow('A', { parentKey: root.key })
    const b = makeRow('B', { parentKey: a.key })
    const c = makeRow('C', { parentKey: b.key })
    const root2 = makeRow('Root 2', { prevKey: root.key })

    // Reparent A (with B, C) under root2
    const newAKey = reparentRow(db, {
      matrixId,
      nodeKey: a.key,
      newParentKey: root2.key,
    })

    // Find new keys for B and C
    const findKey = (rowId: number) => {
      const stmt = db.prepare('SELECT key FROM rank WHERE matrix_id = ? AND row_id = ?')
      stmt.bind([matrixId, rowId])
      stmt.step()
      const key = new Uint8Array((stmt.get({}) as { key: Uint8Array }).key)
      stmt.finalize()
      return key
    }
    const newBKey = findKey(b.rowId)
    const newCKey = findKey(c.rowId)

    // Verify ordering
    const order = getRankOrder()
    expect(order).toEqual([root.rowId, root2.rowId, a.rowId, b.rowId, c.rowId])

    // Verify C has full ancestor chain: self(0), B(1), A(2), root2(3)
    const cAncestors = getAncestors(newCKey)
    expect(cAncestors).toHaveLength(4)
    expect(cAncestors[0]!.depth).toBe(0)
    expect(compareKeys(cAncestors[1]!.ancestor_key, newBKey)).toBe(0)
    expect(cAncestors[1]!.depth).toBe(1)
    expect(compareKeys(cAncestors[2]!.ancestor_key, newAKey)).toBe(0)
    expect(cAncestors[2]!.depth).toBe(2)
    expect(compareKeys(cAncestors[3]!.ancestor_key, root2.key)).toBe(0)
    expect(cAncestors[3]!.depth).toBe(3)
  })
})

describe('deleteRow', () => {
  let db: Database
  let matrixId: number

  const makeRow = (
    title: string,
    opts: { parentKey?: Uint8Array; prevKey?: Uint8Array; nextKey?: Uint8Array } = {},
  ) => {
    const dataStmt = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`,
    )
    dataStmt.bind([title])
    dataStmt.step()
    const rowId = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key = insertRow(db, {
      matrixId,
      parentKey: opts.parentKey,
      prevKey: opts.prevKey,
      nextKey: opts.nextKey,
      rowKind: 0,
      rowId,
    })
    return { key, rowId }
  }

  const getRankOrder = () => {
    const stmt = db.prepare('SELECT row_id FROM rank WHERE matrix_id = ? ORDER BY key')
    stmt.bind([matrixId])
    const ids: number[] = []
    while (stmt.step()) {
      ids.push((stmt.get({}) as { row_id: number }).row_id)
    }
    stmt.finalize()
    return ids
  }

  const getClosureCount = () => {
    const stmt = db.prepare(`SELECT COUNT(*) as count FROM "mx_${matrixId}_closure"`)
    stmt.step()
    const count = (stmt.get({}) as { count: number }).count
    stmt.finalize()
    return count
  }

  const getDataRowCount = () => {
    const stmt = db.prepare(`SELECT COUNT(*) as count FROM "mx_${matrixId}_data"`)
    stmt.step()
    const count = (stmt.get({}) as { count: number }).count
    stmt.finalize()
    return count
  }

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    matrixId = createMatrix(db, 'Test')
  })

  test('delete a leaf row removes rank, closure, and data entries', () => {
    const row = makeRow('Only row')

    deleteRow(db, { matrixId, key: row.key })

    expect(getRankOrder()).toEqual([])
    expect(getClosureCount()).toBe(0)
    expect(getDataRowCount()).toBe(0)
  })

  test('delete one of several root rows leaves others intact', () => {
    const row1 = makeRow('Row 1')
    const row2 = makeRow('Row 2', { prevKey: row1.key })
    const row3 = makeRow('Row 3', { prevKey: row2.key })

    deleteRow(db, { matrixId, key: row2.key })

    expect(getRankOrder()).toEqual([row1.rowId, row3.rowId])
    expect(getDataRowCount()).toBe(2)
  })

  test('delete a leaf child removes only that child', () => {
    const parent = makeRow('Parent')
    const child1 = makeRow('Child 1', { parentKey: parent.key })
    const child2 = makeRow('Child 2', { parentKey: parent.key, prevKey: child1.key })

    deleteRow(db, { matrixId, key: child1.key })

    expect(getRankOrder()).toEqual([parent.rowId, child2.rowId])
    expect(getDataRowCount()).toBe(2)

    // child2 still has parent in its closure
    const closureStmt = db.prepare(`
      SELECT ancestor_key, depth FROM "mx_${matrixId}_closure"
      WHERE descendant_key = ?
      ORDER BY depth
    `)
    closureStmt.bind([child2.key])

    expect(closureStmt.step()).toBe(true)
    const self = closureStmt.get({}) as { depth: number }
    expect(self.depth).toBe(0)

    expect(closureStmt.step()).toBe(true)
    const parentLink = closureStmt.get({}) as { ancestor_key: Uint8Array; depth: number }
    expect(compareKeys(parentLink.ancestor_key, parent.key)).toBe(0)
    expect(parentLink.depth).toBe(1)

    expect(closureStmt.step()).toBe(false)
    closureStmt.finalize()
  })

  test('delete parent does NOT delete children (orphan policy)', () => {
    const parent = makeRow('Parent')
    const child = makeRow('Child', { parentKey: parent.key })
    const grandchild = makeRow('Grandchild', { parentKey: child.key })

    deleteRow(db, { matrixId, key: parent.key })

    // Children remain in rank and data tables
    expect(getRankOrder()).toEqual([child.rowId, grandchild.rowId])
    expect(getDataRowCount()).toBe(2)

    // But the closure links from parent are gone -- child no longer has
    // parent as ancestor, only self-reference remains for child
    const closureStmt = db.prepare(`
      SELECT ancestor_key, depth FROM "mx_${matrixId}_closure"
      WHERE descendant_key = ?
      ORDER BY depth
    `)
    closureStmt.bind([child.key])

    expect(closureStmt.step()).toBe(true)
    const self = closureStmt.get({}) as { depth: number }
    expect(self.depth).toBe(0)

    // child→parent link at depth 1 was deleted (parent was ancestor)
    // Only self-ref and child→grandchild internal links remain
    expect(closureStmt.step()).toBe(false)
    closureStmt.finalize()
  })

  test('delete removes closure entries where key is ancestor', () => {
    const parent = makeRow('Parent')
    makeRow('Child', { parentKey: parent.key })

    // Before delete: closure has parent→child link
    const beforeStmt = db.prepare(`
      SELECT COUNT(*) as count FROM "mx_${matrixId}_closure"
      WHERE ancestor_key = ?
    `)
    beforeStmt.bind([parent.key])
    beforeStmt.step()
    const beforeCount = (beforeStmt.get({}) as { count: number }).count
    beforeStmt.finalize()
    expect(beforeCount).toBeGreaterThan(0)

    deleteRow(db, { matrixId, key: parent.key })

    // After delete: no closure entries with parent as ancestor
    const afterStmt = db.prepare(`
      SELECT COUNT(*) as count FROM "mx_${matrixId}_closure"
      WHERE ancestor_key = ?
    `)
    afterStmt.bind([parent.key])
    afterStmt.step()
    const afterCount = (afterStmt.get({}) as { count: number }).count
    afterStmt.finalize()
    expect(afterCount).toBe(0)
  })

  test('throws when deleting a non-existent key', () => {
    const fakeKey = new Uint8Array([0x42, 0x00])

    expect(() => deleteRow(db, { matrixId, key: fakeKey })).toThrow(
      'Row not found in rank table',
    )
  })

  test('delete is transactional -- failure rolls back', () => {
    const row = makeRow('Row')

    // Verify the row exists
    expect(getRankOrder()).toEqual([row.rowId])

    // Attempt to delete with a bad matrixId -- the rank lookup will fail
    expect(() => deleteRow(db, { matrixId: 9999, key: row.key })).toThrow()

    // Original row is untouched
    expect(getRankOrder()).toEqual([row.rowId])
    expect(getDataRowCount()).toBe(1)
  })
})

describe('deleteSubtree', () => {
  let db: Database
  let matrixId: number

  const makeRow = (
    title: string,
    opts: { parentKey?: Uint8Array; prevKey?: Uint8Array; nextKey?: Uint8Array } = {},
  ) => {
    const dataStmt = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`,
    )
    dataStmt.bind([title])
    dataStmt.step()
    const rowId = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key = insertRow(db, {
      matrixId,
      parentKey: opts.parentKey,
      prevKey: opts.prevKey,
      nextKey: opts.nextKey,
      rowKind: 0,
      rowId,
    })
    return { key, rowId }
  }

  const getRankOrder = () => {
    const stmt = db.prepare('SELECT row_id FROM rank WHERE matrix_id = ? ORDER BY key')
    stmt.bind([matrixId])
    const ids: number[] = []
    while (stmt.step()) {
      ids.push((stmt.get({}) as { row_id: number }).row_id)
    }
    stmt.finalize()
    return ids
  }

  const getClosureCount = () => {
    const stmt = db.prepare(`SELECT COUNT(*) as count FROM "mx_${matrixId}_closure"`)
    stmt.step()
    const count = (stmt.get({}) as { count: number }).count
    stmt.finalize()
    return count
  }

  const getDataRowCount = () => {
    const stmt = db.prepare(`SELECT COUNT(*) as count FROM "mx_${matrixId}_data"`)
    stmt.step()
    const count = (stmt.get({}) as { count: number }).count
    stmt.finalize()
    return count
  }

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    matrixId = createMatrix(db, 'Test')
  })

  test('delete a single leaf row (no descendants)', () => {
    const row = makeRow('Only row')

    deleteSubtree(db, { matrixId, key: row.key })

    expect(getRankOrder()).toEqual([])
    expect(getClosureCount()).toBe(0)
    expect(getDataRowCount()).toBe(0)
  })

  test('delete subtree removes parent and all descendants', () => {
    const parent = makeRow('Parent')
    const child1 = makeRow('Child 1', { parentKey: parent.key })
    makeRow('Child 2', { parentKey: parent.key, prevKey: child1.key })
    makeRow('Grandchild', { parentKey: child1.key })

    deleteSubtree(db, { matrixId, key: parent.key })

    expect(getRankOrder()).toEqual([])
    expect(getClosureCount()).toBe(0)
    expect(getDataRowCount()).toBe(0)
  })

  test('delete subtree of a child leaves sibling subtrees intact', () => {
    const root = makeRow('Root')
    const child1 = makeRow('Child 1', { parentKey: root.key })
    const child2 = makeRow('Child 2', { parentKey: root.key, prevKey: child1.key })
    makeRow('GC 1', { parentKey: child1.key })

    // Delete child1's subtree (child1 + GC 1)
    deleteSubtree(db, { matrixId, key: child1.key })

    expect(getRankOrder()).toEqual([root.rowId, child2.rowId])
    expect(getDataRowCount()).toBe(2)

    // child2 still has root as ancestor
    const closureStmt = db.prepare(`
      SELECT ancestor_key, depth FROM "mx_${matrixId}_closure"
      WHERE descendant_key = ?
      ORDER BY depth
    `)
    closureStmt.bind([child2.key])

    expect(closureStmt.step()).toBe(true)
    const self = closureStmt.get({}) as { depth: number }
    expect(self.depth).toBe(0)

    expect(closureStmt.step()).toBe(true)
    const parentLink = closureStmt.get({}) as { ancestor_key: Uint8Array; depth: number }
    expect(compareKeys(parentLink.ancestor_key, root.key)).toBe(0)
    expect(parentLink.depth).toBe(1)

    expect(closureStmt.step()).toBe(false)
    closureStmt.finalize()
  })

  test('delete subtree of a middle node preserves unrelated rows', () => {
    const root1 = makeRow('Root 1')
    const child = makeRow('Child', { parentKey: root1.key })
    makeRow('Grandchild', { parentKey: child.key })
    const root2 = makeRow('Root 2', { prevKey: root1.key })

    // Delete child's subtree (child + grandchild), root1 and root2 remain
    deleteSubtree(db, { matrixId, key: child.key })

    expect(getRankOrder()).toEqual([root1.rowId, root2.rowId])
    expect(getDataRowCount()).toBe(2)
  })

  test('delete subtree cleans up all closure entries for subtree keys', () => {
    const root = makeRow('Root')
    const child = makeRow('Child', { parentKey: root.key })
    const grandchild = makeRow('Grandchild', { parentKey: child.key })

    // Before: closure has root→child, root→grandchild, child→grandchild, plus self-refs
    deleteSubtree(db, { matrixId, key: child.key })

    // After: no closure entries should reference child or grandchild
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM "mx_${matrixId}_closure"
      WHERE ancestor_key = ? OR descendant_key = ?
         OR ancestor_key = ? OR descendant_key = ?
    `)
    stmt.bind([child.key, child.key, grandchild.key, grandchild.key])
    stmt.step()
    const count = (stmt.get({}) as { count: number }).count
    stmt.finalize()
    expect(count).toBe(0)

    // Root should only have self-reference remaining
    const rootStmt = db.prepare(`
      SELECT COUNT(*) as count FROM "mx_${matrixId}_closure"
      WHERE descendant_key = ?
    `)
    rootStmt.bind([root.key])
    rootStmt.step()
    const rootClosureCount = (rootStmt.get({}) as { count: number }).count
    rootStmt.finalize()
    expect(rootClosureCount).toBe(1)
  })

  test('delete deep subtree (3+ levels)', () => {
    const root = makeRow('Root')
    const a = makeRow('A', { parentKey: root.key })
    const b = makeRow('B', { parentKey: a.key })
    const c = makeRow('C', { parentKey: b.key })
    makeRow('D', { parentKey: c.key })

    deleteSubtree(db, { matrixId, key: a.key })

    expect(getRankOrder()).toEqual([root.rowId])
    expect(getDataRowCount()).toBe(1)
    expect(getClosureCount()).toBe(1) // only root's self-ref
  })

  test('throws when deleting a non-existent key', () => {
    const fakeKey = new Uint8Array([0x42, 0x00])

    expect(() => deleteSubtree(db, { matrixId, key: fakeKey })).toThrow(
      'Row not found in rank table',
    )
  })

  test('delete is transactional -- failure rolls back', () => {
    const row = makeRow('Row')

    expect(getRankOrder()).toEqual([row.rowId])

    // Attempt to delete with a non-existent key triggers rollback
    expect(() =>
      deleteSubtree(db, { matrixId: 9999, key: new Uint8Array([0x42, 0x00]) }),
    ).toThrow()

    // Original row is untouched
    expect(getRankOrder()).toEqual([row.rowId])
    expect(getDataRowCount()).toBe(1)
  })
})

describe('getChildren', () => {
  let db: Database
  let matrixId: number

  const makeRow = (
    title: string,
    opts: { parentKey?: Uint8Array; prevKey?: Uint8Array; nextKey?: Uint8Array } = {},
  ) => {
    const dataStmt = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`,
    )
    dataStmt.bind([title])
    dataStmt.step()
    const rowId = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key = insertRow(db, {
      matrixId,
      parentKey: opts.parentKey,
      prevKey: opts.prevKey,
      nextKey: opts.nextKey,
      rowKind: 0,
      rowId,
    })
    return { key, rowId }
  }

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    matrixId = createMatrix(db, 'Test')
  })

  test('returns empty array for a leaf node', () => {
    const leaf = makeRow('Leaf')
    expect(getChildren(db, matrixId, leaf.key)).toEqual([])
  })

  test('returns direct children in rank order', () => {
    const parent = makeRow('Parent')
    const child1 = makeRow('Child 1', { parentKey: parent.key })
    const child2 = makeRow('Child 2', { parentKey: parent.key, prevKey: child1.key })
    const child3 = makeRow('Child 3', { parentKey: parent.key, prevKey: child2.key })

    const children = getChildren(db, matrixId, parent.key)

    expect(children).toHaveLength(3)
    expect(compareKeys(children[0]!, child1.key)).toBe(0)
    expect(compareKeys(children[1]!, child2.key)).toBe(0)
    expect(compareKeys(children[2]!, child3.key)).toBe(0)
  })

  test('does not include grandchildren (only depth=1)', () => {
    const root = makeRow('Root')
    const child = makeRow('Child', { parentKey: root.key })
    makeRow('Grandchild', { parentKey: child.key })

    const children = getChildren(db, matrixId, root.key)

    expect(children).toHaveLength(1)
    expect(compareKeys(children[0]!, child.key)).toBe(0)
  })

  test('returns empty array for a root node with no children', () => {
    const root = makeRow('Root')
    makeRow('Sibling', { prevKey: root.key })

    expect(getChildren(db, matrixId, root.key)).toEqual([])
  })

  test('returns correct children after reparenting', () => {
    const parent1 = makeRow('Parent 1')
    const parent2 = makeRow('Parent 2', { prevKey: parent1.key })
    const child = makeRow('Child', { parentKey: parent1.key })

    // Initially parent1 has one child, parent2 has none
    expect(getChildren(db, matrixId, parent1.key)).toHaveLength(1)
    expect(getChildren(db, matrixId, parent2.key)).toHaveLength(0)

    // Reparent child under parent2
    reparentRow(db, {
      matrixId,
      nodeKey: child.key,
      newParentKey: parent2.key,
    })

    // Now parent1 has no children, parent2 has one
    expect(getChildren(db, matrixId, parent1.key)).toHaveLength(0)
    expect(getChildren(db, matrixId, parent2.key)).toHaveLength(1)
  })
})

describe('getParent', () => {
  let db: Database
  let matrixId: number

  const makeRow = (
    title: string,
    opts: { parentKey?: Uint8Array; prevKey?: Uint8Array; nextKey?: Uint8Array } = {},
  ) => {
    const dataStmt = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`,
    )
    dataStmt.bind([title])
    dataStmt.step()
    const rowId = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key = insertRow(db, {
      matrixId,
      parentKey: opts.parentKey,
      prevKey: opts.prevKey,
      nextKey: opts.nextKey,
      rowKind: 0,
      rowId,
    })
    return { key, rowId }
  }

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    matrixId = createMatrix(db, 'Test')
  })

  test('returns null for a root-level row', () => {
    const root = makeRow('Root')
    expect(getParent(db, matrixId, root.key)).toBeNull()
  })

  test('returns parent key for a child row', () => {
    const parent = makeRow('Parent')
    const child = makeRow('Child', { parentKey: parent.key })

    const result = getParent(db, matrixId, child.key)

    expect(result).not.toBeNull()
    expect(compareKeys(result!, parent.key)).toBe(0)
  })

  test('returns immediate parent (not grandparent) for nested rows', () => {
    const root = makeRow('Root')
    const child = makeRow('Child', { parentKey: root.key })
    const grandchild = makeRow('Grandchild', { parentKey: child.key })

    const gcParent = getParent(db, matrixId, grandchild.key)
    expect(gcParent).not.toBeNull()
    expect(compareKeys(gcParent!, child.key)).toBe(0)

    const childParent = getParent(db, matrixId, child.key)
    expect(childParent).not.toBeNull()
    expect(compareKeys(childParent!, root.key)).toBe(0)
  })

  test('returns null after reparenting to root', () => {
    const parent = makeRow('Parent')
    const child = makeRow('Child', { parentKey: parent.key })

    // Initially has a parent
    expect(getParent(db, matrixId, child.key)).not.toBeNull()

    // Reparent to root
    const newKey = reparentRow(db, {
      matrixId,
      nodeKey: child.key,
    })

    // Now at root level, no parent
    expect(getParent(db, matrixId, newKey)).toBeNull()
  })

  test('returns new parent after reparenting', () => {
    const parent1 = makeRow('Parent 1')
    const parent2 = makeRow('Parent 2', { prevKey: parent1.key })
    const child = makeRow('Child', { parentKey: parent1.key })

    // Initially child's parent is parent1
    expect(compareKeys(getParent(db, matrixId, child.key)!, parent1.key)).toBe(0)

    // Reparent child under parent2
    const newKey = reparentRow(db, {
      matrixId,
      nodeKey: child.key,
      newParentKey: parent2.key,
    })

    // Now child's parent is parent2
    expect(compareKeys(getParent(db, matrixId, newKey)!, parent2.key)).toBe(0)
  })
})

describe('getDepth', () => {
  let db: Database
  let matrixId: number

  const makeRow = (
    title: string,
    opts: { parentKey?: Uint8Array; prevKey?: Uint8Array } = {},
  ) => {
    const dataStmt = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (title) VALUES (?) RETURNING id`,
    )
    dataStmt.bind([title])
    dataStmt.step()
    const rowId = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key = insertRow(db, {
      matrixId,
      parentKey: opts.parentKey,
      prevKey: opts.prevKey,
      rowKind: 0,
      rowId,
    })
    return { key, rowId }
  }

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    matrixId = createMatrix(db, 'Test')
  })

  test('returns 0 for a root-level row', () => {
    const root = makeRow('Root')
    expect(getDepth(db, matrixId, root.key)).toBe(0)
  })

  test('returns 1 for a direct child', () => {
    const parent = makeRow('Parent')
    const child = makeRow('Child', { parentKey: parent.key })
    expect(getDepth(db, matrixId, child.key)).toBe(1)
  })

  test('returns correct depth for deeply nested rows', () => {
    const root = makeRow('Root')
    const child = makeRow('Child', { parentKey: root.key })
    const grandchild = makeRow('Grandchild', { parentKey: child.key })
    const greatGrandchild = makeRow('Great-grandchild', { parentKey: grandchild.key })

    expect(getDepth(db, matrixId, root.key)).toBe(0)
    expect(getDepth(db, matrixId, child.key)).toBe(1)
    expect(getDepth(db, matrixId, grandchild.key)).toBe(2)
    expect(getDepth(db, matrixId, greatGrandchild.key)).toBe(3)
  })

  test('returns updated depth after reparenting to root', () => {
    const parent = makeRow('Parent')
    const child = makeRow('Child', { parentKey: parent.key })

    expect(getDepth(db, matrixId, child.key)).toBe(1)

    const newKey = reparentRow(db, {
      matrixId,
      nodeKey: child.key,
    })

    expect(getDepth(db, matrixId, newKey)).toBe(0)
  })

  test('returns updated depth after reparenting deeper', () => {
    const root = makeRow('Root')
    const child = makeRow('Child', { parentKey: root.key })
    const sibling = makeRow('Sibling', { prevKey: root.key })

    expect(getDepth(db, matrixId, sibling.key)).toBe(0)

    const newKey = reparentRow(db, {
      matrixId,
      nodeKey: sibling.key,
      newParentKey: child.key,
    })

    expect(getDepth(db, matrixId, newKey)).toBe(2)
  })

  test('returns null for a non-existent key', () => {
    const fakeKey = new Uint8Array([0xff, 0xff, 0xff])
    expect(getDepth(db, matrixId, fakeKey)).toBeNull()
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
    expect(cols).toEqual([{ name: 'content', type: 'TEXT', order: 0 }])
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

describe('insertDataRow', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('inserts a row with values and returns rowId', () => {
    const matrixId = createMatrix(db, 'M')
    const rowId = insertDataRow(db, matrixId, { title: 'Hello' })

    expect(rowId).toBeTypeOf('number')

    const stmt = db.prepare(`SELECT id, title FROM "mx_${matrixId}_data" WHERE id = ?`)
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { id: number; title: string }
    expect(row.id).toBe(rowId)
    expect(row.title).toBe('Hello')
    stmt.finalize()
  })

  test('inserts a row with no values (DEFAULT VALUES)', () => {
    const matrixId = createMatrix(db, 'M')
    const rowId = insertDataRow(db, matrixId)

    expect(rowId).toBeTypeOf('number')

    const stmt = db.prepare(`SELECT id, title FROM "mx_${matrixId}_data" WHERE id = ?`)
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { id: number; title: string | null }
    expect(row.id).toBe(rowId)
    expect(row.title).toBeNull()
    stmt.finalize()
  })

  test('inserts a row with empty values object (DEFAULT VALUES)', () => {
    const matrixId = createMatrix(db, 'M')
    const rowId = insertDataRow(db, matrixId, {})

    expect(rowId).toBeTypeOf('number')
  })

  test('inserts multiple rows with unique IDs', () => {
    const matrixId = createMatrix(db, 'M')
    const id1 = insertDataRow(db, matrixId, { title: 'First' })
    const id2 = insertDataRow(db, matrixId, { title: 'Second' })
    const id3 = insertDataRow(db, matrixId, { title: 'Third' })

    const ids = new Set([id1, id2, id3])
    expect(ids.size).toBe(3)
  })
})

describe('updateRow', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('updates a single column value', () => {
    const matrixId = createMatrix(db, 'M')
    const rowId = insertDataRow(db, matrixId, { title: 'Original' })

    updateRow(db, { matrixId, rowId, values: { title: 'Updated' } })

    const stmt = db.prepare(`SELECT title FROM "mx_${matrixId}_data" WHERE id = ?`)
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    expect((stmt.get({}) as { title: string }).title).toBe('Updated')
    stmt.finalize()
  })

  test('updates multiple columns', () => {
    const matrixId = createMatrix(db, 'M', [
      { name: 'title', type: 'TEXT' },
      { name: 'score', type: 'INTEGER' },
    ])
    const rowId = insertDataRow(db, matrixId, { title: 'Row', score: 10 })

    updateRow(db, { matrixId, rowId, values: { title: 'New', score: 99 } })

    const stmt = db.prepare(`SELECT title, score FROM "mx_${matrixId}_data" WHERE id = ?`)
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { title: string; score: number }
    expect(row.title).toBe('New')
    expect(row.score).toBe(99)
    stmt.finalize()
  })

  test('no-ops with empty values', () => {
    const matrixId = createMatrix(db, 'M')
    const rowId = insertDataRow(db, matrixId, { title: 'Stays' })

    updateRow(db, { matrixId, rowId, values: {} })

    const stmt = db.prepare(`SELECT title FROM "mx_${matrixId}_data" WHERE id = ?`)
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    expect((stmt.get({}) as { title: string }).title).toBe('Stays')
    stmt.finalize()
  })

  test('does not affect other rows', () => {
    const matrixId = createMatrix(db, 'M')
    const row1 = insertDataRow(db, matrixId, { title: 'One' })
    const row2 = insertDataRow(db, matrixId, { title: 'Two' })

    updateRow(db, { matrixId, rowId: row2, values: { title: 'Changed' } })

    const stmt = db.prepare(`SELECT title FROM "mx_${matrixId}_data" WHERE id = ?`)
    stmt.bind([row1])
    expect(stmt.step()).toBe(true)
    expect((stmt.get({}) as { title: string }).title).toBe('One')
    stmt.finalize()
  })

  test('can set a column to null', () => {
    const matrixId = createMatrix(db, 'M')
    const rowId = insertDataRow(db, matrixId, { title: 'Has value' })

    updateRow(db, { matrixId, rowId, values: { title: null } })

    const stmt = db.prepare(`SELECT title FROM "mx_${matrixId}_data" WHERE id = ?`)
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    expect((stmt.get({}) as { title: string | null }).title).toBeNull()
    stmt.finalize()
  })

  test('partial update leaves other columns unchanged', () => {
    const matrixId = createMatrix(db, 'M', [
      { name: 'title', type: 'TEXT' },
      { name: 'score', type: 'INTEGER' },
      { name: 'tag', type: 'TEXT' },
    ])
    const rowId = insertDataRow(db, matrixId, { title: 'Row', score: 10, tag: 'a' })

    updateRow(db, { matrixId, rowId, values: { score: 42 } })

    const stmt = db.prepare(`SELECT title, score, tag FROM "mx_${matrixId}_data" WHERE id = ?`)
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { title: string; score: number; tag: string }
    expect(row.title).toBe('Row')
    expect(row.score).toBe(42)
    expect(row.tag).toBe('a')
    stmt.finalize()
  })

  test('throws on unknown column name', () => {
    const matrixId = createMatrix(db, 'M')
    const rowId = insertDataRow(db, matrixId, { title: 'Row' })

    expect(() => updateRow(db, { matrixId, rowId, values: { nonexistent: 'x' } })).toThrow(
      'Column "nonexistent" does not exist in matrix',
    )
  })

  test('throws when any one of multiple columns is unknown', () => {
    const matrixId = createMatrix(db, 'M')
    const rowId = insertDataRow(db, matrixId, { title: 'Row' })

    expect(() =>
      updateRow(db, { matrixId, rowId, values: { title: 'ok', ghost: 'bad' } }),
    ).toThrow('Column "ghost" does not exist in matrix')
  })
})

describe('Content column and row data model', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    ensureRootMatrix(db)
  })

  const EMPTY_DOC = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })

  test('insertDataRow with no content produces null content', () => {
    const rowId = insertDataRow(db, 1)

    const stmt = db.prepare('SELECT content FROM "mx_1_data" WHERE id = ?')
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    expect((stmt.get({}) as { content: string | null }).content).toBeNull()
    stmt.finalize()
  })

  test('insertDataRow with explicit content stores it correctly', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    }
    const rowId = insertDataRow(db, 1, { content: JSON.stringify(doc) })

    const stmt = db.prepare('SELECT content FROM "mx_1_data" WHERE id = ?')
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    const stored = (stmt.get({}) as { content: string }).content
    stmt.finalize()

    expect(JSON.parse(stored)).toEqual(doc)
  })

  test('updateRow on content column persists JSON and round-trips', () => {
    const rowId = insertDataRow(db, 1)
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Updated' }] }],
    }

    updateRow(db, { matrixId: 1, rowId, values: { content: JSON.stringify(doc) } })

    const stmt = db.prepare('SELECT content FROM "mx_1_data" WHERE id = ?')
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    const stored = (stmt.get({}) as { content: string }).content
    stmt.finalize()

    expect(JSON.parse(stored)).toEqual(doc)
  })

  test('updateRow with invalid column throws, leaving content unchanged', () => {
    const rowId = insertDataRow(db, 1, { content: EMPTY_DOC })

    expect(() => updateRow(db, { matrixId: 1, rowId, values: { badcol: 'x' } })).toThrow(
      'Column "badcol" does not exist in matrix',
    )

    // Content should be unchanged
    const stmt = db.prepare('SELECT content FROM "mx_1_data" WHERE id = ?')
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    expect((stmt.get({}) as { content: string }).content).toBe(EMPTY_DOC)
    stmt.finalize()
  })

  test('multiple update round-trips preserve latest value', () => {
    const rowId = insertDataRow(db, 1, { content: EMPTY_DOC })
    const doc1 = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'v1' }] }],
    }
    const doc2 = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'v2' }] }],
    }

    updateRow(db, { matrixId: 1, rowId, values: { content: JSON.stringify(doc1) } })
    updateRow(db, { matrixId: 1, rowId, values: { content: JSON.stringify(doc2) } })

    const stmt = db.prepare('SELECT content FROM "mx_1_data" WHERE id = ?')
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    expect(JSON.parse((stmt.get({}) as { content: string }).content)).toEqual(doc2)
    stmt.finalize()
  })
})

describe('Row operations round-trip', () => {
  let db: Database
  let matrixId: number

  /**
   * Simulates the handler's deleteRow logic: re-parent children to the
   * deleted row's parent (preserving order), then delete the row.
   */
  const handlerDeleteRow = (key: Uint8Array) => {
    const parentKey = getParent(db, matrixId, key)
    const children = getChildren(db, matrixId, key)

    let prevSiblingKey: Uint8Array | undefined = undefined
    for (const childKey of children) {
      const newKey = reparentRow(db, {
        matrixId,
        nodeKey: childKey,
        newParentKey: parentKey ?? undefined,
        prevSiblingKey,
      })
      prevSiblingKey = newKey
    }
    deleteRow(db, { matrixId, key })
  }

  const makeRow = (
    title: string,
    opts: { parentKey?: Uint8Array; prevKey?: Uint8Array } = {},
  ) => {
    const rowId = insertDataRow(db, matrixId, { title })
    const key = insertRow(db, {
      matrixId,
      parentKey: opts.parentKey,
      prevKey: opts.prevKey,
      rowKind: 0,
      rowId,
    })
    return { key, rowId }
  }

  const queryTitles = (): string[] => {
    const stmt = db.prepare(`
      SELECT d.title
      FROM rank r
      JOIN "mx_${matrixId}_data" d ON d.id = r.row_id
      WHERE r.matrix_id = ?
      ORDER BY r.key
    `)
    stmt.bind([matrixId])
    const titles: string[] = []
    while (stmt.step()) {
      titles.push((stmt.get({}) as { title: string }).title)
    }
    stmt.finalize()
    return titles
  }

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    matrixId = createMatrix(db, 'M')
  })

  test('insert data row + rank row, then query both', () => {
    const rowId = insertDataRow(db, matrixId, { title: 'Test entry' })
    const key = insertRow(db, { matrixId, rowKind: 0, rowId })

    const stmt = db.prepare(`
      SELECT d.id, d.title, r.key, r.row_kind
      FROM rank r
      JOIN "mx_${matrixId}_data" d ON d.id = r.row_id
      WHERE r.matrix_id = ?
      ORDER BY r.key
    `)
    stmt.bind([matrixId])
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { id: number; title: string; key: Uint8Array; row_kind: number }
    expect(row.id).toBe(rowId)
    expect(row.title).toBe('Test entry')
    expect(compareKeys(new Uint8Array(row.key), key)).toBe(0)
    expect(row.row_kind).toBe(0)
    expect(stmt.step()).toBe(false)
    stmt.finalize()
  })

  test('insert → update → query reflects updated value', () => {
    const rowId = insertDataRow(db, matrixId, { title: 'Before' })
    insertRow(db, { matrixId, rowKind: 0, rowId })

    updateRow(db, { matrixId, rowId, values: { title: 'After' } })

    expect(queryTitles()).toEqual(['After'])
  })

  test('insert → reparent → query reflects new structure', () => {
    const parent = makeRow('Parent')
    const child = makeRow('Child', { prevKey: parent.key })

    reparentRow(db, { matrixId, nodeKey: child.key, newParentKey: parent.key })

    expect(queryTitles()).toEqual(['Parent', 'Child'])

    // Verify child is now nested under parent
    const children = getChildren(db, matrixId, parent.key)
    expect(children).toHaveLength(1)
  })

  // -- deleteRow (handler pattern: re-parent children then delete) --

  test('deleteRow on a leaf node just removes it', () => {
    const row1 = makeRow('Row 1')
    makeRow('Row 2', { prevKey: row1.key })

    handlerDeleteRow(row1.key)

    expect(queryTitles()).toEqual(['Row 2'])
  })

  test('deleteRow re-parents children to root when deleting root parent', () => {
    const parent = makeRow('Parent')
    const child1 = makeRow('C1', { parentKey: parent.key })
    makeRow('C2', { parentKey: parent.key, prevKey: child1.key })

    handlerDeleteRow(parent.key)

    expect(queryTitles()).toEqual(['C1', 'C2'])

    // Both children should now be root-level (no parent)
    const stmt = db.prepare(`
      SELECT COUNT(*) as cnt FROM "mx_${matrixId}_closure" WHERE depth = 1
    `)
    stmt.step()
    expect((stmt.get({}) as { cnt: number }).cnt).toBe(0)
    stmt.finalize()
  })

  test('deleteRow re-parents children to grandparent when deleting mid-level node', () => {
    // grandparent → parent → (child1, child2)
    const grandparent = makeRow('GP')
    const parent = makeRow('P', { parentKey: grandparent.key })
    const child1 = makeRow('C1', { parentKey: parent.key })
    makeRow('C2', { parentKey: parent.key, prevKey: child1.key })

    handlerDeleteRow(parent.key)

    expect(queryTitles()).toEqual(['GP', 'C1', 'C2'])

    // Children should now be direct children of grandparent
    const gpChildren = getChildren(db, matrixId, grandparent.key)
    expect(gpChildren).toHaveLength(2)

    // Verify depth: children should be at depth 1 from grandparent
    const stmt = db.prepare(`
      SELECT r.row_id
      FROM "mx_${matrixId}_closure" c
      JOIN rank r ON r.key = c.descendant_key AND r.matrix_id = ?
      WHERE c.ancestor_key = ? AND c.depth = 1
      ORDER BY r.key
    `)
    stmt.bind([matrixId, grandparent.key])
    const childRowIds: number[] = []
    while (stmt.step()) {
      childRowIds.push((stmt.get({}) as { row_id: number }).row_id)
    }
    stmt.finalize()
    expect(childRowIds).toHaveLength(2)
  })

  test('deleteRow re-parents preserve children order with many children', () => {
    const parent = makeRow('P')
    const c1 = makeRow('C1', { parentKey: parent.key })
    const c2 = makeRow('C2', { parentKey: parent.key, prevKey: c1.key })
    const c3 = makeRow('C3', { parentKey: parent.key, prevKey: c2.key })
    makeRow('C4', { parentKey: parent.key, prevKey: c3.key })

    handlerDeleteRow(parent.key)

    expect(queryTitles()).toEqual(['C1', 'C2', 'C3', 'C4'])
  })

  test('deleteRow on mid-level node preserves grandchildren under children', () => {
    // GP → P → C → GC
    const gp = makeRow('GP')
    const p = makeRow('P', { parentKey: gp.key })
    const c = makeRow('C', { parentKey: p.key })
    makeRow('GC', { parentKey: c.key })

    handlerDeleteRow(p.key)

    expect(queryTitles()).toEqual(['GP', 'C', 'GC'])

    // C should now be a child of GP
    const gpChildren = getChildren(db, matrixId, gp.key)
    expect(gpChildren).toHaveLength(1)

    // GC should still be a child of C (the reparented version of C)
    const stmt = db.prepare('SELECT key FROM rank WHERE matrix_id = ? AND row_id = ?')
    stmt.bind([matrixId, c.rowId])
    stmt.step()
    const newCKey = new Uint8Array((stmt.get({}) as { key: Uint8Array }).key)
    stmt.finalize()

    const cChildren = getChildren(db, matrixId, newCKey)
    expect(cChildren).toHaveLength(1)
  })

  test('deleteRow on node with no children and a parent leaves parent intact', () => {
    const parent = makeRow('Parent')
    const child = makeRow('Child', { parentKey: parent.key })

    handlerDeleteRow(child.key)

    expect(queryTitles()).toEqual(['Parent'])
    expect(getChildren(db, matrixId, parent.key)).toHaveLength(0)
  })

  // -- deleteSubtree round-trips --

  test('insert → deleteSubtree → query reflects subtree removal', () => {
    const root1 = makeRow('Root 1')
    makeRow('Child', { parentKey: root1.key })
    makeRow('Root 2', { prevKey: root1.key })

    deleteSubtree(db, { matrixId, key: root1.key })

    expect(queryTitles()).toEqual(['Root 2'])
  })

  // -- Worker integration: insertRow + query pattern --

  test('multiple inserts with positioning produce correct query order', () => {
    const r1 = makeRow('A')
    const r2 = makeRow('B', { prevKey: r1.key })
    makeRow('A.5', { prevKey: r1.key })
    makeRow('C', { prevKey: r2.key })

    expect(queryTitles()).toEqual(['A', 'A.5', 'B', 'C'])
  })

  test('insert child rows appear in correct query order', () => {
    const parent = makeRow('P')
    const c1 = makeRow('C1', { parentKey: parent.key })
    makeRow('C2', { parentKey: parent.key, prevKey: c1.key })
    makeRow('Sibling', { prevKey: parent.key })

    expect(queryTitles()).toEqual(['P', 'C1', 'C2', 'Sibling'])
  })
})

describe('Globally unique random IDs', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('matrix IDs are non-sequential positive integers', () => {
    const ids: number[] = []
    for (let i = 0; i < 10; i++) {
      ids.push(createMatrix(db, `Matrix ${i}`))
    }

    for (const id of ids) {
      expect(id).toBeGreaterThan(0)
    }

    // Verify non-sequential: not all consecutive differences are 1
    const diffs = ids.slice(1).map((id, i) => Math.abs(id - ids[i]!))
    const allSequential = diffs.every((d) => d === 1)
    expect(allSequential).toBe(false)
  })

  test('matrix IDs are unique across many creations', () => {
    const ids = new Set<number>()
    for (let i = 0; i < 100; i++) {
      ids.add(createMatrix(db, `Matrix ${i}`))
    }
    expect(ids.size).toBe(100)
  })

  test('data row IDs are non-sequential positive integers', () => {
    const matrixId = createMatrix(db, 'Test')
    const ids: number[] = []
    for (let i = 0; i < 10; i++) {
      ids.push(insertDataRow(db, matrixId, { title: `Row ${i}` }))
    }

    for (const id of ids) {
      expect(id).toBeGreaterThan(0)
    }

    const diffs = ids.slice(1).map((id, i) => Math.abs(id - ids[i]!))
    const allSequential = diffs.every((d) => d === 1)
    expect(allSequential).toBe(false)
  })

  test('bulk-create 1000 data rows with no collisions', () => {
    const matrixId = createMatrix(db, 'Bulk')
    const ids = new Set<number>()
    for (let i = 0; i < 1000; i++) {
      ids.add(insertDataRow(db, matrixId, { title: `Row ${i}` }))
    }
    expect(ids.size).toBe(1000)
  })

  test('insertDataRow with DEFAULT VALUES returns random positive ID', () => {
    const matrixId = createMatrix(db, 'Test')
    const id = insertDataRow(db, matrixId)
    expect(id).toBeGreaterThan(0)
    expect(id).toBeTypeOf('number')
  })

  test('insertDataRow with values returns random positive ID', () => {
    const matrixId = createMatrix(db, 'Test')
    const id = insertDataRow(db, matrixId, { title: 'Hello' })
    expect(id).toBeGreaterThan(0)
    expect(id).toBeTypeOf('number')
  })

  test('createMatrix returns random positive ID', () => {
    const id = createMatrix(db, 'Test')
    expect(id).toBeGreaterThan(0)
    expect(id).toBeTypeOf('number')
  })

  test('existing operations work correctly with random IDs', () => {
    const matrixId = createMatrix(db, 'Test')

    // insertDataRow + insertRow
    const rowId1 = insertDataRow(db, matrixId, { title: 'Row 1' })
    const key1 = insertRow(db, { matrixId, rowKind: 0, rowId: rowId1 })

    const rowId2 = insertDataRow(db, matrixId, { title: 'Row 2' })
    const key2 = insertRow(db, { matrixId, prevKey: key1, rowKind: 0, rowId: rowId2 })

    // Verify children and parents work
    const rowId3 = insertDataRow(db, matrixId, { title: 'Child' })
    const key3 = insertRow(db, { matrixId, parentKey: key1, rowKind: 0, rowId: rowId3 })

    expect(getChildren(db, matrixId, key1)).toHaveLength(1)
    expect(getParent(db, matrixId, key3)).not.toBeNull()

    // Reparent
    const newKey3 = reparentRow(db, {
      matrixId,
      nodeKey: key3,
      newParentKey: key2,
    })
    expect(getChildren(db, matrixId, key1)).toHaveLength(0)
    expect(getChildren(db, matrixId, key2)).toHaveLength(1)

    // Delete
    deleteRow(db, { matrixId, key: newKey3 })
    expect(getChildren(db, matrixId, key2)).toHaveLength(0)
  })

  test('outline query works with random IDs', () => {
    const matrixId = createMatrix(db, 'Test')

    const rowId1 = insertDataRow(db, matrixId, { title: 'Parent' })
    const key1 = insertRow(db, { matrixId, rowKind: 0, rowId: rowId1 })

    const rowId2 = insertDataRow(db, matrixId, { title: 'Child' })
    insertRow(db, { matrixId, parentKey: key1, rowKind: 0, rowId: rowId2 })

    const rowId3 = insertDataRow(db, matrixId, { title: 'Sibling' })
    insertRow(db, { matrixId, prevKey: key1, rowKind: 0, rowId: rowId3 })

    // Outline-style query: join rank + data, order by key
    const stmt = db.prepare(`
      SELECT d.title
      FROM rank r
      JOIN "mx_${matrixId}_data" d ON d.id = r.row_id
      WHERE r.matrix_id = ?
      ORDER BY r.key
    `)
    stmt.bind([matrixId])
    const titles: string[] = []
    while (stmt.step()) {
      titles.push((stmt.get({}) as { title: string }).title)
    }
    stmt.finalize()

    expect(titles).toEqual(['Parent', 'Child', 'Sibling'])
  })

  test('addSampleRowsToMatrix works with random IDs', () => {
    const matrixId = createMatrix(db, 'Test')
    addSampleRowsToMatrix(db, matrixId)

    const dataStmt = db.prepare(`SELECT COUNT(*) as count FROM "mx_${matrixId}_data"`)
    dataStmt.step()
    const count = (dataStmt.get({}) as { count: number }).count
    expect(count).toBeGreaterThanOrEqual(2)
    dataStmt.finalize()
  })

  test('ensureRootMatrix still works with explicit ID 1', () => {
    const rootId = ensureRootMatrix(db)
    expect(rootId).toBe(1)

    const rowId = insertDataRow(db, 1, { content: 'test' })
    expect(rowId).toBeGreaterThan(0)
  })
})
