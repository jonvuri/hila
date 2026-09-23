# Query spec and SQL-analog gestures

> **Status: executable v1 runtime and transient chip surface shipped.** Session 2 delivered the
> compiler, recognizer, bound runtime, deterministic paging, and rename healing. Session 6 added the
> launcher reducer, value grammar, and bounded read-only preview. Session 7 owns durable chip editing.

> Decided in [Phase 10 §3b](./archive/phases/Phase-10.md#3b-launcher-deep-dive--the-query-spec) (session 3b-i; visual companion + round-by-round reasoning: [Phase-10-Session-3b-visuals.html](./archive/visuals/Phase-10-Session-3b-visuals.html), determinations D1–D19). This is the shared model behind the `⌘K` launcher's filtered search, persisted `view` nodes/blocks, and result-surface gestures — the higher-level authoring layer above raw SQL anticipated by [Phase 9 §9.3](./archive/phases/Phase-9.md#93-embedded-collections--live-views), designed once and spoken by every surface.

## The one-sentence model

**Gestures edit a spec; the spec compiles to canonical SQL; SQL is what is stored and run; a recognizer lifts stored SQL back into the spec.** The spec is a derived, in-memory view over SQL — never a second source of truth.

This inverts Metabase's arrangement (structured spec canonical, SQL an irreversible escape hatch) and generalizes a pattern hila already ships: [`recognize-updatable.ts`](../src/sql/recognize-updatable.ts) lifts write-back structure out of stored SQL today. Because recognition is **recomputed on read, never stored**, there is no conversion moment and no one-way door inside the dialect. The door exists only at the dialect's edge — and it is marked (see [Escalation tiers](#escalation-tiers)).

Consequences that fall out:

- **§9.3's _executed == stored_ is unbroken.** One storage story for view blocks: SQL. Sync, x-ray, and the MCP write path all see the truth.
- **Agents write plain SQL and users get chips.** An MCP agent that emits dialect-shaped SQL produces views whose gesture chrome lights up; off-dialect SQL degrades honestly, exactly like a power user's. The dialect is documented agent-facing guidance, never enforced.
- **The compiler and recognizer will be a matched pair** in `src/sql/query-spec/` beside
  `recognize-updatable.ts`, sharing the parser and kept honest by a round-trip conformance suite
  (`recognize(compile(spec)) ≡ spec`, property-tested per clause).

## The spec

Derived state, one per gesture surface. Six dimensions; each is one gesture, one chip, one compile rule.

```
type QuerySpec = {
  kind:  { matrixId } | 'containers' | 'everything'   // which extent(s) — the FROM
  scope: { node: { matrixId, rowId } } | 'all'         // subtree fence — EXISTS over the position index
  text:  string                                       // label/content-role LIKE now; FTS later, spec unchanged
  where: Predicate[]                                  // flat AND list (v1); col · op · value,
                                                      //   or an opaque SQL fragment leaf
  order: { columnId, dir } | 'natural'                // natural = rank for containers
  limit: number                                       // always present (result caps)
}
```

## Executable v1 contract

This section is normative for Phase 12. The descriptive sections below explain the interaction
model; this section fixes what the first compiler and recognizer accept.

### Input and normalized forms

The executable input is a discriminated, structured-clone-safe structure. Stable IDs occur only at
this boundary; emitted SQL contains resolved table and column names.

```ts
type QueryScalar = string | number | bigint | Uint8Array | null

type QueryPredicate =
  | {
      type: 'predicate'
      columnId: number
      op: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains'
      value: QueryScalar
    }
  | { type: 'predicate'; columnId: number; op: 'empty' | 'notEmpty' }
  | { type: 'opaque'; sql: string }

type QuerySpec = {
  kind: { type: 'matrix'; matrixId: number } | { type: 'containers' } | { type: 'everything' }
  scope: { type: 'node'; matrixId: number; rowId: number } | { type: 'all' }
  text: string
  where: QueryPredicate[]
  order: { type: 'column'; columnId: number; direction: 'asc' | 'desc' } | { type: 'natural' }
  limit: number
}
```

Normalization is deterministic:

- IDs and `limit` must be positive safe integers. `limit` is always present.
- Text is preserved exactly. An empty string emits no text term.
- Predicate order and opaque-leaf bytes are preserved. Opaque leaves must be one valid,
  parameter-free expression; blank or malformed leaves are invalid.
- `-0` becomes `0`. Non-finite numbers are invalid. Scalar kinds must match the selected column's
  SQLite affinity; `null` is valid only for `eq` and `neq` and compiles as `IS NULL` or
  `IS NOT NULL`. Boolean authoring values normalize to SQLite integers `0` and `1` before entering
  `QueryScalar`.
- `empty` means `IS NULL OR value = ''`; `notEmpty` is its negation. They are available only for
  text-affinity columns. `contains` is also text-only and escapes `%`, `_`, and the escape
  character before compiling to `LIKE`.
- Formula columns are invalid predicate and order candidates in v1.
- Natural date tokens are resolved before this normalized form is compiled. The launcher adapter
  expands a relative token into fixed ISO boundary values and `gte`/`lte` predicates. SQL never
  stores `now`, `today`, or another live-relative expression. `on` uses the closed start/end pair;
  `before` uses the start boundary and `after` the end boundary. The chip remains one logical unit
  and states the frozen local-calendar interpretation before save.
- Duplicate structured predicates are retained. Gesture operations may replace a term by index;
  normalization does not reorder or deduplicate user intent.

`containers` and `everything` are valid transient discovery modes, but the v1 SQL compiler rejects
them. They need Session 3's dynamic discovery plan and cannot be materialized or saved. Every
compiled or durable spec therefore has one concrete matrix.

### Catalog boundary and invalid states

Compilation and recognition receive a catalog containing matrix IDs, current physical table
names, ordered column definitions, semantic roles, and any node identities needed by scope. They
fail with a typed reason when:

- the matrix, scope node, column, or physical name no longer exists;
- a column belongs to another matrix, is a formula, or does not support the requested operator;
- a value has the wrong affinity, an opaque term is blank, or a limit/ID is invalid;
- the SQL is not one read-only statement; or
- stored SQL has a non-dialect projection, source, grouping, compound, window, order, offset, or
  limit shape.

A trailing semicolon and SQL whitespace/comments are harmless. A second statement or any trailing
token that is not part of the parsed statement is rejected. Development mutation SQL stays on its
existing separate system-edge path.

### Canonical SQL

One normalized concrete-matrix spec has two renderings:

1. A transient plan: `{ template, bindings }`. Values, scope-node IDs, text, and the limit are bound.
   Resolved table and column identifiers are the only interpolated parts.
2. Persistent SQL: the same clauses with SQLite literals materialized in place. It is
   self-contained and is the only stored truth.

Both renderings use this clause spine:

```sql
SELECT d.*
FROM "mx_<matrixId>_data" AS d
WHERE <scope> AND <text> AND <predicate-or-opaque terms in spec order>
ORDER BY <selected column> <ASC|DESC>, d.id ASC
LIMIT <positive integer>
```

`WHERE` is omitted when empty. Natural order is `ORDER BY d.id ASC`; ordering by `id` does not add a
duplicate tie-breaker. Every other order adds `d.id ASC`, which makes offset paging deterministic
when selected values tie. Text is one parenthesized `OR` across all current label- and content-role
columns, in catalog order, using `CAST(d.<column> AS TEXT) LIKE <value> ESCAPE '\'`. A matrix with
no label/content role rejects non-empty text.

Node scope is the existing correlated single-base-table form: an `own` edge must host the result
row directly under the selected node or under one of its closure descendants. This keeps the outer
`FROM` updatable. The result matrix identity and scope identity are distinct.

Structured predicates use `d.<resolved column>` with `=`, `!=`, `<`, `<=`, `>`, `>=`, `LIKE`,
`IS NULL`, or `IS NOT NULL`. Parentheses belong only to canonical multi-expression terms such as
text and `empty`; opaque leaves keep their original bytes and receive one surrounding pair of
parentheses during compilation so a top-level `OR` cannot escape the flat `AND` list. Recognition
removes exactly that compiler-owned pair, preserving the leaf payload rather than accumulating
parentheses across round trips.

### Recognition and equivalence

The recognizer accepts the canonical clause spine semantically, not by formatting. It resolves the
base matrix and columns through the same catalog, splits only top-level `AND` nodes, and classifies
each term independently:

- canonical scope, text, and typed predicate terms become structured dimensions;
- any other valid boolean term becomes `{ type: 'opaque', sql }`, using its exact source span;
- a structural mismatch returns `custom SQL` with one stated reason instead of a partial spec.

Canonical order and limit are required for `chips` or `chips + leaf`. The recognizer accepts either
qualified or unqualified identifiers and ordinary SQLite whitespace/quoting, then recompilation
canonicalizes those owned clauses. Opaque leaves remain byte-for-byte equal. The normalized
equivalence relation compares stable IDs, scalar values, term order, direction, and semantic
scope/text/limit; it treats harmless SQL formatting and identifier quoting as equal.

Recognition has three results: `chips`, `chips-with-leaves`, or `custom-sql`. Invalid SQL is still
a valid named place: execution may show its error, but recognition never deletes or rewrites it.

- **No projection dimension — permanently.** Compiled SQL is always `SELECT d.*` + `id`, so hydration and write-back editability hold by construction. Column _visibility_ is the face recipe's business ([Plugins.md — composition model](Plugins.md#forward-composition-model)); fetch _narrowing_ is a host execution concern (wrapping, like windowing).
- **Text is the residue; chips are the commitments.** The launcher's bare typed words are the
  `text` dimension. It searches label- and content-role fields, while launcher ranking favors label
  matches by default. When FTS lands
  ([Plan.md — deferred decisions](Plan.md#deferred-decisions)), only the compile rule changes —
  every surface, saved node, and gesture is untouched.
- **`kind: everything`** (the launcher's zero-chip cross-matrix search) and `containers` are transient
  discovery lenses in v1. Saving requires a concrete matrix/type kind. A durable heterogeneous lens
  would otherwise freeze the current runtime matrix set; it waits for a dynamic global-search
  substrate.

## Surfaces and lifetimes

The same spec is designed to drive three surfaces at three tempos:

- **`⌘K` launcher** — transient. The spec lives in memory; compiled SQL runs per keystroke (bound parameters re-bind rather than re-prepare); nothing is stored.
- **View blocks / `view` nodes** — persisted. Chips are derived by recognizing the block's stored SQL on mount; editing a chip recompiles and stores new SQL. "view SQL ▸" (the query's x-ray) is always one keystroke away and editable in place.
- **Result surfaces** — in place. Substrate/grid column headers offer sort (v1) and filter-on-value (fast-follow), emitting the same spec ops against the enclosing subject's query.

**Save-search-as-node** is the escalation between lifetimes after a concrete matrix/type kind is
committed: compile the launcher's spec → store the SQL as a `view` node via the existing block path
→ home by provenance ([ancestry contract](Architecture.md#ancestry)) → focus it. No new storage; a
saved search is indistinguishable from a hand-made block, and because its SQL was compiler-emitted,
it recognizes back into chips by construction.

## Escalation tiers

A block's "mode" is a fact about its SQL, recomputed on read:

| tier             | when                                                               | surface shows                               |
| ---------------- | ------------------------------------------------------------------ | ------------------------------------------- |
| **chips**        | SQL is in the dialect                                              | full chip row                               |
| **chips + leaf** | dialect shape, plus terms the recognizer can't type                | normal chips + an opaque leaf chip per term |
| **custom SQL**   | outside the dialect (joins, aggregates, unions, hand-restructured) | a single custom-query chip + the SQL        |

The middle tier is load-bearing: one exotic condition never evicts a block from gesture-land. **No silent rewriting** (§9.3's rule) carries over: gestures never reformat hand-written SQL unless a gesture is actually used, and then only the terms the recognizer owns are recompiled — opaque leaves are preserved verbatim.

## The leaf taxonomy

Every clause position gets either a canonical chip grammar or an opaque leaf:

| position | leaf             | holds                                           |
| -------- | ---------------- | ----------------------------------------------- |
| WHERE    | fragment         | one opaque boolean term                         |
| FROM     | **source (CTE)** | a full opaque SELECT the outer query reads from |
| SELECT   | computed         | one opaque expression column (dry)              |

**The source chip** — canonical shape `WITH name AS (…opaque…) SELECT d.* FROM name d …dialect…`:

- Recognition stays cheap: a balanced-blob CTE prefix + a dialect outer query. The body is never parsed by the recognizer; the AST machinery (tables-visited invalidation, sandbox authorization) already walks full statements.
- Column vocabulary by introspection (result keys — the existing `QueryBand` pattern). Chips needing columns the output lacks (scope needs position identity; text needs a label role) **disable with a stated reason**.
- **Write-back composes recursively:** if the CTE body itself lifts as a passthrough of a base table, updatability chases through; opaque body → dry, honestly. (`recognize-updatable` rejecting `WITH` today is a v1 restriction, not doctrine — this is its designed growth.)
- One inline CTE per query for now. _Referencing another view node as source_ is the deferred flavor (it rides the ref/ghost machinery); the chip's shape already fits it.

## Write-back by construction

The compiler's output shape is exactly what the existing machinery trusts:

- **Single base table + `d.*` + `id` always** — every compiled view passes `recognize-updatable`; the "+ id to edit" affordance remains only for hand-written SQL.
- **Subtree scope via single-table `EXISTS`** — the form §9.3 already proved keeps updatability recognition sound.
- **Insert stays anchoring-governed** (the [`view` firewall](./archive/phases/Phase-9.7.md#3-three-child-sourcing-modes-the-unification)): gestures change what you _see_, never what owns; the host still omits add-row for `view` subjects.
- **Plain SELECT output** — the invalidation engine and prepared-statement reuse apply unchanged.
- **Rename healing:** dialect SQL can be recognize→recompiled against the catalog when a column is renamed, healing every chip-built view; stranded opaque leaves go invalid _individually_, with the old name stated.

## The interactive grammar

**Chip anatomy (D14).** A chip is: _the object as it renders everywhere else in the app · the op as its operator glyph · the value_ — nothing else. No dimension labels, no chip-type icons. FROM's implicit glyph is the matrix badge itself (a matrix is the only object that _is_ a set of rows); scope's is the node crumb + trailing `›` (the breadcrumb's "and below"). Only opaque leaves carry labels — their content cannot speak.

**Input (D15).** Names are the only grammar: typing matches object names across families (matrixes, nodes, columns once a kind fixes the vocabulary), and each suggestion row pairs the object with the ops its nature affords — object-first, op-second. Uncommitted text is the `text` dimension. Sigils survive only as family narrowers with their exact prose meanings (`#` types, `@` nodes/rows); a sigil never signals a dimension.

**Mastery (D16).** Three layers converging on the displayed glyph vocabulary: menu navigation → typeahead on op names and synonyms ("not" → `≠`, "desc" → `↓`) → typed operators identical to the glyphs (`due<`, `status!=`; ASCII spellings where needed). The op menu leads with glyphs to teach them — reading chips teaches writing them, and the fluent path converges on the SQL-analog. Jump-keys rejected (conflict with typeahead; a non-transferable vocabulary).

## Glyph vocabulary (v1)

| glyph                   | means                                                                                                                                                    | borrowed from                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `[]` · `[name]`         | matrix (the membership plane) — standalone as the family symbol, wrapping names as the object mark. Supersedes the informal `▣`                          | math matrix notation · array literals |
| `#name`                 | a promoted type — its app-wide identity, color and icon included                                                                                         | in-app prose                          |
| `≔ name`                | defined by a query — view node/block, CTE/source chip, custom-query chip; one concept at every granularity (typed `:=`; the SQL layer shows `WITH … AS`) | math definition · Pascal/Go `:=`      |
| `name ›`                | scope — this node and below                                                                                                                              | the app's breadcrumb chevron          |
| `ƒ name`                | formula — a computed, dry value; app-wide, covering matrix formula columns and view computed items (alias required on commit)                            | Excel _fx_                            |
| `=` `≠` `<` `>` `∈` `∅` | predicate ops (predicate _fragments_ carry no glyph — their comparison ops self-signal)                                                                  | math                                  |
| `↓` `↑`                 | order                                                                                                                                                    | sort convention                       |

Rejected candidates, recorded: `∈` for CTE (collides with the IN op; membership test ≠ definition) · `φ` (visual collision with `∅` at chip size) · `P` (reads as an identifier) · `↦` (implies always-visible alias) · `WITH` as chip label (demoted to the SQL layer, paired with `≔` by the mastery ladder).

**Placeholders for the [§4 token pass](./archive/phases/Phase-10.md#4-cohesive-design-token-and-theming-system)** — semantic intents settled here, visual treatments settled there:

- **Opacity texture** (suggested: dashed frame): "opaque SQL inside," uniform across every escape hatch. A storage-tier fact gets its own channel — texture — distinct from glyph (meaning) and color.
- **Invalid treatment** (suggested: red frame + stated reason): "this term cannot run" — red means invalid and _nothing else_.
- **Chip frame palette**: dimension tints (membership/position plane colors) vs object identity (a type's own color) — the full palette question rides the token pass.

## Growth path

Stress-tested against everything deferred (visuals §10). The design holds for structural reasons, not because the v1 subset is small: growth is **per-clause** (complexity additive, recognition compositional); the flat chip row **mirrors SQL's own clause spine** (hierarchy lives inside clauses — exactly where leaves and the compound chip go); and hierarchy/write-back pressure concentrates in features the view layer already owns by other means (scaffold fields, recipes, the launcher).

Sequence, by value:

1. **`IN`/`BETWEEN` predicate sugar** — trivial; collapses most disjunctions.
2. **Relationship traversal predicates** (`has #urgent`, `aspect.status ≠ done`, backlinks) — canonical EXISTS templates over the joins/position tables; the app's soul.
3. **Aggregation/group-by** — flat `group:`/`measure:` chips (the MBQL precedent); results turn dry honestly.
4. **Multi-kind union** — multi-select on the kind chip; predicates restricted to shared columns.
5. **OR-groups** — CNF only (AND of OR-groups), one nesting level, rendered by the **compound chip** — the single new UI primitive the whole path needs (shared with traversal inner-predicates).

**Permanent non-goals at the spec level:** projection · general unions · column-widening joins · arbitrary boolean trees · correlated traversals. These stay leaf/tier-3 territory — the accepted ceiling of SQL-canonical.

## Deferred

- ~~Session 3b-ii — the launcher surface proper~~ **Resolved:** the launcher surface is designed in [Launcher.md](Launcher.md) (Phase 10 §3b-ii, determinations D20–D32) — result layout, ranking, family narrowing, tempo continuum, keyboard map, value editors, save flow, and the stage-4 build items.
- **Live-relative date tokens** (a saved "today" view that is always today) — the designed dialect extension, deferred on need: the compile rule emits a reserved **runtime parameter** (`:today`-family) that the recognizer lifts back to the token; the executor binds an environment at run time; the invalidation engine gains clock-based invalidation (re-run at date rollover). In v1 relative tokens freeze to literal ranges at compile (stated by a save nudge — [Launcher.md](Launcher.md) D29). No second runtime-parameter consumer exists in the immediate plan (host execution params are a different, already-general layer; Phase 11's `date('now')` column defaults evaluate at write time); identity (`:me`) and context (`:here`) are the eventual siblings that would justify extracting the general environment mechanism.
- **Saved-view chip chrome:** Phase 12 implements the shared authoring grammar over stored view SQL
  and replaces the development textarea. Raw SQL remains available as x-ray/custom mode.
- **FTS** (compile-rule swap; Phase 11+) · **frecency ranking** (slots into launcher ranking only; the spec is untouched) · **view-node-as-source** · the growth items above, each on proven need.
