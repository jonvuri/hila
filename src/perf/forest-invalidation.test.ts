/**
 * Self-tests for the seeded forest generator and the invalidation recorder
 * (Phase 8, Stage P0).
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { insertRow } from '../core/matrix'

import {
  assertNoCrossInvalidation,
  createForestMatrix,
  createPerfDb,
  generateForest,
  tablesVisitedBySql,
  type PerfHarness,
} from './index'

const toHex = (key: Uint8Array): string =>
  Array.from(key, (b) => b.toString(16).padStart(2, '0')).join('')

// -- Forest generator ---------------------------------------------------------

describe('generateForest', () => {
  let harness: PerfHarness

  beforeEach(async () => {
    harness = await createPerfDb()
  })
  afterEach(() => harness.close())

  test('produces the requested number of nodes', () => {
    const matrixId = createForestMatrix(harness.rawDb, 'Trees')
    const forest = generateForest(harness.rawDb, { matrixId, count: 200, seed: 1 })
    expect(forest.nodes.length).toBe(200)
  })

  test('respects the max-depth bound', () => {
    const matrixId = createForestMatrix(harness.rawDb, 'Trees')
    const forest = generateForest(harness.rawDb, {
      matrixId,
      count: 300,
      maxDepth: 3,
      seed: 5,
    })
    const maxDepth = Math.max(...forest.nodes.map((n) => n.depth))
    expect(maxDepth).toBeLessThanOrEqual(3)
    expect(maxDepth).toBeGreaterThan(0)
  })

  test('is deterministic: same seed yields byte-identical keys', async () => {
    const matrixIdA = createForestMatrix(harness.rawDb, 'A')
    const forestA = generateForest(harness.rawDb, { matrixId: matrixIdA, count: 150, seed: 42 })

    const other = await createPerfDb()
    try {
      const matrixIdB = createForestMatrix(other.rawDb, 'B')
      const forestB = generateForest(other.rawDb, { matrixId: matrixIdB, count: 150, seed: 42 })

      expect(forestB.nodes.map((n) => toHex(n.edgeKey))).toEqual(
        forestA.nodes.map((n) => toHex(n.edgeKey)),
      )
      expect(forestB.nodes.map((n) => n.depth)).toEqual(forestA.nodes.map((n) => n.depth))
    } finally {
      other.close()
    }
  })

  test('different seeds yield different shapes', async () => {
    const matrixIdA = createForestMatrix(harness.rawDb, 'A')
    const forestA = generateForest(harness.rawDb, { matrixId: matrixIdA, count: 150, seed: 1 })

    const other = await createPerfDb()
    try {
      const matrixIdB = createForestMatrix(other.rawDb, 'B')
      const forestB = generateForest(other.rawDb, { matrixId: matrixIdB, count: 150, seed: 2 })
      expect(forestB.nodes.map((n) => n.depth)).not.toEqual(forestA.nodes.map((n) => n.depth))
    } finally {
      other.close()
    }
  })

  test('exposes useful node selectors', () => {
    const matrixId = createForestMatrix(harness.rawDb, 'Trees')
    const forest = generateForest(harness.rawDb, { matrixId, count: 250, seed: 7 })

    expect(forest.roots().length).toBeGreaterThan(0)
    expect(forest.leaves().length).toBeGreaterThan(0)
    const deep = forest.deepestLeaf()
    expect(deep.depth).toBe(Math.max(...forest.nodes.map((n) => n.depth)))
  })
})

// -- Invalidation recorder ----------------------------------------------------

describe('invalidation recorder', () => {
  let harness: PerfHarness

  beforeEach(async () => {
    harness = await createPerfDb()
  })
  afterEach(() => harness.close())

  test('tablesVisitedBySql resolves read tables', () => {
    expect(tablesVisitedBySql('SELECT * FROM matrix WHERE id = 1')).toEqual(new Set(['matrix']))
  })

  test('recomputedFor selects only subscriptions reading a written table', () => {
    const tracker = harness.createTracker()
    const matrixSql = 'SELECT COUNT(*) FROM matrix WHERE id = 1'
    const joinsSql = 'SELECT * FROM joins WHERE source_row_id = 1'
    tracker.subscribe(matrixSql)
    tracker.subscribe(joinsSql)

    const recomputed = tracker.recomputedFor(['matrix'])
    expect(recomputed.has(matrixSql)).toBe(true)
    expect(recomputed.has(joinsSql)).toBe(false)
  })

  test('records real write fan-out and proves cross-table isolation', () => {
    const matrixA = createForestMatrix(harness.rawDb, 'A')
    const matrixB = createForestMatrix(harness.rawDb, 'B')

    const tracker = harness.createTracker()
    const aData = `SELECT * FROM "mx_${matrixA}_data"`
    const bData = `SELECT * FROM "mx_${matrixB}_data"`
    tracker.subscribe(aData)
    tracker.subscribe(bData)

    const edit = tracker.record(() => {
      insertRow(harness.db, matrixA, { values: { label: 'x' } })
    })

    // The edit wrote matrix A's data table (plus the own-edge in joins + changelog).
    expect(edit.writtenTables.has(`mx_${matrixA}_data`)).toBe(true)
    expect(edit.recomputed.has(aData)).toBe(true)
    // A subscription reading only matrix B's data table is untouched.
    assertNoCrossInvalidation(edit, bData)
  })

  test('documents current table-grained over-invalidation on shared tables', () => {
    const matrixA = createForestMatrix(harness.rawDb, 'A')
    const matrixB = createForestMatrix(harness.rawDb, 'B')

    const tracker = harness.createTracker()
    // Both count queries read the global `joins` table (the own-forest).
    const aCount = `SELECT COUNT(*) FROM joins WHERE target_matrix_id = ${matrixA}`
    const bCount = `SELECT COUNT(*) FROM joins WHERE target_matrix_id = ${matrixB}`
    tracker.subscribe(aCount)
    tracker.subscribe(bCount)

    const edit = tracker.record(() => {
      insertRow(harness.db, matrixA, { values: { label: 'x' } })
    })

    // Both count queries read `joins`, so today an edit to A also recomputes the
    // B-scoped count. Phase 8b §4 makes invalidation range-aware to fix this.
    expect(edit.recomputed.has(aCount)).toBe(true)
    expect(edit.recomputed.has(bCount)).toBe(true)
  })
})
