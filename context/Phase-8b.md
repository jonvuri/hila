# Phase 8b -- Derived projections and unified cascade

> Part B of the data-layer ownership-spine work. See [Phase 8](Phase-8.md) for the umbrella, the settled foundational decisions, and Part A (the own-edge foundation). This part rebuilds `closure` as a single global cache derived from `own`-edges, builds the global pre-order **scroll index** that drives windowed scrolling, and unifies cascade deletion. Depends on Phase 8 (the edge truth must exist first).

The principle: **`own`-edges are the sole structural truth; every global shape (reachability, scroll order) is a derived cache over them.** Per-matrix partitioning of these shapes was an artifact of "a tree lives inside one matrix" -- with the own-forest crossing matrixes, both shapes go global.

---

## 1. Closure as a global derived cache

Today closure is per-matrix: `mx_{id}_closure(ancestor_key, descendant_key, depth)`, keyed by rank keys, maintained incrementally in `tree.ts` and rebuildable via `rebuildClosure`. The new closure is **global** and keyed by row identity, derived from `own`-edges.

- [x] **New global closure table.** `closure(ancestor_matrix_id, ancestor_row_id, descendant_matrix_id, descendant_row_id, depth)`, PK on the full ancestor/descendant identity, index on the descendant for ancestry walks. It is the transitive closure of `own`-edges (which now span matrixes), replacing all `mx_{id}_closure` tables.
- [x] **Drop the per-matrix closure tables and `ensureTrait('closure')` provisioning.** Closure is global infrastructure, not a per-matrix opt-in trait. The trait system (`matrix_traits`, `ensureTrait`/`hasTrait`/`requireTraits`, `TraitType`, face `traitRequirements`) is removed entirely — neither rank nor closure is a per-matrix trait.
- [x] **Materialization strategy is a perf decision (resolution §5).** Chose **(a) fully materialized global table maintained incrementally on edge edits**. Closure is maintained in `src/core/closure.ts` via `maintainClosureOnInsert`, `maintainClosureOnReparent`, `maintainClosureOnDelete`, called from the structural ops in `tree.ts`. Performance guards confirm O(depth) on insert and O(subtree) on reparent, independent of forest size.
- [x] **Maintenance on structural edits.** Insert, reparent, and delete refresh closure. A reparent prunes stale "reaches up" links for the moved subtree and re-inserts correct upward links from the new position. Uses temp tables for efficient subtree collection.
- [x] **`rebuildClosure` becomes a global rebuild** from `own`-edges (a recursive CTE over `joins`), used after remote sync applies and as a repair tool.
- [x] **Port the tree queries** (`getChildren`, `getParent`, `getDepth`, ancestry) to the global closure + edge tables. `getChildren(parent)` = `own`-edges with that parent, ordered by `edge_key`. `getParent` = the inbound `own`-edge source. `getDepth` = max depth in global closure. `getAncestors` and `isAncestor` query the closure table.
- [x] Tests: closure matches a brute-force edge walk after inserts/moves/deletes across matrix boundaries; ancestry of a hosted aspect row climbs through its host into the workspace matrix; `rebuildClosure` reproduces the incrementally-maintained table exactly.

## 2. The global pre-order scroll index

The windowed outline scroll is today a keyset range scan over the per-matrix prefix-encoded `rank` keys (`NavigationPanel` / workspace queries). With heterogeneous, cross-matrix children, a per-matrix-partitioned key **cannot** order interleaved siblings from different matrixes -- so a global order index is forced by the unified-outline feature regardless of rank representation.

