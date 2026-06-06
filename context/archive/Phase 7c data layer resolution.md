# Hila — Phase 7c: Data-Layer Resolution & Rendering Hand-off

> **Purpose.** A companion to [`PHASE-7C-PRIMER.md`](PHASE-7C-PRIMER.md) capturing the design decisions reached in the ownership-centric iteration. It **resolves the data/relationship-layer open questions** from the primer's §4.3 and the cross-cutting `Plan.md` items 7c touches, then **hands off the remaining rendering & interaction questions** to a fresh, focused session. The primer's §1–§3 (what Hila is, architecture, current build state) and §5 (code surfaces) remain valid context; this doc revises specific "settled" claims in §4.1 with explicit cause (the app is pre-alpha, no live data — the model was deliberately broken apart and pulled back together).
>
> **One-line thesis of the revision:** _ownership is the spine._ The `own`-join is promoted from "a cross-matrix lifecycle link" to **the universal tree edge**; almost everything else in the data layer either falls out of that or demotes to a view concern.

---

## 0. What changed from the primer

The primer treated these as settled; this session revised them, with cause:

| Primer position                                                                               | Revised position                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `own`/`ref` joins are **cross-matrix** row references                                         | Joins relate **any two rows, intra- or cross-matrix**. The cross-matrix framing was incidental.                                                                                                    |
| rank + closure are per-matrix structural traits; rank's Lexorank prefix **encodes hierarchy** | Hierarchy lives in `own`-edges. **rank dissolves onto the edge** (sibling-local key); **closure and the scroll index become derived projections** of the edge truth. Per-matrix partitioning gone. |
| A tag type is a matrix tracked by a **registry matrix**; tagging always `createDependentRow`  | A tag type is **a node that owns a matrix**; the registry dissolves into named type-nodes. "Tag" splits into **label (ref)** vs **type (own)**.                                                    |
| own-matrix is the `row_kind=1` path, representation **TBD** (§4.3)                            | own-matrix = **own-edges to the matrix's root rows + a thin `matrix.owner` fact**. Resolved.                                                                                                       |

Nothing in §4.1's _two-layer_ framing (data-stored vs view-seen) or the _one-attachment-primitive-with-presets_ conclusion is overturned — both are reinforced. What changed is the **storage mechanism beneath the primitive**.

---

## 1. The core move: `own` is the universal tree edge

- **`own`-join = a tree edge.** Structure **and** lifecycle. The primer's single-ownership invariant ("each target row has ≤1 `own` join") **is** the single-parent property of a tree, stated once instead of twice. `own`-edges work intra-matrix (outline nesting) and cross-matrix (tags, collections, sub-matrices) identically.
- **`ref`-join = a graph edge.** Association only, no lifecycle, unordered. `@`-mentions, wiki-links, backlinks, and **tag-as-label** are all `ref`-edges.
- **The own-forest spans matrixes.** There is one hierarchy, one cascade, one ancestry walk — and it crosses matrix boundaries for free, because `own`-edges always could.
- **The `#`/`@` editor split is an affordance, not two mechanisms.** Under the hood there are exactly two edge kinds (`own`, `ref`) plus the typed matrixes they point into.

Crisp dual to carry everywhere: **`own` = structure + lifecycle; `ref` = association; rank = order; closure = reachability (cached).**

---

## 2. Resolved data-model decisions

### 2.1 Rank dissolves onto the edge; everything global is a derived projection

The per-matrix shape of rank/closure was an artifact of "a tree lives inside one matrix." With the own-forest crossing matrixes, the trait layer collapses into a single principle: **`own`-edges are the sole structural truth; every global shape (reachability, scroll order) is a derived cache over them.**

**rank dissolves onto the `own`-edge as a sibling-local key.** A node's children are now **heterogeneous** (a project node owning a few child bullets _plus_ `#task` rows _plus_ a `#note` row), interleaved in one user-chosen order. That order is **per-parent and spans matrixes**, so it cannot live in a per-matrix partition. The resolution: each `own`-edge carries a lexorank key giving the child's order **among its siblings** (the rows sharing that `own`-parent). "Ordered children of X" = `own`-edges with parent X, sorted by the edge key. This is the _intrinsic, stable_ fact — moving a subtree leaves its descendants' sibling keys untouched. **Requires a root sentinel** so every row (top-level workspace bullets included) has exactly one `own`-edge to carry its order. The standalone rank trait is gone; the key is a column on the join/edge row (non-null for `own`-edges, null for `ref`).

**Two derived projections of that edge truth, for two query patterns:**

