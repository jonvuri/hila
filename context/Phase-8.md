# Phase 8 -- Data layer: the ownership spine

> The implementation phase that reintegrates the **ownership-centric data-layer resolution** reached in the Phase 7c iteration (recorded in the root working docs `PHASE-7C-PRIMER.md` and `Phase 7c data layer resolution.md`). Phase 7c was a design exploration ([Phase 7c](Phase-7c.md)); this phase is its data-layer realization. The view-layer surfaces it unlocks are [Phase 9](Phase-9.md); the design-system pass over the final surface set is [Phase 10](Phase-10.md).

This is the largest structural change since the foundation. It touches the most load-bearing tables in the system (`rank`, the per-matrix `closure` tables, `joins`, `matrix`), every structural op (`insertRow`, `deleteRow`, `reparentRow`, `createTreePosition`), the workspace plugin's queries, and the tags plugin. Because of that scope it is **split into three sequential parts**, each scoped to a focused, self-contained agent session:

- **Phase 8 (this doc) -- the own-edge foundation.** Promote the `own`-join from "a cross-matrix lifecycle link" to **the universal tree edge**. Move the sibling-local order key onto the edge, introduce the root sentinel, and rewrite the structural ops on top of edges. The standalone per-matrix `rank` trait dissolves.
- **[Phase 8b](Phase-8b.md) -- derived projections and unified cascade.** Rebuild `closure` as a single global cache derived from `own`-edges, build the global pre-order **scroll index** that drives windowed scrolling, and unify cascade deletion over `own`-descendants (intra- and cross-matrix identically).
- **[Phase 8c](Phase-8c.md) -- matrix ownership and tags-as-nodes.** Add the thin `matrix.owner` fact, realize own-matrix (a node owning a dedicated matrix), dissolve the tag registry into named type-nodes, and split "tag" into label (`ref`) vs type (`own`). The promotion taxonomy falls out.

The one-line thesis carried across all three parts: **`own` = structure + lifecycle; `ref` = association; rank = order (now on the edge); closure = reachability (a derived cache).**

---

## 0. Foundational decisions (settled, do not relitigate without cause)

These were settled in the Phase 7c ownership iteration. The app is **pre-alpha with no live user data**, which is what makes a structural rewrite of this depth acceptable; treat the OPFS database as disposable (reset rather than data-migrate).

1. **`own`-join = a tree edge.** Structure **and** lifecycle. The old "single-ownership invariant" (each target row has ≤1 `own` join) **is** the single-parent property of a tree. `own`-edges work intra-matrix (outline nesting) and cross-matrix (tags, collections, sub-matrices) identically. There is **one own-forest** spanning all matrixes.
2. **`ref`-join = a graph edge.** Association only, no lifecycle, unordered. `@`-mentions, wiki-links, backlinks, and tag-as-label are all `ref`-edges.
3. **rank dissolves onto the edge.** A node's children are now **heterogeneous** (a node can own child bullets *plus* `#task` rows *plus* a `#note`, interleaved in one user-chosen order) and that order is **per-parent and spans matrixes**, so it cannot live in a per-matrix partition. Each `own`-edge carries a **sibling-local lexorank key** ordering the child among its siblings (the rows sharing that `own`-parent). This is the intrinsic, stable fact -- moving a subtree leaves descendants' sibling keys untouched.
4. **A root sentinel is required.** Every row -- including top-level workspace bullets -- has exactly one `own`-edge carrying its order. The forest roots attach to a single global root sentinel.
5. **closure and the scroll index are derived projections** of the edge truth, not independent truth (→ Phase 8b).
6. **Cascade is one mechanism:** delete a row → sever its `own`-edges → recurse over `own`-descendants (→ Phase 8b).
7. **own-matrix = `own`-edges to the matrix's root rows + a thin `matrix.owner` fact** (→ Phase 8c).

What is **not** changing: the two-layer framing (data-stored vs view-seen), hydration (column-lineage), column roles (`label`/`content`), column identity/constraints (Phase 5b), and the identity-face authority model. `ref`-edges remain unordered and keep the existing backlinks mechanism.

---

## Simplifications and removals (consequences of the spine)

A guiding lens for this phase: it is **net-subtractive at the core**. Replacing several parallel structural mechanisms (per-matrix rank, per-matrix closure, join-based ownership, and the trait layer that coordinated them) with **one** (`own`-edges + derived caches) removes abstractions that existed only to manage per-matrix structure. This section consolidates the consequent removals so the subtractive intent is explicit; the numbered stages above and in [8b](Phase-8b.md)/[8c](Phase-8c.md) implement them.

