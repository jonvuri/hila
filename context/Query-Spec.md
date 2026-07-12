# Query spec and SQL-analog gestures

> Decided in [Phase 10 §3b](Phase-10.md#3b-launcher-deep-dive--the-query-spec) (session 3b-i; visual companion + round-by-round reasoning: [Phase-10-Session-3b-visuals.html](Phase-10-Session-3b-visuals.html), determinations D1–D19). This is the shared model behind the `⌘K` launcher's filtered search, persisted `view` nodes/blocks, and result-surface gestures — the higher-level authoring layer above raw SQL anticipated by [Phase 9 §9.3](Phase-9.md#93-embedded-collections--live-views), designed once and spoken by every surface.

## The one-sentence model

**Gestures edit a spec; the spec compiles to canonical SQL; SQL is what is stored and run; a recognizer lifts stored SQL back into the spec.** The spec is a derived, in-memory view over SQL — never a second source of truth.

This inverts Metabase's arrangement (structured spec canonical, SQL an irreversible escape hatch) and generalizes a pattern hila already ships: [`recognize-updatable.ts`](../src/sql/recognize-updatable.ts) lifts write-back structure out of stored SQL today. Because recognition is **recomputed on read, never stored**, there is no conversion moment and no one-way door inside the dialect. The door exists only at the dialect's edge — and it is marked (see [Escalation tiers](#escalation-tiers)).

Consequences that fall out:

- **§9.3's *executed == stored* is unbroken.** One storage story for view blocks: SQL. Sync, x-ray, and the MCP write path all see the truth.
- **Agents write plain SQL and users get chips.** An MCP agent that emits dialect-shaped SQL produces views whose gesture chrome lights up; off-dialect SQL degrades honestly, exactly like a power user's. The dialect is documented agent-facing guidance, never enforced.
- **The compiler and recognizer are a matched pair** living in `src/sql/query-spec/` beside `recognize-updatable.ts`, sharing the parser, kept honest by a round-trip conformance suite (`recognize(compile(spec)) ≡ spec`, property-tested per clause).

## The spec

Derived state, one per gesture surface. Six dimensions; each is one gesture, one chip, one compile rule.

```
type QuerySpec = {
  kind:  { matrixId } | 'containers' | 'everything'   // which extent(s) — the FROM
  scope: { node } | 'all'                             // subtree fence — EXISTS over the position index
  text:  string                                       // label-role LIKE now; FTS later, spec unchanged
  where: Predicate[]                                  // flat AND list (v1); col · op · value,
                                                      //   or an opaque SQL fragment leaf
  order: { columnId, dir } | 'natural'                // natural = rank for containers
  limit: number                                       // always present (result caps)
}
```

- **No projection dimension — permanently.** Compiled SQL is always `SELECT d.*` + `id`, so hydration and write-back editability hold by construction. Column *visibility* is the face recipe's business ([Plugins.md — composition model](Plugins.md#plugin-view-composition-model)); fetch *narrowing* is a host execution concern (wrapping, like windowing).
- **Text is the residue; chips are the commitments.** The launcher's bare typed words are the `text` dimension. When FTS lands ([Plan.md — Search](Plan.md#search)), only the compile rule changes — every surface, saved node, and gesture is untouched.
- **`kind: everything`** (the launcher's zero-chip cross-matrix union) is fine transiently; saving it is allowed but flagged read-only, with a nudge to pick a kind for an editable view.

## Surfaces and lifetimes

The same spec drives three surfaces at three tempos:

- **`⌘K` launcher** — transient. The spec lives in memory; compiled SQL runs per keystroke (bound parameters re-bind rather than re-prepare); nothing is stored.
- **View blocks / `view` nodes** — persisted. Chips are derived by recognizing the block's stored SQL on mount; editing a chip recompiles and stores new SQL. "view SQL ▸" (the query's x-ray) is always one keystroke away and editable in place.
- **Result surfaces** — in place. Substrate/grid column headers offer sort (v1) and filter-on-value (fast-follow), emitting the same spec ops against the enclosing subject's query.

**Save-search-as-node** is the escalation between lifetimes: compile the launcher's spec → store the SQL as a `view` node via the existing block path → home by provenance ([session 2](Architecture.md#placeless-creation-homes-by-provenance)) → focus it. No new storage; a saved search is indistinguishable from a hand-made block, and because its SQL was compiler-emitted, it recognizes back into chips by construction.

## Escalation tiers

A block's "mode" is a fact about its SQL, recomputed on read:

| tier | when | surface shows |
| --- | --- | --- |
| **chips** | SQL is in the dialect | full chip row |
| **chips + leaf** | dialect shape, plus terms the recognizer can't type | normal chips + an opaque leaf chip per term |
| **custom SQL** | outside the dialect (joins, aggregates, unions, hand-restructured) | a single custom-query chip + the SQL |

The middle tier is load-bearing: one exotic condition never evicts a block from gesture-land. **No silent rewriting** (§9.3's rule) carries over: gestures never reformat hand-written SQL unless a gesture is actually used, and then only the terms the recognizer owns are recompiled — opaque leaves are preserved verbatim.

## The leaf taxonomy

Every clause position gets either a canonical chip grammar or an opaque leaf:

| position | leaf | holds |
| --- | --- | --- |
| WHERE | fragment | one opaque boolean term |
| FROM | **source (CTE)** | a full opaque SELECT the outer query reads from |
| SELECT | computed | one opaque expression column (dry) |

**The source chip** — canonical shape `WITH name AS (…opaque…) SELECT d.* FROM name d …dialect…`:

- Recognition stays cheap: a balanced-blob CTE prefix + a dialect outer query. The body is never parsed by the recognizer; the AST machinery (tables-visited invalidation, sandbox authorization) already walks full statements.
- Column vocabulary by introspection (result keys — the existing `QueryBand` pattern). Chips needing columns the output lacks (scope needs position identity; text needs a label role) **disable with a stated reason**.
- **Write-back composes recursively:** if the CTE body itself lifts as a passthrough of a base table, updatability chases through; opaque body → dry, honestly. (`recognize-updatable` rejecting `WITH` today is a v1 restriction, not doctrine — this is its designed growth.)
- One inline CTE per query for now. *Referencing another view node as source* is the deferred flavor (it rides the ref/ghost machinery); the chip's shape already fits it.

## Write-back by construction

The compiler's output shape is exactly what the existing machinery trusts:

- **Single base table + `d.*` + `id` always** — every compiled view passes `recognize-updatable`; the "+ id to edit" affordance remains only for hand-written SQL.
- **Subtree scope via single-table `EXISTS`** — the form §9.3 already proved keeps updatability recognition sound.
- **Insert stays anchoring-governed** (the [`view` firewall](Phase-9.7.md#3-three-child-sourcing-modes-the-unification)): gestures change what you *see*, never what owns; the host still omits add-row for `view` subjects.
- **Plain SELECT output** — the invalidation engine and prepared-statement reuse apply unchanged.
- **Rename healing:** dialect SQL can be recognize→recompiled against the catalog when a column is renamed, healing every chip-built view; stranded opaque leaves go invalid *individually*, with the old name stated.

## The interactive grammar

**Chip anatomy (D14).** A chip is: *the object as it renders everywhere else in the app · the op as its operator glyph · the value* — nothing else. No dimension labels, no chip-type icons. FROM's implicit glyph is the matrix badge itself (a matrix is the only object that *is* a set of rows); scope's is the node crumb + trailing `›` (the breadcrumb's "and below"). Only opaque leaves carry labels — their content cannot speak.

**Input (D15).** Names are the only grammar: typing matches object names across families (matrixes, nodes, columns once a kind fixes the vocabulary), and each suggestion row pairs the object with the ops its nature affords — object-first, op-second. Uncommitted text is the `text` dimension. Sigils survive only as family narrowers with their exact prose meanings (`#` types, `@` nodes/rows); a sigil never signals a dimension.

**Mastery (D16).** Three layers converging on the displayed glyph vocabulary: menu navigation → typeahead on op names and synonyms ("not" → `≠`, "desc" → `↓`) → typed operators identical to the glyphs (`due<`, `status!=`; ASCII spellings where needed). The op menu leads with glyphs to teach them — reading chips teaches writing them, and the fluent path converges on the SQL-analog. Jump-keys rejected (conflict with typeahead; a non-transferable vocabulary).

## Glyph vocabulary (v1)

| glyph | means | borrowed from |
| --- | --- | --- |
| `[]` · `[name]` | matrix (the membership plane) — standalone as the family symbol, wrapping names as the object mark. Supersedes the informal `▣` | math matrix notation · array literals |
| `#name` | a promoted type — its app-wide identity, color and icon included | in-app prose |
| `≔ name` | defined by a query — view node/block, CTE/source chip, custom-query chip; one concept at every granularity (typed `:=`; the SQL layer shows `WITH … AS`) | math definition · Pascal/Go `:=` |
| `name ›` | scope — this node and below | the app's breadcrumb chevron |
| `ƒ name` | formula — a computed, dry value; app-wide, covering matrix formula columns and view computed items (alias required on commit) | Excel *fx* |
| `=` `≠` `<` `>` `∈` `∅` | predicate ops (predicate *fragments* carry no glyph — their comparison ops self-signal) | math |
| `↓` `↑` | order | sort convention |

Rejected candidates, recorded: `∈` for CTE (collides with the IN op; membership test ≠ definition) · `φ` (visual collision with `∅` at chip size) · `P` (reads as an identifier) · `↦` (implies always-visible alias) · `WITH` as chip label (demoted to the SQL layer, paired with `≔` by the mastery ladder).

**Placeholders for the [§4 token pass](Phase-10.md#4-cohesive-design-token-and-theming-system)** — semantic intents settled here, visual treatments settled there:

- **Opacity texture** (suggested: dashed frame): "opaque SQL inside," uniform across every escape hatch. A storage-tier fact gets its own channel — texture — distinct from glyph (meaning) and color.
- **Invalid treatment** (suggested: red frame + stated reason): "this term cannot run" — red means invalid and *nothing else*.
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

- **Session 3b-ii — the launcher surface proper:** result layout/sectioning, command-integration and ranking interleave (stateless in v1), the quick↔deep visual continuum, empty-input state, keyboard map, per-type value editors, save-flow polish, stage-4 build items.
- **Block-chrome follow-up:** the full view-block authoring chrome replacing the dev textarea (direction fixed; details ride the §4 token pass).
- **FTS** (compile-rule swap; Phase 11+) · **frecency ranking** (slots into launcher ranking only; the spec is untouched) · **view-node-as-source** · the growth items above, each on proven need.