- [x] **Build the scroll index** `scroll_index(global_lexkey BLOB, matrix_id, row_id, depth)` -- a global, un-partitioned **pre-order** index where `global_lexkey` is the path of sibling `edge_key`s from the root sentinel down to the node (root→node concatenation). Pre-order = parent immediately precedes its first child; a subtree is a contiguous range. No `visible` column — collapse state is per-panel and filtered at query time.
- [x] **Windowing stays a single-column keyset scan:** `WHERE matrix_id = M AND global_lexkey > $cursor ORDER BY global_lexkey LIMIT ~500`. Collapse is applied at query time as range-exclusion filters (`AND NOT (key > X AND key < X')`), preserving the existing `collapsedKeyHexes` mechanism.
- [x] **Collapse/expand is a contiguous-run hide/show.** Kept at query time (UI/per-panel), not materialized into the index. Multiple panels can have independent collapse states without conflicting.
- [x] **Maintenance.** Insert adds one entry (O(1)). A subtree move triggers a full `rebuildScrollIndex` (O(forest)) — acceptable for now; Phase 9 may optimize to an O(subtree) partial rebuild via `rebuildSubtreeScrollIndex`. Closure and scroll-index maintenance are two separate passes called from the structural ops.
- [x] **The new read cost (resolution §4.1).** The window query yields `(matrix_id, row_id)` pairs. The workspace outline currently filters `WHERE r.matrix_id = M` to show only same-matrix rows; Phase 9 widens this for heterogeneous-children rendering. The query shape is exposed via `buildPaginatedOutlineQuery`.
- [x] Tests: pre-order matches a recursive edge walk; child global_lexkey is parent's + edge_key (prefix property); a subtree is contiguous; a cross-matrix subtree (host + `#task` child) appears in correct order; move updates the index; `rebuildScrollIndex` reproduces the incrementally-maintained state.

## 3. Unified cascade

Today there are effectively two cascade paths: `deleteRowCascade` in `matrix.ts` (recurses over `own`-join targets, cross-matrix) and the per-matrix subtree/closure cleanup in `tree.ts`. With `own` as the universal edge these converge.

- [x] **One cascade.** Delete a row → sever its `own`-edges → recurse over `own`-descendants → delete each. Identical intra-matrix (outline subtree) and cross-matrix (a host and its aspect rows). There is no longer a separate closure-cascade vs join-cascade. Implemented in `deleteSubtree` (via `collectOwnSubtree`) and `deleteRowCascade`.
- [x] **Reconcile with single-node delete.** `deleteRow` promotes same-matrix own-children and cascade-deletes cross-matrix owned children. `deleteSubtree` walks all own-descendants. Both are explicit ops.
- [x] **Preserve reverse cleanup.** The existing `removeInlineRefFromDoc` reverse cleanup fires in `deleteRowCascade` for cross-matrix aspect rows.
- [x] **Two independent deletion dependencies (resolution §2.5).** This part implements (a) own-parent cascade; (b) matrix-drop bulk-cascade lands in 8c.
- [x] **Bound the recursion / detect cycles.** `MAX_CASCADE_DEPTH` guard preserved in `deleteRowCascade`. The own-forest is acyclic by construction (single-parent unique index), but the guard remains as a safety net.
- [x] Tests: existing cascade tests pass (8 tests match "cascade" pattern); subtree delete removes all descendants across matrix boundaries; reverse inlineref cleanup fires.

---

## 4. Range-aware reactive invalidation

The deepest performance risk of the whole data-layer shift, and the one that **cannot be indexed away** -- it is a design problem in the subscription layer. Today a write to matrix M invalidates subscriptions touching M. After this part, the global scroll index and global closure are shared by *every* open outline panel and *every* subtree-scoped query across all matrixes. If invalidation stays **table-grained** ("the scroll index / closure / `joins` table changed"), then a single structural edit anywhere re-runs every outline view and every node-scoped live view -- which breaks the single-frame budget exactly when the unified-outline value proposition is realized (many live views open at once).

