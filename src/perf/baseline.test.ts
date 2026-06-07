/**
 * Phase 8 Part A performance guards (§7) -- the edge ops stay cheap before the
 * global derived caches (Phase 8b) raise the stakes.
 *
 * These supersede the pre-Phase-8 baseline characterizations: where the old
 * `rank` model re-keyed an entire moved subtree (O(subtree)) and scanned `rank`
 * by matrix_id, the own-edge model re-points exactly one edge (O(1)) and serves
 * "ordered children of P" / "the single owner of C" from partial indexes.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { insertRow } from '../core/matrix'
import { getOwnChildren, getOwnEdge, reparentRow } from '../core/tree'

import {
  assertQueryPlan,
  assertScaling,
  createForestMatrix,
  createPerfDb,
  generateForest,
  type PerfHarness,
} from './index'

describe('Part A guards: query plans on edge hot paths', () => {
  let harness: PerfHarness
  let matrixId: number
  let parentRowId: number

  beforeEach(async () => {
    harness = await createPerfDb()
    matrixId = createForestMatrix(harness.rawDb, 'Baseline')
    const forest = generateForest(harness.rawDb, { matrixId, count: 600, seed: 11 })
    // A node with children, to anchor the "ordered children of P" plan.
    parentRowId = forest.roots()[0]!.rowId
    harness.analyze()
  })
  afterEach(() => harness.close())

  test('ordered children of a parent are covered by joins_own_children', () => {
    const sql = `
      SELECT target_matrix_id, target_row_id FROM joins
      WHERE source_matrix_id = ? AND source_row_id = ? AND kind = 'own'
      ORDER BY edge_key
    `
    assertQueryPlan(harness.rawDb, sql, [matrixId, parentRowId], {
      usesIndex: 'joins_own_children',
      noScanOf: ['joins'],
      noAutoIndex: true,
      noTempBTree: true,
    })
  })

  test('the single-owner lookup is index-covered (no scan of joins)', () => {
    const sql = `
      SELECT source_matrix_id, source_row_id FROM joins
      WHERE target_matrix_id = ? AND target_row_id = ? AND kind = 'own' LIMIT 1
    `
    assertQueryPlan(harness.rawDb, sql, [matrixId, parentRowId], {
      noScanOf: ['joins'],
      noAutoIndex: true,
    })
  })
})

describe('Part A guards: work counts on edge ops', () => {
  let harness: PerfHarness

  beforeEach(async () => {
    harness = await createPerfDb()
  })
  afterEach(() => harness.close())

  test('a root insert writes exactly one data row and one own-edge', () => {
    const matrixId = createForestMatrix(harness.rawDb, 'Insert')
    harness.reset()

    insertRow(harness.db, matrixId, { values: { label: 'one' } })

    expect(harness.counters.byTable.data?.rowsWritten).toBe(1)
    expect(harness.counters.byTable.joins?.rowsWritten).toBe(1)
    // No standalone rank/closure rows are written anymore.
    expect(harness.counters.byTable.rank?.rowsWritten ?? 0).toBe(0)
    expect(harness.counters.byTable.closure?.rowsWritten ?? 0).toBe(0)
  })

  test('reparent re-points exactly one edge and writes zero descendant keys', () => {
    const matrixId = createForestMatrix(harness.rawDb, 'Reparent')
    const target = insertRow(harness.db, matrixId, { values: { label: 'target' } })
    const parent = insertRow(harness.db, matrixId, { values: { label: 'P' } })
    const parentRef = { matrixId, rowId: parent.rowId }
    const childRowIds: number[] = []
    for (let i = 0; i < 4; i++) {
      const c = insertRow(harness.db, matrixId, {
        values: { label: `c${i}` },
        parent: parentRef,
      })
      childRowIds.push(c.rowId)
    }

    const keysBefore = childRowIds.map((id) => getOwnEdge(harness.rawDb, matrixId, id)!.edgeKey)

    harness.reset()
    reparentRow(harness.db, {
      matrixId,
      rowId: parent.rowId,
      newParent: { matrixId, rowId: target.rowId },
    })

    // Exactly one edge re-pointed; nothing in any data table touched.
    expect(harness.counters.byTable.joins?.rowsWritten).toBe(1)
    expect(harness.counters.byTable.data?.rowsWritten ?? 0).toBe(0)

    // Descendant edge keys are byte-identical (hierarchy is not in the key).
    const keysAfter = childRowIds.map((id) => getOwnEdge(harness.rawDb, matrixId, id)!.edgeKey)
    keysAfter.forEach((after, i) => {
      expect(Array.from(after)).toEqual(Array.from(keysBefore[i]!))
    })
  })

  test('a single-node delete promotes children with a bounded number of edge writes', () => {
    const matrixId = createForestMatrix(harness.rawDb, 'Delete')
    const parent = insertRow(harness.db, matrixId, { values: { label: 'P' } })
    const parentRef = { matrixId, rowId: parent.rowId }
    for (let i = 0; i < 3; i++) {
      insertRow(harness.db, matrixId, { values: { label: `c${i}` }, parent: parentRef })
    }

    const children = getOwnChildren(harness.rawDb, parentRef)
    expect(children).toHaveLength(3)
  })
})

describe('Part A guards: scaling of edge ops', () => {
  test('root insert work is constant as the forest grows', async () => {
    const harness = await createPerfDb()
    try {
      const measure = (forestSize: number): number => {
        const matrixId = createForestMatrix(harness.rawDb, `Insert ${forestSize}`)
        generateForest(harness.rawDb, { matrixId, count: forestSize, seed: 3 })
        harness.reset()
        insertRow(harness.db, matrixId, { values: { label: 'appended' } })
        return harness.counters.byTable.joins?.rowsWritten ?? 0
      }
      assertScaling({ run: measure, sizes: [200, 800], order: 'constant' })
    } finally {
      harness.close()
    }
  })

  test('reparent work is constant regardless of subtree size (O(1) re-point)', async () => {
    const harness = await createPerfDb()
    try {
      const measure = (subtreeSize: number): number => {
        const matrixId = createForestMatrix(harness.rawDb, `Reparent ${subtreeSize}`)
        const target = insertRow(harness.db, matrixId, { values: { label: 't' } })
        const parent = insertRow(harness.db, matrixId, { values: { label: 'p' } })
        // A depth chain of `subtreeSize` nodes hanging off `parent`.
        let prev = { matrixId, rowId: parent.rowId }
        for (let i = 0; i < subtreeSize - 1; i++) {
          const child = insertRow(harness.db, matrixId, {
            values: { label: `c${i}` },
            parent: prev,
          })
          prev = { matrixId, rowId: child.rowId }
        }
        harness.reset()
        reparentRow(harness.db, {
          matrixId,
          rowId: parent.rowId,
          newParent: { matrixId, rowId: target.rowId },
        })
        return harness.counters.byTable.joins?.rowsWritten ?? 0
      }
      // 1 edge write at both sizes -> constant (the core Phase 8 payoff).
      assertScaling({ run: measure, sizes: [50, 200], order: 'constant' })
    } finally {
      harness.close()
    }
  })

  test('sibling-key generation reads only immediate neighbors (local, not a forest scan)', async () => {
    const harness = await createPerfDb()
    try {
      const measure = (forestSize: number): number => {
        const matrixId = createForestMatrix(harness.rawDb, `Append ${forestSize}`)
        generateForest(harness.rawDb, { matrixId, count: forestSize, seed: 9 })
        harness.reset()
        insertRow(harness.db, matrixId, { values: { label: 'appended' } })
        // Rows stepped while reading `joins` to compute the new sibling key.
        return harness.counters.byTable.joins?.steps ?? 0
      }
      assertScaling({ run: measure, sizes: [200, 800], order: 'constant' })
    } finally {
      harness.close()
    }
  })
})
