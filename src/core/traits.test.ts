import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { initMatrixSchema, createMatrix, insertDataRow, insertRow } from './matrix'
import { ensureTrait, getTraits } from './traits'

describe('Trait provisioning', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('matrix_traits table exists after schema init', () => {
    const stmt = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='matrix_traits'`,
    )
    expect(stmt.step()).toBe(true)
    stmt.finalize()
  })

  // -- ensureTrait: closure ---------------------------------------------------

  test('ensureTrait closure creates the closure table', () => {
    const matrixId = createMatrix(db, 'Test')

    ensureTrait(db, 'closure', matrixId)

    const tableStmt = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='mx_${matrixId}_closure'`,
    )
    expect(tableStmt.step()).toBe(true)
    tableStmt.finalize()
  })

  test('ensureTrait closure is idempotent (one table, one matrix_traits row)', () => {
    const matrixId = createMatrix(db, 'Test')

    const handle1 = ensureTrait(db, 'closure', matrixId)
    const handle2 = ensureTrait(db, 'closure', matrixId)

    expect(handle1).toEqual(handle2)

    const countStmt = db.prepare(
      `SELECT COUNT(*) as count FROM matrix_traits WHERE matrix_id = ? AND trait_type = 'closure'`,
    )
    countStmt.bind([matrixId])
    countStmt.step()
    expect((countStmt.get({}) as { count: number }).count).toBe(1)
    countStmt.finalize()

    const tableStmt = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='mx_${matrixId}_closure'`,
    )
    expect(tableStmt.step()).toBe(true)
    tableStmt.finalize()
  })

  // -- ensureTrait: rank ------------------------------------------------------

  test('ensureTrait rank records the trait without creating extra tables', () => {
    const matrixId = createMatrix(db, 'Test')

    const handle = ensureTrait(db, 'rank', matrixId)

    expect(handle).toEqual({ type: 'rank', matrixId })

    const countStmt = db.prepare(
      `SELECT COUNT(*) as count FROM matrix_traits WHERE matrix_id = ? AND trait_type = 'rank'`,
    )
    countStmt.bind([matrixId])
    countStmt.step()
    expect((countStmt.get({}) as { count: number }).count).toBe(1)
    countStmt.finalize()
  })

  test('ensureTrait rank is idempotent', () => {
    const matrixId = createMatrix(db, 'Test')

    ensureTrait(db, 'rank', matrixId)
    ensureTrait(db, 'rank', matrixId)

    const countStmt = db.prepare(
      `SELECT COUNT(*) as count FROM matrix_traits WHERE matrix_id = ? AND trait_type = 'rank'`,
    )
    countStmt.bind([matrixId])
    countStmt.step()
    expect((countStmt.get({}) as { count: number }).count).toBe(1)
    countStmt.finalize()
  })

  test('ensureTrait rank for matrix with existing rank entries causes no data loss', () => {
    const matrixId = createMatrix(db, 'Test')

    ensureTrait(db, 'rank', matrixId)
    ensureTrait(db, 'closure', matrixId)

    const rowId = insertDataRow(db, matrixId, { title: 'Existing' })
    insertRow(db, { matrixId, rowKind: 0, rowId })

    const beforeStmt = db.prepare('SELECT COUNT(*) as count FROM rank WHERE matrix_id = ?')
    beforeStmt.bind([matrixId])
    beforeStmt.step()
    const beforeCount = (beforeStmt.get({}) as { count: number }).count
    beforeStmt.finalize()
    expect(beforeCount).toBe(1)

    ensureTrait(db, 'rank', matrixId)

    const afterStmt = db.prepare('SELECT COUNT(*) as count FROM rank WHERE matrix_id = ?')
    afterStmt.bind([matrixId])
    afterStmt.step()
    const afterCount = (afterStmt.get({}) as { count: number }).count
    afterStmt.finalize()
    expect(afterCount).toBe(1)
  })

  // -- insertRow without traits -----------------------------------------------

  test('insertRow errors when traits are not provisioned', () => {
    const matrixId = createMatrix(db, 'Test')
    const rowId = insertDataRow(db, matrixId, { title: 'Test' })

    expect(() => insertRow(db, { matrixId, rowKind: 0, rowId })).toThrow(
      /does not have the 'rank' trait provisioned/,
    )
  })

  test('insertRow errors when only rank is provisioned (missing closure)', () => {
    const matrixId = createMatrix(db, 'Test')
    ensureTrait(db, 'rank', matrixId)
    const rowId = insertDataRow(db, matrixId, { title: 'Test' })

    expect(() => insertRow(db, { matrixId, rowKind: 0, rowId })).toThrow(
      /does not have the 'closure' trait provisioned/,
    )
  })

  test('insertRow succeeds when both traits are provisioned', () => {
    const matrixId = createMatrix(db, 'Test')
    ensureTrait(db, 'rank', matrixId)
    ensureTrait(db, 'closure', matrixId)
    const rowId = insertDataRow(db, matrixId, { title: 'Test' })

    const key = insertRow(db, { matrixId, rowKind: 0, rowId })
    expect(key).toBeTruthy()
    expect(key.length).toBeGreaterThan(0)
  })

  // -- getTraits --------------------------------------------------------------

  test('getTraits returns empty array for matrix with no traits', () => {
    const matrixId = createMatrix(db, 'Test')
    expect(getTraits(db, matrixId)).toEqual([])
  })

  test('getTraits returns provisioned traits', () => {
    const matrixId = createMatrix(db, 'Test')

    ensureTrait(db, 'rank', matrixId)
    ensureTrait(db, 'closure', matrixId)

    const traits = getTraits(db, matrixId)
    expect(traits).toHaveLength(2)
    expect(traits).toContainEqual({
      matrix_id: matrixId,
      trait_type: 'closure',
    })
    expect(traits).toContainEqual({
      matrix_id: matrixId,
      trait_type: 'rank',
    })
  })

  test('getTraits does not return traits from other matrices', () => {
    const m1 = createMatrix(db, 'M1')
    const m2 = createMatrix(db, 'M2')

    ensureTrait(db, 'rank', m1)
    ensureTrait(db, 'closure', m2)

    const m1Traits = getTraits(db, m1)
    expect(m1Traits).toHaveLength(1)
    expect(m1Traits[0]!.trait_type).toBe('rank')

    const m2Traits = getTraits(db, m2)
    expect(m2Traits).toHaveLength(1)
    expect(m2Traits[0]!.trait_type).toBe('closure')
  })

  test('getTraits returns results ordered by trait_type', () => {
    const matrixId = createMatrix(db, 'Test')

    ensureTrait(db, 'rank', matrixId)
    ensureTrait(db, 'closure', matrixId)

    const traits = getTraits(db, matrixId)
    expect(traits.map((t) => t.trait_type)).toEqual(['closure', 'rank'])
  })

  // -- createMatrix no longer creates closure table ---------------------------

  test('createMatrix does not create a closure table', () => {
    const matrixId = createMatrix(db, 'Test')

    const tableStmt = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='mx_${matrixId}_closure'`,
    )
    expect(tableStmt.step()).toBe(false)
    tableStmt.finalize()
  })
})