- **closure** — a global materialized cache of the transitive closure of `own`-edges (ancestor/descendant + depth), replacing `mx_{id}_closure`. Serves ancestry and subtree-scoping. Per-matrix projections are just an optimization. (Materialization strategy — fully materialized vs recursive CTE vs partial — is a perf decision; see §5.)
- **the scroll index** — a global, un-partitioned **pre-order** index `(global_lexkey, matrix_id, row_id, visible)` derived from the sibling-local edge keys (the global key = the path of sibling keys root→node). This is the windowed-scroll workhorse: a window is a keyset range scan (`WHERE visible AND global_lexkey > $cursor LIMIT ~500`), preserving today's single-column scrolling behavior. A subtree move is O(1) at the edge truth and O(subtree) only in this rebuildable index; collapse/expand is a contiguous run in pre-order, so it's a clean range hide/show.

**Why this doesn't make scrolling harder than it already is.** A global cross-matrix order index is _forced by the unified outline regardless of the rank representation_: the moment a parent's children span two matrixes and you want them interleaved in one scroll, a per-matrix-partitioned lexorank column cannot order them (different partitions, no shared key space). So the derivation is a cost the heterogeneous-children feature already incurred — rank-on-edge is simply the cleanest thing to derive it from, and it is the _only_ form that can express cross-matrix sibling order at all. (The one genuinely new _read_ cost is independent of rank: a window yields `(matrix_id, row_id)` pairs across matrixes, so hydrating the visible rows is a multi-table gather — see §4.1.)

### 2.2 Cascade is one mechanism

Delete a row → sever its `own`-edges → recurse over `own`-descendants. Identical intra- and cross-matrix. There is no longer a separate closure-cascade vs join-cascade.

### 2.3 own-matrix = own-edges + a thin `matrix.owner`

- A node that owns a dedicated matrix has **`own`-edges to that matrix's root rows** (cross-matrix, exactly like a hosted aspect row). Interior nesting (subtasks) uses ordinary intra-matrix `own`-edges.
- **`matrix.owner = (matrix_id, row_id)`** is the _thin coordinating fact_: schema isolation, fast whole-table drop, and "this matrix is a dedicated container of node X." It is **not** the primary structural tie. This keeps **ancestry a uniform `own`-chain across boundaries** (no special "hop via `matrix.owner`" rule).
- Cardinality: `matrix.owner` is **N:1** (a node may own several matrixes; each matrix has ≤1 owner — the matrix-grain mirror of row single-ownership) and **nullable** (the everything/system matrixes are unowned; they hold the forest roots).

### 2.4 own-matrix vs own-rows is the class/instance duality

- A node owning a **matrix** = a **class** (it holds the extent + schema). A node owning a **row** = an **instance** (a slot in some extent). The own-matrix/own-rows distinction that unified the primer's Q4 collection-vs-sub-table question **is** type-vs-instance — same primitive read at two grains.
- **shared vs dedicated has a structural signature**, not just a UX knob:
  - **dedicated** (private sub-table): matrix-owner and row-owners are the **same** node.
  - **shared** (tag type): the type-node owns the matrix; **many hosts** own the rows. Ownership **diverges**.

### 2.5 A row has two independent deletion dependencies

These are different axes; "single owner" must not be read as "single thing that can delete me":

- its **`own`-parent** (the tree edge, single — the single-ownership invariant), and
- its **containing matrix** (whose `matrix.owner` can bulk-cascade the whole table).

Deleting a `#task`'s host kills that task (row cascade). Deleting the `task` type-node drops the table and every task in it (matrix cascade). Both correct.

### 2.6 Tags, reduced to nodes + ownership

- **"Tag" was two things.** A **label** (a named node you associate rows with, no schema) and a **type** (a record schema you instantiate per host). The ownership model cleaves them by edge kind: **label = `ref`-edge to a node**; **type = `own`-edge to a typed matrix**. A label is therefore _not a data kind_ — it is any node with inbound `ref`-edges; its backlinks are its members.
- **A tag type is an everything-matrix node that owns a matrix** and is flagged globally invocable. The **registry matrix dissolves** into "the set of named type-nodes." The type's name is the node's **`label`-role column** (no new field). The type-node is simultaneously a name, a place (navigable, can hold notes), a schema (its owned matrix), and a collection root.
- **Tagging gestures map onto the two edges:**
  - `#task` (create) → an `own`-edge to a **new** aspect row in the type's matrix.
  - tag an **existing** entity → a `ref`-edge (link, not own). _This resolves `Plan.md` #3: create-vs-link **is** own-vs-ref._
  - `#label` (no schema) → a `ref`-edge to the label-node.
