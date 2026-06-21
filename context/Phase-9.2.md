# Phase 9.2 — The property surface, generalized: bands, anchoring, and the substrate

> Deep-dive for [Phase 9 §9.2](Phase-9.md). What began as "render an aspect row's
> fields next to a node" turned out to be a special case of a general problem:
> **a focal node is a lens around which multiple related row-sets are composed.**
> This doc captures the model that generalizes 9.2 and feeds 9.1, 9.3, 9.4, and
> 9.5. It honors the [Phase 8](Phase-8.md)/[8c](Phase-8c.md) ownership spine and the
> development principles (incremental/intentional, gestalt-aware, single-frame perf).

## The reframing

The original 9.2 framing ("intrinsic columns ∪ 0/1 owned aspect fields") and the
recurring "group aspect rows at the top vs. let them reorder freely in the outline"
dilemma both dissolve once you stop solving for *aspect rows specifically* and solve
for **listings of rows related to the focal node**, described by two structural axes
plus a presentation continuum.

### Two structural axes (data)

- **Source / query** — *which rows are in the set* (the `WHERE`). Endpoints we have
  today: the workspace outline (own-edges within the workspace matrix), `own`-joins
  (aspect rows / sub-matrix rows), and node-scoped queries (live views, §9.3).
  Source picks the **query**.
- **Schema** — homogeneous-with-the-focus (same matrix → shared columns) vs.
  heterogeneous (different schema, no common column vector). Schema picks the
  **face vocabulary**: homogeneous sets admit grid/board faces; heterogeneous sets
  want the outline face (per-row, schema-adaptive) or a group-by-type set of mini-grids.

These two axes place our existing concepts without special-casing:

|                   | outline-source                        | own-join / query                      |
| ----------------- | ------------------------------------- | ------------------------------------- |
| **homogeneous**   | ordinary outline children             | embedded collection / sub-table (§9.4) |
| **heterogeneous** | cross-matrix interleaved children (§9.1) | aspect rows (§9.2)                  |

### The dropped axis: cardinality

