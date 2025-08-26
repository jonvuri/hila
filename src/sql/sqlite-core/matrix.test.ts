import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { initMatrixSchema, createMatrix, addSampleRowsToMatrix } from './matrix'

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
