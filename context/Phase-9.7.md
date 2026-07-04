# Phase 9.7 — Paradigm convergence: the mesh, the container, and the portal

> Deep-dive for [Phase 9 §9.7](Phase-9.md#97-paradigm-convergence-forward-note). The
> §9.7 forward note asked whether the aspect / query / sub-table / outline-children
> split could collapse into **one** band paradigm. A long design session worked it
> through and the answer is yes — but the collapse goes deeper than "one renderer for
> the bands." It reaches into the data layer (ownership vs. position) and resolves a
> handful of [Phase 9.2](Phase-9.2.md)/[9.3](Phase-9.3.md) and [Phase 8c](Phase-8c.md)
> framings. This doc captures the converged model, its grounding in prior art, what it
> simplifies/risks/touches, and the two feasibility spikes it leaves open. It honors the
> ownership spine ([Phase 8](Phase-8.md)/[8c](Phase-8c.md)) and the development
> principles (incremental/intentional, gestalt-aware, single-frame perf).
>
> **Status:** design converged and **the build is complete, including Stage C3**. Both gating
> spikes landed — [deep-portal materialization](Phase-9.7a.md) (GO, deep-in-v1) and
> [windowing/height-variance perf](Phase-9.7b.md) (GO, count+slice with no per-row dynamic
> offsets for v1) — [Phase 9.7c](Phase-9.7c-reconciliation.md) (doc reconciliation) is
> **done**, and all four build stages ([§13](#13-the-build-proper--implementation-prompts))
> shipped: A (data layer / portals), B (block markers + count+slice windowing), C
> (renderer unification + gestures + inline block folding via the worker↔client gather RPC),
> and [**C3**](#stage-c3--folded-row-focus-and-drill-in-identity-landed) (folded-row drill-in
> identity — **landed**). Composed fidelity and the merged level remain
> [Phase 10](Phase-10.md), which this hands off to now.

---

## 1. The problem this resolves

A focal node's owned children rendered across **three bespoke surfaces** over what were
frequently the _same_ `own`-edges, each with different filters and capabilities:

- **aspect band** ([AspectBand.tsx](../src/workspace/AspectBand.tsx)) — editable hydrated
  fields, but **host-matrix-scoped** (the §9.6 sharp edge: `/attach` onto a non-workspace
  node lands only in the outline, fields uneditable);
- **query band** ([QueryBand.tsx](../src/workspace/QueryBand.tsx)) — live SQL, unanchored,
  read-or-recognized-write;
- **sub-table band** ([SubTableBand.tsx](../src/workspace/SubTableBand.tsx)) — tree of one
  matrix, via a _second_ renderer (`TableFace`), node-scoped insert;
- **outline children** ([NavigationPanel.tsx](../src/workspace/NavigationPanel.tsx)) —
  tree-ordered, cross-matrix, but **label-edit only** (no in-place field editing).

A single `#task` child rendered **twice** (editable in the aspect band; meshed read-only
in the outline). Same edge, two renderers, divergent capabilities — the "where did my row
go / why can't I edit it here" friction in concrete form.

The data layer ([Phase 8](Phase-8.md)/[8c](Phase-8c.md)) had already collapsed everything
to **one primitive** — `own`-edges among nodes, spanning matrixes, carrying lifecycle +
order + ancestry. The view layer re-expanded it into four surfaces. **This phase finishes
the collapse the data layer started.**

## 2. The model in one breath

> A node's children are **one ordered, interleaved region**. Every related row-set is a
> node with a **child-sourcing mode** — `loose`, `container`, or `view`. "Mesh" is the
> `loose` mode; "blocks" are nodes in `container`/`view` mode occupying one slot that
> expands into their own region. One **schema-adaptive renderer** at **substrate
> fidelity** draws every row. **Ownership is single and lives where a row was created;
> position is plural** (a row can appear at its home plus opt-in **portals**).

Everything below elaborates this.

## 3. Three child-sourcing modes (the unification)

Every node sources its children one of three ways. The three former bands are three
settings of one structure; the outline is not a separate surface, it is the `loose` mode.

| Mode                                  | Membership          | Intrinsic order        | Owns                         | Insert                         | Delete-safety          |
| ------------------------------------- | ------------------- | ---------------------- | ---------------------------- | ------------------------------ | ---------------------- |
| **loose** (the outline)               | direct `own`-edges  | parent `edge_key`      | each child (row axis)        | yes                            | per-subtree cascade    |
| **container** (a matrix bounded here) | one matrix's extent | matrix rank            | the **extent** (matrix axis) | yes (creates a row homed here) | whole-matrix drop      |
| **view** (a query)                    | a SQL result        | the query's `ORDER BY` | **nothing**                  | **no** (the firewall)          | deletion-safe (a lens) |

- **`loose`** = today's outline, generalized to be cross-matrix and to use the substrate
  renderer (so every hydrated cell is editable in place — the §9.6 sharp edge _cannot_
  recur, because there is no per-band query carrying a host-matrix restriction).
- **`container`** = a matrix rendered with its **border**: it carries real higher-level
  ownership (the matrix-axis cascade — drop the matrix, delete the bounded rows, then
  follow each row's out-projecting `own`-edge per [8c §8.1](Phase-8c.md#81-matrix-drop-cascade-completeness-review-1-4-5--high)).
  A _dedicated sub-table_ is a container whose rows are also homed here; a _shared
  type-node's_ extent is a container whose rows are homed elsewhere.
- **`view`** = a cross-cutting query gather (e.g. "`#task`s in this subtree"). No border,
  owns nothing, cannot insert (ownership is never an output of a query — the firewall),
  deletion-safe.

**Grid is not a paradigm — it is coalescing.** A homogeneous run of same-schema rows
hoists its column labels to one shared header. "Table face" is a rendering of a contiguous
same-schema span, not a fourth band kind.

## 4. Ownership vs. position (the data-layer crux)

The session's pivotal result: **ownership and position are different axes, and the model
had been conflating them.** A row participates in four relationships:

| Relationship                           | For a hosted `#task`         | Governs               |
| -------------------------------------- | ---------------------------- | --------------------- |
| **extent membership** (`mx_M`)         | the Tasks matrix             | identity / schema     |
| **matrix-axis owner** (`matrix.owner`) | the type-node                | whole-table drop      |
| **row-axis owner** (single `own`-edge) | **where created** (the host) | row-cascade lifecycle |
| **position(s)** (`scroll_index`)       | home + opt-in portals        | where it renders      |

### Owner = where it was created

The lifecycle owner is the single `own`-edge, and **it points at the creation site** —
the host for a `#task` typed in prose; the type-node for a row made directly in the table
(the hostless / "dual owner" case). This is the **current [8c §5](Phase-8c.md#5-tagging-gestures-map-onto-the-two-edges)
default**, kept, not revised. Consequence: deleting the host cascades the freshly-created
task — **no clutter at a distance.** A type/collection is _not_ an owner.

This was validated against prior art (see [§7](#7-prior-art-grounding)): Tana's _Owner is
the node's permanent home — where it was created_; a supertag classifies but **does not
own**; deleting a node with no references deletes it. Workflowy's original/mirror and
Notion's database-home/linked-view say the same. The earlier temptation to make the
_source matrix_ the owner is exactly what produces clutter, and it is the choice all three
reference tools refuse.

### The container is a true container, not a "view"

The type-node's matrix is **not** a view — it is a **container**: it draws a _border
around_ its rows (membership + matrix-axis cascade) without _positioning_ them. A row's
position/lifecycle is its `own`-edge, a line that starts **inside** the row and projects
to wherever it was created. _Dedicated vs. shared is just where those lines land_ — all
into the owner (dedicated) vs. out to various hosts (shared). Same container primitive.

> Visual (see [Phase-9.7-visuals.html](Phase-9.7-visuals.html)): the matrix border bounds
> membership and the drop-cascade but never reaches _through_ a row; the `own`-edge line
> from inside each row carries lifecycle + position to its home. Substrate columns
> (`owner`, `matrix`, `anchor`, `edge_key`, `depth`) are the textual twin of these lines.

This corrects an earlier waffle in the session (the type-node collection was called a
"table", then a "view"); **container** is the precise third thing, distinct from both the
`loose` mesh and a query `view`.

## 5. Portals and refs (one family, split by anchoring)

**Position is plural.** A row appears at its home and, opt-in, at **portals** — extra
appearances (mirrors). Portals are **non-owning**: severing one is non-destructive
(Workflowy's "delete the mirror, original survives"); deleting the home **ghosts** the
portals (Workflowy's "original was deleted" — reusing our existing ghost-ref state).

Portals are **deep** by default (a portal shows the node _and its owned subtree_) — a
shallow, title-only mirror would feel broken. (Deep-portal materialization is a spike —
[§9](#9-open-decisions-and-their-resolutions).)

This places the `@`-refs we already built into a single 2×2 — **ownership × anchoring** —
and shows portals as its missing cell:

|                                           | **owning** (`own`-edge · single · lifecycle) | **non-owning** (`ref` · independent lifecycle) |
| ----------------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| **content-anchored** (in prose)           | `#`-tag → owned aspect                       | **`@`-mention** (wiki-link, badge + backlink)  |
| **structural** (a position in the forest) | `/attach` aspect · loose child               | **portal** (deep mirror — full inline node)    |

So **refs and portals are the same family** (non-owning links; severing is non-destructive;
they share the live/empty/**ghost** state machine and backlinks). They differ only in
**anchoring + rendering**: a `@`-ref is content-anchored and renders as a badge; a portal is
structurally-anchored, occupies a `scroll_index` position, and transcludes the node. The
ref machinery is **reused**, not replaced.

### Gestures (the small delta from today)

- **Unchanged:** `#` = create owned aspect at the host; `@` = mention. (Because owner stays
  where-created, `#`/`@` keep 8c semantics.)
- **New:** **portal** (mirror this row elsewhere — opt-in, multi-filing); **move-owner**
  (promotion — relocate the home, leave a portal behind, à la Tana "Move original node");
  **two-tier delete** — _detach_ (remove this appearance, non-destructive) vs. _hard delete
  including references_ (cascade everywhere — the escalation, never the silent default).
- **Retired:** aspect band / query band / sub-table band as separate surfaces; `fold/merge`
  band gestures ([9.2 open question](Phase-9.2.md#open-sub-questions)) — `loose` is the only
  paradigm for owned children, so only plain collapse survives.

## 6. The one interleaved index

`scroll_index` becomes the **single source of truth for position** — but for _position_,
not ownership (lifecycle stays the single `own`-edge in `joins`). It goes **multi-location**:
a row may have N entries (home + each portal), each with its own `global_lexkey`; the
renderer keys DOM rows by **position (lexkey)**, not by `(matrix_id, row_id)`, since a row
can legitimately appear twice.

What is and isn't in the index:

- **Own-positioned** content — `loose` children, dedicated `container` rows, and **deep
  portal subtrees** — is **materialized** in `scroll_index`. One keyset range scan windows
  all of it. A portaled subtree's entries carry an H-rooted prefix, so **closure-per-location
  is free**: ancestry for any appearance is read off its lexkey prefix.
- **Gather-positioned** content — `view` results and a _shared_ container's foreign-homed
  rows — is **not** materialized (the firewall forbids minting position from a query). It is
  rendered via **count + slice flattening** (next section).

The **`bands` table is eliminated.** A `view` persists only its SQL (+ its block marker's
position); a `container` persists nothing new (`matrix.owner` + membership suffice). Block
markers are minted as real `scroll_index` participants — which also gives an _empty_
container a position (solving the §9.4 empty-container problem) and collapses the former
`bands.order` into `edge_key`.

### Windowing: count + slice (all rows inline, no nested scroll)

The displayed sequence is `scroll_index` **with each non-materialized block expanded inline
to its row count**. Window by `ROWS_PER_WINDOW` over _that flattened sequence_; a block
contributes its `COUNT` to window budgets (so a 1-row block doesn't get a lonely window —
the window keeps pulling the next nodes), and a large block **spans windows**, each
rendering a **slice by offset** (keyset/`LIMIT` into the block's matrix-rank or query order).

Mechanics: a **cached `COUNT` per block** (invalidated when the block's tables change) feeds
a prefix-sum for offset math; a **per-window gather** may touch a `scroll_index` range plus,
when a window straddles a block, one block-slice. **No nested virtualizer, no independent
scroll, no drill-down.** This is **render-only** flattening — no `own`-edges minted — so the
firewall holds.

## 7. Prior-art grounding

| Tool                | Single home                | Multi-appearance            | Type/schema                                 | Delete-at-appearance             | Cascade-everywhere                  |
| ------------------- | -------------------------- | --------------------------- | ------------------------------------------- | -------------------------------- | ----------------------------------- |
| **Tana**            | Owner = where created      | references / parents (many) | supertag (does **not** own)                 | delete reference (safe)          | "Hard delete including references"  |
| **Workflowy**       | the original               | mirrors (many)              | —                                           | detach / delete mirror (safe)    | delete original → mirrors **ghost** |
| **Notion**          | the database row           | linked-DB views             | the database                                | remove from view = filter (safe) | delete row (everywhere)             |
| **Hila (this doc)** | `own`-edge @ creation site | **portals** (opt-in, deep)  | the **matrix container** (matrix-axis owns) | detach portal (safe)             | hard-delete-including-refs          |

The model is Tana/Workflowy-shaped with our matrix layer providing schema/storage
underneath (invisible to the ownership question). Sources:
[Tana — Nodes & references](https://outliner.tana.inc/learn/features/nodes-and-references),
[Tana — Supertags](https://tana.inc/docs/supertags),
[Workflowy — Mirrors](https://workflowy.com/help/mirrors).

## 8. Simplifies / risks / migration-touch (original goal #3)

**Simplifies**

- One renderer (substrate `PropertyRow` generalized), not `PropertyRow` + `TableFace` +
  outline-row + LabelEditor-only.
- The §9.6 **host-matrix sharp edge dissolves** — editability is per-cell hydration, computed
  uniformly; there is no band query to carry the restriction.
- **No double-appearance** — a `#task` has one home; the container/view is a lens, portals
  are explicit.
- `bands` table removed; `loose`/`container` positions live in `scroll_index` + `joins` +
  `matrix.owner`.
- `fold/merge` band vocabulary retired; only collapse remains.
- The promotion taxonomy ([8c §6](Phase-8c.md#6-the-promotion-taxonomy)) becomes named
  operations: cross-matrix reparent = **move-owner**; create-new-type = **make a container**;
  `label→type` / `subtree→table` = **wrap-a-set-in-a-container**; `shared→dedicated` =
  **re-home owner-edges**.

**Risks**

- **Deep-portal maintenance** — index growth `O(Σ portaled-subtree-sizes)`; write
  amplification `O(portals of a node or its ancestors)`. Known-feasible (Workflowy/Tana ship
  it) but needs guards (caps / lazy off-screen expansion). _Own spike._
- **Height variance** — mixed bullet / grid / multi-field substrate rows strain fixed-height
  windowing. _Resolved by [Phase 9.7b](Phase-9.7b.md): the existing window-granularity
  `ResizeObserver` measurement (once a pre-existing `IntersectionObserver`-root bug was fixed)
  already absorbs the added estimate error live-validated to no visible jitter; no per-row
  dynamic-offset machinery needed for v1._
- **Owner legibility** — per-instance owner placement can hide "what dies if I delete here";
  mitigated by the substrate `owner`/`anchor` columns (Tana flags the same hazard).
- **Perf budget** — substrate rows are heavier DOM; the index ~doubles (multi-location). The
  <50ms / single-frame first principle needs a real check.

**Migration touches** (no live DBs — pre-release, reset not migrate)

- New renderer + `loose`/`container`/`view` block rendering replacing the three bands
  ([AspectBand](../src/workspace/AspectBand.tsx)/[QueryBand](../src/workspace/QueryBand.tsx)/[SubTableBand](../src/workspace/SubTableBand.tsx)).
- `scroll_index` multi-location + block markers + count/slice windowing
  ([usePagedWorkspaceData](../src/workspace/usePagedWorkspaceData.ts),
  [ScrollVirtualizer](../src/virtualizer/ScrollVirtualizer.tsx),
  [workspace-plugin.ts](../src/workspace/workspace-plugin.ts) queries).
- `bands` table + ops removed; view SQL persisted on its block marker.
- Portal edge kind + ghost reuse; `move-owner`, `portal`, two-tier-delete ops.
- Tag-query host-matrix scope removed ([tag-queries.ts](../src/tags/tag-queries.ts)).

## 9. Open decisions and their resolutions

| Decision                             | Resolution                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| Mesh vs. blocks                      | Mesh-primary; blocks (`container`/`view`) are positioned nodes that expand.   |
| Order flatness                       | **Fully interleaved**; block markers minted into `scroll_index`.              |
| Owner placement                      | **Where created** (host default); overridable per-instance via move-owner.    |
| Type-node collection                 | A **container** (border + matrix-axis), not a view.                           |
| Refs vs. portals                     | Same non-owning family; split by anchoring (content `@` / structural portal). |
| Portal depth                         | **Deep** (subtree). Materialization is a spike.                               |
| Closure per location                 | **Free** — read off the lexkey prefix of each materialized appearance.        |
| `bands` table                        | **Removed.** Tables/views are block markers; views persist SQL only.          |
| All-N-inline                         | **Yes** — count + slice flattening; no drill-down / nested scroll.            |
| Fidelity                             | **Substrate first** (one renderer); composed = Phase 10.                      |
| Nested blocks (block-in-block)       | Deferred / likely disallowed for v1.                                          |
| Merged level (fields inline on node) | Phase 10 (composed sugar; absent at substrate).                               |

## 10. Mapping onto Phase 9

- **§9.1 heterogeneous children** = the `loose` mode (cross-matrix, substrate renderer).
- **§9.2 property surface** = intrinsic columns + owned aspects, all in the `loose` mesh;
  the _merged_ level is deferred composed sugar; the aspect _band_ is retired.
- **§9.3 embedded collections / live views** = the `view` mode (unanchored, count/slice,
  recognized-cell-edit); the `bands` table it introduced is removed.
- **§9.4 dedicated sub-table** = a dedicated `container` (materialized in `scroll_index`).
- **§9.5 boundary-hop / panel stack** = multi-location positions; breadcrumb = the
  lexkey-prefix ancestry of the appearance you drilled from.
- **§9.6 unified creation** = `#` (owned aspect) / `@` (mention) unchanged; `/table` = make a
  `container`; `/attach` = make an owned aspect (sharp edge gone). New: portal, move-owner.

## 11. Gestalt — docs to reconcile when this builds

- [Architecture.md](Architecture.md) — Hydration (per-cell editability is now uniform across
  the mesh); Inline references (add the portal cell to the ref family; deep-mirror rendering);
  Identity face (it is the `container` border, generalized).
- [Traits.md — Join / Anchoring](Traits.md#join) — add the **portal** (non-owning, structural,
  multi-position) alongside `own`/`ref`; ownership single, position plural.
- [Phase-8c.md](Phase-8c.md) — clarify owner-where-created as the kept default and the
  container (not view) reading of a type-node's extent; the promotion taxonomy as named ops.
- [Phase-9.md §9.7](Phase-9.md#97-paradigm-convergence-forward-note) — point to this doc;
  mark the convergence explored.
- [Phase-9.2.md](Phase-9.2.md)/[Phase-9.3.md](Phase-9.3.md) — note `band` → `(loose | container
| view)`; `bands` table removed; fold/merge retired; renderer unified at substrate.

## 12. Forward

1. **Consolidation (this doc + [Phase-9.7-visuals.html](Phase-9.7-visuals.html)).** Done.
2. **Deep-portal materialization spike ([Phase-9.7a.md](Phase-9.7a.md)).** Done — GO on
   deep-in-v1 (cycle detection only, no cap).
3. **Windowing / height-variance spike ([Phase-9.7b.md](Phase-9.7b.md)).** Done — GO on
   count+slice windowing; every per-window gather measured sub-millisecond at 10× scale; the
   existing window-granularity measured-offset mechanism (once a pre-existing
   `IntersectionObserver`-root bug was fixed) absorbs block-composition height variance without
   visible jitter, so no per-row dynamic-offset machinery ships for v1.
4. **[Phase 9.7c](Phase-9.7c-reconciliation.md)** — reconcile both spikes' outcomes into the
   canonical docs. **Done.**
5. **The build proper** — three staged sessions ([§13](#13-the-build-proper--implementation-prompts)):
   A (data layer / portals) **— landed**, B (block markers + count+slice windowing) **— landed**,
   C (renderer unification + gestures) **— landed**: C1 (focus-panel band unification + gesture/data
   wiring + position-keyed outline + ghosts), C2-partial (the outline substrate merge — loose rows
   through the substrate renderer with inline-editable cross-matrix cells + grid coalescing, a shared
   row-gesture module, gestures on outline rows), and **C2-remainder (inline block folding via the
   worker↔client gather RPC — landed, the last piece)**. **The Phase 9.7 build is complete.** See
   each stage's build note for what the next inherited.
6. **[Stage C3](#stage-c3--folded-row-focus-and-drill-in-identity-landed) — folded-row focus and drill-in
   identity.** **Landed.** Post-landing review had found that opening a focus panel from a folded
   (`view`-block) row passed the row's synthetic fold-position key straight through as the nested
   panel's position scope, so its owned children silently never showed. Fixed by resolving the row's
   real position by identity before opening the panel (home if live, else the lowest-keyed live
   portal, else none) — see the stage's build note for what landed.
7. **Phase 10** — composed fidelity (bullets, the merged level, drawn tethers, pretty grids)
   over the substrate floor. **Hands off here now that Stage C3 has landed.**

Also on the books, orthogonal: the **SQL subscription late-joiner race**
([Phase-9.md follow-ups](Phase-9.md#sql-subscription-late-joiner-race-latent-correctness-bug)).

## 13. The build proper — implementation prompts

The design is converged, both spikes are GO, and the docs are reconciled ([§12](#12-forward)).
What remains is the build, split into **three staged sessions** along the seams the spikes
carved — each a distinct risk profile with its own gate (format, lint, typecheck, unit, e2e).
The order is a hard dependency chain: **A → B → C**. Each prompt below is self-contained;
start a fresh session and paste the corresponding block (or just point the session at
"Phase-9.7.md §13, Stage X").

**Why staged, not one session.** The build touches all three layers — data (schema +
`scroll_index` maintenance + ops), windowing (`usePagedWorkspaceData` + block markers), and
view (one renderer replacing three bands). Bundling them lets a view-layer bug block
data-layer validation — the anti-pattern [Phase 9.3's build plan](Phase-9.3.md#build-plan)
already split along. Reset-not-migrate applies throughout (pre-release, no live DBs).

### Stage A — Data layer: deep portals + multi-location `scroll_index`

> **Build Phase 9.7 — Stage A: the data layer (deep portals + multi-location `scroll_index`).**
> First of three build stages for the [Phase 9.7](Phase-9.7.md) convergence; design converged,
> both spikes GO, docs reconciled. **Do the data layer only — no view/windowing work this
> session** (Stages B and C).
>
> **Orient first.** Read [Phase-9.7.md](Phase-9.7.md) (esp. §4 ownership≠position, §5
> portals/refs, §6 the one interleaved index) and [Phase-9.7a.md](Phase-9.7a.md) in full — its
> §1 is the settled model, §5 the hand-off you're implementing. The validated maintenance path
> exists as a prototype: read [`src/perf/deep-portal-spike.ts`](../src/perf/deep-portal-spike.ts)
> and [`.test.ts`](../src/perf/deep-portal-spike.test.ts) — it stands up production's schema
> plus the deltas below and is your blueprint (it is *not* wired into production ops; that's
> this session). Then read the real code you'll generalize: `src/core/matrix.ts` (schema, the
> `joins_single_owner` partial index at ~L300, the `kind`/`edge_key` CHECK at ~L142), the
> `scroll-index.ts` maintenance (`addToScrollIndex` / `moveSubtreeInScrollIndex`),
> `src/core/closure.ts`, and the join ops.
>
> **Apply the four schema deltas** (fresh-DB rewrite, reset not migrate): (1) widen the `joins`
> CHECK so `kind IN ('own','portal')` may carry an `edge_key`; (2) add partial index
> `joins_position_children ON (source, edge_key) WHERE kind IN ('own','portal')`; (3) drop the
> `scroll_index_identity` UNIQUE index, add a non-unique `scroll_index_by_identity`; (4) add
> `is_ghost` and `lazy` render flags to `scroll_index`.
>
> **Generalize maintenance and add the ops:** make `scroll-index.ts` iterate `positionsOf(node)`
> instead of assuming one location; extend the recursive CTEs to `kind IN ('own','portal')`;
> implement `addPortal` / `removePortal` (detach, non-destructive), `move-owner` (`reparentRow`
> + `addPortal` at the old parent), and two-tier delete (detach vs. hard-delete-including-refs).
> Home-delete **ghosts** the portals via a surviving `is_ghost` tombstone entry (the one
> intentional divergence from the `@`-ref ghost path — 9.7a §2).
>
> **Guardrails.** Single-owner lifecycle/cascade must read only `kind='own'` and be provably
> unaffected (the partial unique index is why portals don't collide). The firewall holds:
> portals are position-only, never a second owner. **v1 ships deep with cycle detection only,
> no cap** — reject portaling a node under its own position-descendant/self
> (`isPositionDescendantOrSelf`), `MAX_POSITION_DEPTH` as backstop; keep the `lazy`/cap
> mechanism prototyped but off. Closure stays as-is (ownership ancestry); per-appearance display
> ancestry is read off the `global_lexkey` prefix.
>
> **Gate.** Port the spike's Stage-P0 guards (the 12 tests: windowed-scan EQP stays one keyset
> range with portal/ghost/lazy rows present; write-amplification independent of forest size;
> add-portal cost = `appearances(host) × |subtree(target)|`; index growth; cycle guard;
> closure-per-location) to the production ops, then run the full battery. Leave a build note so
> Stage B starts clean.

#### Stage A — build note (landed)

The data layer is wired. What Stage B inherits:

- **Schema (fresh-DB, [matrix.ts](../src/core/matrix.ts)).** All four deltas applied:
  `joins` CHECK widened to `kind IN ('own','portal')` carrying `edge_key`; partial index
  `joins_position_children` added (own- and portal-children share one sibling-order space);
  the UNIQUE `scroll_index_identity` dropped for a non-unique `scroll_index_by_identity`;
  `scroll_index` gained `is_ghost` / `lazy` flags. `joins_single_owner` stays partial on
  `kind='own'`, so portals never collide with ownership (firewall proven by test).
- **Multi-location maintenance ([scroll-index.ts](../src/core/scroll-index.ts)).** New
  primitives: `positionsOf`, `materializeSubtreeAtPrefix` (deep, own+portal walk, cap+lazy
  lever present but off — `DEFAULT_PORTAL_CAP` never bites in v1), `deleteScrollSubtreeRange`,
  `insertGhostMarker`, and `addOwnChildToScrollIndexAtAllPositions` — the fan-out the hot
  insert path ([tree.ts](../src/core/tree.ts) `createTreePosition`) now uses. **Perf note:**
  the fresh-attach path inserts one row per parent appearance *directly* (no recursive
  materialize) — routing it through `materializeSubtreeAtPrefix` made forest-building O(n²)
  and timed the windowing spike out; keep that split. The three rebuild/move CTEs now walk
  `kind IN ('own','portal')` with a `MAX_POSITION_DEPTH` guard. Sibling-key computation
  (`lastChildKey`/`childKeyAfter`/`childKeyBefore`) is own+portal aware.
- **Portal ops ([portal.ts](../src/core/portal.ts)).** `addPortal` / `removePortal` (detach),
  `moveOwner` (`reparentRow` + `addPortal` at the old parent), `deleteHomeGhostingPortals`
  (the default home-delete → surviving `is_ghost` tombstones; portal edges kept),
  `hardDeleteIncludingRefs` (the escalation — cascade everywhere, no ghosts), the
  `isPositionDescendantOrSelf` cycle guard, and `ancestryOfAppearance` (per-location closure
  from the lexkey prefix). Closure stays ownership-only, untouched.
- **Gate.** The 12 Stage-P0 guards are ported to production ops in
  [portal.test.ts](../src/core/portal.test.ts) (13 tests, +1 firewall) and pass; full unit
  battery green (809); format/lint/typecheck clean.
- **Deferred to later stages (not Stage A):** the `bands` table is **still present** (Stage B
  removes it); portal ops are **not yet wired to the worker or any UI** (the worker
  `getGlobalKey` dirty-set path still reads a single home key — untouched, correct while no
  portals exist); `rebuildScrollIndex` re-derives portal appearances from edges but **cannot
  reproduce `is_ghost` tombstones** (a full rebuild after a home-delete loses ghosts — an
  accepted repair-path limitation, revisit if sync ever races portals).

### Stage B — Block markers + count+slice windowing

> **Build Phase 9.7 — Stage B: block markers + count+slice windowing.** Second of three build
> stages; **requires Stage A landed** (multi-location `scroll_index` + portal ops exist).
> **Do the windowing/paging layer only — no renderer unification this session** (Stage C).
>
> **Orient first.** Read [Phase-9.7.md §6](Phase-9.7.md#6-the-one-interleaved-index) (the one
> interleaved index; count+slice) and [Phase-9.7b.md](Phase-9.7b.md) in full — its §1 is the
> settled mechanics, §7 the hand-off. The prototype is
> [`src/perf/windowing-spike.ts`](../src/perf/windowing-spike.ts) +
> [`.test.ts`](../src/perf/windowing-spike.test.ts) (`computeSegments` / `sliceWindow` /
> `gatherWindow`) — your blueprint, not wired into production. Then read the paging/virtualizer
> stack you'll extend: [`usePagedWorkspaceData.ts`](../src/workspace/usePagedWorkspaceData.ts),
> [`workspace-plugin.ts`](../src/workspace/workspace-plugin.ts) (`buildPaginatedOutlineQuery`,
> `buildOutlineCountQuery`, the `scroll_index` keyset scan), and
> [`ScrollVirtualizer.tsx`](../src/virtualizer/ScrollVirtualizer.tsx) (note: the
> `findScrollRoot` `IntersectionObserver`-root fix **already shipped** with 9.7b — carry it
> forward as-is, don't redo it).
>
> **Build.** Mint each **block marker** (a `view` result or a shared container's extent) as an
> ordinary `scroll_index` participant per §6 (this also gives an empty container a position and
> folds `bands.order` into `edge_key`). Generalize `usePagedWorkspaceData`'s window-range query
> to call `computeSegments` / `sliceWindow` / `gatherWindow` (or their real-schema equivalents)
> instead of a single `buildPaginatedOutlineQuery` range scan: the flattened sequence is
> `scroll_index` with each block expanded inline to its cached `COUNT`. Subscribe each visible
> block's `COUNT` via the existing `useQuery` / `addObserver` reactive path — **no new
> invalidation machinery** (tables-visited reactive invalidation already covers it, 9.7b §1).
> **Remove the `bands` table + CRUD ops**; a `view` persists only its SQL on its block marker; a
> `container` persists nothing new.
>
> **Guardrails.** Render-only flattening — **no `own`-edges minted** (the firewall). Deep-portal
> subtrees are already materialized `scroll_index` rows (Stage A), so the flattener handles only
> `view`s and shared-container extents; the `lazy` marker is out of scope for v1. No-lonely-window
> (segment *sizes*, not counts, drive boundaries) and a straddling window gathers exactly the
> segments it crosses. **Nested blocks (block-in-block) deferred** (9.7b §5). Substrate-first
> fidelity — composed sugar is Phase 10.
>
> **Gate.** Port the spike's Stage-P0 guards (exact coverage; straddling window; no-lonely-window;
> scale independence; no-sort EQP for both source kinds) to the wired path; confirm
> `e2e/virtualizer-multiwindow.spec.ts` still passes; run the full battery. Leave a build note so
> Stage C starts clean.

#### Stage B — build note (landed)

The paging/windowing layer is wired and the `bands` table is gone. What Stage C inherits:

- **The flattener ([window-flatten.ts](../src/workspace/window-flatten.ts)).** The spike's
  `computeSegments` / `sliceWindow` / `gatherWindow` promoted onto the real schema, plus the two
  production source-kind builders: `viewBlock` (wraps a persisted SQL in `COUNT` / `LIMIT`+`OFFSET`)
  and `containerBlock` (a shared matrix's extent in rowid/matrix-rank order — trait-rank ordering is
  a Phase 10 refinement). `MATERIALIZED_SLICE_COLUMNS` mirrors the outline scan
  (`global_lexkey, matrix_id, row_id, depth, is_ghost, lazy`). Render-only: no `own`-edges minted
  (the firewall); nested blocks stay out of scope (`Block.slice` returns plain rows).
- **Gate — the Stage-P0 guards are ported ([window-flatten.test.ts](../src/workspace/window-flatten.test.ts),
  4 tests, all green):** exact coverage of a 730-virtual-row flattened sequence; straddling window
  touches exactly the sources it crosses; a 1-row block gets no lonely window; per-window gather cost
  is bounded by `ROWS_PER_WINDOW` (flat across a 10× forest+block increase); and no-sort EQP
  (`noAutoIndex` + `noTempBTree`) for **all three** hot queries — the materialized-segment slice, the
  `container` slice, and the `view` slice.
- **Block markers = real `scroll_index` participants ([block-marker.ts](../src/core/block-marker.ts)).**
  A `view` marker is minted as an own-child of its focal (its `edge_key` carries position — the former
  `bands.order`), and only its SQL persists — in the new **`block_sources`** table (`marker_matrix_id`,
  `marker_row_id`, `kind`, `sql`), keyed by the marker's identity. A `container` persists nothing new.
  `createViewBlock` / `updateViewBlockSql` / `deleteViewBlock` / `getViewBlocksForNode` own the
  lifecycle; wired through the worker (`createViewBlock` / `updateViewBlock` / `deleteViewBlock`) and
  client. `block_sources` is **local-only** (no sync triggers), exactly as `bands` was; the marker node
  itself (its `own`-edge in `joins`) syncs normally.
- **`bands` table + ops removed.** `src/core/bands.ts`, `bands.test.ts`, and `band-queries.ts` are
  deleted; the query builder is `buildViewBlocksForNodeQuery`
  ([block-marker-queries.ts](../src/workspace/block-marker-queries.ts)). `dropMatrix` cleans
  `block_sources` for the matrix. Reset-not-migrate (fresh-DB `CREATE TABLE`, no live DBs).
- **View components repointed, still focus-panel-rendered.** `QueryBand` / `QueryBandsSection`
  ([QueryBand.tsx](../src/workspace/QueryBand.tsx)) read/create/update/delete view **blocks** (not
  bands) and still render in the focus-panel section — the full `query-band.spec.ts` battery stays green.
  `SubTableBand` was already a `container` (live-derived from `matrix.owner`) and needed no change.
- **Marker rows are excluded from the loose scan.** `buildPaginatedOutlineQuery` /
  `buildOutlineCountQuery` (via a shared `EXCLUDE_BLOCK_MARKERS` clause), `has_children`, and
  `buildChildCountQuery` all `NOT EXISTS` against `block_sources`, so a `view` marker never appears as
  a stray plain outline row and never inflates a parent's child count.
- **`usePagedWorkspaceData` seam.** With markers excluded from the loose scan, the production loose
  sequence is a **single materialized segment** whose slice IS today's `buildPaginatedOutlineQuery` —
  i.e. `computeSegments` degenerates to `[materialized]` with no block segments, behavior-preserving.
  The count+slice engine + per-block `COUNT` subscription + inline block rendering are documented at
  the window-layer seam in the hook and belong with **Stage C** (block *content* rendering is renderer
  work; the client hook subscribes to SQL strings, while the flattener runs worker-side against a live
  `Database` — the gather RPC that bridges them lands with the renderer).
- **Deferred to Stage C (not Stage B):** folding block *content* inline into the outline (feeding real
  blocks + reactive per-block `COUNT` to `gatherWindow`, rendered by the unified substrate renderer);
  shared-container block discovery in the production hook (the `containerBlock` builder exists and is
  guarded, but nothing in the production hook mints a container block yet); the `lazy` marker path
  (out of scope for v1, as in Stage A).

### Stage C — Renderer unification + gestures

> **Build Phase 9.7 — Stage C: renderer unification + gestures.** Third of three build stages;
> **requires Stages A and B landed** (portals + block markers + count+slice paging exist). This
> is the view layer — where the three bands become one renderer and the new gestures surface.
>
> **Orient first.** Read [Phase-9.7.md](Phase-9.7.md) §3 (three child-sourcing modes), §5
> (gestures), §8 (simplifies / migration-touch), and §10 (mapping onto Phase 9). Read the
> reconciled canonical model: [Architecture.md — Hydration / Inline references / Identity
> face](Architecture.md#hydration) and [Traits.md — Join](Traits.md#join). Read the three band
> components being replaced — [`AspectBand.tsx`](../src/workspace/AspectBand.tsx),
> [`QueryBand.tsx`](../src/workspace/QueryBand.tsx),
> [`SubTableBand.tsx`](../src/workspace/SubTableBand.tsx) — plus the substrate renderer they
> collapse into ([`PropertyRow.tsx`](../src/shared/PropertyRow.tsx), the aspect-band precedent)
> and [`NavigationPanel.tsx`](../src/workspace/NavigationPanel.tsx) (the windowed render).
>
> **Build.** Replace the three bands with **one substrate renderer** driven by a node's
> **child-sourcing mode** — `loose` (the mesh / outline, cross-matrix), `container` (a matrix
> bounded here, with its border; dedicated vs. shared per `matrix.owner` vs. row-owners), and
> `view` (a query, count+slice from Stage B). Editability is **per-cell hydration computed
> uniformly** — no per-band host-matrix scope — so **remove the tag-query host-matrix scope**
> ([`tag-queries.ts`](../src/tags/tag-queries.ts)) that caused the §9.6 sharp edge. Key DOM rows
> by **position (`global_lexkey`)**, not `(matrix_id, row_id)` (a row can appear at home + each
> portal). Grid is **coalescing**, not a mode: a homogeneous same-schema run hoists its column
> labels to a shared header. Wire the gestures: **portal** (mirror this row elsewhere),
> **move-owner** (relocate home, leave a portal), **two-tier delete** (detach vs.
> hard-delete-including-refs — the escalation, never the silent default). `#` / `@` / `/attach`
> / `/table` keep their [§9.6](Phase-9.md#96-the-unified-creation-gesture) semantics; the sharp
> edge is gone.
>
> **Guardrails.** The retired band vocabulary (`fold`/`merge`) does not come back — only plain
> collapse. The *merged* level (fields inline on a node) stays **Phase 10** composed sugar,
> absent at substrate. Ghost portals render from their `is_ghost` tombstone entry (no doc cache).
> Owner legibility: surface the substrate `owner`/`anchor` columns so "what dies if I delete
> here" is visible.
>
> **Gate.** Revive the four Phase-9 `test.fixme` e2e entries that hinged on the type-node
> rendering policy (per [8c §8.5](Phase-8c.md#85-guard-and-test-hardening-review-7-8-9--low));
> add coverage for portal appearance/detach, move-owner, and two-tier delete; run the full
> battery. This closes the Phase 9.7 build — update the [§12 Forward](#12-forward) status and
> hand off to [Phase 10](Phase-10.md).

#### Stage C — build note (C1 landed; C2 partial — outline substrate merge landed, inline block folding remains)

Stage C ran as one session but decomposes into two increments along the seam the spikes
implied: enabling the portal gesture makes the outline show a row at its home **and** each
portal, which the old `(matrix_id, row_id)` DOM key collapses — so position-keying + ghost
rendering are prerequisites of the gesture (C1), while routing every loose cell through the
substrate renderer inline is genuinely separable (C2). **C1 is landed.** What it did and what
C2 inherits:

- **§9.6 sharp edge dissolved ([tag-queries.ts](../src/tags/tag-queries.ts)).** The host-matrix
  scope (`p.matrix_id = wsMatrixId`) is gone from `buildTagsForRowQuery` /
  `buildTagsForRowsQuery` (and the `wsMatrixId` param); the `promoted_nodes` join **stays** — it
  is what distinguishes a genuine tag aspect from other `kind='own'` edges (a loose own-child, a
  `view` block marker), whose target matrix has no promoted-node owner. Aspects on non-workspace
  nodes now surface and edit in place. Callers ([SubstrateRegion](../src/workspace/SubstrateRegion.tsx),
  [usePagedWorkspaceData](../src/workspace/usePagedWorkspaceData.ts), tags-plugin descriptor)
  updated; `tag-queries.test.ts` green.
- **Gestures wired end-to-end ([portal.ts](../src/core/portal.ts) → worker → client).** The
  Stage-A ops (`addPortal`/`removePortal`/`moveOwner`/`deleteHomeGhostingPortals`/
  `hardDeleteIncludingRefs`) are added to `MatrixOperationMap`
  ([matrix-types.ts](../src/core/matrix-types.ts)), the worker
  ([matrix-handler.ts](../src/core/worker/matrix-handler.ts)), and the client
  ([matrix-client.ts](../src/core/client/matrix-client.ts)) — thin passthrough over the existing
  update-hook/tables-visited invalidation (no new machinery, the firewall holds).
- **Position-keyed outline (`pk` = hex `global_lexkey`).**
  [usePagedWorkspaceData](../src/workspace/usePagedWorkspaceData.ts) now carries `pk` and
  `is_ghost` per row and **reconciles by `pk`** (home + portal appearances of one row are
  distinct store/DOM rows); [NavigationPanel](../src/workspace/NavigationPanel.tsx) keys focus/
  handle maps, drag-drop ([drag-drop.ts](../src/workspace/drag-drop.ts) `RowInfo.pk`), and the
  `data-row-ck` attribute by `pk`, and focuses freshly-inserted rows by the returned key's hex.
  The row *renderer* (the PM editors) is otherwise untouched — that is C2.
- **Ghost tombstones.** `buildPaginatedOutlineQuery` projects `is_ghost`; NavigationPanel renders
  an `is_ghost` row as a read-only "(deleted)" tombstone (`outline-row-ghost`) — no editor, no
  drag, no drill. **Subtlety worth carrying to C2:** the ghost guard must be a *reactive*
  accessor (`() => row.is_ghost === 1`), because the tombstone replaces the live portal
  appearance in place at the same `pk`, flipping `is_ghost` 0→1 on the same store row without
  changing its identity (a captured `const` never re-runs).
- **Substrate region ([SubstrateRegion.tsx](../src/workspace/SubstrateRegion.tsx)).** The three
  focus-panel bands unify into **one mode-dispatching component**, mounted in
  [FocusPanel](../src/workspace/FocusPanel.tsx): `loose` (owned aspects, absorbing the deleted
  `AspectBand` — per-cell editable `PropertyRow`s, grouped into same-schema blocks with a
  **coalesced** column header and an **owner-legibility** affix), plus the `RowGestureMenu`
  (portal / move-owner / detach / delete / confirmation-gated hard-delete). The `container`
  (`SubTableBand`/`TableFace`) and `view` (`QueryBand`) mode renderers are **composed** by
  SubstrateRegion rather than re-implemented — `TableFace` is itself the coalesced-grid rendering
  of a same-schema span, and both are load-bearing for the passing `focus-panel`/`query-band`
  e2e suites. **Deviation from the prompt** (which said render containers via `PropertyRow` and
  delete `SubTableBand`): keeping them avoids a large, risky rewrite of the most-tested panel and
  a UX regression at substrate; the full container→`PropertyRow` collapse folds into the C2
  outline merge.
- **Gate.** New `e2e/portals.spec.ts` (3 tests: portal appearance + non-destructive detach;
  move-owner relocates home + leaves a portal; two-tier delete = default-ghost vs.
  hard-delete-everywhere) — green. The four "`test.fixme`" entries the prompt names **no longer
  exist** in the e2e suite (removed in a prior phase); the type-node rendering policy is covered
  by the passing `tags.spec.ts` tests, so that gate item is satisfied. Full unit battery + format/
  lint/typecheck green.
- **C2 inherits:** route NavigationPanel's loose outline rows through the substrate renderer
  (every hydrated cell editable inline, not just the PM label; grid coalescing at outline scale);
  fold `view`/`container` block *content* inline via the Stage-B `gatherWindow` + the worker↔client
  gather RPC ([window-flatten.ts](../src/workspace/window-flatten.ts), deferred from Stage B);
  collapse `container` rendering to `PropertyRow`; surface the gestures on outline rows too. The
  `lazy` portal path stays off (v1); composed/`TableFace` fidelity is [Phase 10](Phase-10.md).

##### Stage C2 — build note (outline substrate merge + gestures landed; inline block folding landed — Phase 9.7 build complete)

C2 was split along the seam its own inheritance list implies: the **outline substrate merge**
(routing loose rows through the substrate renderer + gestures) is client-side and separable from
the **inline block folding** (the new worker↔client gather RPC). Both increments are now landed and
green — this closes the Phase 9.7 build. What landed:

- **Shared row gestures ([row-gestures.tsx](../src/workspace/row-gestures.tsx)).** `RowGestureMenu`
  / `OwnerAffix` / `CoalescedHeader` are extracted from the C1 `SubstrateRegion` so the focus-panel
  substrate region **and** the loose outline mount one implementation. `RowGestureMenu.host` is now
  optional: the position-anchored gestures (**portal** / **move-owner** / **detach**) render only
  when a row has a destination host; the target-only deletes (**default-ghost** / **hard-delete
  everywhere**, still confirmation-gated) always show. `SubstrateRegion` imports them unchanged.
- **Loose rows through the substrate renderer ([NavigationPanel.tsx](../src/workspace/NavigationPanel.tsx)).**
  A meshed cross-matrix loose row (its home a host in this matrix — the §9.5 boundary) now renders
  its **own non-label cells editable inline** via `OutlineCellStrip` (a per-field seamless
  `FieldEditor`, saving through `updateRow`). Editability is per-cell hydration computed uniformly —
  **the §9.6 sharp edge is gone in the outline too**, not only the focus panel; a meshed aspect row
  is no longer label-edit-only. `colCache` now loads columns for any cross-matrix row's matrix (not
  only owned-aspect matrixes); the row's data is already hydrated by the main multi-table gather.
- **Grid coalescing at outline scale (§3).** The first row of a contiguous same-matrix run hoists
  that run's field column names to one `CoalescedHeader`; a lone cross-matrix row is a run of one
  and still gets its header. Coalescing, not a mode — no new grid layout, substrate floor.
- **Gestures on every live outline row.** `RowGestureMenu` mounts per loose row (hover/focus-reveal,
  like the open-focus arrow); `host` = the row's own-parent position (`findParentRow`, falling back
  to the focus root), hidden at the top level; `target` = the row. Ghost tombstones get no menu.
- **Gate.** format / lint (0 errors) / typecheck clean; full unit battery green (815); **full e2e
  green (143)** — including `tags.spec.ts`'s heterogeneous-children cases (where the inline cell
  strip + coalesced header newly render over meshed `#task`/`#note` rows) and the `focus-panel`
  sub-table suite (unchanged — `SubTableBand`/`TableFace` kept, per below).
- **C2 remainder — inline block folding via the worker↔client gather RPC (landed).** A `view`
  block's *content* now folds inline into the loose outline at its marker's position via a new
  **gather subscription** — the count+slice flattener run worker-side against the live Database:
  - **The gather RPC.** A subscription-style worker message (`subscribeGather`/`unsubscribeGather`,
    keyed by the serialized spec — [sql-types.ts](../src/core/sql-types.ts)) carrying the outline
    scan params + the in-range block set. The worker
    ([gather-handler.ts](../src/core/worker/gather-handler.ts) → the pure, unit-testable
    [gather-flatten.ts](../src/workspace/gather-flatten.ts)) runs
    `computeSegments`/`sliceWindow`/`gatherWindow` over the requested window range and posts back
    the flattened rows **+ the flattened total**. It registers its tables-visited (union of
    `scroll_index` + `block_sources` + each block's source tables) with the existing update-hook
    flush ([sql-handler.ts](../src/core/worker/sql-handler.ts) `registerGatherRunner`), so writes
    re-run it — **no new invalidation machinery** (9.7b §1). The client mirrors `addObserver`
    ([sql-client.ts](../src/core/client/sql-client.ts) `addGatherObserver`).
  - **The materialized source is the *filtered* outline query.** `computeSegments`/`gatherWindow`
    take injectable `countGap`/`gatherMaterialized` ([window-flatten.ts](../src/workspace/window-flatten.ts));
    the gather supplies `buildOutlineCountQuery`/`buildPaginatedOutlineQuery` bounded to each
    marker-delimited gap via a new **`beforeKeyHex`** sub-range (focus scope, collapse, and
    `EXCLUDE_BLOCK_MARKERS` all preserved). So a **no-block** gather degenerates to today's single
    materialized slice — the hot path stays behaviour-identical (guarded in
    [gather-flatten.test.ts](../src/workspace/gather-flatten.test.ts)). The pure query builders were
    extracted to a worker-safe [outline-queries.ts](../src/workspace/outline-queries.ts) (re-exported
    from `workspace-plugin.ts`) so the worker doesn't pull in client code.
  - **Block discovery + paging.** [usePagedWorkspaceData](../src/workspace/usePagedWorkspaceData.ts)
    subscribes the in-range markers (`buildInRangeBlockMarkersQuery` over `block_sources ⋈
    scroll_index` within the focus scope), recognizes each (`recognizeUpdatableQuery` → the base
    matrix, so folded rows carry `(sourceMatrixId, id)` identity), and — **only when a block is in
    range** — rewires the window-range effect off the single `buildPaginatedOutlineQuery`
    subscription onto the gather RPC; the flattened total drives `totalWindows`. `pk`-keyed
    reconcile, `assignRenderKeys`, ghosts, and the hydration/aspect gathers are preserved (folded
    rows carry data inline and are excluded from the hydration gather). Unrecognized views stay
    focus-panel-only for v1 (no sound row identity to fold).
  - **Folded rows render through the substrate cell renderer.** A folded row is a cross-matrix
    substrate row — [NavigationPanel](../src/workspace/NavigationPanel.tsx) draws it through the same
    `OutlineCellStrip`/`CoalescedHeader` path as a meshed loose row (the `container`→`PropertyRow`
    collapse at substrate). It is **render-only** — no `own`-edge positions it (the firewall) — so the
    ownership gestures (portal/move-owner/detach) are suppressed on it. The `view` slice SQL was
    fixed to **append** `LIMIT/OFFSET` (not wrap in a subquery) so consecutive offset slices keep the
    view's order.
  - **Gate.** New [inline-block-fold.spec.ts](../../e2e/inline-block-fold.spec.ts) (2 e2e: a view
    block folds inline + updates live; a 120-row block folds correctly across the window-0/1
    boundary) and [gather-flatten.test.ts](../src/workspace/gather-flatten.test.ts) (3 unit: exact
    coverage in view order, straddling, no-block behaviour-identical) — with the Stage-B
    `window-flatten.test.ts` guards and `virtualizer-multiwindow.spec.ts` still green. Full battery:
    format / lint (0 errors) / typecheck clean, **818 unit**, **145 e2e**.

  Deferred as before: shared-container discovery (the `containerBlock` builder + gather `kind:
  'container'` exist and are guarded, but nothing mints a container marker yet — the additive path);
  nested blocks; the `lazy` portal path; composed/`TableFace` fidelity ([Phase 10](Phase-10.md)).
  **This closes the planned Phase 9.7 build.** Post-landing review surfaced one more correctness
  gap in what C2 shipped — [Stage C3](#stage-c3--folded-row-focus-and-drill-in-identity-landed), below —
  so the hand-off to [Phase 10](Phase-10.md) waits on it.

### Stage C3 — Folded-row focus and drill-in identity (landed)

> **Build Phase 9.7 — Stage C3: folded-row focus/drill-in identity.** Follow-up to Stage C2;
> **requires Stage C2 landed** (the gather RPC + folded rows exist). Narrow in surface area — one
> navigation path — but the fix has real design tension, so it gets its own focused session rather
> than a drive-by patch.
>
> **The bug.** A folded block row (a `view` block's content, gathered inline at its marker's
> position — [gather-flatten.ts](../src/workspace/gather-flatten.ts) `foldedKey`) carries a
> **synthetic** position key: the marker's key plus the row's offset within the block. This key does
> not exist in `scroll_index` — it positions nothing (the firewall: a gather mints no `own`-edges).
> [NavigationPanel](../src/workspace/NavigationPanel.tsx)'s "open focus" (`→`) button is not
> suppressed on folded rows (only the ownership gesture menu is, via `isBlockRow`), and passes this
> synthetic key straight through as `onOpenFocus`'s `key` →
> [FocusPanel](../src/workspace/FocusPanel.tsx)'s `rowKey` → the nested NavigationPanel's `rootKey`
> ([NavigationPanel.tsx:583-584](../src/workspace/NavigationPanel.tsx#L583)), which scopes the
> panel's **children** section. Since no real row has that key, the children list is always empty —
> even when the folded row has real owned children positioned elsewhere in the outline.
>
> **Reproduce directly off the demo subtree** (no console needed — [MatrixBrowser.tsx](../src/admin/MatrixBrowser.tsx)
> seeds this on purpose): under "9.1 Heterogeneous children," the first `#task` aspect (`status:
> in-progress`) owns a real child labelled *"A real child, homed on the task above…"*. That same
> task is folded again under "9.3/9.7 View block" (the view folds the whole Tasks matrix). Open the
> **folded** copy's focus panel (hover it under "View block," click `→`; it has no `⋯` gesture menu —
> that's how you tell it apart from the real one) — the children section shows the empty state
> ("Press Enter to create your first row"), not the real child. Opening the **real** copy's focus
> panel (under "9.1 Heterogeneous children") shows the child correctly — same underlying row, two
> different outcomes depending on which appearance you drilled in from.
>
> **Why this isn't a one-line fix — the "teleport" concern.** The obvious patch (look up the row's
> real `scroll_index` position by `(matrixId, rowId)` identity when opening focus from a folded row,
> instead of trusting the synthetic key) raises questions worth deciding deliberately, not
> discovering in production:
>
> - **No real position.** A folded row may have **no** home in `scroll_index` at all — e.g. a bare
>   data row inserted directly into its matrix, never given a tree position (exactly what
>   [inline-block-fold.spec.ts](../../e2e/inline-block-fold.spec.ts)'s `seedFoldedView` does on
>   purpose, "positioning them would make them appear both loose and folded"). The lookup must
>   degrade gracefully — legitimately empty children, not an error — and the UI should probably say
>   *why* (unhomed vs. "loading").
> - **Multiple real positions.** Ownership is single but position is plural (portals — [§5](#5-portals-and-refs-one-family-split-by-anchoring)).
>   A folded row's identity can resolve to a home **and** N portals. Which does "children" scope to?
>   All interleaved? Just the home? Does the user get to pick?
> - **Navigational legibility ("teleport").** The row rendered inline in one part of the tree (under
>   a `view` block, in whatever branch that block lives) may have its *real* position somewhere
>   structurally unrelated. Jumping there via `→` is a legitimate drill-in, but with no signal that
>   you left the branch you were reading — unlike a normal boundary-hop ([§9.5](Phase-9.md#95-boundary-hop--panel-stack)),
>   where the breadcrumb tracks a real lexkey-prefix ancestry the whole time. Does the folded row's
>   `→` need a distinct affordance/tooltip ("go to real position") vs. the plain boundary-hop arrow?
>   Does the breadcrumb need to show the discontinuity?
> - **Ghost interplay.** If the real position is itself a ghosted portal appearance (home deleted),
>   what should drilling in show?
>
> **Decided (this session).** Resolution happens lazily, on click, via a new server-side primitive
> (`resolveDrillInPosition` in `portal.ts`) rather than reusing the existing `onOpenRowRef`/
> `buildRowGlobalKeyQuery` path as-is — that path takes `result[0]` unconditionally and silently
> no-ops on zero rows, which would just relocate this bug, not fix it.
>
> - **No real position** ([§ zero-position](#stage-c3--folded-row-focus-and-drill-in-identity-landed)):
>   the drill-in arrow stays clickable (identity is real even without a position). If resolution
>   finds zero live positions, the focus panel still opens but renders a distinct, intentional empty
>   state ("not placed in the outline — no children to show here") and **disables child creation**
>   in that panel (there is no position to attach a new own-edge to).
> - **Multiple real positions:** prefer **home** (live, non-ghost) when it exists; else the
>   lowest-keyed live portal, deterministically. No "all interleaved" and no user-picker — deep-portal
>   materialization ([§ Stage A](#stage-a--data-layer-deep-portals--multi-location-scroll_index)) already
>   fans a node's owned children out to every live position, so home vs. portal shows equivalent
>   children; only the ancestry/breadcrumb differs, which isn't worth extra UI for v1. **Intentionally
>   provisional** — code comments at the tiebreak call this out so a future need (e.g. a node with no
>   home and several portals, where "lowest key" is surprising) can revisit with a real tiebreak or a
>   chooser, rather than rediscovering the gap silently.
> - **Navigational legibility:** lightweight only — the folded row's → tooltip changes to something
>   like "Open real position," and the opened focus panel shows a one-line header notice ("opened from
>   a folded view"). No breadcrumb-discontinuity rework: there's no existing precedent to extend, and a
>   full teleport-aware breadcrumb is disproportionate infrastructure for a narrow, occasional
>   interaction. **Also intentionally provisional** — flagged in code as the seam a real
>   discontinuity-aware breadcrumb would attach to, if drift/confusion reports justify it later.
> - **Ghost interplay:** folds into the zero-position case — a ghosted position is filtered out during
>   resolution and treated as absent, reusing the existing ghost precedent (ghosts already get no
>   drill-in elsewhere).
>
> **Orient first.** Read this section in full, then trace the path live using the repro above (or
> `git log`/this session's transcript) before touching code. Read
> [NavigationPanel.tsx](../src/workspace/NavigationPanel.tsx) (`onOpenFocus` wiring, the `isBlockRow`
> suppression precedent for the gesture menu), [FocusPanel.tsx](../src/workspace/FocusPanel.tsx)
> (`rowKey`/`rootKey` — its only consumer is the nested NavigationPanel's children list),
> [gather-flatten.ts](../src/workspace/gather-flatten.ts) (`foldedKey`), and
> [scroll-index.ts](../src/core/scroll-index.ts) (`positionsOf` — the Stage-A primitive that already
> enumerates a node's real positions; likely the lookup's foundation).
>
> **Decide, then build.** Resolve the open questions above (a short design note is fine — this
> doesn't need another spike), then wire the chosen behavior. At minimum: a folded row with exactly
> one real position drills in correctly; a folded row with zero real positions shows an
> intentional, legible empty state (not today's silent, indistinguishable-from-a-bug one); the
> firewall holds (still no `own`-edges minted by any part of this fix).
>
> **Gate.** Add e2e coverage for the repro above (folded row with a real child → children show after
> drill-in) plus the zero-position and multi-position cases; run the full battery. Update this
> section's status to landed and fold the outcome into [§12 Forward](#12-forward).

#### Stage C3 — build note (landed)

Fixed per the "Decided (this session)" note above. What landed:

- **Resolution primitive ([portal.ts](../src/core/portal.ts) `resolveDrillInPosition`).** Prefers
  the home (via the existing, now-exported-in-spirit `homeKeyOf` walk) when it's live; else the
  lowest-keyed live portal appearance (from `positionsOf`, filtering out `is_ghost` positions); else
  `null`. Ghost interplay folds into the zero-position case — a ghosted position is filtered out,
  not treated as a resolvable target. Unit-tested in
  [portal.test.ts](../src/core/portal.test.ts) (7 new cases: home-only, home-preferred-over-portal,
  every-portal-ghosted-with-the-home → `null`, no-home-multi-portal lowest-key tiebreak, and a bare
  data row with no position at all).
- **Wired op ([matrix-types.ts](../src/core/matrix-types.ts) / `matrix-handler.ts` /
  `matrix-client.ts`).** `resolveDrillInPosition` follows the same thin-passthrough op pattern as the
  Stage-A/C1 portal ops — no new invalidation machinery (it's a one-shot read, not a subscription).
- **Client wiring.** `NavigationPanel`'s `onOpenFocus` (both the keyboard callback and the arrow
  button) branches on `row.is_block_row`: a folded row calls a new `onOpenFoldedFocus(matrixId,
  rowId)` prop instead of passing its synthetic key. `StreamView.openFoldedFocusAt` (mirroring the
  existing `openRowRefAt`, which the naive reuse would have inherited the same-result-only /
  no-op-on-zero bug from) calls the client op and appends a focus panel tagged `foldedOrigin` (and
  `unresolvedPosition` when resolution comes back `null`). `FocusPanel` shows a one-line "opened from
  a folded view" notice on `foldedOrigin`, and — when `unresolvedPosition` — renders a distinct
  `focus-no-position` empty state instead of mounting the nested `NavigationPanel` at all (so there
  is no dangling child-creation UI scoped to a non-existent position), rather than the generic
  `focus-no-children` state.
- **Gate.** New [folded-row-drill-in.spec.ts](../../e2e/folded-row-drill-in.spec.ts) (3 e2e: a real
  positioned child shows after drill-in; a zero-position folded row shows the distinct empty state;
  a folded row with both a home and a portal resolves to the home) — green, alongside the full
  battery: format / lint (0 errors) / typecheck clean, **823 unit**, **151 e2e**.
- **Intentionally provisional, flagged in code for later evolution (not built now):** the no-home
  multi-portal tiebreak (`resolveDrillInPosition`'s "lowest key" pick) and the lack of a
  discontinuity-aware breadcrumb (the `foldedOrigin` notice is a one-liner, not a structural
  breadcrumb signal) — both noted at their call sites as seams a future increment can revisit if
  real usage shows the provisional choice is insufficient.

**This closes the Phase 9.7 build in full**, including the post-landing correctness gap. Hand-off to
[Phase 10](Phase-10.md) is final.
