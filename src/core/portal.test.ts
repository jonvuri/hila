/**
 * Phase 9.7 — Stage A: deep portals + multi-location scroll_index, wired into
 * the production ops. This ports the deep-portal spike's Stage-P0 guards
 * (src/perf/deep-portal-spike.test.ts) onto the real schema (initMatrixSchema)
 * and the real structural ops (insertRow / createTreePosition / addPortal /
 * removePortal / deleteHomeGhostingPortals), proving the settled model holds
 * where it now lives:
 *   1. windowed scan stays a single keyset range with portal/lazy/ghost rows;
 *   2. write-amplification of a structural edit under X = appearances(X),
 *      independent of forest size;
 *   3. add-portal cost = appearances(host) × |subtree(target)| (capped);
 *   4. the cap + lazy lever bounds a pathological portal (kept, off in v1);
 *   5. index growth = base + Σ materialized portal-subtree sizes;
 *   6. the cycle guard trips on a position cycle;
 *   7. closure-per-location is free — per-appearance ancestry from the lexkey
 *      prefix, which the single ownership closure cannot represent.
 * Plus correctness for the maintenance cases: deep (nested) portals, descendant
 * fan-out, non-destructive detach, the home-delete → ghost transition, and the
 * position-depth guard.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { createPerfDb, type PerfHarness } from '../perf/index'
import { assertQueryPlan } from '../perf/query-plan'

import { createMatrix, insertRow } from './matrix'
import {
  addPortal,
  ancestryOfAppearance,
  deleteHomeGhostingPortals,
  hardDeleteIncludingRefs,
  isPositionDescendantOrSelf,
  moveOwner,
  removePortal,
} from './portal'
import { positionsOf } from './scroll-index'
import { getOwnEdge, type NodeRef } from './tree'

/** The hot windowed keyset scan — a single range on the global_lexkey PK. */
const WINDOW_SCAN_SQL = `SELECT global_lexkey, matrix_id, row_id, depth, is_ghost, lazy
   FROM scroll_index
   WHERE global_lexkey > ?
   ORDER BY global_lexkey
   LIMIT 500`

const scrollIndexSize = (h: PerfHarness): number =>
  (h.rawDb.selectObjects('SELECT COUNT(*) AS n FROM scroll_index')[0] as { n: number }).n

const scrollWrites = (h: PerfHarness): number =>
  h.counters.byTable['scroll_index']?.rowsWritten ?? 0

