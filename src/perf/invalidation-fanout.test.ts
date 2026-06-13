/**
 * Invalidation fan-out guards (Phase 8b §4).
 *
 * These prove that range-aware invalidation narrows the subscription recompute
 * set: a structural edit confined to one subtree does NOT recompute a
 * subscription scoped to a disjoint subtree.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { insertRow } from '../core/matrix'
import { getAncestors, getDescendants } from '../core/closure'
import { reparentRow } from '../core/tree'
import {
  buildPaginatedOutlineQuery,
  buildAncestryForRowsQuery,
} from '../workspace/workspace-plugin'
import { getGlobalKey } from '../core/scroll-index'
import type { DirtySet, NodeId } from '../core/worker/invalidation'

import {
  assertNoCrossInvalidationRangeAware,
  createForestMatrix,
  createPerfDb,
  type PerfHarness,
} from './index'

const toHex = (key: Uint8Array): string =>
  Array.from(key, (b) => b.toString(16).padStart(2, '0')).join('')

describe('range-aware invalidation: fan-out guards', () => {
  let harness: PerfHarness
  let matrixId: number

  beforeEach(async () => {
    harness = await createPerfDb()
    matrixId = createForestMatrix(harness.rawDb, 'FanOut')
  })
  afterEach(() => harness.close())

  test('an edit confined to subtree A does NOT recompute a subscription scoped to disjoint subtree B', () => {
    // Create two independent top-level subtrees.
    const rootA = insertRow(harness.db, matrixId, { values: { label: 'A' } })
    const rootB = insertRow(harness.db, matrixId, { values: { label: 'B' } })

    // Add children under A.
    insertRow(harness.db, matrixId, {
      values: { label: 'A-child' },
      parent: { matrixId, rowId: rootA.rowId },
    })

    const keyA = getGlobalKey(harness.rawDb, matrixId, rootA.rowId)!
    const keyB = getGlobalKey(harness.rawDb, matrixId, rootB.rowId)!
    const hexA = toHex(keyA)
    const hexB = toHex(keyB)

    // Subscription A: scoped to subtree A via focusRootHex.
    const sqlA = buildPaginatedOutlineQuery({ focusRootHex: hexA })
    // Subscription B: scoped to subtree B via focusRootHex.
    const sqlB = buildPaginatedOutlineQuery({ focusRootHex: hexB })

    const tracker = harness.createTracker()
    tracker.subscribe(sqlA)
    tracker.subscribe(sqlB)

    // Insert a child under A → dirty set affects only A's range.
    const edit = tracker.recordWithDirty(
      () => {
        insertRow(harness.db, matrixId, {
          values: { label: 'A-child-2' },
          parent: { matrixId, rowId: rootA.rowId },
        })
      },
      (() => {
        // Build the dirty set that the handler would emit: affects A's range.
        const newChild = insertRow(harness.db, matrixId, {
          values: { label: 'measure' },
          parent: { matrixId, rowId: rootA.rowId },
        })
        const newKey = getGlobalKey(harness.rawDb, matrixId, newChild.rowId)!
        const closureNodes = [
          { matrixId, rowId: newChild.rowId },
          { matrixId, rowId: rootA.rowId },
        ]
        // Clean up the measurement row
        harness.rawDb.exec(`DELETE FROM "mx_${matrixId}_data" WHERE id = ?`, {
          bind: [newChild.rowId],
        })
        harness.rawDb.exec(
          `DELETE FROM joins WHERE target_matrix_id = ? AND target_row_id = ?`,
          { bind: [matrixId, newChild.rowId] },
        )
        harness.rawDb.exec(
          `DELETE FROM closure WHERE descendant_matrix_id = ? AND descendant_row_id = ?`,
          { bind: [matrixId, newChild.rowId] },
        )
        harness.rawDb.exec(`DELETE FROM scroll_index WHERE matrix_id = ? AND row_id = ?`, {
          bind: [matrixId, newChild.rowId],
        })
        return {
          scrollRanges: [
            { matrixId, low: newKey, high: newKey },
            { matrixId, low: keyA, high: keyA },
          ],
          closureNodes,
        } satisfies DirtySet
      })(),
    )

    // Subscription A should fire (the edit is in its range).
    expect(edit.recomputed.has(sqlA)).toBe(true)
    // Subscription B should NOT fire (the edit is outside its range).
    assertNoCrossInvalidationRangeAware(edit, sqlB)
  })

  test('inserting a top-level sibling does not recompute a deep unrelated node-scoped view', () => {
    // Create a deep chain: root -> c1 -> c2 -> c3 (focused view on c3's subtree).
    const root = insertRow(harness.db, matrixId, { values: { label: 'root' } })
    const c1 = insertRow(harness.db, matrixId, {
      values: { label: 'c1' },
      parent: { matrixId, rowId: root.rowId },
    })
    const c2 = insertRow(harness.db, matrixId, {
      values: { label: 'c2' },
      parent: { matrixId, rowId: c1.rowId },
    })
    const c3 = insertRow(harness.db, matrixId, {
      values: { label: 'c3' },
      parent: { matrixId, rowId: c2.rowId },
    })

    const keyC3 = getGlobalKey(harness.rawDb, matrixId, c3.rowId)!
    const hexC3 = toHex(keyC3)

    // Subscription focused on c3's subtree (deep, unrelated to top-level).
    const deepSql = buildPaginatedOutlineQuery({ focusRootHex: hexC3 })

    const tracker = harness.createTracker()
    tracker.subscribe(deepSql)

    // Insert a new top-level sibling (at root level, totally disjoint from c3).
    const newSibling = insertRow(harness.db, matrixId, { values: { label: 'sibling' } })
    const siblingKey = getGlobalKey(harness.rawDb, matrixId, newSibling.rowId)!

    const dirty: DirtySet = {
      scrollRanges: [{ matrixId, low: siblingKey, high: siblingKey }],
      closureNodes: [{ matrixId, rowId: newSibling.rowId }],
    }

    const edit = tracker.recordWithDirty(() => {
      // The actual insert already happened above; we simulate the write hook
      // by just running a trivial write to trigger the hook.
      harness.rawDb.exec(`UPDATE "mx_${matrixId}_data" SET label = label WHERE id = ?`, {
        bind: [newSibling.rowId],
      })
    }, dirty)

    // The deep-node subscription should NOT recompute.
    assertNoCrossInvalidationRangeAware(edit, deepSql)
  })

  test('an edit recomputes only the overlapping subscriptions (exact small set)', () => {
    // Create 5 independent top-level subtrees.
    const roots: { rowId: number; hex: string }[] = []
    for (let i = 0; i < 5; i++) {
      const r = insertRow(harness.db, matrixId, { values: { label: `root-${i}` } })
      const key = getGlobalKey(harness.rawDb, matrixId, r.rowId)!
      roots.push({ rowId: r.rowId, hex: toHex(key) })
    }

    const tracker = harness.createTracker()
    const sqls = roots.map((r) => buildPaginatedOutlineQuery({ focusRootHex: r.hex }))
    for (const sql of sqls) tracker.subscribe(sql)

    // Insert under root[2].
    const child = insertRow(harness.db, matrixId, {
      values: { label: 'child-of-2' },
      parent: { matrixId, rowId: roots[2]!.rowId },
    })
    const childKey = getGlobalKey(harness.rawDb, matrixId, child.rowId)!
    const parentKey = getGlobalKey(harness.rawDb, matrixId, roots[2]!.rowId)!

    const dirty: DirtySet = {
      scrollRanges: [
        { matrixId, low: childKey, high: childKey },
        { matrixId, low: parentKey, high: parentKey },
      ],
      closureNodes: [
        { matrixId, rowId: child.rowId },
        { matrixId, rowId: roots[2]!.rowId },
      ],
    }

    const edit = tracker.recordWithDirty(() => {
      harness.rawDb.exec(`UPDATE "mx_${matrixId}_data" SET label = label WHERE id = ?`, {
        bind: [child.rowId],
      })
    }, dirty)

    // Only subscription[2] should fire (its range overlaps the dirty set).
    expect(edit.recomputed.has(sqls[2]!)).toBe(true)
    // All others should be isolated.
    expect(edit.recomputed.has(sqls[0]!)).toBe(false)
    expect(edit.recomputed.has(sqls[1]!)).toBe(false)
    expect(edit.recomputed.has(sqls[3]!)).toBe(false)
    expect(edit.recomputed.has(sqls[4]!)).toBe(false)
  })

  test('collapse/expand of a subtree touches only that contiguous run', () => {
    // Create root with children A, B. Each has sub-children.
    const root = insertRow(harness.db, matrixId, { values: { label: 'root' } })
    const childA = insertRow(harness.db, matrixId, {
      values: { label: 'A' },
      parent: { matrixId, rowId: root.rowId },
    })
    const childB = insertRow(harness.db, matrixId, {
      values: { label: 'B' },
      parent: { matrixId, rowId: root.rowId },
    })
    insertRow(harness.db, matrixId, {
      values: { label: 'A1' },
      parent: { matrixId, rowId: childA.rowId },
    })
    insertRow(harness.db, matrixId, {
      values: { label: 'B1' },
      parent: { matrixId, rowId: childB.rowId },
    })

    const keyA = getGlobalKey(harness.rawDb, matrixId, childA.rowId)!
    const keyB = getGlobalKey(harness.rawDb, matrixId, childB.rowId)!
    const hexB = toHex(keyB)

    // Subscription focused on B's subtree.
    const sqlB = buildPaginatedOutlineQuery({ focusRootHex: hexB })
    const tracker = harness.createTracker()
    tracker.subscribe(sqlB)

    // Collapsing A is a no-write operation (collapse state is per-panel, not
    // materialized). But if something DID write within A's range (simulating
    // an optimistic collapse/expand toggle writing a marker), B wouldn't fire.
    const dirty: DirtySet = {
      scrollRanges: [{ matrixId, low: keyA, high: keyA }],
      closureNodes: [],
    }

    const edit = tracker.recordWithDirty(() => {
      // Simulate a write within A's range (like a collapse-state flush).
      harness.rawDb.exec(`UPDATE "mx_${matrixId}_data" SET label = label WHERE id = ?`, {
        bind: [childA.rowId],
      })
    }, dirty)

    // B's subscription should NOT fire (A's collapse is disjoint from B).
    assertNoCrossInvalidationRangeAware(edit, sqlB)
  })

  test('reparenting an ancestor fires an ancestry subscription for a deep descendant', () => {
    // Create a chain: A -> B -> C. An ancestry subscription for C should fire
    // when A is reparented (because C's ancestry changed through A).
    const a = insertRow(harness.db, matrixId, { values: { label: 'A' } })
    const b = insertRow(harness.db, matrixId, {
      values: { label: 'B' },
      parent: { matrixId, rowId: a.rowId },
    })
    const c = insertRow(harness.db, matrixId, {
      values: { label: 'C' },
      parent: { matrixId, rowId: b.rowId },
    })
    const d = insertRow(harness.db, matrixId, { values: { label: 'D' } })

    // Ancestry subscription for C (reads closure).
    const ancestrySql = buildAncestryForRowsQuery(matrixId, [c.rowId])

    const tracker = harness.createTracker()
    tracker.subscribe(ancestrySql)

    // Reparent A under D. C's ancestry now includes D (through A -> B -> C).
    // Build the dirty set that the handler would emit (including descendants).
    const nodeA = { matrixId, rowId: a.rowId }
    reparentRow(harness.db, {
      matrixId,
      rowId: a.rowId,
      newParent: { matrixId, rowId: d.rowId },
    })

    const closureNodes: NodeId[] = [nodeA]
    const ancestors = getAncestors(harness.rawDb, nodeA)
    for (const anc of ancestors) {
      closureNodes.push({ matrixId: anc.matrixId, rowId: anc.rowId })
    }
    const descendants = getDescendants(harness.rawDb, nodeA)
    for (const desc of descendants) {
      closureNodes.push({ matrixId: desc.matrixId, rowId: desc.rowId })
    }

    const aKey = getGlobalKey(harness.rawDb, matrixId, a.rowId)!
    const dirty: DirtySet = {
      scrollRanges: [{ matrixId, low: aKey, high: aKey }],
      closureNodes,
    }

    const edit = tracker.recordWithDirty(() => {
      harness.rawDb.exec(`UPDATE "mx_${matrixId}_data" SET label = label WHERE id = ?`, {
        bind: [a.rowId],
      })
    }, dirty)

    // The ancestry subscription for C should fire (C is in closureNodes as a
    // descendant of the reparented node A).
    expect(edit.recomputed.has(ancestrySql)).toBe(true)
  })
})