**Collapses and removals:**

- **The trait system, in full.** `rank` and `closure` were the only two traits, and both stop being per-matrix opt-ins (rank dissolves onto the edge; closure becomes a global derived cache). The provisioning abstraction therefore has no remaining members. Delete the `matrix_traits` table and its `trait_type` CHECK, the `TraitType`/`TraitHandle`/`TraitRow` types, `ensureTrait`/`hasTrait`/`requireTraits` and all call sites, and face-triggered provisioning. This supersedes the softer "decide whether `matrix_traits` survives" phrasing in §6 / 8b §1 -- the end state is **full removal**. (A per-matrix closure *projection* may survive as a perf optimization, but that is a derived index keyed by matrix, not a provisioned trait.)
- **Face trait-requirement declarations.** Faces that declare required traits (e.g. the workspace face's `requires: rank + closure`) lose their meaning -- every row is in the forest unconditionally. Remove the declarations and the resolution logic that consumed them in the face registry / face application.
- **`insertRow` and `createDependentRow` converge.** They differ today only because intra-matrix tree position (rank/closure) and cross-matrix ownership (an `own` join) were *different mechanisms*. With a single `own`-edge, both become "insert a row + attach an `own`-edge to a parent" -- where the parent may be the sentinel (root), a sibling bullet, or a host in another matrix. Unify them into one op (or one with a thin convenience wrapper). (Relates to §3.)
- **`matrixId` de-threading.** Tree ops and queries (`createTreePosition`, `reparentRow`, `getChildren`, `getParent`, `getDepth`, ancestry) stop being matrix-scoped; they operate on `(matrix_id, row_id)` identities against the global edge/closure tables. The `mx_{id}_closure` naming disappears entirely. (Relates to §3-§5, 8b §1.)
- Already noted in the stages, listed here for completeness: the `reparentRow` prefix-splice + triple closure-rewrite machinery (§4), lexorank's hierarchy prefix-encoding (§1), per-matrix closure tables → one global cache (8b §1), `row_kind` as a data concept (§5), the tag registry matrix (8c §4), the `rank` change-tracking triggers (§6), and the two cascade paths collapsing into one own-descendant walk (8b §3).

**Reconcile, don't blindly delete:**

- **Root matrix (`id = 1`) vs root sentinel vs the workspace/"everything" matrix** now overlap conceptually. Decide in §2 whether the sentinel subsumes the root matrix or they remain distinct; this is a deliberate reconciliation, not an automatic removal.

**Deliberately preserved (do not over-simplify):**

- **Matrixes remain separate schema containers**; the per-matrix `mx_{id}_data` tables stay. Tag-type matrixes are **not** absorbed into the everything matrix -- the *forest of `own`-edges* spans matrixes, but the *schema* stays per-matrix (column-locality is load-bearing, resolution §2.7). The reason traits can go is "rank/closure became universal," not "everything became one matrix."
- **`ref`-joins, backlinks, hydration (column-lineage), the identity face, and lexorank itself** (now ordering siblings rather than encoding hierarchy) all stay.

---

## Performance testing strategy (shared across Parts A/B/C)

This phase puts the <50ms / single-frame goal at real risk because it makes the hottest structural caches (closure, scroll index, the `joins` edge table) **global**. Rather than only "build with performance in mind," this phase **tests for performance in a principled, deterministic way**. The guards assert on **work and query plans**, not wall-clock time -- wall-clock is environment-dependent and noisy, whereas the things that actually break the budget (an accidental full-table scan, an O(n²) op, an over-broad reactive invalidation) show up deterministically in plans and work counts and can be caught at their root.

**The four guard types** (all run in Vitest against the worker SQLite db, fully deterministic):

1. **Query-plan guards (`EXPLAIN QUERY PLAN`).** For each hot-path query, assert the plan uses the intended index, contains no full-table `SCAN` of a large table, and contains no `USING AUTOMATIC` index (an automatic index in the plan is the planner papering over a *missing* real index -- treat it as a failure). Run against a representative-scale fixture with `ANALYZE` so the planner sees realistic statistics; set `PRAGMA automatic_index = OFF` in the test db so a missing index surfaces as an error instead of a silent auto-index. Helper shape: `assertQueryPlan(db, sql, params, { usesIndex, noScanOf: [...], noAutoIndex: true })`.
2. **Work-count complexity guards.** Instrument the data layer with test-only counters (statements executed, rows written, closure/scroll-index rows touched, data-table queries issued per hydration gather) that reset per test. Assert exact bounds independent of SQLite internals -- e.g. "a reparent re-points exactly 1 edge and writes 0 descendant edge keys," "a window hydration issues ≤ (#distinct matrixes in the window) queries." This is the most robust class because it does not depend on the planner or stats.
3. **Scaling-ratio tests.** Run an op at sizes N and kN against seeded fixtures and assert the *work counter* grows at the expected order (≈constant per op, or linear -- never super-linear). Catches accidental O(n²) without any timing. Assert on counts with tolerance, not milliseconds.
4. **Invalidation fan-out guards.** Instrument the subscription layer to record which subscriptions recompute per applied edit, then assert an edit confined to subtree A does not recompute a subscription scoped to a disjoint subtree B (i.e. table-grained over-invalidation has not crept back). These guard the range-aware invalidation work in [8b §4](Phase-8b.md).

**Optional, non-gating:** a coarse wall-clock smoke benchmark with generous thresholds, run locally / in a dedicated bench, **never** a CI gate -- purely a backstop for gross constant-factor surprises the deterministic guards miss.

Tooling notes: `EXPLAIN QUERY PLAN` via `db.exec('EXPLAIN QUERY PLAN ' + sql)`; optionally SQLite's `sqlite3_stmt_status(SQLITE_STMTSTATUS_FULLSCAN_STEP | _SORT | _AUTOINDEX)` via `sqlite3.capi` if sqlite-wasm exposes it (a non-zero `FULLSCAN_STEP` on a hot query is an instant fail and complements EQP).

### Stage P0 -- Bootstrap the perf-test harness (do this before §1)

The harness lives in `src/perf/` (barrel: `src/perf/index.ts`); `createPerfDb()` (`src/perf/setup.ts`) bundles an in-memory connection with the schema, the deterministic-planner pragmas, the work counter, and the invalidation recorder. Self-tests (`src/perf/harness.test.ts`, `forest-invalidation.test.ts`) prove each guard family passes on good input and **fails loudly** on bad input; baseline guards live in `src/perf/baseline.test.ts`.

A key implementation choice vs the initial proposal: the work counter is **non-invasive** rather than a counter sink the data layer increments. The sub-50ms-relevant work (rows written per logical table; statements/rows-read per query) is captured by (1) a single shared SQLite `update_hook` for row writes and (2) a transparent `Database` proxy for statement/step counts -- so the harness hands the proxied db to the real ops with **zero data-layer changes** and no test flag threaded through production code. Per-matrix tables (`mx_<id>_data/closure`) are normalized to logical categories (`data`, `closure`) so guards assert without naming a random matrix id. The same `update_hook` feeds the invalidation recorder, which mirrors the worker's `node-sql-parser` table-grained mapping and is the unit Phase 8b §4 tightens to range-aware.

- [x] Build the shared harness so every later guard stage only adds assertions: `assertQueryPlan` (EQP parser + index/scan/auto-index assertions), the test-only **work-counter instrumentation** (update-hook + db proxy, reset per test), a **seeded deterministic forest generator** (controlled N, depth, breadth via a mulberry32 PRNG; same seed -> byte-identical keys), the **scaling-ratio helper** (asserts constant/linear order on work counts, catching super-linear without timing), and the **subscription-recompute recorder**. (Cross-matrix "matrix-mix" windows are deferred to Phase 8b, where the global forest spans matrixes; the per-matrix generator + multi-matrix seeding it supports are the substrate for it.)
- [x] Wire `ANALYZE` + `PRAGMA automatic_index = OFF` into the perf-test db setup (`createPerfDb` sets the pragma at construction; `analyze()` is called post-seed).
- [x] Land a couple of guards against the *current* (pre-Phase-8) hot paths as a baseline, so the harness is proven and regressions are measured against a known-good starting point. Landed: a positive EQP guard (parent lookup is closure-index-covered), a precise insert work-count (1 data + 1 rank + 1 closure row), and **characterizations** of the costs Phase 8 collapses -- the `rank` matrix_id scan (→ 8b scroll index) and reparent's O(subtree) rank re-keying (→ §4/§7 O(1) edge re-point). The characterizations are annotated so they flip to tightened guards as their stages land.

## 1. Schema: add the order key to the join/edge

The `joins` table becomes the carrier of the own-forest. Today (`src/core/matrix.ts`, `initMatrixSchema`):

```sql
CREATE TABLE joins (
  source_matrix_id  INTEGER NOT NULL,
  source_row_id     INTEGER NOT NULL,
  target_matrix_id  INTEGER NOT NULL,
  target_row_id     INTEGER NOT NULL,
  kind              TEXT NOT NULL DEFAULT 'ref',
  PRIMARY KEY (source_matrix_id, source_row_id, target_matrix_id, target_row_id)
);
```

Semantics today: `source` references/owns `target`. As a tree edge, the **parent is the source** and the **child is the target** (an `own`-edge points parent → child). The child's sibling order lives on the edge.

- [ ] **Add `edge_key BLOB` to `joins`.** Non-null for `kind = 'own'` (the sibling-local lexorank key), null for `kind = 'ref'`. Add a migration `ALTER TABLE joins ADD COLUMN edge_key BLOB` mirroring the existing migration pattern. The key validity CHECK from the old `rank` table (`length(key) > 0 AND last byte = x'00'`) moves here, conditioned on `kind = 'own'`.
- [ ] **Decide and document the sibling key space.** A child's order key is unique **among siblings of the same `own`-parent**, not globally. Add an index that makes "ordered children of parent P" a fast range/sort: `CREATE INDEX joins_own_children ON joins(source_matrix_id, source_row_id, edge_key) WHERE kind = 'own'`. (A partial index on `kind = 'own'` keeps `ref`-edges out of it.)
- [ ] **Single-parent enforcement.** A target row may have at most one inbound `own`-edge. Today this is enforced procedurally in `createDependentRow`. Add a partial unique index: `CREATE UNIQUE INDEX joins_single_owner ON joins(target_matrix_id, target_row_id) WHERE kind = 'own'`. This is the schema-level statement of the single-parent tree property.
- [ ] **Reuse `lexorank.ts` unchanged.** Sibling keys are ordinary lexorank keys; `between`/`makeKey`/`compareKeys` apply directly. The crucial simplification vs today: there is **no prefix encoding of hierarchy** in the key anymore -- hierarchy is the edge, the key only orders siblings. Document this prominently (it removes the most error-prone part of `tree.ts`).
- [ ] Verification: `npm run typecheck && npm run lint && npm run test:run` (tests will be updated alongside the ops below; expect red until §3-§5 land -- sequence within the session).

## 2. The root sentinel

Every row needs exactly one `own`-edge carrying its order, so the forest roots need a parent.

- [ ] **Choose the sentinel representation.** Recommended: a reserved sentinel identity `(ROOT_MATRIX_ID, ROOT_ROW_ID)` (e.g. the existing root matrix `id = 1` plus a reserved sentinel row id, or a dedicated `(0, 0)` pair). It is never rendered as a row; it exists only to be the `source` of the top-level `own`-edges. Document the exact constants in `src/core/matrix.ts`.
- [ ] **Top-level workspace bullets attach to the sentinel.** Where `createTreePosition` currently appends a root-level rank key, the new path inserts an `own`-edge `(sentinel) → (matrix_id, row_id)` with a sibling key among the sentinel's children.
- [ ] **`ensureRootMatrix` provisions the sentinel** once, idempotently, alongside the root matrix.
- [ ] **Carried-forward flag (resolution §5):** this commits us to the root-sentinel variant (a). The documented fallback (b) -- relocating today's prefix-encoded global key onto the edge with no separate scroll index -- is **not** taken; record that decision here so a future reader knows the sentinel is load-bearing.
- [ ] Verification: a fresh DB has exactly one sentinel; every top-level bullet has one `own`-edge from it.

## 3. Rewrite `createTreePosition` / `insertRow` onto edges

`src/core/tree.ts` `createTreePosition` currently computes a prefix-encoded global rank key from `parentKey`/`prevKey`/`nextKey` and writes the `rank` row (plus closure). The new version computes a **sibling-local** key and writes an `own`-edge.

- [ ] **New positioning inputs.** Replace key-based positioning (`parentKey`, `prevKey`, `nextKey` as opaque global keys) with **edge-based** positioning: the parent identity `(parentMatrixId, parentRowId)` (defaulting to the sentinel) plus optional `prevSiblingKey` / `nextSiblingKey` (the *edge keys* of the surrounding siblings under that parent). The new sibling key is `between(prev, next)` scoped to that parent's children -- a simple `between`, with **none** of the cross-partition global-bound gymnastics the old code needed (the old `globalLowerBound`/`globalNextStmt` logic disappears).
- [ ] **`insertRow` signature update** (`src/core/matrix.ts`). It currently takes `{ values, parentKey, prevKey, nextKey }` and calls `createTreePosition` when the matrix has the rank trait. Now: every row insert also creates its `own`-edge (to the given parent or the sentinel). The "has rank trait" gate is removed -- **all rows live in the own-forest** (see §6 on the trait dissolution).
- [ ] **`createDependentRow`** (the `#`-tag / aspect-row path) becomes: insert the target row, then create an `own`-edge from the host to it with a sibling key. This already creates an `own` join today; the only addition is the `edge_key`. A hosted aspect row is just a cross-matrix child -- identical machinery.
- [ ] Tests: inserting siblings yields strictly ordered edge keys under the same parent; inserting under different parents reuses the sibling key space independently (cross-parent keys may collide -- that is fine, they're scoped); a hosted aspect row appears as an ordered child of its host.

## 4. Rewrite `reparentRow` onto edges (the big simplification)

This is where the payoff is largest. Today `reparentRow` (`src/core/tree.ts`) rewrites the rank keys of the **entire moved subtree** (prefix splice via `UNHEX(HEX(?)||...)`) and performs three closure-rewrite statements. With hierarchy on the edge, a move is **O(1) at the truth**.

- [ ] **A move is a single edge rewrite.** Re-point the moved node's inbound `own`-edge to the new parent and assign a new sibling key via `between(prevSibling, nextSibling)` under the new parent. **Descendants are untouched** -- their `own`-edges and sibling keys are unchanged because hierarchy is no longer encoded in their keys. This deletes the entire prefix-splice `UPDATE rank ... substr(...)` machinery.
- [ ] **Cross-matrix reparent is the same operation.** Outdenting a `#task` from a host bullet to the sentinel, or moving a bullet under a task, are all "re-point the inbound own-edge." Note this explicitly -- it is the resolution's "ancestry is a uniform `own`-chain across boundaries."
- [ ] **Cycle check moves to the edge graph.** The old cycle guard queried the per-matrix closure (`ancestor_key = ? AND descendant_key = ?`). The new guard walks `own`-edges (or consults the global closure cache from Phase 8b) to reject re-pointing a node under one of its own `own`-descendants. If Phase 8b lands after this, use a bounded recursive CTE over `joins WHERE kind='own'` as the interim check.
- [ ] **Closure/scroll-index maintenance on move** is deferred to Phase 8b (the truth update here is trivial; the derived caches refresh from it). For this part, either rebuild the affected caches eagerly with a simple walk, or land §4 with closure temporarily rebuilt wholesale and optimize in 8b. Pick one and note it.
- [ ] Tests: reparent leaves descendant edge keys byte-identical; reparent across matrixes works; reparent under own descendant is rejected; sibling order after the move matches `prev`/`next` inputs.

## 5. Rewrite `removeTreePosition` / `deleteSubtree` onto edges

- [ ] **Remove a single node, reparent its children** (today's `removeTreePosition` behavior): on delete, the node's `own`-children are re-pointed to the node's `own`-parent (preserving order), then the node's inbound and outbound `own`-edges are severed. No per-matrix closure rewrite -- just edge re-points (+ a Phase 8b cache refresh).
- [ ] **Delete a subtree** (today's `deleteSubtree`): walk `own`-descendants from the node and delete them. This converges with cascade (Phase 8b §cascade) -- ideally there is **one** descendant walk used by both subtree-delete and cascade-delete. Note the convergence; the unified implementation lands in 8b.
- [ ] **`row_kind` on the old `rank` table is gone here.** Today `rank.row_kind` distinguishes `0=row` / `1=child_matrix_ref`. Ownership of a child matrix is expressed differently now (Phase 8c: `own`-edges to the matrix's roots + `matrix.owner`). The `row_kind = 1` concept is **reinterpreted as a view-layer positioning marker** and is settled in [Phase 9 §dedicated sub-tables](Phase-9.md) -- it carries **position, not ownership**. Do **not** carry `row_kind` onto the join/edge.
- [ ] Tests: deleting a node promotes its children to the grandparent in order; deleting a subtree removes all `own`-descendants; no orphaned edges remain.

## 6. Dissolve the standalone `rank` trait

With order on the edge, the per-matrix `rank` table and its `matrix_traits` bookkeeping no longer represent truth.

- [ ] **Drop the `rank` table** from `initMatrixSchema` (and the `rank`-related CHECK). Its role (ordering) is now `joins.edge_key`.
- [ ] **Update `matrix_traits`.** The `trait_type IN ('rank', 'closure')` CHECK and `ensureTrait`/`hasTrait`/`requireTraits` usages: `rank` is no longer a provisionable trait (the own-forest is universal infrastructure, not a per-matrix opt-in). `closure` becomes global (Phase 8b) rather than per-matrix, so the trait registry's role shrinks further -- decide in 8b whether `matrix_traits` survives at all or collapses entirely. For this part: stop provisioning/requiring `rank`; leave `closure` provisioning in place until 8b reworks it.
- [ ] **Update `src/core/sync.ts` triggers.** Change tracking currently installs triggers on `rank` (and `joins`, `matrix`, `matrix_columns`). Remove the `rank` triggers; ensure `joins` triggers capture `edge_key`. (Closure remains untracked/derived -- unchanged principle.)
- [ ] **Sweep callers of the old key-based API.** `addSampleRowsToMatrix`, the workspace plugin's queries (children/ancestry/scroll), `NavigationPanel`, and any tests that read `rank` or pass `parentKey`/`prevKey`/`nextKey` must move to the edge API. Catalog them at the start of the session (grep `FROM rank`, `createTreePosition`, `parentKey`, `parseKey`) and convert each. The workspace read queries are substantial -- they may partly defer to Phase 8b's scroll index, so coordinate: this part can leave reads on a temporary "recursive CTE over edges" path and let 8b install the fast scroll index.
- [ ] Verification: `npm run format && npm run lint && npm run typecheck && npm run test:run`, then `pnpm test:e2e`. Outline create/indent/outdent/reorder/delete and drag-drop must pass end-to-end on the edge model before moving to Phase 8b.

## 7. Performance guards -- Part A (edge ops)

Uses the Stage P0 harness. These assert the edge ops stay cheap before the global caches (8b) raise the stakes.

- [ ] **Reparent is O(1) at the truth (work-count):** a reparent re-points exactly **1** edge and writes **0** descendant edge keys; assert descendant edge keys are byte-identical before/after (the core payoff of moving hierarchy off the key).
- [ ] **Children-of-parent query is index-covered (EQP):** "ordered children of P" uses the `joins_own_children` partial index, with no `SCAN` of `joins` and no `USING AUTOMATIC`.
- [ ] **Single-owner check is index-covered (EQP):** the insert-time "does this target already have an owner?" check uses the `joins_single_owner` partial unique index.
- [ ] **No super-linear edge ops (scaling-ratio):** per-op work for insert / reparent / single-node delete stays ≈constant as the forest grows N → 10N (it must not scan the forest).
- [ ] **Sibling-key generation is local:** computing a new sibling key reads only the immediate neighbors under one parent (work-count), confirming the old cross-partition global-bound scans are gone.

---

## Done criteria (Phase 8 / Part A)

The `own`-join is the universal tree edge: it carries a sibling-local `edge_key`, single-parent is enforced by a partial unique index, and a root sentinel gives every row exactly one inbound `own`-edge. `insertRow`, `createDependentRow`, `reparentRow`, and node/subtree deletion are rewritten onto edges -- a reparent is an O(1) edge re-point with descendants untouched, intra- and cross-matrix alike. The standalone `rank` table and trait are gone; ordering lives on the edge. The perf-test harness (Stage P0) exists and the Part A edge-op guards (§7) pass. The full static-analysis suite and the existing outline E2E suite pass on the new model (reads may run on an interim recursive-CTE path pending the Phase 8b scroll index).

## Dependency notes

Gates [Phase 8b](Phase-8b.md) (derived projections build on the edge truth) and [Phase 8c](Phase-8c.md) (matrix ownership and tags-as-nodes build on edges + sentinel). Builds on Phase 5b (column identity, constraints) and Phase 7 (workspace plugin / stream view). Largely independent of [Phase 11](Phase-11.md) (tasks/movie reviews) except that 8c reshapes how tag types are stored -- sequence 8c before any further tag work. The view-layer surfaces this unlocks are [Phase 9](Phase-9.md); the design-system pass over them is [Phase 10](Phase-10.md).
