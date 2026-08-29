# Phase 9.7a — Deep-portal materialization (spike outcome)

> Outcome of the spike framed in [Phase-9.7a-deep-portals.md](Phase-9.7a-deep-portals.md).
> Settles the model for a **multi-location `scroll_index`** — portals as extra
> _positions_ of a single-owned row, **deep** by default — and returns a
> measurement-backed **GO on deep-in-v1**. Feeds [Phase 9.7b](Phase-9.7b-windowing.md)
> (windowing) and [Phase 9.7c](Phase-9.7c-reconciliation.md) (doc reconciliation).
>
> **Prototype:** [`src/perf/deep-portal-spike.ts`](../../../src/perf/deep-portal-spike.ts)
> (maintenance path) + [`src/perf/deep-portal-spike.test.ts`](../../../src/perf/deep-portal-spike.test.ts)
> (Stage-P0 guards, 12 tests). The prototype stands up production's `scroll_index`/`joins`
> schema plus the two deltas the real build must make, and is **not** wired into the
> production ops — that is the 9.7 build proper.

## 1. The settled model

**Position graph = own-edges ∪ portal-edges.** `scroll_index` becomes the pre-order
flattening of that DAG rooted at the sentinel. A row appears **once per distinct
root→row path**; its `global_lexkey` concatenates the `edge_key`s (own **or** portal)
along that path. Ownership stays single (the one `own`-edge in `joins`); **position is
plural**.