Cardinality (1 vs. N owned aspects) is **not** a structural property and is dropped as
an axis. The join table allows a host to emit N `own`-joins while each target has at
most one owner ([Traits.md — Join kinds](./Traits.md#join-kinds)); "1 vs. N" is just a
count per query. Even the "merge fields into the focal node" case can be plural: a node
whose prose says "…then #task email the vendor and #task file the report" owns *two*
prose-anchored aspects. Merging is never licensed by cardinality — it's licensed by
**anchoring + a presentation choice**. Cardinality becomes a free rendering variable.

## Anchoring (the data axis that drives the visuals)

What the group-vs-reorder dilemma was *really* about is **where the edge's source of
truth lives** — call it *anchoring*. It is independent of presentation and it has a
literal geometric reading: if the edge were a visible line from the focal node to the
related row, **where does the line terminate?**

| Tier            | Source of truth                                          | Edge-line geometry              | Reparent cost                                            |
| --------------- | ------------------------------------------------------- | ------------------------------- | ------------------------------------------------------- |
| **unanchored**  | none — a node-scoped query; rows are foreign            | no line                         | meaningless (you edit the *query*, not an edge)         |
| **structural**  | a structural table (rank/closure/join) or an FK cell    | stops at the node's border      | pure structural write; **no node's prose changes**      |
| **content**     | an `own`-join materialized from an inline `#`-ref in prose | crosses the border, terminates *on the token* | the token sits in human prose that may be phrased around it |

Tiers `structural` and `content` are *both* `kind = 'own'` joins — the data layer does
not distinguish them by `kind`. They differ only in whether the join is a **materialized
index of a relationship encoded in rich text** vs. a **structural source of truth**
([Traits.md — Semantics](./Traits.md#semantics), and rule 2 of
[Lifecycle rules](./Traits.md#lifecycle-rules): deleting the inline `#` removes the
`own` join and cascades the target).

**Anchoring is not "edge strength."** It does not forbid moves. A content-anchored
aspect is *mechanically* re-parentable — splice the inline ref out of the source prose
and either splice it into a destination with a `content`-role column or leave the row as
a plain-owned aspect awaiting a new ref. What makes the content tier distinct is only
that **its anchor is embedded in prose that may be phrased around it**, so the splice
carries a prose-coherence judgment the system cannot make. That is a *human* judgment,
not a mechanical obstacle.

## The integration continuum (presentation)

Orthogonal to anchoring, any related set sits somewhere on a presentation continuum of
how integrated it is with the focal node:

1. **Merged** — a bound record's fields render as inline properties *of the focal node*
   (this is the original 9.2 "property surface": intrinsic columns ∪ the owned aspect's
   hydrated fields, shown as one row). Revealed in the substrate (below) for what it
   actually is: a left-join `host ⋈ aspect` on the own-edge — a *presentational* join,
   not a data fusion.
2. **Banded** — a labeled section with its own face (the aspect block; an embedded
   collection; a sub-table).
3. **Meshed** — interleaved into the outline as ordinary siblings, freely reorderable.

The group-vs-reorder dilemma is just *banded* (clarity, predictable gestures, table
affordances) vs. *meshed* (composability, emergent structure). **It is resolved by not
deciding globally:** default owned aspects to *banded* (matches their content/structural
anchoring and gives clean sort/drag affordances), and let the user **fold/unfold/merge**
to move along the continuum. The capability exists; the default is just one point on it.

### Anchoring gates the continuum

The two are orthogonal but anchoring **constrains** which presentations are valid:

- An **unanchored** (query) set cannot *mesh* into the focal node's owned order and
  cannot *merge* as editable properties of *this* node — its rows aren't owned by it. It
  can only sit *banded*.
- A **content-anchored** set can be merged, banded, or meshed — but banding/meshing
  moves the rendered row away from its prose anchor, so it requires a **tether**.

This yields a falsifiable rule for when a tether is drawn:

> **tether needed ⇔ (content-anchored) ∧ (not merged)**

The tether is the **reconciliation device** between a content anchor and a non-merged
position. When merged, the fields already sit beside the prose, so no tether is needed.
Its endpoint depth *is* the anchoring tier (no line / border / into-the-token).

## Bands — the organizing primitive

Generalize the stream view: a focal node renders as a vertical stack of **bands**, each

```
band = (query, face, integration-level)
```

The outline children are a band (outline face). Owned aspects are a band. An embedded
collection is a band. Same primitive, different query/face/integration. This **unifies
9.2 / 9.3 / 9.4** under one model: the aspect band (9.2), live query bands (9.3), and
sub-table bands (9.4) are the same thing with different coordinates on the two axes.

A band must **carry its own provenance** (its defining query, face, and integration
level) — see the substrate section for why this is a hard requirement, not a nicety.

### Fold / merge

Folding moves a band along the integration continuum; merging unions two bands into one
face instance with one sort order. **Merge-ability is gated by anchoring + face
compatibility:** only structurally- or content-anchored bands can mesh/merge into the
focal node's owned order (they share an *anchor domain*); query bands can be visually
unioned but never reordered into the owned order. Two bands can merge into one face when
their schemas are compatible for that face (e.g. heterogeneous rows under the outline
face — the §9.1 case) or share a column vector (homogeneous, under a grid face).

*(Open: the exact fold/merge gesture vocabulary and how compatibility is surfaced — see
Open sub-questions.)*

### Move-from-anchor (instead of dialogs)

Reparenting reduces to **editing the anchor wherever it lives** — no modal prompt:

- **Structural anchor** → drag the row/bullet (a structural gesture). Reorder within a
  band is always fine (it doesn't change the parent).
- **Content anchor** → manipulate the `#`-token in the text: cut/paste/delete the tag
  phrase and the aspect goes with it (the join is the materialized index of that token).
  The tag *is* the handle; the banded/meshed row is a projection of it. Cross-node moves
  for content-anchored aspects route through the text, which is correct because that is
  exactly the operation that carries the prose-coherence judgment.

Initial scope: make tag-token operations (copy / paste / delete, carried together with
surrounding text) the primary change+movement gesture set for content-anchored aspects.

## The schema-adaptive row renderer

A single renderer produces every multi-field row presentation. Its signature has two
orthogonal environment/data axes:

```
render(row, columns, density, fidelity)
```

- **density** — environmental: wide / narrow / compact (panel width, container type).
- **fidelity** — explicitness: **composed** (structure suggested) / **substrate**
  (structure spelled out). Orthogonal to density — there is a narrow-substrate and a
  wide-composed.

It adapts to the row's **schema via column roles** (the existing `role: 'label' |
'content' | null`; [Plan.md resolved decision #5](Plan.md), Phase 6): the label-role
column becomes the title/bullet in composed mode and a `[label]`-chipped cell in
substrate; the content-role column becomes the prose body vs. a `[content]`-chipped
cell; role-less columns are plain fields/cells. The same renderer serves aspect-band
rows, §9.1 heterogeneous outline children, table-face cells, and compact navigation
previews — so "inline heterogeneous multi-column display" is solved once.

The `AspectRowPrototype` Storybook story explored the composed corner of this renderer
(stacked / inline / labels-aligned across wide/narrow). "Stacked + per-field (wide)" and
"narrow + labels-aligned" are the two density points that read best; they are the seed
of the composed renderer.

## Composed vs. substrate (fidelity), and x-ray

The "fluid vs. brutalist" distinction is **fidelity**, the axis above. Naming:

- **composed** — the default; structure suggested, optimized for fluid viewing/editing.
- **substrate** — the bare labeled grid: explicit row borders, column names (per-cell or
  a shared header), role chips, and visible relationship metadata (anchoring, own-edge
  kind, view mode). Rich text still editable via an expanding cell / popup. Outline
  hierarchy still shown with indentation (a legitimate tabular idiom); only at the
  deepest x-ray are `depth`/Lexorank-key surfaced as explicit columns. The overlaid-cards
  panel stack renders as a breadcrumb of `(matrix_id, row_id)` pairs.
- **x-ray** — a global toggle that forces substrate at every granularity (cell / row /
  band / focus column / workspace) at once. The debugging/inspector view.

Fidelity applies at any granularity and **cascades** down a scope unless overridden
finer (like an inherited property): x-ray sets it at the workspace root; a local inspect
overrides it at one node/cell.

### The substrate is the identity face, generalized — and a conformance test

The substrate is the **identity face** ([Architecture.md — Identity face](./Architecture.md#identity-face))
lifted from "a per-matrix table view" to "a fidelity available at any granularity." It is
the *degenerate* face: every column binds to a labeled cell, and *all* relationship
metadata is shown. That makes it the most valuable architectural tool we have:

> Any datum the substrate cannot display is a hole in the model. "Does it x-ray cleanly?"
> is a standing acceptance check for every Phase 9 surface.

Concretely: the substrate forces a band to be able to print its own `query`/`face`/
`integration`; it reveals *merged* as a left-join (so merge semantics survive being shown
literally); it renders anchoring as an `anchor: prose@… / structural / query` label that
is the textual twin of the tether geometry; and it gives §9.5 a **universal drill-in
fallback** — when an attachment declares no preferred face, you land in the substrate,
which partially answers [Plan.md open question #5](Plan.md) (face affinity) for free.

## Mapping onto Phase 9

- **§9.1 heterogeneous children** = a *meshed* band with the outline face; meshing is
  gated by anchoring.
- **§9.2 property surface** = the *merged* level (intrinsic ∪ content-anchored aspect
  fields) **plus** the *aspect band* + the schema-adaptive renderer + the tether. The
  "0/1" cardinality language is dropped.
- **§9.3 embedded collections / live views** = *query bands* (unanchored): no tether, a
  `query:` header, cannot mesh.
- **§9.4 sub-table embedding** = a band with the table face — the composed cousin of the
  substrate.
- **§9.5 panel stack** = keyed by `(matrix_id, row_id)`; the breadcrumb is its substrate
  rendering; substrate-as-fallback contributes to resolving face affinity (#5).

## Implementation status

**Built / shipped (§9.2 done criteria met):**

- **Column roles** (`role: 'label' | 'content' | null`) already existed in the data layer
  (migration, unique-per-role index, `setColumnRole`); the renderer relies on them.
- **Schema-adaptive renderer** — `src/shared/PropertyRow.tsx`, role-aware partition
  (`partitionPropertyColumns` in `src/shared/property-surface.ts`), wide + narrow density,
  always-live seamless `FieldEditor` inputs (no display/edit toggle). Design corners
  prototyped in `src/design/outline/AspectRowPrototype.stories.tsx`.
- **Aspect band (banded level)** — `src/workspace/AspectBand.tsx`: owned aspects grouped
  into contiguous type blocks with type-badge bullets, edited in place via the renderer;
  mounted in the focus panel between the node body and the children nav panel.
- **Compact navigation-row previews** — restored in `src/workspace/NavigationPanel.tsx`
  as the nav-panel tier, fed by the retained gather spine (`aspectsByHostCk` /
  `getHydratedData`) and sharing `buildAspectPreview` key-field logic with the band.
- **Content-anchored tether (hover bridge)** — `src/editor/aspect-tether.ts` (shared
  module-scoped hover signal), wired into the inline badge (`InlineRefView`, lit via
  `.inlineref-tethered`) and the band row; the band marks content-anchored rows with a
  tether indicator. `FocusPanel` derives the content-anchored set from the node's prose
  via `extractInlineRefsFromJson` (`src/editor/inlineref-sync.ts`).

**Retired** (pre-band ad-hoc treatment, superseded): the focus-panel collapsible aspect
groups (`AspectPropertyGroup`). The intrinsic half of the property surface (overflow
columns via `FieldEditor`) is kept.

**Deferred past §9.2** (to later sub-phases, not blockers): the **merged** integration
level (intrinsic ∪ aspect fields as one row — we default to banded); the **add** gesture
for new aspects (leans into §9.6); **substrate / x-ray** fidelity and **fold/merge** (later);
a drawn-line tether (the hover-highlight bridge is v1).

## Open sub-questions

- **Fold/merge gesture vocabulary.** The exact gestures for fold/unfold/merge and how
  compatibility (anchor domain + face) is surfaced to the user.
- **Within-band ordering of multiple content-anchored aspects** (two `#task`s in one
  node): mirror prose order, or carry an independent rank? Deferred.
- **A `ref` column role.** Roles today are `label`/`content`/null; the substrate's role
  chips and the renderer may eventually want an explicit `ref` role. Not needed yet.
