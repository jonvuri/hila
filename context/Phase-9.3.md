# Phase 9.3 — Embedded collections & live views: bands as queries, write-back as anchoring

> Deep-dive for [Phase 9 §9.3](Phase-9.md). A design session worked through what a
> node-scoped "live view" actually is, where write-back can come from, and why the
> structured query-builder we first reached for does not earn its keep. The result
> is a sharper model: **query bands are SQL-first; structure follows anchoring, not
> authoring.** It honors the [Phase 8](Phase-8.md)/[8b](Phase-8b.md)/[8c](Phase-8c.md)
> ownership spine, the [Phase 9.2](Phase-9.2.md) bands model, and the development
> principles (incremental/intentional, gestalt-aware, single-frame perf).

## The reframing

[Phase 9.2](Phase-9.2.md) established the organizing primitive: a focal node renders
a stack of **bands**, each `band = (query, face, integration-level)`. §9.3 is the
**band-as-query** case. It covers two kinds the original §9.3 bullet bundled together:

- **Owned-collection bands (anchored).** A node's own set of a shared type — "this
  project's `#task`s." The band's defining relation *is* ownership by the node
  (`own`-edges into the type's matrix). This is the [aspect band](Phase-9.2.md#the-integration-continuum-presentation)
  generalized to the collection grain; its "add" gesture is [§9.6](Phase-9.md#96-the-unified-creation-gesture).
- **Query-binding bands (unanchored).** A live view — "all `#task`s whose host is in
  this subtree." The rows are **foreign**: owned by various hosts, not by the focal
  node. No tether, a `query:` header, cannot mesh ([Phase 9.2](Phase-9.2.md#anchoring-gates-the-continuum)).

Net-new engineering in §9.3 is the **query-binding** path. The anchored side is
largely already realized by the aspect band plus the §9.6 add gesture; §9.3 only
formalizes it as a persisted band later (see [The bands table](#the-bands-table)).

## Structure follows anchoring (the organizing principle)

The pivotal result of the session: **write-back decomposes into two orthogonal axes,
governed by different things.**

| Capability | Governed by | Applies when |
| --- | --- | --- |
| **Update** (edit existing cells) | **query provenance** (a recognizer over the SQL) | any recognized-updatable query — anchored or not |
| **Insert** (create a row) | **band anchoring** (an authored `own`-edge target) | only anchored bands (owned collections / sub-tables) |

The reason insert is gated by anchoring is an invariant worth stating plainly:

> **Ownership is an input to queries, never an output of them.** Derivation flows one
> way: authored `own`-edges (`joins`) → `closure`/`scroll_index` → query results.
> Never the reverse.

If ownership were an *effect* of a query result, editing the query (adding a join,
loosening a filter) would silently change what is owned — hence change cascade-delete
reach. You would get deletes rippling from query edits, ownership flickering as
unrelated data changes, and overlapping bands each "claiming" the same row (violating
single-owner). A read cannot mint a cause. Therefore an `own`-edge can only be created
against an **explicitly authored anchor** — the node an anchored band declares it owns
for. An unanchored query has no such anchor, so it *structurally cannot* node-insert.
(The most a query band could do is insert a hostless row into the type's matrix —
owned by the **type-node** per [8c §5](Phase-8c.md), a fixed authored owner — which is
really an insert into the *type-node's* collection, a different band, and one that
usually would not even satisfy the query's filter.)

So **node-scoped insert is reassigned out of query bands entirely** — it lives with
anchored bands ([§9.4](Phase-9.md#94-dedicated-sub-table-embedding) /
[§9.6](Phase-9.md#96-the-unified-creation-gesture)), realized by `createDependentRow`
(an `own`-edge from the node to a new aspect row). This extends the [9.2 rule set](Phase-9.2.md#anchoring-gates-the-continuum)
cleanly: unanchored bands already cannot mesh and cannot merge; now also **cannot
node-insert**, all for the same single reason — the rows are not owned by the node.

## Query bands are SQL-first

The structured query-builder we first reached for (pick type + scope + filters,
compiled to SQL) was load-bearing only for *insert* ("a node-scoped query has an
obvious place to insert"). Once insert moves to anchored bands, the builder's residual
justifications are all either ergonomic, available to SQL too, or have only speculative
near-term consumers. So for query bands we commit **SQL-first** and drop the structured
spec for v1.

This is the [composed-vs-substrate fidelity axis](Phase-9.2.md#composed-vs-substrate-fidelity-and-x-ray)
applied to query *authoring*: a structured spec is *composed*; raw SQL over the real
logical tables is *substrate*. Going SQL-first means query bands are authored at the
substrate and rendered composed (a schema-adaptive result, not raw rows).

What this buys and costs:

- **Expressiveness is unbounded immediately.** A query band composes the user's
  matrixes with the app's logical tables (`joins`, `closure`, `matrix`,
  `promoted_nodes`, `scroll_index`) with no builder ceiling. Reads already work: the
  reactive layer subscribes by SQL string and invalidates by tables-visited, so an
  arbitrary `SELECT` is a first-class live query today (`src/sql/useQuery.ts`).
- **Common shapes ship as snippets, not a builder.** The motivating "type T in this
  subtree" is a snippet that inserts SQL composing the type's `own`-edges (cf.
  `buildTaggedRowsQuery` / `buildTagInstancesQuery` in `src/tags/tag-queries.ts`) with
  a `closure` scope. **Closure caveat:** `closure` starts at depth 1 (no self-pairs,
  `src/core/closure.ts`), so "in this subtree" scope = `{node} ∪ descendants(node)` —
  the snippet must union the node's own direct hosts with its closure descendants.
- **The cost is power-user surface**, which is acceptable here: cross-subtree live
  views are inherently a power feature, not the outlining floor. A structured authoring
  layer can be added *later* if a concrete consumer appears (accessibility demand,
  migration, a footgun incident) — and it would compile to the same SQL, so SQL-first
  does not foreclose it.

**Deferred (not built now):** the structured query spec; a `shape` provenance tag on
bands (introspectability hedge for future migration — we are pre-release and add no
speculative metadata); rename-safety via `{{columnId}}` templating in band SQL (the
mechanism exists as `compileFaceQuery`, but is not wired for bands yet).

## Write-back: two tiers and the recognizer

Query bands have exactly two write tiers (insert is not among them — it is anchored-only):

1. **Recognized SQL → editable cells.** The query passes a recognizer; its passthrough
   columns become editable, writing through the existing `updateRow(matrixId, rowId, col)`.
2. **Arbitrary SQL → read-only.** Everything else. The safe default (the substrate floor).

### The recognizer

General view updatability is ambiguous/undecidable for arbitrary SQL (joins,
aggregates, unions can map one output edit to zero or many base edits). So we do not
*decide* it — we build a **sound recognizer**: accept a well-defined updatable subset,
reject everything else, **no false positives**. This is the classic *view-update
problem*, and the conservative subset is the one JDBC "updatable result sets" and the
SQL-standard "updatable view" rules already formalize.

Mechanism (preferred, semantic): SQLite's **`sqlite3_column_origin_name()` /
`_table_name()`** (compiled with `SQLITE_ENABLE_COLUMN_METADATA`) report, per result
column, the exact base `(table, column)` it came from — or **NULL** for an expression /
aggregate / literal / formula. The engine resolves aliases and `*`-expansion for you.
So:

- A cell is **writable ⟺ its column has a non-NULL origin** (a direct passthrough to an
  addressable base column). Formula/computed cells self-identify as read-only. The
  granularity is **per column** — a result can be partially editable (passthrough cells
  light up, derived cells do not).
- Origin gives `(table, column)` but **not the row's identity**. Fix: ensure each
  contributing base table's primary key (`id`) is in the projection (inject/alias it),
  so each editable cell resolves to `(base table, base pk value, base column)` →
  straight into `updateRow`. Identity already rides the app's `(matrix_id, row_id)`
  keying, so the reactive layer is unaffected.
- Combine with a small AST structural gate that rejects set-reducing/compound shapes
  (`GROUP BY` / `DISTINCT` / aggregate / `UNION`) up front — sound by construction.

Boundaries:

- **Update-only.** The recognizer never yields insert: an updatable `SELECT` does not
  say what a *new* row must contain to appear, and a node-scoped insert must also create
  the node `own`-edge — app semantics absent from the query text. Insert stays anchored.
- **Single base table for v1.** "Rows of type T scoped by closure" is single-table.
  Key-preserving joins (Oracle's "key-preserved table" notion) need uniqueness/constraint
  reasoning that is more than v1 warrants; widen later.

**Prerequisite spike:** confirm the **sqlite-wasm build ships `SQLITE_ENABLE_COLUMN_METADATA`**.
If present, the recognizer is small and robust. If absent, write-back falls back to pure
AST parsing (fixed SQLite dialect over *known* logical tables — tractable, but you
reimplement name resolution and lose per-column robustness). Run this ~30-minute check
at the tail of Session 1, before committing Session 2's shape.

## The bands table

Persistence is a dedicated **`bands` table** keyed by `(matrix_id, row_id)` (the focal
node) — chosen over reusing face-config (which conflates "how to render a matrix" with
"which rows + where they integrate," and is not N-per-node-keyed) and over a JSON column
on the node (which repeats the [column-locality](Phase-8c.md#6-the-promotion-taxonomy)
smell own-matrixes exist to avoid, and is invisible to SQL/invalidation). A band carries
its own provenance, which the model requires: roughly

```
band = (id, focal (matrix_id, row_id), sql, face, integration, order)
```

Decisions:

- **Local-only for now.** Bands are *not* synced this phase — treated as local view
  state, consistent with not building ahead of need pre-release. This leaves a "bands
  do not sync" special case to resolve when multi-device matters; the table is
  source-of-truth in shape, so promoting it to synced later (like `joins` /
  `promoted_nodes`) is additive.
- **Renderer is schema-adaptive, not `TableFace`.** Arbitrary SQL returns heterogeneous
  columns, so the band renders through the [9.2 schema-adaptive renderer](Phase-9.2.md#the-schema-adaptive-row-renderer)
  (`src/shared/PropertyRow.tsx`, the aspect-band precedent) — not the matrix-bound
  `TableFace`, whose homogeneous-matrix + own-config shape belongs to
  [§9.4](Phase-9.md#94-dedicated-sub-table-embedding). `TableFace` generalization is
  explicitly out of §9.3.
- **Bands table starts by persisting query-binding bands.** Folding the (currently
  live-derived) aspect/owned-collection bands into the same table is the 9.2 "one table
  backs all bands" unification — a real coherence pull, but deferred; do not migrate the
  aspect band now.

## Build plan

Split along the seam that separates **read-correctness from write-soundness** — they
have different risk profiles, and coupling them lets a write bug block read validation.

- **Session 1 — read slice.** The `bands` table + persistence (local-only); the
  `QueryBand` component (run its SQL via `useQuery`, render the result set through the
  schema-adaptive renderer, `query:` header) mounted in `FocusPanel` like `AspectBand`;
  a minimal authoring affordance (a raw SQL box + one "in this subtree" snippet).
  Deliverable: attach a live SQL view to a node, persisted, rendered live, **read-only**.
  End with the `SQLITE_ENABLE_COLUMN_METADATA` spike.
- **Session 2 — recognized-SQL write-back.** The recognizer (column-origin metadata +
  AST structural gate + PK injection) and the output-cell→`updateRow` mapping, plugged
  into Session 1's rendered bands. Soundness-critical; gets a dedicated test battery so a
  recognizer bug cannot destabilize the read path.
- **Session 3 (later) — authoring polish.** The schema-aware SQL editor (logical-table
  palette, column autocomplete, more snippets). *Not* `TableFace` generalization (→ §9.4).

Each session ends with the standard gate (format, lint, typecheck, unit, e2e).

## Mapping onto Phase 9

- **§9.3 owned-collection bands** = anchored bands; update + **insert** via ownership
  (`createDependentRow`); structured-by-nature (an ownership declaration, not authored
  SQL); insert shared with [§9.6](Phase-9.md#96-the-unified-creation-gesture).
- **§9.3 query-binding bands** = unanchored; **SQL-first**; read + recognized-cell-update;
  never node-insert. The net-new engineering above.
- **[§9.4](Phase-9.md#94-dedicated-sub-table-embedding)** = the `TableFace`-bound band
  (homogeneous own-matrix); inherits node-scoped insert as an anchored band.
- **[§9.6](Phase-9.md#96-the-unified-creation-gesture)** = the add gesture that creates
  anchored collections — the insert UX the query-band path delegates to.

## Open questions / deferred

- **Bands sync** — promote `bands` to synced source-of-truth when multi-device matters.
- **Key-preserving joins** in the recognizer (widen past single-base-table updatability).
- **Structured authoring layer** — add only when a concrete consumer appears; it compiles
  to the same SQL.
- **Unifying the aspect band into the `bands` table** (the "one table backs all bands"
  pull from 9.2).
- **AST-parsing fallback** scope, *iff* the `SQLITE_ENABLE_COLUMN_METADATA` spike fails.
