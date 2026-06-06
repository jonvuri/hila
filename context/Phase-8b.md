# Phase 8b -- Derived projections and unified cascade

> Part B of the data-layer ownership-spine work. See [Phase 8](Phase-8.md) for the umbrella, the settled foundational decisions, and Part A (the own-edge foundation). This part rebuilds `closure` as a single global cache derived from `own`-edges, builds the global pre-order **scroll index** that drives windowed scrolling, and unifies cascade deletion. Depends on Phase 8 (the edge truth must exist first).

The principle: **`own`-edges are the sole structural truth; every global shape (reachability, scroll order) is a derived cache over them.** Per-matrix partitioning of these shapes was an artifact of "a tree lives inside one matrix" -- with the own-forest crossing matrixes, both shapes go global.

---

## 1. Closure as a global derived cache

Today closure is per-matrix: `mx_{id}_closure(ancestor_key, descendant_key, depth)`, keyed by rank keys, maintained incrementally in `tree.ts` and rebuildable via `rebuildClosure`. The new closure is **global** and keyed by row identity, derived from `own`-edges.

- [ ] **New global closure table.** `closure(ancestor_matrix_id, ancestor_row_id, descendant_matrix_id, descendant_row_id, depth)`, PK on the full ancestor/descendant identity, index on the descendant for ancestry walks. It is the transitive closure of `own`-edges (which now span matrixes), replacing all `mx_{id}_closure` tables.
- [ ] **Drop the per-matrix closure tables and `ensureTrait('closure')` provisioning.** Closure is global infrastructure, not a per-matrix opt-in trait. Reconcile `matrix_traits` (begun in Phase 8 §6): if neither `rank` nor `closure` remains a per-matrix trait, `matrix_traits` and `ensureTrait`/`hasTrait`/`requireTraits` may be removed outright. Decide and document; update `face-config`/face-registry trait-requirement logic accordingly (the workspace face declared rank+closure requirements -- those become no-ops or are dropped).
- [ ] **Materialization strategy is a perf decision (resolution §5).** Options: (a) fully materialized global table maintained incrementally on edge edits; (b) recursive CTE over `joins WHERE kind='own'` with no stored table; (c) partial/lazy materialization. Default to (a) for parity with today's behavior; measure deep-subtree ops against the <50ms target and fall back to (b)/(c) only if maintenance cost bites. Record the choice.
- [ ] **Maintenance on structural edits.** Insert (Phase 8 §3), reparent (§4), and delete (§5) refresh closure. A reparent is O(subtree) in the cache (re-point is O(1) at the truth, but reachability of the moved subtree's ancestors changes). Port the existing incremental closure-update SQL (the `CROSS JOIN` ancestor×descendant insert and the prune of stale ancestor links) from `tree.ts`, generalized to the global identity-keyed table.
- [ ] **`rebuildClosure` becomes a global rebuild** from `own`-edges (a BFS/recursive CTE over `joins`), used after remote sync applies and as a repair tool. The old "parent = key with N-1 segments" logic is gone (no prefix encoding); the parent is the inbound `own`-edge source.
- [ ] **Port the tree queries** (`getChildren`, `getParent`, `getDepth`, ancestry) to the global closure + edge tables. `getChildren(parent)` = `own`-edges with that parent, ordered by `edge_key`. `getParent` = the inbound `own`-edge source. `getDepth` = max depth in global closure.
- [ ] Tests: closure matches a brute-force edge walk after inserts/moves/deletes across matrix boundaries; ancestry of a hosted aspect row climbs through its host into the workspace matrix; `rebuildClosure` reproduces the incrementally-maintained table exactly.

## 2. The global pre-order scroll index

The windowed outline scroll is today a keyset range scan over the per-matrix prefix-encoded `rank` keys (`NavigationPanel` / workspace queries). With heterogeneous, cross-matrix children, a per-matrix-partitioned key **cannot** order interleaved siblings from different matrixes -- so a global order index is forced by the unified-outline feature regardless of rank representation.

- [ ] **Build the scroll index** `scroll_index(global_lexkey BLOB, matrix_id, row_id, visible)` -- a global, un-partitioned **pre-order** index where `global_lexkey` is the path of sibling `edge_key`s from the root sentinel down to the node (root→node concatenation). Pre-order = parent immediately precedes its first child; a subtree is a contiguous range.
- [ ] **Windowing stays a single-column keyset scan:** `WHERE visible AND global_lexkey > $cursor ORDER BY global_lexkey LIMIT ~500`. This preserves today's scrolling behavior and perf characteristics -- the window is still one indexed range scan.
- [ ] **Collapse/expand is a contiguous-run hide/show.** A collapsed subtree is a contiguous `global_lexkey` range; flip `visible` over the run (or filter it out of the window). Keep collapse state where it lives today (UI/per-panel) and reflect it into `visible`, or compute visibility at query time -- pick the approach that keeps the window query a clean range scan.
- [ ] **Maintenance.** A subtree move is O(1) at the edge truth but O(subtree) in this index (every descendant's `global_lexkey` prefix changes). Rebuild the affected contiguous run on move; full rebuild from edges on demand. **Closure and the scroll index may share one pre-order/ancestry walk** on structural edits -- settle whether they are one maintenance pass or two (resolution §5 carried-forward flag).
- [ ] **The new read cost (resolution §4.1).** A window now yields `(matrix_id, row_id)` pairs spanning matrixes, so hydrating the ~500 visible rows is a **multi-table gather** rather than one `SELECT *`. This is a Phase 9 rendering concern (batch-by-matrix, lazy, virtualized) but the index/query shape that produces those pairs is built here. Expose the window query so Phase 9's `NavigationPanel`/`useQuery` can consume it.
- [ ] Tests: pre-order matches a recursive edge walk; a window of N rows is a single keyset scan; collapsing a subtree hides exactly its contiguous run; a cross-matrix subtree (host bullet + its `#task` children) appears interleaved in one correct order; a move updates only the affected run.

## 3. Unified cascade

Today there are effectively two cascade paths: `deleteRowCascade` in `matrix.ts` (recurses over `own`-join targets, cross-matrix) and the per-matrix subtree/closure cleanup in `tree.ts`. With `own` as the universal edge these converge.

- [ ] **One cascade.** Delete a row → sever its `own`-edges → recurse over `own`-descendants → delete each. Identical intra-matrix (outline subtree) and cross-matrix (a host and its aspect rows). There is no longer a separate closure-cascade vs join-cascade.
- [ ] **Reconcile with single-node delete.** Phase 8 §5 distinguishes "delete this node, promote its children" (the outline Backspace/delete-row behavior) from "delete this subtree." Keep both as explicit ops; the subtree variant is the unified cascade walk, the single-node variant re-points children first.
- [ ] **Preserve reverse cleanup.** The existing `removeInlineRefFromDoc` reverse cleanup (when an own-target is deleted, strip the `inlineref` node from each source row's rich text) must still run for cross-matrix aspect rows. It is orthogonal to the structural change -- carry it forward.
- [ ] **Two independent deletion dependencies (resolution §2.5).** A row can be deleted by (a) its `own`-parent cascade (the tree edge) or (b) its containing matrix being dropped (`matrix.owner` bulk-cascade, Phase 8c). Do not conflate "single owner" with "single thing that can delete me." This part implements (a); (b) lands in 8c.
- [ ] **Bound the recursion / detect cycles.** Keep the `MAX_CASCADE_DEPTH` guard. With single-parent enforced (Phase 8 §1) the own-forest is acyclic by construction, but keep the guard as a safety net.
- [ ] Tests: deleting a host cascades its aspect rows; deleting an outline subtree removes all descendants across matrix boundaries; reverse inlineref cleanup fires; the depth guard trips on a synthetic cycle.

---

## 4. Range-aware reactive invalidation

The deepest performance risk of the whole data-layer shift, and the one that **cannot be indexed away** -- it is a design problem in the subscription layer. Today a write to matrix M invalidates subscriptions touching M. After this part, the global scroll index and global closure are shared by *every* open outline panel and *every* subtree-scoped query across all matrixes. If invalidation stays **table-grained** ("the scroll index / closure / `joins` table changed"), then a single structural edit anywhere re-runs every outline view and every node-scoped live view -- which breaks the single-frame budget exactly when the unified-outline value proposition is realized (many live views open at once).

- [ ] **Make invalidation range/key-aware, not table-aware.** A structural edit emits a **dirty set** -- a `global_lexkey` range (the affected pre-order span) plus the closure ancestor/descendant identities it changed -- instead of a bare "table X changed" signal.
- [ ] **Describe each subscription by its scope.** A windowed outline/scroll subscription is described by its `global_lexkey` window range; a node-scoped query by its subtree root (its closure descendant set). The registry recomputes a subscription only when the edit's dirty set **overlaps** its scope.
- [ ] **Coalesce within the transaction.** One structural op (which may touch many edge/closure/index rows) emits **one** dirty-set notification after commit, not per-statement churn. This composes with the existing op/transaction boundary.
- [ ] **Conservative fallback over going global.** If a precise dirty range is hard to compute for some edit class, over-approximate to a **bounded superset** (e.g. the affected parent's subtree range) rather than falling back to a global "everything recompute." Document any such approximations.
- [ ] **Reconcile with `useQuery`.** The current client hook subscribes to worker-side prepared queries and re-runs on invalidation; extend the worker subscription registry to carry scope metadata and match against dirty sets. Keep the client API stable.
- [ ] Tests (invalidation fan-out guards, via the Stage P0 recorder): an edit confined to subtree A does **not** recompute a subscription scoped to a disjoint subtree B; an edit recomputes only the overlapping subscriptions (assert an exact small set, not "all"); collapse/expand of a subtree touches only that contiguous run; inserting a top-level sibling does not recompute a deep unrelated node-scoped view.

## 5. Performance guards -- Part B (global caches)

Uses the Stage P0 harness ([Phase 8 -- Performance testing strategy](Phase-8.md)).

- [ ] **Scroll window is a single keyset range scan (EQP):** the windowed `WHERE visible AND global_lexkey > $cursor ORDER BY global_lexkey LIMIT ~500` query uses the scroll-index, with no full `SCAN` and no `SORT` step (the index supplies order), and no `USING AUTOMATIC`. Verify at representative scale with `ANALYZE`.
- [ ] **Closure maintenance is bounded (work-count + scaling):** a subtree move touches O(subtree) closure rows, not O(forest); assert the count scales with subtree size, independent of total forest size.
- [ ] **Multi-table hydration gather is bounded (work-count):** hydrating a window issues ≤ (#distinct matrixes in the window) data-table queries (batch-by-matrix), not one-per-row. Build a **worst-case heterogeneous-window fixture** (a node with many interleaved instances from many tag types) and assert the bound holds and off-screen types are not hydrated.
- [ ] **Closure/scroll-index consistency:** assert a window reflects a structural edit atomically -- the derived caches are rebuilt within the same transaction as the edit, so no window ever observes a half-updated index.
- [ ] **Closure ancestry lookup is index-covered (EQP):** "ancestors of node X" and "is A an ancestor of B?" use the global closure indexes with no full scan.

## Done criteria (Phase 8b)

Closure is a single global cache keyed by row identity, derived from `own`-edges and maintained on structural edits, with `rebuildClosure` as a global rebuild; the per-matrix closure tables and the closure trait are gone. The global pre-order scroll index drives windowed scrolling as a single keyset range scan, interleaving heterogeneous cross-matrix siblings in one correct order, with collapse/expand as contiguous-run visibility. Cascade is one mechanism over `own`-descendants, intra- and cross-matrix identically, preserving reverse inlineref cleanup. **Reactive invalidation is range-aware** (§4): a structural edit recomputes only subscriptions whose scope overlaps its dirty set, proven by the fan-out guards. The Part B performance guards (§5) pass. Static analysis, unit tests, and the outline E2E suite pass; deep-subtree ops meet the <50ms target.

## Dependency notes

Depends on [Phase 8](Phase-8.md) (edge truth + sentinel). Gates the heaviest [Phase 9](Phase-9.md) reads (heterogeneous-children rendering and the multi-table hydration gather consume this part's window query). Independent of [Phase 8c](Phase-8c.md) except that 8c's matrix-drop cascade composes with this part's row cascade; they can be built in either order but 8c reads cleaner after 8b.