- **Two ownership grains coexist** without violating single-parent (they own _different things_): the **type-node owns the matrix**; each **host owns its aspect row**.
- **Hostless aspect rows are first-class.** A task created directly in the Tasks table, owned by the **type-node** (a "task unto itself," not contextualized in any note/project). `owner = host` is therefore a **default, not a law**. Contextualizing such a task later = **reparenting its `own`-edge** from the type-node to a host bullet (a normal cross-matrix reparent).
- **"Should every child matrix be taggable by name?"** A child matrix and a tag-type matrix are the _same structure_ — a matrix owned by a node. The only difference is whether the owner-node carries a **globally invocable name**. So taggability is a **promotion/visibility flag on the owner-node**, not a property of the matrix. _Any_ owned matrix is a candidate; only **promoted** ones appear in `#` autocomplete. Possible ≠ offered (this is the gate that keeps autocomplete from drowning in private sub-tables).

### 2.7 The promotion taxonomy falls out

Every "this got more serious" migration is a crossing of two axes — **`ref`→`own`** (add lifecycle) and **add-a-matrix** (add schema):

| Promotion                               | Crossing(s)                   |
| --------------------------------------- | ----------------------------- |
| label → type                            | `ref`→`own` + add-a-matrix    |
| folksonomy member → owned aspect        | `ref`→`own`                   |
| shared collection → dedicated sub-table | add-a-matrix (+ re-home rows) |
| subtree → table                         | add-a-matrix (+ re-home rows) |

"Promote subtree to table" stays a real migration because of **column-locality** (columns are matrix-wide; the everything matrix must not grow domain columns), **not** anything in the ownership model. The `own`-edges survive a re-home unchanged.

### 2.8 Untouched / orthogonal (confirmed, no action)

- **Hydration** is column-lineage (hydrated = traces to a source cell; dry = computed). Fully orthogonal to ownership. The property surface = `own`-edge (lifecycle) + hydrated columns surfaced inline (editability).
- **Column roles** (`label`/`content`) unchanged; a type-node's name reuses the `label` role.
- **Identity face = table face = full authority** (delete rows, modify schema, delete matrix) unchanged. "Delete matrix" via the identity face = sever `matrix.owner` + drop + cascade.
- **`ref`-edges are unordered**; the existing backlinks mechanism covers label membership with no new machinery.

---

## 3. Mapping to the primer's open questions

| Primer item                                                 | Status                                                                                                                                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **§4.3 — own-matrix representation (→7c.3)**                | **Resolved.** §2.3: `own`-edges to roots + thin `matrix.owner`.                                                                                                                                                                 |
| **§4.3 — own-rows @ 0..N vs own-matrix**                    | **Resolved.** §2.4: same mechanism (class/instance), structural signature, one creation gesture with a shared-vs-dedicated knob.                                                                                                |
| **§4.3 — cross-matrix ancestry/breadcrumbs (→7c.4)**        | **Data model resolved** (ancestry = the `own`-chain, §2.3). **View layer remains** — see §4.3 below.                                                                                                                            |
| **§4.3 — node-scoped query authoring + write-back (→7c.2)** | **Data side clarified:** the query binding is the _one_ non-owning nesting (view-only); write-back = hydration + an **insertion target = the node** (node-scoped queries have an obvious one). **Authoring UX remains** — §4.2. |
| **`Plan.md` #3 — singleton/shared aspects**                 | **Resolved.** §2.6: create-vs-link = own-vs-ref.                                                                                                                                                                                |
| **`Plan.md` #4 — labeled/typed joins**                      | **Narrowed.** `own`-edges are typed by their target matrix, so labels buy nothing there; only `ref`-edges want optional labels ("appears as Author in…"). **Defer** until a backlink view needs it.                             |
| **`Plan.md` #5 — face affinity**                            | **Still open, and now clearly a rendering question** — §4.4.                                                                                                                                                                    |

The tell that the data layer is closed: every remaining item has **migrated into rendering & interaction**.

---

## 4. Hand-off — rendering & interaction (next session)