- [x] **Make invalidation range/key-aware, not table-aware.** A structural edit emits a **dirty set** -- a `global_lexkey` range (the affected pre-order span) plus the closure ancestor/descendant identities it changed -- instead of a bare "table X changed" signal. Implemented in `src/core/worker/invalidation.ts` (types, scope inference, overlap logic) and `src/core/worker/matrix-handler.ts` (dirty-set emission from structural ops).
- [x] **Describe each subscription by its scope.** A windowed outline/scroll subscription is described by its `global_lexkey` window range; a node-scoped query by its subtree root (its closure descendant set). The registry recomputes a subscription only when the edit's dirty set **overlaps** its scope. Scope inferred automatically from SQL via regex pattern matching in `inferScope`.
- [x] **Coalesce within the transaction.** One structural op (which may touch many edge/closure/index rows) emits **one** dirty-set notification after commit, not per-statement churn. This composes with the existing op/transaction boundary. The dirty-set accumulator merges multiple emissions and the microtask flush consumes the coalesced result.
- [x] **Conservative fallback over going global.** If a precise dirty range is hard to compute for some edit class, over-approximate to a **bounded superset** (e.g. the affected parent's subtree range) rather than falling back to a global "everything recompute." Approximations: reparent emits the node's old + new key positions (point ranges); subscriptions without a parseable structural scope fall back to table-grained matching.
- [x] **Reconcile with `useQuery`.** The current client hook subscribes to worker-side prepared queries and re-runs on invalidation; extend the worker subscription registry to carry scope metadata and match against dirty sets. Keep the client API stable. The `useQuery` client API is unchanged; scope metadata is derived server-side in `sql-handler.ts` via `inferScope` at subscription time.
- [x] Tests (invalidation fan-out guards, via the Stage P0 recorder): an edit confined to subtree A does **not** recompute a subscription scoped to a disjoint subtree B; an edit recomputes only the overlapping subscriptions (assert an exact small set, not "all"); collapse/expand of a subtree touches only that contiguous run; inserting a top-level sibling does not recompute a deep unrelated node-scoped view. All four guards pass in `src/perf/invalidation-fanout.test.ts`.

## 5. Performance guards -- Part B (global caches)

Uses the Stage P0 harness ([Phase 8 -- Performance testing strategy](Phase-8.md)).

- [x] **Scroll window is a single keyset range scan (EQP):** the windowed `WHERE matrix_id = M AND global_lexkey > $cursor ORDER BY global_lexkey LIMIT ~500` query uses the scroll-index PK, with no full `SCAN` and no `USING AUTOMATIC`. Verified at representative scale with `ANALYZE`.
- [x] **Closure maintenance is bounded (work-count + scaling):** a subtree move touches O(subtree) closure rows, not O(forest); asserted the count scales with subtree size, independent of total forest size.
- [x] **Multi-table hydration gather is bounded (work-count):** hydrating a window issues ≤ (#distinct matrixes in the window) data-table queries (batch-by-matrix), not one-per-row. Built a worst-case heterogeneous-window fixture (a parent with 15 interleaved children across 5 tag-type matrixes) and asserted the bound holds (6 queries for 6 matrixes, not 16 for 16 rows) and off-screen types are not hydrated.
- [x] **Closure/scroll-index consistency:** asserted a window reflects a structural edit atomically -- closure and scroll-index counts match between incremental and full-rebuild.
- [x] **Closure ancestry lookup is index-covered (EQP):** "ancestors of node X" uses `closure_by_descendant` index; "is A an ancestor of B?" uses the closure PK. No full scan.

## Done criteria (Phase 8b)

Closure is a single global cache keyed by row identity, derived from `own`-edges and maintained on structural edits, with `rebuildClosure` as a global rebuild; the per-matrix closure tables and the closure trait are gone. The global pre-order scroll index drives windowed scrolling as a single keyset range scan, interleaving heterogeneous cross-matrix siblings in one correct order, with collapse/expand as contiguous-run visibility. Cascade is one mechanism over `own`-descendants, intra- and cross-matrix identically, preserving reverse inlineref cleanup. **Reactive invalidation is range-aware** (§4): a structural edit recomputes only subscriptions whose scope overlaps its dirty set, proven by the fan-out guards. The Part B performance guards (§5) pass. Static analysis, unit tests, and the outline E2E suite pass; deep-subtree ops meet the <50ms target.

## Follow-up: Replace `node-sql-parser` with `sqlite3-parser`

**✅ Complete.** The `inferScope` function (§4) now uses `sqlite3-parser` — a pure-JS port of SQLite's own LALR(1) grammar — for robust AST-based SQL analysis. The table extraction (`tablesVisitedBySql`) has been unified into a single `sqlite3-parser`-based implementation in `src/core/worker/invalidation.ts`:

- [x] Replace both usages with a `sqlite3-parser` `traverse` that collects `TableSelectTable` nodes (table names from FROM/JOIN), filtering out CTE-defined names.
- [x] Handle quoted table names (`"mx_42_data"`) via the parser's `Name.text` (already unquoted).
- [x] Remove `node-sql-parser` from `package.json`.
- [x] Verify: the table extraction handles the full query repertoire (CTEs, subqueries, correlated subqueries like `has_children`). Tests in `src/core/worker/tables-visited.test.ts` cover all shapes.

## Dependency notes

Depends on [Phase 8](Phase-8.md) (edge truth + sentinel). Gates the heaviest [Phase 9](Phase-9.md) reads (heterogeneous-children rendering and the multi-table hydration gather consume this part's window query). Independent of [Phase 8c](Phase-8c.md) except that 8c's matrix-drop cascade composes with this part's row cascade; they can be built in either order but 8c reads cleaner after 8b.
