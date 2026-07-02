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
> **Status:** design converged; not yet implemented. Both gating spikes are complete —
> [deep-portal materialization](Phase-9.7a.md) (GO, deep-in-v1) and
> [windowing/height-variance perf](Phase-9.7b.md) (GO, count+slice with no per-row dynamic
> offsets for v1) — and [Phase 9.7c](Phase-9.7c-reconciliation.md) (doc reconciliation) is
> **done**, leaving **the build proper**: three staged sessions with ready-to-run handoff
> prompts in [§13](#13-the-build-proper--implementation-prompts). Composed fidelity and the
> merged level remain [Phase 10](Phase-10.md).

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
   A (data layer / portals), B (block markers + count+slice windowing), C (renderer unification
   + gestures).
6. **Phase 10** — composed fidelity (bullets, the merged level, drawn tethers, pretty grids)
   over the substrate floor.

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
