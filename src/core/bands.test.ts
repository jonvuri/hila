import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { initMatrixSchema } from './matrix'
import { createBand, updateBandSql, deleteBand, getBandsForNode } from './bands'

describe('Bands CRUD (Phase 9.3 read slice)', () => {
  let db: Database

  const focal = { matrixId: 1, rowId: 42 }

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('createBand persists and getBandsForNode returns it', () => {
    const id = createBand(db, focal, 'SELECT 1 AS x')
    const bands = getBandsForNode(db, focal)
    expect(bands).toHaveLength(1)
    expect(bands[0]!.id).toBe(id)
    expect(bands[0]!.sql).toBe('SELECT 1 AS x')
    // The documented band tuple defaults are present.
    expect(bands[0]!.face).toBe('property-list')
    expect(bands[0]!.integration).toBe('query')
  })

  test('createBand appends in order; getBandsForNode is ordered', () => {
    const a = createBand(db, focal, 'SELECT 1')
    const b = createBand(db, focal, 'SELECT 2')
    const c = createBand(db, focal, 'SELECT 3')
    const bands = getBandsForNode(db, focal)
    expect(bands.map((band) => band.id)).toEqual([a, b, c])
    expect(bands.map((band) => band.order)).toEqual([0, 1, 2])
  })

  test('getBandsForNode is scoped to the focal node', () => {
    createBand(db, focal, 'SELECT 1')
    createBand(db, { matrixId: 1, rowId: 99 }, 'SELECT 2')
    expect(getBandsForNode(db, focal)).toHaveLength(1)
    expect(getBandsForNode(db, { matrixId: 1, rowId: 99 })).toHaveLength(1)
  })

  test('updateBandSql replaces the SQL', () => {
    const id = createBand(db, focal, 'SELECT 1')
    updateBandSql(db, id, 'SELECT 2 AS y')
    expect(getBandsForNode(db, focal)[0]!.sql).toBe('SELECT 2 AS y')
  })

  test('deleteBand removes the band', () => {
    const id = createBand(db, focal, 'SELECT 1')
    deleteBand(db, id)
    expect(getBandsForNode(db, focal)).toHaveLength(0)
  })
})
