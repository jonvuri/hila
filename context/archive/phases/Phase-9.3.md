# Phase 9.3 — Embedded collections & live views: bands as queries, write-back as anchoring

> Deep-dive for [Phase 9 §9.3](Phase-9.md). A design session worked through what a
> node-scoped "live view" actually is, where write-back can come from, and why the
> structured query-builder we first reached for does not earn its keep. The result
> is a sharper model: **query bands are SQL-first; structure follows anchoring, not
> authoring.** It honors the [Phase 8](Phase-8.md)/[8b](Phase-8b.md)/[8c](Phase-8c.md)
> ownership spine, the [Phase 9.2](Phase-9.2.md) bands model, and the development
> principles (incremental/intentional, gestalt-aware, single-frame perf).
>
> **Status (post-[9.7](Phase-9.7.md)):** the query band is now the **`view` child-sourcing
> mode**; the [`bands` table is removed](#the-bands-table) and per-band mounts give way to
> [count + slice windowing](Phase-9.7b.md). Read this doc as the `view` mode's design
> lineage; the built model is [Phase 9.7](Phase-9.7.md).

## The reframing

[Phase 9.2](Phase-9.2.md) established the organizing primitive: a focal node renders
a stack of **bands**, each `band = (query, face, integration-level)`. §9.3 is the
**band-as-query** case. It covers two kinds the original §9.3 bullet bundled together:

- **Owned-collection bands (anchored).** A node's own set of a shared type — "this
  project's `#task`s." The band's defining relation _is_ ownership by the node
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

| Capability                       | Governed by                                        | Applies when                                         |
| -------------------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| **Update** (edit existing cells) | **query provenance** (a recognizer over the SQL)   | any recognized-updatable query — anchored or not     |
| **Insert** (create a row)        | **band anchoring** (an authored `own`-edge target) | only anchored bands (owned collections / sub-tables) |

The reason insert is gated by anchoring is an invariant worth stating plainly:

> **Ownership is an input to queries, never an output of them.** Derivation flows one
> way: authored `own`-edges (`joins`) → `closure`/`scroll_index` → query results.
> Never the reverse.

If ownership were an _effect_ of a query result, editing the query (adding a join,
loosening a filter) would silently change what is owned — hence change cascade-delete
reach. You would get deletes rippling from query edits, ownership flickering as
unrelated data changes, and overlapping bands each "claiming" the same row (violating
single-owner). A read cannot mint a cause. Therefore an `own`-edge can only be created
against an **explicitly authored anchor** — the node an anchored band declares it owns
for. An unanchored query has no such anchor, so it _structurally cannot_ node-insert.
(The most a query band could do is insert a hostless row into the type's matrix —
owned by the **type-node** per [8c §5](Phase-8c.md), a fixed authored owner — which is
really an insert into the _type-node's_ collection, a different band, and one that
usually would not even satisfy the query's filter.)

So **node-scoped insert is reassigned out of query bands entirely** — it lives with
anchored bands ([§9.4](Phase-9.md#94-dedicated-sub-table-embedding) /
[§9.6](Phase-9.md#96-the-unified-creation-gesture)), realized by `createDependentRow`
(an `own`-edge from the node to a new aspect row). This extends the [9.2 rule set](Phase-9.2.md#anchoring-gates-the-continuum)
cleanly: unanchored bands already cannot mesh and cannot merge; now also **cannot
node-insert**, all for the same single reason — the rows are not owned by the node.

## Query bands are SQL-first

The structured query-builder we first reached for (pick type + scope + filters,
compiled to SQL) was load-bearing only for _insert_ ("a node-scoped query has an
obvious place to insert"). Once insert moves to anchored bands, the builder's residual
justifications are all either ergonomic, available to SQL too, or have only speculative
near-term consumers. So for query bands we commit **SQL-first** and drop the structured
spec for v1.

This is the [composed-vs-substrate fidelity axis](Phase-9.2.md#composed-vs-substrate-fidelity-and-x-ray)
applied to query _authoring_: a structured spec is _composed_; raw SQL over the real
logical tables is _substrate_. Going SQL-first means query bands are authored at the
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
  layer can be added _later_ if a concrete consumer appears (accessibility demand,
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
_decide_ it — we build a **sound recognizer**: accept a well-defined updatable subset,
reject everything else, **no false positives**. This is the classic _view-update
problem_, and the conservative subset is the one JDBC "updatable result sets" and the
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
  say what a _new_ row must contain to appear, and a node-scoped insert must also create
  the node `own`-edge — app semantics absent from the query text. Insert stays anchored.
- **Single base table for v1.** "Rows of type T scoped by closure" is single-table.
  Key-preserving joins (Oracle's "key-preserved table" notion) need uniqueness/constraint
  reasoning that is more than v1 warrants; widen later.

**Prerequisite spike — RESULT (Session 1, 2026-06-26): NEGATIVE.** The bundled
`@sqlite.org/sqlite-wasm@3.50.1` build does **not** ship `SQLITE_ENABLE_COLUMN_METADATA`,
so the semantic column-origin path above is unavailable. Evidence:
`sqlite3_compileoption_used('ENABLE_COLUMN_METADATA')` returns `0`;
`capi.sqlite3_column_origin_name` / `_table_name` / `_database_name` are all `undefined`;
and the option is absent from the wasm's embedded compile-options table (which jumps
`ENABLE_BYTECODE_VTAB` → `ENABLE_COMMENTS`). The official wasm build does not define it
and there is no build flag to toggle from the published package.

**Therefore Session 2 takes the AST-parsing fallback** (a fixed SQLite dialect over the
_known_ logical tables): parse the band SQL, structurally gate it (reject
`GROUP BY` / `DISTINCT` / aggregate / `UNION` / multi-table-`FROM` for v1), and resolve
passthrough columns + inject the base PK by name. This is **cheaper here than the design
feared**, because the codebase already parses SQL this way: `sqlite3-parser`'s
`parseStmt` / `traverse` is a direct dependency already powering `tablesVisitedBySql`
([src/core/worker/invalidation.ts](../../../src/core/worker/invalidation.ts)). The recognizer
reuses that exact mechanism rather than reimplementing a parser — it loses per-column
_engine-resolved_ robustness (alias / `*`-expansion edge cases must be handled in the AST
walk) but the v1 subset (single-table `SELECT … FROM "mx_<T>_data"`, the snippet shape)
is well within reach. Switching to the semantic path later remains a drop-in _iff_ a
column-metadata-enabled wasm build is ever adopted.

### Implemented (Session 2, 2026-06-27)

The recognizer shipped as a **pure function**, [src/sql/recognize-updatable.ts](../../../src/sql/recognize-updatable.ts)
— SQL in, resolved passthrough bindings out, **no rewrite** (SQL stays canonical; it
annotates, never mutates). Two parts: `recognizeUpdatableQuery(sql)` (parse + structural
gate + per-column passthrough/derived classification) and `resolveEditableColumns(rec,
columns)` (apply the real catalog: expand `*`, drop `id`/formula, apply the row-identity
gate). It runs **client-side** in `QueryBand` (the chosen home — reuses the existing
`updateRow` op, no new worker round-trip, and converts the Session-1 "synthesize columns"
degrade into _real_ column metadata for recognized bands as a bonus). Per-cell editability
flows through a new `PropertyRow` `isEditable` predicate (the row-level `readOnly` flag
generalized, as planned).

Two decisions settled here:

- **Single-table shape, via correlated `EXISTS`.** The v1 gate is single-base-table. The
  Session-1 subtree snippet used a `JOIN joins`, which would render read-only; it was
  rewritten so the top-level `FROM` is single-table (`mx_<T>_data`) with host/closure
  scoping pushed into a correlated `EXISTS` (`buildTypeInSubtreeQuery`). Semantically
  identical, and _now_ the motivating live view is write-back-editable. (A `WHERE`
  subquery does not change outer row identity, so the gate allows it.)
- **Row-identity gate = require `id` in the result set** (no PK injection / no rewrite,
  per the SQL-canonical principle). A passthrough cell is editable only if the result set
  carries `id` (via `*` / `<base>.*` / explicit `id`); the snippet's `d.*` satisfies this.
  **Enablement affordance (built Session 2):** when a band is _shape_-updatable but
  `id`-less and adding `id` would unlock a cell, `QueryBand` shows a one-click "+ id to
  edit" control. It rewrites the **stored** SQL via `addIdToProjection` (an AST
  span-guided splice of `, <alias>.id` before the top-level `FROM`) — a _user-initiated_
  edit of the canonical query, distinct from the silent execution-time PK injection we
  rejected (which would diverge executed from stored SQL and hide a synthetic column).
  Executed == stored throughout.

## The bands table

> **Removed by [Phase 9.7](Phase-9.7.md#6-the-one-interleaved-index).** The convergence eliminates the `bands` table entirely: a `view` persists **only its SQL** (on a block marker minted as a real `scroll_index` participant), and a `container` persists nothing new (`matrix.owner` + membership suffice). The former `bands.order` collapses into the marker's `edge_key`. The query band described below therefore becomes the **`view` child-sourcing mode**, rendered inline via **count + slice** windowing ([validated in Phase 9.7b](Phase-9.7b.md)) rather than as a separately-mounted band, and the read-only/recognized-write behavior carries over. The `bands` table + CRUD ops shipped in Sessions 1–2 below (build lineage) will be removed by the 9.7 build.

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

- **Local-only for now.** Bands are _not_ synced this phase — treated as local view
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

- **Session 1 — read slice. ✅ DONE (2026-06-26).** The `bands` table + persistence
  (local-only, no sync triggers — reactivity rides the SQLite update hook); CRUD ops
  (`createBand`/`updateBand`/`deleteBand` in `src/core/bands.ts` + worker wiring); the
  `QueryBand` component (run its SQL via `useQuery`, render the result set read-only
  through the schema-adaptive renderer — `PropertyRow` gained a `readOnly` mode, columns
  synthesized from result keys — with a `query:` header) mounted in `FocusPanel` after
  `AspectBand`; the authoring affordance (raw SQL box + a promoted-type-node dropdown that
  inserts the "in this subtree" snippet, `src/workspace/band-queries.ts`). Unit tests
  (band CRUD, the closure∪self snippet, `PropertyRow` read-only) + e2e
  (`e2e/query-band.spec.ts`: attach → live read-only results → edit underlying data →
  band updates; persists across reload). Spike done — see the recognizer section
  (**negative**; S2 takes the AST route).
- **Session 2 — recognized-SQL write-back. ✅ DONE (2026-06-27).** The recognizer (pure
  `recognizeUpdatableQuery` + `resolveEditableColumns`, AST-parsing route over
  `sqlite3-parser`; single-base-table v1; **no PK injection** — require `id`), the per-cell
  `updateRow` mapping in `QueryBand`, and the `PropertyRow` `isEditable` generalization.
  The subtree snippet was rewritten to single-table `EXISTS` so the motivating live view is
  editable. Unit battery (`src/sql/recognize-updatable.test.ts` — accept/reject + resolve)
  - e2e (`e2e/query-band.spec.ts` — edit a recognized cell writes through; id-less band
    read-only). Includes the **id-enablement affordance**: a one-click "+ id to edit" that
    rewrites the stored SQL (`addIdToProjection`) when a band is shape-updatable but
    `id`-less (signal, not silent injection — keeps executed == stored).
- **Session 3 (later) — authoring polish.** The schema-aware SQL editor (logical-table
  palette, column autocomplete, more snippets) — built on the shared binder/resolver kernel
  below. _Not_ `TableFace` generalization (→ §9.4).

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

- ~~**Bands sync** — promote `bands` to synced source-of-truth when multi-device matters.~~
  **Moot** — the [`bands` table is removed by 9.7](#the-bands-table); a `view`'s SQL rides
  its block marker (an ordinary synced `scroll_index` participant), so there is no separate
  bands table to sync.
- **Key-preserving joins** in the recognizer (widen past single-base-table updatability).
- **Structured authoring layer** — add only when a concrete consumer appears; it compiles
  to the same SQL.
- ~~**Unifying the aspect band into the `bands` table** (the "one table backs all bands"
  pull from 9.2).~~ **Resolved differently by 9.7:** there is no `bands` table to unify into;
  aspect/owned children are the `loose` mode and `view`s persist only their SQL on a marker.
- **AST-parsing recognizer scope** — now the confirmed S2 route (the spike failed). Open:
  exactly which single-table shapes the `sqlite3-parser` gate accepts, and how alias /
  `*`-expansion are resolved in the AST walk (the work the engine would have done).
- ~~**Write-back enablement affordance**~~ — **built 2026-06-27** (the one-click "+ id to
  edit" in `QueryBand` via `addIdToProjection`; signal over silent injection, executed ==
  stored). Remaining nuance: it currently rewrites to a bare/alias-qualified `id`; revisit
  if a band ever needs a different projection style.

### Forward direction: a first-party SQL semantic layer (amortizes future generality)

Going SQL-first means we owe genuine first-party understanding of SQLite semantics as the
recognizer/editor grow. We commit to recovering that understanding over **SQL as the
canonical form** — _no IR_; the binder _lifts_ SQL → resolved bindings for analysis, it
never replaces SQL with a structured representation, and it never rewrites the stored
query. The investments that pay off across more than one feature:

- **Catalog as the authoritative semantic source.** Route all schema knowledge through the
  app's own catalog (`matrix_columns` + `matrix` + `joins`/`closure`), which is richer than
  SQLite's (roles, formula-ness, ownership/closure). Cheap enrichments compound — e.g. an
  explicit PK marker rather than the implicit `id` convention, uniqueness, reference
  semantics.
- **A shared binder/resolver kernel.** Generalize today's one-off AST walks
  (`tablesVisitedBySql`, `recognizeUpdatableQuery`) into one `(parsed SQL, catalog) →
resolved query` module handling aliases, `*`-expansion, and scopes once. Four consumers,
  not one: the write-back recognizer, rename-safe `{{columnId}}` templating, the
  schema-aware editor (autocomplete/validation), and invalidation. `recognizeUpdatableQuery`
  is the first brick — built deliberately as a binder restricted to the single-table subset.
- **The strategic fork to revisit, not pre-decide.** When write-back wants to grow past
  single-table, choose between _owning a fuller SQLite binder_ (expressive; recompiling
  sqlite-wasm with `SQLITE_ENABLE_COLUMN_METADATA` becomes the lever for engine-authoritative
  resolution) and _narrowing to a closed query algebra_ (the deferred structured spec —
  semantics closed by construction, still compiling to SQL). An ORM is neither (it assumes a
  static, build-time schema; ours is runtime/user-defined) and is not a fit.
