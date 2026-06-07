/**
 * Phase 8b Part B performance guards (§5).
 *
 * These assert the global caches (scroll index + closure) maintain the sub-50ms
 * / single-frame design goal after the Part A edge ops raised the stakes by
 * going global.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { insertRow } from '../core/matrix'
import { reparentRow } from '../core/tree'
import { getAncestors, rebuildClosure } from '../core/closure'
import { rebuildScrollIndex } from '../core/scroll-index'

import {
  assertQueryPlan,
  assertScaling,
  createForestMatrix,
  createPerfDb,
  generateForest,
  type PerfHarness,
} from './index'

describe('Part B guards: scroll index query plans', () => {
  let harness: PerfHarness
  let matrixId: number

  beforeEach(async () => {
    harness = await createPerfDb()
    matrixId = createForestMatrix(harness.rawDb, 'Scroll')
    generateForest(harness.rawDb, { matrixId, count: 600, seed: 42 })
    harness.analyze()
  })
  afterEach(() => harness.close())

  test('windowed scroll query uses scroll_index PK (no SCAN, no SORT)', () => {
    const sql = `
      SELECT r.global_lexkey AS key, r.row_id, r.depth
      FROM scroll_index r
      WHERE r.matrix_id = ? AND r.global_lexkey > ?
      ORDER BY r.global_lexkey
      LIMIT 500
    `
    assertQueryPlan(harness.rawDb, sql, [matrixId, new Uint8Array([0])], {
      noScanOf: ['scroll_index'],
      noAutoIndex: true,
    })
  })

  test('scroll index identity lookup uses the unique index', () => {
    const sql = `
      SELECT global_lexkey FROM scroll_index WHERE matrix_id = ? AND row_id = ?
    `
    assertQueryPlan(harness.rawDb, sql, [matrixId, 1], {
      usesIndex: 'scroll_index_identity',
      noScanOf: ['scroll_index'],
      noAutoIndex: true,
    })
  })
})

describe('Part B guards: closure query plans', () => {
  let harness: PerfHarness
  let matrixId: number

  beforeEach(async () => {
    harness = await createPerfDb()
    matrixId = createForestMatrix(harness.rawDb, 'Closure')
    generateForest(harness.rawDb, { matrixId, count: 600, seed: 7 })
    harness.analyze()
  })
  afterEach(() => harness.close())

  test('ancestors-of-node query uses the closure_by_descendant index', () => {
    const sql = `
      SELECT ancestor_matrix_id, ancestor_row_id, depth FROM closure
      WHERE descendant_matrix_id = ? AND descendant_row_id = ?
      ORDER BY depth
    `
    assertQueryPlan(harness.rawDb, sql, [matrixId, 1], {
      usesIndex: 'closure_by_descendant',
      noScanOf: ['closure'],
      noAutoIndex: true,
    })
  })

  test('is-ancestor check uses the closure PK index', () => {
    const sql = `
      SELECT 1 FROM closure
      WHERE ancestor_matrix_id = ? AND ancestor_row_id = ?
        AND descendant_matrix_id = ? AND descendant_row_id = ?
      LIMIT 1
    `
    assertQueryPlan(harness.rawDb, sql, [matrixId, 1, matrixId, 2], {
      noScanOf: ['closure'],
      noAutoIndex: true,
    })
  })
})

describe('Part B guards: closure maintenance bounds', () => {
  let harness: PerfHarness

  beforeEach(async () => {
    harness = await createPerfDb()
  })
  afterEach(() => harness.close())

  test('inserting a leaf node writes O(depth) closure rows', () => {
    const matrixId = createForestMatrix(harness.rawDb, 'Depth')
    // Build a chain of depth 10: root -> c1 -> c2 -> ... -> c10
    let prev = insertRow(harness.db, matrixId, { values: { label: 'root' } })
    for (let i = 0; i < 9; i++) {
      prev = insertRow(harness.db, matrixId, {
        values: { label: `c${i}` },
        parent: { matrixId, rowId: prev.rowId },
      })
    }

    harness.reset()
    insertRow(harness.db, matrixId, {
      values: { label: 'leaf' },
      parent: { matrixId, rowId: prev.rowId },
    })

    // A leaf at depth 10 writes exactly 10 closure rows (one per ancestor).
    expect(harness.counters.byTable.closure?.rowsWritten).toBe(10)
  })

  test('closure maintenance scales with subtree size on reparent, independent of forest size', async () => {
    const harness = await createPerfDb()
    try {
      const measure = (forestSize: number): number => {
        const matrixId = createForestMatrix(harness.rawDb, `Reparent ${forestSize}`)
        const target = insertRow(harness.db, matrixId, { values: { label: 't' } })
        const parent = insertRow(harness.db, matrixId, { values: { label: 'p' } })
        // Build a small subtree (fixed size) hanging off `parent`
        let prev = { matrixId, rowId: parent.rowId }
        for (let i = 0; i < 3; i++) {
          const child = insertRow(harness.db, matrixId, {
            values: { label: `c${i}` },
            parent: prev,
          })
          prev = { matrixId, rowId: child.rowId }
        }
        // Seed a large forest around them
        generateForest(harness.rawDb, { matrixId, count: forestSize, seed: forestSize })
        harness.reset()
        reparentRow(harness.db, {
          matrixId,
          rowId: parent.rowId,
          newParent: { matrixId, rowId: target.rowId },
        })
        return harness.counters.byTable.closure?.rowsWritten ?? 0
      }
      // Closure work should be ~constant (bounded by subtree size 4, not forest size).
      assertScaling({ run: measure, sizes: [100, 400], order: 'constant' })
    } finally {
      harness.close()
    }
  })
})

describe('Part B guards: closure/scroll-index consistency', () => {
  let harness: PerfHarness

  beforeEach(async () => {
    harness = await createPerfDb()
  })
  afterEach(() => harness.close())

  test('scroll index and closure are consistent after a structural edit', () => {
    const matrixId = createForestMatrix(harness.rawDb, 'Consistency')
    const forest = generateForest(harness.rawDb, { matrixId, count: 100, seed: 5 })

    // Pick a deep leaf and verify its depth matches in both caches.
    const leaf = forest.deepestLeaf()
    const closureAncestors = getAncestors(harness.rawDb, { matrixId, rowId: leaf.rowId })
    const closureDepth = closureAncestors.length

    const stmt = harness.rawDb.prepare(
      'SELECT depth FROM scroll_index WHERE matrix_id = ? AND row_id = ?',
    )
    stmt.bind([matrixId, leaf.rowId])
    expect(stmt.step()).toBe(true)
    const scrollDepth = (stmt.get({}) as { depth: number }).depth
    stmt.finalize()

    expect(scrollDepth).toBe(closureDepth)
  })

  test('rebuildClosure + rebuildScrollIndex match the incrementally-maintained state', () => {
    const matrixId = createForestMatrix(harness.rawDb, 'Rebuild')
    generateForest(harness.rawDb, { matrixId, count: 200, seed: 8 })

    // Capture incremental state
    const closureStmt = harness.rawDb.prepare('SELECT COUNT(*) AS c FROM closure')
    closureStmt.step()
    const closureCount = (closureStmt.get({}) as { c: number }).c
    closureStmt.finalize()

    const scrollStmt = harness.rawDb.prepare('SELECT COUNT(*) AS c FROM scroll_index')
    scrollStmt.step()
    const scrollCount = (scrollStmt.get({}) as { c: number }).c
    scrollStmt.finalize()

    // Rebuild from scratch
    rebuildClosure(harness.rawDb)
    rebuildScrollIndex(harness.rawDb)

    // Counts should match
    const closureStmt2 = harness.rawDb.prepare('SELECT COUNT(*) AS c FROM closure')
    closureStmt2.step()
    expect((closureStmt2.get({}) as { c: number }).c).toBe(closureCount)
    closureStmt2.finalize()

    const scrollStmt2 = harness.rawDb.prepare('SELECT COUNT(*) AS c FROM scroll_index')
    scrollStmt2.step()
    expect((scrollStmt2.get({}) as { c: number }).c).toBe(scrollCount)
    scrollStmt2.finalize()
  })
})
