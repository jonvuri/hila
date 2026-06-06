/**
 * Self-tests for the perf-test harness (Phase 8, Stage P0).
 *
 * These prove each guard family works in isolation -- both that it passes on
 * good input and that it *fails loudly* on bad input -- so later phases can
 * trust the harness when they add real guards. The baseline guards against the
 * current hot paths live in `baseline.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { createMatrix, insertRow } from '../core/matrix'
import { ensureTrait } from '../core/traits'

import {
  assertQueryPlan,
  assertScaling,
  categorizeTables,
  createPerfDb,
  explainQueryPlan,
  measureScaling,
  normalizeTable,
  type PerfHarness,
} from './index'

const createMatrixWithTraits = (harness: PerfHarness, title: string): number => {
  const matrixId = createMatrix(harness.rawDb, title, [{ name: 'label', type: 'TEXT' }])
  ensureTrait(harness.rawDb, 'rank', matrixId)
  ensureTrait(harness.rawDb, 'closure', matrixId)
  return matrixId
}

// -- Table categorization -----------------------------------------------------

describe('table categorization', () => {
  test('normalizes per-matrix tables onto logical categories', () => {
    expect(normalizeTable('mx_42_data')).toBe('data')
    expect(normalizeTable('mx_7_closure')).toBe('closure')
    expect(normalizeTable('rank')).toBe('rank')
    expect(normalizeTable('JOINS')).toBe('joins')
  })

  test('extracts referenced tables from SQL without throwing', () => {
    const cats = categorizeTables(`
      SELECT r.key FROM rank r
      JOIN "mx_3_data" d ON r.row_id = d.id
      LEFT JOIN "mx_3_closure" c ON r.key = c.descendant_key
      WHERE r.matrix_id = 3
    `)
    expect(cats).toEqual(new Set(['rank', 'data', 'closure']))
  })

  test('does not confuse matrix with matrix_columns', () => {
    expect(categorizeTables('SELECT * FROM matrix_columns')).toEqual(
      new Set(['matrix_columns']),
    )
    expect(categorizeTables('SELECT * FROM matrix')).toEqual(new Set(['matrix']))
  })
})

// -- Work counter -------------------------------------------------------------

describe('work counter', () => {
  let harness: PerfHarness

  beforeEach(async () => {
    harness = await createPerfDb()
  })
  afterEach(() => harness.close())

  test('counts row writes per logical table via the update hook', () => {
    const matrixId = createMatrixWithTraits(harness, 'Work')
    harness.reset()

    insertRow(harness.db, matrixId, { values: { label: 'hi' } })

    // One root insert writes: the data row, its rank entry, and its self
    // closure entry. (The _sync_changelog triggers add untracked-by-table
    // noise, so we assert per logical table rather than on the grand total.)
    expect(harness.counters.byTable.data?.rowsWritten).toBe(1)
    expect(harness.counters.byTable.rank?.rowsWritten).toBe(1)
    expect(harness.counters.byTable.closure?.rowsWritten).toBe(1)
  })

  test('counts statements and stepped rows through the proxy', () => {
    const matrixId = createMatrixWithTraits(harness, 'Work')
    insertRow(harness.db, matrixId, { values: { label: 'a' } })
    insertRow(harness.db, matrixId, { values: { label: 'b' } })
    harness.reset()

    const stmt = harness.db.prepare(`SELECT id FROM "mx_${matrixId}_data"`)
    let n = 0
    while (stmt.step()) n++
    stmt.finalize()

    expect(n).toBe(2)
    expect(harness.counters.statements).toBe(1)
    expect(harness.counters.steps).toBe(2)
    expect(harness.counters.byTable.data?.steps).toBe(2)
  })

  test('reset zeroes all counters', () => {
    const matrixId = createMatrixWithTraits(harness, 'Work')
    insertRow(harness.db, matrixId, { values: { label: 'a' } })
    expect(harness.counters.rowsWritten).toBeGreaterThan(0)

    harness.reset()
    expect(harness.counters.rowsWritten).toBe(0)
    expect(harness.counters.statements).toBe(0)
    expect(harness.counters.steps).toBe(0)
    expect(harness.counters.byTable).toEqual({})
  })

  test('proxied prepared statements still return correct data', () => {
    const matrixId = createMatrixWithTraits(harness, 'Work')
    insertRow(harness.db, matrixId, { values: { label: 'roundtrip' } })

    const stmt = harness.db.prepare(`SELECT label FROM "mx_${matrixId}_data" LIMIT 1`)
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { label: string }
    stmt.finalize()
    expect(row.label).toBe('roundtrip')
  })
})

// -- Query-plan guard ---------------------------------------------------------

describe('assertQueryPlan', () => {
  let harness: PerfHarness

  beforeEach(async () => {
    harness = await createPerfDb({ initSchema: false })
    harness.rawDb.exec('CREATE TABLE t (a INTEGER, b INTEGER)')
    harness.rawDb.exec('CREATE INDEX t_a ON t(a)')
    const insert = harness.rawDb.prepare('INSERT INTO t (a, b) VALUES (?, ?)')
    for (let i = 0; i < 500; i++) {
      insert.bind([i, i % 7])
      insert.step()
      insert.reset()
    }
    insert.finalize()
    harness.analyze()
  })
  afterEach(() => harness.close())

  test('passes when the intended index is used', () => {
    expect(() =>
      assertQueryPlan(harness.rawDb, 'SELECT * FROM t WHERE a = ?', [1], {
        usesIndex: 't_a',
        noScanOf: ['t'],
      }),
    ).not.toThrow()
  })

  test('fails on a full table scan of a banned table', () => {
    expect(() =>
      assertQueryPlan(harness.rawDb, 'SELECT * FROM t WHERE b = ?', [1], {
        noScanOf: ['t'],
      }),
    ).toThrow(/full SCAN of "t"/)
  })

  test('fails when a required index is absent from the plan', () => {
    expect(() =>
      assertQueryPlan(harness.rawDb, 'SELECT * FROM t WHERE b = ?', [1], {
        usesIndex: 't_a',
      }),
    ).toThrow(/use index "t_a"/)
  })

  test('explainQueryPlan exposes the raw plan rows', () => {
    const plan = explainQueryPlan(harness.rawDb, 'SELECT * FROM t WHERE a = ?', [1])
    expect(plan.length).toBeGreaterThan(0)
    expect(plan.some((r) => /t_a/.test(r.detail))).toBe(true)
  })
})

// -- Scaling-ratio helper -----------------------------------------------------

describe('assertScaling', () => {
  test('accepts constant work across sizes', () => {
    expect(() =>
      assertScaling({ run: () => 1, sizes: [100, 1000], order: 'constant' }),
    ).not.toThrow()
  })

  test('accepts linear work', () => {
    expect(() =>
      assertScaling({ run: (size) => size, sizes: [100, 1000], order: 'linear' }),
    ).not.toThrow()
  })

  test('rejects super-linear work under a linear expectation', () => {
    expect(() =>
      assertScaling({ run: (size) => size * size, sizes: [100, 1000], order: 'linear' }),
    ).toThrow(/Scaling guard failed/)
  })

  test('rejects linear work under a constant expectation', () => {
    expect(() =>
      assertScaling({ run: (size) => size, sizes: [100, 1000], order: 'constant' }),
    ).toThrow(/Scaling guard failed/)
  })

  test('measureScaling reports raw measurements', () => {
    const measurements = measureScaling((size) => size * 2, [10, 20])
    expect(measurements).toEqual([
      { size: 10, work: 20 },
      { size: 20, work: 40 },
    ])
  })
})
