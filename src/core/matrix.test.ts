import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { initMatrixSchema, createMatrix, addSampleRowsToMatrix, insertElement } from './matrix'
import { compareKeys } from './lexorank'

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

    // Verify ordering entries were created
    const orderingStmt = db.prepare(
      `SELECT COUNT(*) as count FROM ordering WHERE matrix_id = ?`,
    )
    orderingStmt.bind([matrixId])
    orderingStmt.step()
    const orderingCount = (orderingStmt.get({}) as { count: number }).count
    expect(orderingCount).toBe(dataCount)
    orderingStmt.finalize()

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

describe('insertElement API', () => {
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

  test('should insert element at root level with no existing elements', () => {
    const matrixId = createMatrix(db, 'Test Matrix')

    // Create a data row
    const dataStmt = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`,
    )
    dataStmt.bind(['First row'])
    dataStmt.step()
    const elementId = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    // Insert element
    const key = insertElement(db, {
      matrixId,
      elementKind: 0,
      elementId,
    })

    // Verify ordering entry was created
    const orderingStmt = db.prepare('SELECT * FROM ordering WHERE matrix_id = ?')
    orderingStmt.bind([matrixId])
    expect(orderingStmt.step()).toBe(true)
    const orderingRow = orderingStmt.get({}) as {
      key: Uint8Array
      matrix_id: number
      element_kind: number
      element_id: number
    }
    expect(orderingRow.matrix_id).toBe(matrixId)
    expect(orderingRow.element_kind).toBe(0)
    expect(orderingRow.element_id).toBe(elementId)
    expect(compareKeys(orderingRow.key, key)).toBe(0)
    orderingStmt.finalize()

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

  test('should insert multiple elements in order with only prevKey', () => {
    const matrixId = createMatrix(db, 'Test Matrix')

    // Create and insert first element
    let dataStmt = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`,
    )
    dataStmt.bind(['First'])
    dataStmt.step()
    const elementId1 = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key1 = insertElement(db, {
      matrixId,
      elementKind: 0,
      elementId: elementId1,
    })

    // Create and insert second element after first
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`)
    dataStmt.bind(['Second'])
    dataStmt.step()
    const elementId2 = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key2 = insertElement(db, {
      matrixId,
      prevKey: key1,
      elementKind: 0,
      elementId: elementId2,
    })

    // Create and insert third element after second
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`)
    dataStmt.bind(['Third'])
    dataStmt.step()
    const elementId3 = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key3 = insertElement(db, {
      matrixId,
      prevKey: key2,
      elementKind: 0,
      elementId: elementId3,
    })

    // Verify ordering: key1 < key2 < key3
    expect(compareKeys(key1, key2)).toBe(-1)
    expect(compareKeys(key2, key3)).toBe(-1)
    expect(compareKeys(key1, key3)).toBe(-1)

    // Verify elements appear in order in the database
    const orderingStmt = db.prepare(
      'SELECT element_id FROM ordering WHERE matrix_id = ? ORDER BY key',
    )
    orderingStmt.bind([matrixId])

    expect(orderingStmt.step()).toBe(true)
    expect((orderingStmt.get({}) as { element_id: number }).element_id).toBe(elementId1)

    expect(orderingStmt.step()).toBe(true)
    expect((orderingStmt.get({}) as { element_id: number }).element_id).toBe(elementId2)

    expect(orderingStmt.step()).toBe(true)
    expect((orderingStmt.get({}) as { element_id: number }).element_id).toBe(elementId3)

    expect(orderingStmt.step()).toBe(false)
    orderingStmt.finalize()
  })

  test('should insert multiple elements in order with only nextKey', () => {
    const matrixId = createMatrix(db, 'Test Matrix')

    // Create and insert first element
    let dataStmt = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`,
    )
    dataStmt.bind(['Third'])
    dataStmt.step()
    const elementId3 = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key3 = insertElement(db, {
      matrixId,
      elementKind: 0,
      elementId: elementId3,
    })

    // Create and insert second element before third
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`)
    dataStmt.bind(['Second'])
    dataStmt.step()
    const elementId2 = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key2 = insertElement(db, {
      matrixId,
      nextKey: key3,
      elementKind: 0,
      elementId: elementId2,
    })

    // Create and insert first element before second
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`)
    dataStmt.bind(['First'])
    dataStmt.step()
    const elementId1 = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key1 = insertElement(db, {
      matrixId,
      nextKey: key2,
      elementKind: 0,
      elementId: elementId1,
    })

    // Verify ordering: key1 < key2 < key3
    expect(compareKeys(key1, key2)).toBe(-1)
    expect(compareKeys(key2, key3)).toBe(-1)
    expect(compareKeys(key1, key3)).toBe(-1)

    // Verify elements appear in order in the database
    const orderingStmt = db.prepare(
      'SELECT element_id FROM ordering WHERE matrix_id = ? ORDER BY key',
    )
    orderingStmt.bind([matrixId])

    expect(orderingStmt.step()).toBe(true)
    expect((orderingStmt.get({}) as { element_id: number }).element_id).toBe(elementId1)

    expect(orderingStmt.step()).toBe(true)
    expect((orderingStmt.get({}) as { element_id: number }).element_id).toBe(elementId2)

    expect(orderingStmt.step()).toBe(true)
    expect((orderingStmt.get({}) as { element_id: number }).element_id).toBe(elementId3)

    expect(orderingStmt.step()).toBe(false)
    orderingStmt.finalize()
  })

  test('should insert element between two existing elements', () => {
    const matrixId = createMatrix(db, 'Test Matrix')

    // Create and insert first element
    let dataStmt = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`,
    )
    dataStmt.bind(['First'])
    dataStmt.step()
    const elementId1 = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key1 = insertElement(db, {
      matrixId,
      elementKind: 0,
      elementId: elementId1,
    })

    // Create and insert third element
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`)
    dataStmt.bind(['Third'])
    dataStmt.step()
    const elementId3 = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key3 = insertElement(db, {
      matrixId,
      prevKey: key1,
      elementKind: 0,
      elementId: elementId3,
    })

    // Create and insert middle element
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`)
    dataStmt.bind(['Second'])
    dataStmt.step()
    const elementId2 = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const key2 = insertElement(db, {
      matrixId,
      prevKey: key1,
      nextKey: key3,
      elementKind: 0,
      elementId: elementId2,
    })

    // Verify ordering: key1 < key2 < key3
    expect(compareKeys(key1, key2)).toBe(-1)
    expect(compareKeys(key2, key3)).toBe(-1)
    expect(compareKeys(key1, key3)).toBe(-1)

    // Verify elements appear in order in the database
    const orderingStmt = db.prepare(
      'SELECT element_id FROM ordering WHERE matrix_id = ? ORDER BY key',
    )
    orderingStmt.bind([matrixId])

    expect(orderingStmt.step()).toBe(true)
    expect((orderingStmt.get({}) as { element_id: number }).element_id).toBe(elementId1)

    expect(orderingStmt.step()).toBe(true)
    expect((orderingStmt.get({}) as { element_id: number }).element_id).toBe(elementId2)

    expect(orderingStmt.step()).toBe(true)
    expect((orderingStmt.get({}) as { element_id: number }).element_id).toBe(elementId3)

    expect(orderingStmt.step()).toBe(false)
    orderingStmt.finalize()
  })

  test('should insert child elements with parentKey', () => {
    const matrixId = createMatrix(db, 'Test Matrix')

    // Create and insert parent element
    let dataStmt = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`,
    )
    dataStmt.bind(['Parent'])
    dataStmt.step()
    const parentElementId = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const parentKey = insertElement(db, {
      matrixId,
      elementKind: 0,
      elementId: parentElementId,
    })

    // Create and insert first child
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`)
    dataStmt.bind(['Child 1'])
    dataStmt.step()
    const childElementId1 = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const childKey1 = insertElement(db, {
      matrixId,
      parentKey,
      elementKind: 0,
      elementId: childElementId1,
    })

    // Create and insert second child
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`)
    dataStmt.bind(['Child 2'])
    dataStmt.step()
    const childElementId2 = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const childKey2 = insertElement(db, {
      matrixId,
      parentKey,
      prevKey: childKey1,
      elementKind: 0,
      elementId: childElementId2,
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

    // Create and insert root element
    let dataStmt = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`,
    )
    dataStmt.bind(['Root'])
    dataStmt.step()
    const rootElementId = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const rootKey = insertElement(db, {
      matrixId,
      elementKind: 0,
      elementId: rootElementId,
    })

    // Create and insert child element
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`)
    dataStmt.bind(['Child'])
    dataStmt.step()
    const childElementId = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const childKey = insertElement(db, {
      matrixId,
      parentKey: rootKey,
      elementKind: 0,
      elementId: childElementId,
    })

    // Create and insert grandchild element
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`)
    dataStmt.bind(['Grandchild'])
    dataStmt.step()
    const grandchildElementId = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const grandchildKey = insertElement(db, {
      matrixId,
      parentKey: childKey,
      elementKind: 0,
      elementId: grandchildElementId,
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
      `INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`,
    )
    dataStmt.bind(['Parent'])
    dataStmt.step()
    const parentId = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const parentKey = insertElement(db, {
      matrixId,
      elementKind: 0,
      elementId: parentId,
    })

    // Create first child
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`)
    dataStmt.bind(['Child 1'])
    dataStmt.step()
    const child1Id = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const child1Key = insertElement(db, {
      matrixId,
      parentKey,
      elementKind: 0,
      elementId: child1Id,
    })

    // Create second child
    dataStmt = db.prepare(`INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`)
    dataStmt.bind(['Child 2'])
    dataStmt.step()
    const child2Id = (dataStmt.get({}) as { id: number }).id
    dataStmt.finalize()

    const child2Key = insertElement(db, {
      matrixId,
      parentKey,
      prevKey: child1Key,
      elementKind: 0,
      elementId: child2Id,
    })

    // Verify keys are different
    expect(compareKeys(child1Key, child2Key)).toBe(-1)

    // Verify both are children of parent
    expect(compareKeys(parentKey, child1Key)).toBe(-1)
    expect(compareKeys(parentKey, child2Key)).toBe(-1)

    // Verify they appear in order in the database
    const orderingStmt = db.prepare(
      'SELECT element_id FROM ordering WHERE matrix_id = ? ORDER BY key',
    )
    orderingStmt.bind([matrixId])

    expect(orderingStmt.step()).toBe(true)
    expect((orderingStmt.get({}) as { element_id: number }).element_id).toBe(parentId)

    expect(orderingStmt.step()).toBe(true)
    expect((orderingStmt.get({}) as { element_id: number }).element_id).toBe(child1Id)

    expect(orderingStmt.step()).toBe(true)
    expect((orderingStmt.get({}) as { element_id: number }).element_id).toBe(child2Id)

    expect(orderingStmt.step()).toBe(false)
    orderingStmt.finalize()
  })

  test('should maintain correct ordering with multiple inserts at different levels', () => {
    const matrixId = createMatrix(db, 'Test Matrix')

    // Create root level elements
    const dataStmt1 = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`,
    )
    dataStmt1.bind(['Root 1'])
    dataStmt1.step()
    const rootId1 = (dataStmt1.get({}) as { id: number }).id
    dataStmt1.finalize()

    const rootKey1 = insertElement(db, {
      matrixId,
      elementKind: 0,
      elementId: rootId1,
    })

    const dataStmt2 = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`,
    )
    dataStmt2.bind(['Root 2'])
    dataStmt2.step()
    const rootId2 = (dataStmt2.get({}) as { id: number }).id
    dataStmt2.finalize()

    const rootKey2 = insertElement(db, {
      matrixId,
      prevKey: rootKey1,
      elementKind: 0,
      elementId: rootId2,
    })

    // Create children for Root 1
    const dataStmt3 = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`,
    )
    dataStmt3.bind(['Child 1.1'])
    dataStmt3.step()
    const childId1_1 = (dataStmt3.get({}) as { id: number }).id
    dataStmt3.finalize()

    const childKey1_1 = insertElement(db, {
      matrixId,
      parentKey: rootKey1,
      elementKind: 0,
      elementId: childId1_1,
    })

    const dataStmt4 = db.prepare(
      `INSERT INTO "mx_${matrixId}_data" (data1) VALUES (?) RETURNING id`,
    )
    dataStmt4.bind(['Child 1.2'])
    dataStmt4.step()
    const childId1_2 = (dataStmt4.get({}) as { id: number }).id
    dataStmt4.finalize()

    const childKey1_2 = insertElement(db, {
      matrixId,
      parentKey: rootKey1,
      prevKey: childKey1_1,
      elementKind: 0,
      elementId: childId1_2,
    })

    // Verify all keys are in correct order
    const keys = [rootKey1, childKey1_1, childKey1_2, rootKey2]
    for (let i = 0; i < keys.length - 1; i++) {
      expect(compareKeys(keys[i]!, keys[i + 1]!)).toBe(-1)
    }

    // Verify they appear in order in the database
    const orderingStmt = db.prepare(
      'SELECT element_id FROM ordering WHERE matrix_id = ? ORDER BY key',
    )
    orderingStmt.bind([matrixId])

    const expectedOrder = [rootId1, childId1_1, childId1_2, rootId2]
    for (const expectedId of expectedOrder) {
      expect(orderingStmt.step()).toBe(true)
      expect((orderingStmt.get({}) as { element_id: number }).element_id).toBe(expectedId)
    }

    expect(orderingStmt.step()).toBe(false)
    orderingStmt.finalize()
  })
})
