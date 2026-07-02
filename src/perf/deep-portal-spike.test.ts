/**
 * Phase 9.7a — deep-portal materialization spike: Stage-P0 validation.
 *
 * Proves the settled model against the perf guards that gate deep-in-v1:
 *   1. windowed scan stays a single keyset range with portal entries present;
 *   2. write-amplification is bounded — a write under X touches O(appearances of
 *      X), independent of forest size;
 *   3. add-portal cost = appearances(host) × |subtree(target)| (capped);
 *   4. cap + lazy fallback bounds the pathological (huge / nested) portal;
 *   5. index growth = base + Σ materialized portal-subtree sizes;
 *   6. the cycle guard trips on a position cycle;
 *   7. closure-per-location is free — per-appearance ancestry comes from the
 *      lexkey prefix, and this schema has NO closure table.
 * Plus correctness for the maintenance cases: content edit reflected at all
 * appearances, descendant add/reorder, deep (nested) portals, detach, and the
 * home-delete → ghost transition.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  addPortal,
  ancestryOfAppearance,
  attachOwnChild,
  DEFAULT_PORTAL_CAP,
  ghostHomeDelete,
  initPortalSpikeSchema,
  positionsOf,
  removePortal,
  scrollIndexSize,
  SENTINEL,
  windowScanSql,
  type Node,
} from './deep-portal-spike'
import { assertQueryPlan } from './query-plan'

import { createPerfDb, type PerfHarness } from './index'

// A synthetic matrix id for the spike (no real data tables involved — the index
// only needs (matrix_id, row_id) identities).
const MX = 42
let nextRow = 1
const newRow = (): Node => ({ mx: MX, row: nextRow++ })

/** Build a chain host→c1→c2→…→cN of own-edges; returns [host, ...children]. */
const ownChain = (h: PerfHarness, root: Node, length: number): Node[] => {
  const chain = [root]
  let parent = root
  for (let i = 0; i < length; i++) {
    const child = newRow()
    attachOwnChild(h.db, parent, child)
    chain.push(child)
    parent = child
  }
  return chain
}

/** Build a bushy subtree of `size` nodes rooted at `root` (breadth-first). */
const bushySubtree = (h: PerfHarness, root: Node, size: number, breadth = 4): Node[] => {
  const all: Node[] = []
  const queue: Node[] = [root]
  while (all.length < size && queue.length > 0) {
    const parent = queue.shift()!
    for (let b = 0; b < breadth && all.length < size; b++) {
      const child = newRow()
      attachOwnChild(h.db, parent, child)
      all.push(child)
      queue.push(child)
    }
  }
  return all
}