describe('Phase 9.7a — deep portals + multi-location scroll_index (production ops)', () => {
  let h: PerfHarness
  let mx: number

  /** Insert a childless row under `parent` (default: the root sentinel). */
  const mkRow = (parent?: NodeRef): NodeRef => {
    const { rowId } = insertRow(h.db, mx, parent ? { parent } : undefined)
    return { matrixId: mx, rowId }
  }

  /** Build a chain root→c1→…→cN of own-edges; returns [root, ...children]. */
  const ownChain = (root: NodeRef, length: number): NodeRef[] => {
    const chain = [root]
    let parent = root
    for (let i = 0; i < length; i++) {
      const child = mkRow(parent)
      chain.push(child)
      parent = child
    }
    return chain
  }

  /** Build a bushy subtree of `size` nodes rooted at `root` (breadth-first). */
  const bushySubtree = (root: NodeRef, size: number, breadth = 4): NodeRef[] => {
    const all: NodeRef[] = []
    const queue: NodeRef[] = [root]
    while (all.length < size && queue.length > 0) {
      const parent = queue.shift()!
      for (let b = 0; b < breadth && all.length < size; b++) {
        const child = mkRow(parent)
        all.push(child)
        queue.push(child)
      }
    }
    return all
  }

  beforeEach(async () => {
    h = await createPerfDb()
    mx = createMatrix(h.db, 'Portals', [{ name: 'label', type: 'TEXT', role: 'label' }])
  })
  afterEach(() => h.close())

  // -- 1. Windowed scan stays a single keyset range -----------------------------

  test('windowed scan is a single keyset range even with portal + lazy + ghost rows', () => {
    const a = mkRow()
    const sub = bushySubtree(a, 40)
    const host = mkRow()
    addPortal(h.db, host, a) // deep portal of a's 41-node subtree
    addPortal(h.db, host, sub[0]!, 3) // tiny cap → a lazy marker
    // A ghost row too: give sub[1] a portal, then delete its home.
    const ghostHost = mkRow()
    addPortal(h.db, ghostHost, sub[1]!)
    deleteHomeGhostingPortals(h.db, sub[1]!)

    h.analyze()

    // One range seek on the global_lexkey PK — no full SCAN of the index, no
    // synthesized AUTOMATIC index, no sort b-tree — unchanged by the portal /
    // lazy / ghost rows.
    assertQueryPlan(h.rawDb, WINDOW_SCAN_SQL, [new Uint8Array(0)], {
      usesIndex: 'sqlite_autoindex_scroll_index_1',
      noScanOf: ['scroll_index'],
      noAutoIndex: true,
      noTempBTree: true,
    })
  })

  // -- 2. Write amplification is bounded ----------------------------------------

  test('inserting a leaf under X touches O(appearances of X), independent of forest size', () => {
    const measureLeafInsertUnder = (forestSize: number, portals: number): number => {
      // Fresh matrix per measurement so X's identity is isolated (forest rows in
      // other matrixes are pure noise the write must NOT scale with).
      const fmx = createMatrix(h.db, 'F', [{ name: 'label', type: 'TEXT', role: 'label' }])
      const node = (rowId: number): NodeRef => ({ matrixId: fmx, rowId })
      for (let i = 0; i < forestSize; i++) insertRow(h.db, fmx)
      const { rowId: xRow } = insertRow(h.db, fmx)
      const x = node(xRow)
      for (let p = 0; p < portals; p++) {
        const { rowId: hostRow } = insertRow(h.db, fmx)
        addPortal(h.db, node(hostRow), x)
      }

      h.reset()
      insertRow(h.db, fmx, { parent: x })
      return scrollWrites(h)
    }

    // appearances(X) = 1 (home) + portals. Independent of forest size.
    expect(measureLeafInsertUnder(50, 3)).toBe(4)
    expect(measureLeafInsertUnder(500, 3)).toBe(4) // 10× forest, same write count
    expect(measureLeafInsertUnder(50, 0)).toBe(1) // no portals → home only
    expect(measureLeafInsertUnder(50, 7)).toBe(8) // scales with portals, not forest
  })

  // -- 3. add-portal cost = appearances(host) × |subtree(target)| ---------------

  test('add-portal writes appearances(host) × |subtree(target)| entries', () => {
    const x = mkRow()
    bushySubtree(x, 24) // |subtree(x)| = 25 (x + 24)

    // A host with 3 appearances (itself portaled twice elsewhere).
    const host = mkRow()
    const p1 = mkRow()
    const p2 = mkRow()
    addPortal(h.db, p1, host)
    addPortal(h.db, p2, host)
    expect(positionsOf(h.db, host).length).toBe(3)

    h.reset()
    addPortal(h.db, host, x)
    expect(scrollWrites(h)).toBe(25 * 3)
  })

  // -- 4. Cap + lazy fallback ---------------------------------------------------

  test('a subtree over the cap materializes a single lazy marker, not the whole subtree', () => {
    const x = mkRow()
    bushySubtree(x, 200) // |subtree(x)| = 201
    const host = mkRow()

    h.reset()
    addPortal(h.db, host, x, 20) // cap = 20 < 201
    expect(scrollWrites(h)).toBe(1)

    const rows = h.rawDb.selectObjects(
      'SELECT lazy FROM scroll_index WHERE matrix_id = ? AND row_id = ? AND lazy = 1',
      [x.matrixId, x.rowId],
    )
    expect(rows.length).toBe(1)

    // And the window scan is still a single range with the lazy marker present.
    h.analyze()
    assertQueryPlan(h.rawDb, WINDOW_SCAN_SQL, [new Uint8Array(0)], {
      noScanOf: ['scroll_index'],
      noAutoIndex: true,
    })
  })

  // -- 5. Index growth bound ----------------------------------------------------

  test('total index size = base forest + Σ materialized portal-subtree sizes', () => {
    const a = mkRow()
    bushySubtree(a, 9) // subtree(a) = 10
    const b = mkRow()
    bushySubtree(b, 4) // subtree(b) = 5
    const base = scrollIndexSize(h)
    expect(base).toBe(10 + 5) // a-subtree + b-subtree, all at root

    const host = mkRow() // +1
    addPortal(h.db, host, a) // + |subtree(a)| = 10
    addPortal(h.db, host, b) // + |subtree(b)| = 5

    expect(scrollIndexSize(h)).toBe(base + 1 + 10 + 5)
  })

  // -- 6. Cycle guard -----------------------------------------------------------

  test('portaling a node under one of its own position-descendants is rejected', () => {
    const [root, , grandchild] = ownChain(mkRow(), 2)
    // root → child → grandchild. Portaling root under grandchild is a cycle.
    expect(() => addPortal(h.db, grandchild!, root!)).toThrow(/cycle/i)
    // Self-portal is also a cycle.
    expect(() => addPortal(h.db, root!, root!)).toThrow(/cycle/i)
    // And the guard predicate agrees.
    expect(isPositionDescendantOrSelf(h.db, root!, grandchild!)).toBe(true)
    expect(isPositionDescendantOrSelf(h.db, root!, root!)).toBe(true)
  })

  // -- 7. Closure-per-location is free (from the lexkey prefix) ------------------

  test('per-appearance ancestry is read from the lexkey prefix', () => {
    // home:  root → x → child
    const root = mkRow()
    const x = mkRow(root)
    const child = mkRow(x)

    // portal x under a different host:  host → (portal x) → child
    const host = mkRow()
    addPortal(h.db, host, x)

    const appearances = positionsOf(h.db, child)
    expect(appearances.length).toBe(2) // home + inside the portal

    const ancestries = appearances
      .map((a) => ancestryOfAppearance(h.db, a.key).map((n) => n.rowId))
      .sort((p, q) => p.length - q.length || p[0]! - q[0]!)

    // One appearance climbs root→x; the other climbs host→x. Same row, two
    // legitimately different ancestries — exactly what the prefix encodes and a
    // single identity-keyed ownership closure could not represent.
    expect(ancestries).toContainEqual([x.rowId, root.rowId])
    expect(ancestries).toContainEqual([x.rowId, host.rowId])
  })

  // -- Maintenance-case correctness ---------------------------------------------

  test('deep (nested) portal: a portal inside a portaled subtree expands too', () => {
    // inner subtree: y → yc
    const y = mkRow()
    const yc = mkRow(y)

    // x owns a child, and also portals y under itself:  x → xc, x → (portal y) → yc
    const x = mkRow()
    mkRow(x) // xc
    addPortal(h.db, x, y)

    // Now portal x under a host. x's position-subtree includes the nested portal
    // of y, so the host's copy must contain xc AND y AND yc.
    const host = mkRow()
    addPortal(h.db, host, x)

    // yc appears at: home(y), inside x's portal of y, and inside host's copy of
    // both of those → 3 appearances. Proves nested-portal expansion is deep.
    expect(positionsOf(h.db, yc).length).toBe(3)
  })

  test('adding a descendant under X updates every location containing X', () => {
    const x = mkRow()
    const host1 = mkRow()
    const host2 = mkRow()
    addPortal(h.db, host1, x)
    addPortal(h.db, host2, x)
    expect(positionsOf(h.db, x).length).toBe(3) // home + 2 portals

    const grandchild = mkRow(x)
    // The new descendant shows up at all 3 appearances of X.
    expect(positionsOf(h.db, grandchild).length).toBe(3)
  })

  test('detach (removePortal) is non-destructive: home and siblings survive', () => {
    const x = mkRow()
    bushySubtree(x, 5) // subtree(x) = 6
    const host = mkRow()
    addPortal(h.db, host, x)
    expect(positionsOf(h.db, x).length).toBe(2)

    removePortal(h.db, host, x)
    // Portal gone; home intact.
    expect(positionsOf(h.db, x).length).toBe(1)
    // The portal edge is severed.
    const edges = h.rawDb.selectObjects(
      "SELECT 1 FROM joins WHERE kind='portal' AND target_matrix_id = ? AND target_row_id = ?",
      [x.matrixId, x.rowId],
    )
    expect(edges.length).toBe(0)
  })

  test('deleting X home ghosts every portal of X (subtree collapsed to a tombstone)', () => {
    const x = mkRow()
    bushySubtree(x, 5) // subtree(x) = 6
    const host1 = mkRow()
    const host2 = mkRow()
    addPortal(h.db, host1, x)
    addPortal(h.db, host2, x)

    const ghosts = deleteHomeGhostingPortals(h.db, x)
    expect(ghosts).toBe(2) // one tombstone per portal appearance

    // Home appearances of x's subtree are gone; only ghost markers of x remain.
    const xRows = h.rawDb.selectObjects(
      'SELECT is_ghost FROM scroll_index WHERE matrix_id = ? AND row_id = ?',
      [x.matrixId, x.rowId],
    ) as { is_ghost: number }[]
    expect(xRows.length).toBe(2)
    expect(xRows.every((r) => r.is_ghost === 1)).toBe(true)

    // x's own home edges are severed (single-owner lifecycle removed the home).
    const ownEdges = h.rawDb.selectObjects(
      "SELECT COUNT(*) AS n FROM joins WHERE kind='own' AND source_row_id = ?",
      [x.rowId],
    ) as { n: number }[]
    expect(ownEdges[0]!.n).toBe(0)

    // The portal edges survive — they carry the ghost positions.
    const portalEdges = h.rawDb.selectObjects(
      "SELECT COUNT(*) AS n FROM joins WHERE kind='portal' AND target_row_id = ?",
      [x.rowId],
    ) as { n: number }[]
    expect(portalEdges[0]!.n).toBe(2)
  })

  // -- Position-depth guard -----------------------------------------------------

  test('the materialization walk is bounded by the position-depth guard', () => {
    const top = mkRow()
    ownChain(top, 30)
    const host = mkRow()
    expect(() => addPortal(h.db, host, top)).not.toThrow()
    // top's subtree = 31 nodes; all materialized under the host.
    expect(positionsOf(h.db, top).length).toBe(2)
  })

  // -- move-owner (promotion: relocate home, leave a portal) --------------------

  test('move-owner relocates the home under the new parent and leaves a portal behind', () => {
    const p1 = mkRow()
    const x = mkRow(p1)
    mkRow(x) // a child, so the moved subtree is non-trivial
    const p2 = mkRow()

    moveOwner(h.db, x, p2)

    // The single own-edge now points at p2 (the home moved)...
    expect(getOwnEdge(h.db, x.matrixId, x.rowId)!.parent).toEqual(p2)
    // ...and a non-owning portal of x remains under the old parent p1.
    const portalUnderP1 = h.rawDb.selectObjects(
      `SELECT 1 FROM joins WHERE kind='portal'
         AND source_matrix_id = ? AND source_row_id = ?
         AND target_matrix_id = ? AND target_row_id = ?`,
      [p1.matrixId, p1.rowId, x.matrixId, x.rowId],
    )
    expect(portalUnderP1.length).toBe(1)
    // Two appearances: the new home under p2 and the portal under p1.
    expect(positionsOf(h.db, x).length).toBe(2)
  })

  // -- hard delete including references (the escalation) ------------------------

  test('hard delete removes the home AND every portal appearance (no ghosts)', () => {
    const x = mkRow()
    bushySubtree(x, 5) // subtree(x) = 6
    const host = mkRow()
    addPortal(h.db, host, x)
    expect(positionsOf(h.db, x).length).toBe(2)

    hardDeleteIncludingRefs(h.db, x)

    // No appearances of x anywhere — and specifically no ghost tombstones.
    expect(positionsOf(h.db, x).length).toBe(0)
    // The portal edge is severed (unlike the ghosting delete, which keeps it).
    const portalEdges = h.rawDb.selectObjects(
      "SELECT COUNT(*) AS n FROM joins WHERE kind='portal' AND target_row_id = ?",
      [x.rowId],
    ) as { n: number }[]
    expect(portalEdges[0]!.n).toBe(0)
    // x's own edges are gone too.
    const ownEdges = h.rawDb.selectObjects(
      "SELECT COUNT(*) AS n FROM joins WHERE kind='own' AND (source_row_id = ? OR target_row_id = ?)",
      [x.rowId, x.rowId],
    ) as { n: number }[]
    expect(ownEdges[0]!.n).toBe(0)
  })

  // -- Single-owner firewall (portals never a second owner) ---------------------

  test('a portal never collides with single ownership (joins_single_owner holds)', () => {
    const x = mkRow()
    const host = mkRow()
    addPortal(h.db, host, x)
    // x still has exactly one own-edge (its home); the portal is a separate,
    // non-owning edge into the same row.
    const owners = h.rawDb.selectObjects(
      "SELECT COUNT(*) AS n FROM joins WHERE kind='own' AND target_matrix_id = ? AND target_row_id = ?",
      [x.matrixId, x.rowId],
    ) as { n: number }[]
    expect(owners[0]!.n).toBe(1)
  })
})
