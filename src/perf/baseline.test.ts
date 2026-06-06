/**
 * Baseline perf guards against the *current* (pre-Phase-8) hot paths.
 *
 * Purpose, per Stage P0: prove the harness against real ops and establish a
 * known-good starting point so Phase 8 regressions are measured against it.
 * Some guards here are positive ("this stays index-covered / cheap") and some
 * are characterizations ("this is the cost today") that the Phase 8 spine is
 * explicitly designed to improve -- those are annotated with the stage that
 * supersedes them, so the contrast is documented rather than silent.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { insertRow } from '../core/matrix'
import { reparentRow } from '../core/tree'

import {
  assertQueryPlan,
  assertScaling,
  createForestMatrix,
  createPerfDb,
  explainQueryPlan,
  generateForest,
  type PerfHarness,
} from './index'

describe('baseline: query plans on current hot paths', () => {
  let harness: PerfHarness
  let matrixId: number

  beforeEach(async () => {
    harness = await createPerfDb()
    matrixId = createForestMatrix(harness.rawDb, 'Baseline')
    generateForest(harness.rawDb, { matrixId, count: 600, seed: 11 })
    harness.analyze()
  })
  afterEach(() => harness.close())

  test('parent lookup is covered by the closure by-descendant index', () => {
    // getParent / ancestry walks: closure keyed by descendant_key.
    const sql = `
      SELECT ancestor_key FROM "mx_${matrixId}_closure"
      WHERE descendant_key = ? AND depth = 1
    `
    assertQueryPlan(harness.rawDb, sql, [new Uint8Array([0x80, 0x00])], {
      usesIndex: `mx_${matrixId}_closure_by_descendant`,
      noAutoIndex: true,
    })
  })

  test('CHARACTERIZATION: outline count scans `rank` (no matrix_id index today)', () => {
    // `rank` is indexed only by its BLOB primary key; filtering by matrix_id
    // forces a scan. Phase 8b's global pre-order scroll index replaces this
    // count/offset path -- at which point this characterization should flip to
    // an index-covered guard.
    const sql = `SELECT COUNT(*) FROM rank WHERE matrix_id = ${matrixId}`
    const plan = explainQueryPlan(harness.rawDb, sql, [])
    const scansRank = plan.some((r) => /\bSCAN\b/.test(r.detail) && /\brank\b/.test(r.detail))
    expect(scansRank).toBe(true)
  })
})

describe('baseline: work counts on current structural ops', () => {
  let harness: PerfHarness

  beforeEach(async () => {
    harness = await createPerfDb()
  })
  afterEach(() => harness.close())

  test('a root insert writes exactly one data, rank, and closure row', () => {
    const matrixId = createForestMatrix(harness.rawDb, 'Insert')
    harness.reset()

    insertRow(harness.db, matrixId, { values: { label: 'one' } })

    expect(harness.counters.byTable.data?.rowsWritten).toBe(1)
    expect(harness.counters.byTable.rank?.rowsWritten).toBe(1)
    expect(harness.counters.byTable.closure?.rowsWritten).toBe(1)
  })

  test('CHARACTERIZATION: reparent rewrites the whole moved subtree`s rank keys', () => {
    // Today hierarchy is prefix-encoded in the rank key, so moving a node
    // rewrites every descendant`s key. Phase 8 §4/§7 moves hierarchy onto the
    // edge: a reparent must then re-point exactly 1 edge and write 0 descendant
    // keys. This guard pins the current O(subtree) cost so that payoff is
    // measurable.
    const matrixId = createForestMatrix(harness.rawDb, 'Reparent')
    const target = insertRow(harness.db, matrixId, { values: { label: 'target' } })
    const parent = insertRow(harness.db, matrixId, { values: { label: 'P' } })
    const subtreeSize = 5
    for (let i = 0; i < subtreeSize - 1; i++) {
      insertRow(harness.db, matrixId, { values: { label: `c${i}` }, parentKey: parent.key! })
    }

    harness.reset()
    reparentRow(harness.db, {
      matrixId,
      nodeKey: parent.key!,
      newParentKey: target.key!,
    })

    // The whole subtree (parent + 4 children) is re-keyed.
    expect(harness.counters.byTable.rank?.rowsWritten).toBe(subtreeSize)
  })
})

describe('baseline: scaling of current structural ops', () => {
  test('root insert work is constant as the forest grows', async () => {
    const harness = await createPerfDb()
    try {
      const measure = (forestSize: number): number => {
        const matrixId = createForestMatrix(harness.rawDb, `Insert ${forestSize}`)
        generateForest(harness.rawDb, { matrixId, count: forestSize, seed: 3 })
        harness.reset()
        insertRow(harness.db, matrixId, { values: { label: 'appended' } })
        return harness.counters.byTable.rank?.rowsWritten ?? 0
      }
      assertScaling({ run: measure, sizes: [200, 800], order: 'constant' })
    } finally {
      harness.close()
    }
  })

  test('CHARACTERIZATION: reparent work scales linearly with subtree size', async () => {
    // Confirms the current cost is O(subtree). After Phase 8 §4 this becomes
    // O(1) and the order here flips from `linear` to `constant`.
    const harness = await createPerfDb()
    try {
      const measure = (subtreeSize: number): number => {
        const matrixId = createForestMatrix(harness.rawDb, `Reparent ${subtreeSize}`)
        const target = insertRow(harness.db, matrixId, { values: { label: 't' } })
        const parent = insertRow(harness.db, matrixId, { values: { label: 'p' } })
        // Build the subtree as a depth chain (one child per level) so the moved
        // subtree has exactly `subtreeSize` nodes without packing many siblings
        // under one parent (which would hit the global rank-key key space).
        let prev = parent.key!
        for (let i = 0; i < subtreeSize - 1; i++) {
          const child = insertRow(harness.db, matrixId, {
            values: { label: `c${i}` },
            parentKey: prev,
          })
          prev = child.key!
        }
        harness.reset()
        reparentRow(harness.db, { matrixId, nodeKey: parent.key!, newParentKey: target.key! })
        return harness.counters.byTable.rank?.rowsWritten ?? 0
      }
      assertScaling({ run: measure, sizes: [50, 200], order: 'linear' })
    } finally {
      harness.close()
    }
  })
})