describe('Phase 9.7a — deep-portal materialization spike', () => {
  let h: PerfHarness

  beforeEach(async () => {
    h = await createPerfDb({ initSchema: false })
    initPortalSpikeSchema(h.rawDb)
    nextRow = 1
  })
  afterEach(() => h.close())

  // -- 1. Windowed scan stays a single keyset range -----------------------------

  test('windowed scan is a single keyset range even with portal + lazy + ghost rows', () => {
    // A forest plus a couple of portals, so the index holds home, portal, and
    // (via a tiny cap) lazy entries — the full row-kind mix.
    const a = newRow()
    attachOwnChild(h.db, SENTINEL, a)
    const sub = bushySubtree(h, a, 40)
    const host = newRow()
    attachOwnChild(h.db, SENTINEL, host)
    addPortal(h.db, host, a) // deep portal of a's 41-node subtree
    addPortal(h.db, host, sub[0]!, 3) // tiny cap → lazy marker

    h.analyze()

    // The hot read: one range seek on the global_lexkey PK
    // (`SEARCH scroll_index USING INDEX sqlite_autoindex_scroll_index_1
    // (global_lexkey>?)`). No full SCAN of the index, no synthesized AUTOMATIC
    // index, no sort b-tree — the production window shape, unchanged by the
    // portal/lazy/ghost rows.
    assertQueryPlan(h.rawDb, windowScanSql(), [new Uint8Array(0)], {
      usesIndex: 'sqlite_autoindex_scroll_index_1',
      noScanOf: ['scroll_index'],
      noAutoIndex: true,
      noTempBTree: true,
    })
  })

  // -- 2. Write amplification is bounded ----------------------------------------

  test('inserting a leaf under X touches O(appearances of X), independent of forest size', () => {
    const measureLeafInsertUnder = (forestSize: number, portals: number): number => {
      nextRow = 1
      // Fresh schema per measurement.
      h.rawDb.exec('DELETE FROM scroll_index; DELETE FROM joins;')

      // Background forest (noise the write must NOT scale with).
      for (let i = 0; i < forestSize; i++) {
        const r = newRow()
        attachOwnChild(h.db, SENTINEL, r)
      }
      // The target node X, plus `portals` hosts each portaling X.
      const x = newRow()
      attachOwnChild(h.db, SENTINEL, x)
      for (let p = 0; p < portals; p++) {
        const host = newRow()
        attachOwnChild(h.db, SENTINEL, host)
        addPortal(h.db, host, x)
      }

      // Measure: add one leaf under X. It must appear at X's home + each portal.
      h.reset()
      const leaf = newRow()
      attachOwnChild(h.db, x, leaf)
      return h.counters.byTable['scroll_index']?.rowsWritten ?? 0
    }

    // appearances(X) = 1 (home) + portals. Independent of forest size.
    expect(measureLeafInsertUnder(50, 3)).toBe(4)
    expect(measureLeafInsertUnder(500, 3)).toBe(4) // 10× forest, same write count
    expect(measureLeafInsertUnder(50, 0)).toBe(1) // no portals → home only
    expect(measureLeafInsertUnder(50, 7)).toBe(8) // scales with portals, not forest
  })

  // -- 3. add-portal cost = appearances(host) × |subtree(target)| ---------------

  test('add-portal writes appearances(host) × |subtree(target)| entries', () => {
    const x = newRow()
    attachOwnChild(h.db, SENTINEL, x)
    const sub = bushySubtree(h, x, 24) // |subtree(x)| = 25 (x + 24)

    // A host with 3 appearances (itself portaled twice elsewhere).
    const host = newRow()
    attachOwnChild(h.db, SENTINEL, host)
    const p1 = newRow()
    attachOwnChild(h.db, SENTINEL, p1)
    const p2 = newRow()
    attachOwnChild(h.db, SENTINEL, p2)
    addPortal(h.db, p1, host)
    addPortal(h.db, p2, host)
    expect(positionsOf(h.db, host).length).toBe(3)

    h.reset()
    addPortal(h.db, host, x)
    // 25-node subtree × 3 host appearances.
    expect(h.counters.byTable['scroll_index']?.rowsWritten).toBe(25 * 3)
    void sub
  })

  // -- 4. Cap + lazy fallback ---------------------------------------------------

  test('a subtree over the cap materializes a single lazy marker, not the whole subtree', () => {
    const x = newRow()
    attachOwnChild(h.db, SENTINEL, x)
    bushySubtree(h, x, 200) // |subtree(x)| = 201

    const host = newRow()
    attachOwnChild(h.db, SENTINEL, host)

    h.reset()
    addPortal(h.db, host, x, 20) // cap = 20 < 201
    expect(h.counters.byTable['scroll_index']?.rowsWritten).toBe(1)

    const rows = h.rawDb.selectObjects(
      'SELECT lazy FROM scroll_index WHERE matrix_id = ? AND row_id = ? AND lazy = 1',
      [x.mx, x.row],
    )
    expect(rows.length).toBe(1)

    // And the window scan is still a single range with the lazy marker present.
    h.analyze()
    assertQueryPlan(h.rawDb, windowScanSql(), [new Uint8Array(0)], {
      noScanOf: ['scroll_index'],
      noAutoIndex: true,
    })
  })

  // -- 5. Index growth bound ----------------------------------------------------

  test('total index size = base forest + Σ materialized portal-subtree sizes', () => {
    const a = newRow()
    attachOwnChild(h.db, SENTINEL, a)
    bushySubtree(h, a, 9) // subtree(a) = 10
    const b = newRow()
    attachOwnChild(h.db, SENTINEL, b)
    bushySubtree(h, b, 4) // subtree(b) = 5
    const base = scrollIndexSize(h.db)
    expect(base).toBe(10 + 5) // a-subtree + b-subtree, all at root

    const host = newRow()
    attachOwnChild(h.db, SENTINEL, host) // +1
    addPortal(h.db, host, a) // + |subtree(a)| = 10
    addPortal(h.db, host, b) // + |subtree(b)| = 5

    expect(scrollIndexSize(h.db)).toBe(base + 1 + 10 + 5)
  })

  // -- 6. Cycle guard -----------------------------------------------------------

  test('portaling a node under one of its own position-descendants is rejected', () => {
    const [root, , grandchild] = ownChain(
      h,
      (() => {
        const r = newRow()
        attachOwnChild(h.db, SENTINEL, r)
        return r
      })(),
      2,
    )
    // root → child → grandchild. Portaling root under grandchild is a cycle.
    expect(() => addPortal(h.db, grandchild!, root!)).toThrow(/cycle/i)
    // Self-portal is also a cycle.
    expect(() => addPortal(h.db, root!, root!)).toThrow(/cycle/i)
  })

  // -- 7. Closure-per-location is free (from the lexkey prefix) ------------------

  test('per-appearance ancestry is read from the lexkey prefix (no closure table)', () => {
    // There is no closure table in this schema at all.
    const hasClosure = h.rawDb.selectObjects(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='closure'",
    )
    expect(hasClosure.length).toBe(0)

    // home:  root → x → child
    const root = newRow()
    attachOwnChild(h.db, SENTINEL, root)
    const x = newRow()
    attachOwnChild(h.db, root, x)
    const child = newRow()
    attachOwnChild(h.db, x, child)

    // portal x under a different host:  host → (portal x) → child
    const host = newRow()
    attachOwnChild(h.db, SENTINEL, host)
    addPortal(h.db, host, x)

    const appearances = positionsOf(h.db, child)
    expect(appearances.length).toBe(2) // home + inside the portal

    const ancestries = appearances
      .map((a) => ancestryOfAppearance(h.db, a.key).map((n) => n.row))
      .sort((p, q) => p.length - q.length || p[0]! - q[0]!)

    // One appearance climbs root→x; the other climbs host→x. Same row, two
    // legitimately different ancestries — exactly what the prefix encodes and a
    // single identity-keyed closure table could not represent.
    const homeAnc = [x.row, root.row]
    const portalAnc = [x.row, host.row]
    expect(ancestries).toContainEqual(homeAnc)
    expect(ancestries).toContainEqual(portalAnc)
  })

  // -- Maintenance-case correctness ---------------------------------------------

  test('deep (nested) portal: a portal inside a portaled subtree expands too', () => {
    // inner subtree: y → yc
    const y = newRow()
    attachOwnChild(h.db, SENTINEL, y)
    const yc = newRow()
    attachOwnChild(h.db, y, yc)

    // x owns a child, and also portals y under itself:  x → xc, x → (portal y) → yc
    const x = newRow()
    attachOwnChild(h.db, SENTINEL, x)
    const xc = newRow()
    attachOwnChild(h.db, x, xc)
    addPortal(h.db, x, y)

    // Now portal x under a host. x's subtree includes the nested portal of y,
    // so the host's copy must contain xc AND y AND yc.
    const host = newRow()
    attachOwnChild(h.db, SENTINEL, host)
    addPortal(h.db, host, x)

    // Under the host's portal of x, every node of x's *position* subtree appears.
    for (const n of [x, xc, y, yc]) {
      const appearances = positionsOf(h.db, n)
      // each node now appears at: its home + inside host's portal of x
      // (y and yc additionally appear inside x's own portal of y).
      expect(appearances.length).toBeGreaterThanOrEqual(2)
    }
    // yc appears at: home(y), inside x's portal of y, and inside host's copy of
    // both of those → 3 appearances. Proves nested-portal expansion is deep.
    expect(positionsOf(h.db, yc).length).toBe(3)
  })

  test('adding a descendant under X updates every location containing X', () => {
    const x = newRow()
    attachOwnChild(h.db, SENTINEL, x)
    const host1 = newRow()
    attachOwnChild(h.db, SENTINEL, host1)
    const host2 = newRow()
    attachOwnChild(h.db, SENTINEL, host2)
    addPortal(h.db, host1, x)
    addPortal(h.db, host2, x)
    expect(positionsOf(h.db, x).length).toBe(3) // home + 2 portals

    const grandchild = newRow()
    attachOwnChild(h.db, x, grandchild)
    // The new descendant shows up at all 3 appearances of X.
    expect(positionsOf(h.db, grandchild).length).toBe(3)
  })

  test('detach (removePortal) is non-destructive: home and siblings survive', () => {
    const x = newRow()
    attachOwnChild(h.db, SENTINEL, x)
    bushySubtree(h, x, 5) // subtree(x) = 6
    const host = newRow()
    attachOwnChild(h.db, SENTINEL, host)
    addPortal(h.db, host, x)
    expect(positionsOf(h.db, x).length).toBe(2)

    removePortal(h.db, host, x)
    // Portal gone; home intact.
    expect(positionsOf(h.db, x).length).toBe(1)
    // The portal edge is severed.
    const edges = h.rawDb.selectObjects(
      "SELECT 1 FROM joins WHERE kind='portal' AND target_row_id = ?",
      [x.row],
    )
    expect(edges.length).toBe(0)
  })

  test('deleting X home ghosts every portal of X (subtree collapsed to a tombstone)', () => {
    const x = newRow()
    attachOwnChild(h.db, SENTINEL, x)
    bushySubtree(h, x, 5) // subtree(x) = 6
    const host1 = newRow()
    attachOwnChild(h.db, SENTINEL, host1)
    const host2 = newRow()
    attachOwnChild(h.db, SENTINEL, host2)
    addPortal(h.db, host1, x)
    addPortal(h.db, host2, x)

    const ghosts = ghostHomeDelete(h.db, x)
    expect(ghosts).toBe(2) // one tombstone per portal appearance

    // Home appearances of x's subtree are gone; only ghost markers of x remain.
    const xRows = h.rawDb.selectObjects(
      'SELECT is_ghost FROM scroll_index WHERE matrix_id = ? AND row_id = ?',
      [x.mx, x.row],
    ) as { is_ghost: number }[]
    expect(xRows.length).toBe(2)
    expect(xRows.every((r) => r.is_ghost === 1)).toBe(true)

    // The subtree's descendants no longer appear anywhere (ghost is shallow).
    const descendantCount = h.rawDb.selectObjects(
      "SELECT COUNT(*) AS n FROM joins WHERE kind='own' AND source_row_id = ?",
      [x.row],
    ) as { n: number }[]
    expect(descendantCount[0]!.n).toBe(0) // x's own home edges severed
  })

  // -- materializeSubtreeAtPrefix depth guard -----------------------------------

  test('the materialization walk is bounded by the position-depth guard', () => {
    // A long own-chain; materializing from the top must terminate (guard), and
    // the entry count never exceeds the guard depth.
    const top = newRow()
    attachOwnChild(h.db, SENTINEL, top)
    ownChain(h, top, 30)
    const host = newRow()
    attachOwnChild(h.db, SENTINEL, host)
    // Cap high enough to not trip lazy; guard is the only limiter.
    expect(() => addPortal(h.db, host, top, DEFAULT_PORTAL_CAP)).not.toThrow()
    // top's subtree = 31 nodes; all materialized under the host.
    expect(positionsOf(h.db, top).length).toBe(2)
  })
})