Foundation to honor: the §1 ownership spine and §2 decisions are settled; revisit only with explicit cause. Development principles unchanged — **incremental/intentional** (don't over-build), **gestalt-aware** (architecture/code/docs coherent), **performance** (<50ms, single-frame). Keep **orthogonality with Phase 8**: the property surface must be realizable by Phase 8's renderer registry / property panel.

### 4.1 Heterogeneous children in one outline

A node's `own`-children can span multiple matrixes (bullets + `#task` rows + a `#note` + …), interleaved in one sibling order (carried on the `own`-edges, §2.1). How do they render together in a single ordered outline, and how does each row type present in a navigation row? **Perf:** scroll order itself stays a single-column keyset range scan on the derived pre-order index (§2.1), so windowing is unchanged — but the window now yields `(matrix_id, row_id)` pairs spanning matrixes, so **hydrating the ~500 visible rows is a multi-table gather** rather than one table read. That gather is the real new cost on the hot path (it would exist under any rank scheme once outlines cross matrixes): batch by matrix, lazy-load, virtualize against the <50ms target. _(Touches `NavigationPanel.tsx`, `useQuery.ts`, the join/edge query + derived scroll index.)_

### 4.2 The property surface — 7c.1 (most tangible)

Intrinsic columns ∪ 0/1 owned aspect fields rendered as inline fields: a consistent property list in the focus panel and a **compact preview in navigation rows**; the add/edit gesture; coexistence of intrinsic columns and tag fields. Builds on the existing overflow "Properties" list, `FieldEditor`, tag chips. **Design it so Phase 8's registry/panel realizes it directly.** _(Touches `FocusPanel.tsx`, `FieldEditor.tsx`, `src/tags/_`.)\*

### 4.3 Embedded collections & live views — 7c.2

Render a row-set under a node as an embedded face (table/outline/board): owned collections (`own`-rows @ 0..N) and query bindings (live views). **Node-scoped query authoring UX** (express "tasks whose host is in this subtree" — closure gives "in this subtree," the `own`-edge gives "is a task" — without writing SQL). **Editable-in-place write-back** via hydration, with **insertion target = the node**. _(Touches `TableFace.tsx`, `FaceRenderer.tsx`, `useQuery.ts`.)_

### 4.4 Boundary-hop rendering & the panel stack — 7c.4 (hardest)

The data is trivial now (ancestry = the `own`-chain), so the work is purely view-layer: generalize the overlaid-cards / panel-stack model so a panel is keyed by **`(matrix_id, row_id)`**, render a **boundary hop** (a `#task` aspect row whose `own`-parent is a host bullet in another matrix), and decide **what face shows on the far side** when you drill into an aspect/record row. The far-side face is **`Plan.md` #5 face affinity** — an attachment may carry a preferred face. _(Touches `StreamView.tsx` panel-stack state, `OverlaidCards.tsx`, breadcrumb/ancestry data.)_

### 4.5 Dedicated sub-table embedding — 7c.3

The embedded `TableFace` inside the stream view; a collapsed preview in the navigation panel; outline interactions around a sub-table. **Open, data-adjacent item:** _how an owned-matrix's embedded face is positioned among a node's other heterogeneous children._ The primer's `row_kind=1` stub is best reinterpreted as a **view-layer positioning marker** for an embedded collection among siblings — ownership itself is already fully expressed by `own`-edges + `matrix.owner`, so `row_kind=1` should carry **position, not ownership**. Settle its exact shape here. _(Touches `matrix.ts` rank/`row_kind` DDL ~line 78–82, `FocusPanel.tsx` ~line 463 placeholder.)_

### 4.6 The unified creation gesture

One "add a collection / make this a …" gesture with a single knob: **existing shared type** (`own`-rows in that matrix) vs **new dedicated matrix** (own-matrix). Mirrors Notion's "link database" vs "new inline database." Where it lives, defaults, and how promotion (§2.7) surfaces in-line.

### 4.7 Paradigm convergence — 7c.5 (forward note)

Table face with hierarchy (it can now render an `own`-forest); outline with a column view; face-swapping a subtree. Mostly a documented direction once 4.1–4.5 land.

---

## 5. Carried-forward flags (genuinely unsettled)

- **rank: resolved as variant (a)** (§2.1) — sibling-local lexorank on the `own`-edge as truth; the global pre-order **scroll index** and **closure** are the two derived projections. Commits us to a **root sentinel** (every row has exactly one `own`-edge). _Fallback if implementation pushes back:_ (b) relocate today's prefix-encoded global key onto the edge (no separate scroll index, but keeps prefix-rekey-on-move in the truth). Decide the root-sentinel representation before touching the rank/`row_kind` DDL.
- **derived-index maintenance** (§2.1/§4.1): closure and the pre-order scroll index both refresh on structural edits (O(subtree) on a subtree move; contiguous-run update on collapse/expand). They may share a single pre-order/ancestry walk; settle whether they're one maintenance pass or two during implementation.
- **closure materialization strategy** (§2.1): global materialized table vs recursive CTE on the join table vs partial/lazy materialization. A perf decision — measure against <50ms deep-subtree ops; defer to implementation.
- **labeled `ref`-joins** (`Plan.md` #4): defer until a backlink/reverse-lookup view needs it.
- **`row_kind=1` final shape** (§4.5): position marker for embedded collections; pin down in the rendering session.

---

## 6. Continuity

Canonical docs remain source of truth; fold §1–§3 of _this_ doc into `Architecture.md` (joins/traits/identity) and `Plan.md` (resolved #3, narrowed #4) when convenient. For the rendering session, primer §5 (code surfaces) is the grounding map; the surfaces each §4 item touches are noted inline above. Recommended entry point for a fresh agent: read `PHASE-7C-PRIMER.md` for vocabulary and current build state, then this doc's §1–§3 for the settled model, then start at §4.