- **Ownership provably unaffected.** A portal is a `joins` row with `kind='portal'` and
  a sibling `edge_key`. The `joins_single_owner` unique index is **partial**
  (`WHERE kind='own'`, [matrix.ts:300](../../../src/core/matrix.ts#L300)), so a second,
  non-owning edge into a row does not collide — single-owner lifecycle/cascade reads only
  `kind='own'` and never sees portal edges.
- **Deep = one primitive: `materializeSubtreeAtPrefix(node, prefix, depth, cap)`.** Its
  recursive walk follows `kind IN ('own','portal')`, so a portal _nested inside_ a
  portaled subtree expands too. Bounded by `MAX_POSITION_DEPTH` (mirrors
  `MAX_CASCADE_DEPTH`); a creation-time cycle guard keeps the DAG acyclic so it always
  terminates.
- **Closure-per-location is genuinely free.** The `closure` table stays exactly as-is —
  it is _ownership_ ancestry (single, own-edges), which lifecycle/cascade/invalidation
  need. Per-**appearance** display ancestry is read off the appearance's `global_lexkey`
  prefix. The spike schema has **no `closure` table at all** and still resolves the two
  different ancestries of a portaled row's descendant — proving the claim
  (`ancestryOfAppearance`, test 7).
- **Renderer keys by position (`global_lexkey`), not `(matrix_id, row_id)`** — the
  `scroll_index_identity` UNIQUE index is dropped; a non-unique `scroll_index_by_identity`
  replaces it for "all appearances of a row".

### Storage decision (fork resolved → `joins kind='portal'`)

Portals live in `joins`, reusing the ref family (backlinks, ghost states) per §5 of
[Phase-9.7.md](Phase-9.7.md). Schema deltas the real build makes (fresh-DB rewrite;
pre-release reset-not-migrate):

1. Widen the `joins` CHECK so `kind IN ('own','portal')` may carry an `edge_key`
   (production forbids `edge_key` on non-`own` kinds — [matrix.ts:142](../../../src/core/matrix.ts#L142)).
2. Add partial index `joins_position_children ON (source,edge_key) WHERE kind IN ('own','portal')`
   (own- and portal-children share one sibling-order space under a host).
3. Drop `scroll_index_identity` (UNIQUE); add non-unique `scroll_index_by_identity`.
4. `scroll_index` gains render flags `is_ghost`, `lazy`.

The `joins` PK `(source, target)` already caps a host at one portal of a given target.

### Guard decision (v1: cycle detection only; cap+lazy deferred)

The fork initially resolved to _cap + lazy fallback_, but a wall-clock scaling pass (§3.1)
showed the crossovers sit well above realistic usage, so **v1 ships with cycle detection
only** — no cap. The lazy-marker mechanism is prototyped and kept as a **documented lever**
(`materializeSubtreeAtPrefix` counts the position-subtree, short-circuited at `cap`, and
writes a single `lazy=1` marker past it — the count+slice hand-off to 9.7b), to be turned
on only if a real workload produces nodes with thousands of appearances. `DEFAULT_PORTAL_CAP`
in the prototype is a safety valve, not a v1 policy.

## 2. Incremental maintenance — cases covered

| Case                                      | Mechanism                                                                          | Prototype                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------- |
| add a portal of X under H                 | portal edge + `materializeSubtreeAtPrefix` at every appearance of H                | `addPortal`                                   |
| remove a portal (detach, non-destructive) | delete the prefix range at each host appearance + sever the edge                   | `removePortal`                                |
| content edit under X                      | reactive — appearances share `(matrix_id,row_id)`, one data row; all reflect it    | (render-layer; no index write)                |
| add / reorder a descendant under X        | write to **every** appearance of X                                                 | `attachOwnChild` (fan-out over `positionsOf`) |
| move X's owner (move-owner)               | `reparentRow` (moves home) **+** `addPortal` at the old parent                     | composed                                      |
| delete X's home → ghost the portals       | collapse each portal's subtree to one `is_ghost` tombstone; portal edge survives   | `ghostHomeDelete`                             |
| recursion / cycles                        | reject at creation via `isPositionDescendantOrSelf`; `MAX_POSITION_DEPTH` backstop | `addPortal` guard                             |

Ghost handling note: unlike a `@`-ref ghost (rendered from PM doc attrs), a **structural**
portal has no doc cache, so the surviving `is_ghost` tombstone entry _is_ the ghost — it
holds the position at each portal appearance. This is the one intentional divergence from
the ref ghost path.

## 3. Perf validation (Stage P0) — the go/no-go evidence

All guards are deterministic (work-count + EQP), not wall-clock. From
[`deep-portal-spike.test.ts`](../../../src/perf/deep-portal-spike.test.ts) (12/12 pass):

| Guard                                | Claim                                                                                    | Result                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Windowed scan** (EQP)              | one keyset range on the `global_lexkey` PK, portal/lazy/ghost rows present               | `SEARCH scroll_index USING INDEX sqlite_autoindex_scroll_index_1 (global_lexkey>?)` — no SCAN, no AUTOMATIC index, no temp b-tree |
| **Write amplification** (work-count) | a leaf insert under X writes `appearances(X)` index rows, **independent of forest size** | 4 rows at forest=50 **and** forest=500 (X home + 3 portals); 1 with no portals; 8 with 7 portals                                  |
| **Add-portal cost** (work-count)     | `appearances(host) × \|subtree(target)\|`                                                | 25-node subtree × 3 host appearances = **75** rows, exactly                                                                       |
| **Cap + lazy** (work-count)          | a subtree over the cap → **1** `lazy` marker, not the whole subtree                      | cap 20 vs 201-node subtree → **1** row; window scan still one range                                                               |
| **Index growth**                     | `base + Σ materialized portal-subtree sizes`                                             | exact: `15 + 1 + 10 + 5`                                                                                                          |
| **Cycle guard**                      | portaling a node under its own position-descendant (or itself) throws                    | rejected                                                                                                                          |
| **Closure-per-location**             | per-appearance ancestry from the lexkey prefix, no closure table                         | two distinct ancestries (`x→root`, `x→host`) for one row's descendant, with **no `closure` table in the schema**                  |

Correctness cases also pass: **deep/nested** portal expansion (a portal inside a portaled
subtree materializes — `yc` correctly reaches 3 appearances), descendant-add fan-out,
non-destructive detach, and home-delete→ghost.

### 3.1 Wall-clock scaling — where the budget actually bites (rough 10ms target)

The work-count guards prove the _shape_ of the bounds; a wall-clock pass (in-memory
SQLite, raw connection) locates the crossovers. Both paths are dead linear, no cliff:

| Variable                                      | Rate            | ≈10ms crossover      | 100k / 5k tail |
| --------------------------------------------- | --------------- | -------------------- | -------------- |
| `addPortal` vs `\|subtree(target)\|` (host×1) | ~4µs / row      | **~2,500 nodes**     | 100k → 420ms   |
| descendant-insert fan-out vs `appearances(X)` | ~100µs / appear | **~100 appearances** | 5k → 541ms     |

Read against realistic usage, the crossovers sit **well above** what a user produces:
portaled subtrees are hundreds of nodes (a 2,500-node portal is a big, deliberate one-shot
gesture at 10ms), and `appearances(X)` — how many times a node has been mirrored — is
single-to-low-double digits (10 appearances = 1.3ms). The ~100-appearance figure is also
_artificially low_: the prototype's fan-out runs a needless recursive-CTE precount **per
appearance** even for a known 1-node leaf; a set-based `INSERT…SELECT` across all
appearances removes it and moves the crossover up ~10–50×. (Likewise the prototype cycle
guard is an O(target-appearances × host-appearances) JS double-loop — 11ms at 101×101 —
where the real guard is a single SQL prefix-range `EXISTS`.)

**Conclusion: no cap needed for v1.** Cycle detection alone suffices; the acyclic guard
also bounds the one compounding risk (nested portals multiply `appearances(X)`, so
appearances — not subtree size — is the variable to watch). The cap+lazy mechanism stays
prototyped as a documented lever for a future workload that genuinely produces
thousand-appearance nodes.

### Bounds, stated plainly

- **Write amplification** of any structural edit under X is `O(appearances(X))`, where
  `appearances(X) = ` number of root→X paths in the position DAG `= 1 + Σ` portal-edges
  landing on X's ancestor-chain (when portals don't nest). Independent of total forest
  size (proven). Nested portals multiply paths but stay linear-per-op and bounded by the
  acyclic guard; the cap+lazy lever is the escape hatch if that tail ever bites.
- **Index growth** is `base_rows + Σ materialized portaled-subtree-sizes`. The windowed
  scan is a single keyset range regardless.

## 4. Verdict — **GO on deep-in-v1**

Deep portals are feasible within the <50ms / single-frame budget: the read path is
**unchanged** (one keyset range; portal rows are just more rows under the same PK), and
the write path is `O(appearances(X))` with crossovers (§3.1) well above realistic usage —
so **v1 ships deep with cycle detection only, no cap**. Deep is the right default (a
shallow title-only mirror "would feel broken", §5); the shallow/`lazy` fallback survives
only as a documented lever for a future thousand-appearance workload.

## 5. Hand-off

- **[Phase 9.7b](Phase-9.7b-windowing.md):** portal subtrees **are** materialized (deep
  ships) and — with no cap in v1 — are **always** ordinary `scroll_index` rows to the
  windower. The count+slice flattener handles only `view`s and shared-container extents;
  the `lazy` portal marker is out of scope for v1 (re-enters only if the cap lever is
  ever pulled).
- **The 9.7 build proper** applies the four schema deltas above, generalizes the real
  `scroll-index.ts` maintenance (`addToScrollIndex`/`moveSubtreeInScrollIndex`) to iterate
  `positionsOf` instead of assuming one location, extends the recursive CTEs to
  `kind IN ('own','portal')`, and adds the `portal` / `move-owner` / two-tier-delete ops.
- **[Phase 9.7c](Phase-9.7c-reconciliation.md):** Traits.md gains `portal` alongside
  `own`/`ref` (non-owning, structural, multi-position); Architecture.md adds the structural
  portal to the ref family with the `is_ghost`-tombstone divergence noted.
