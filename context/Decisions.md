---
title: Decision log
kind: canonical
state: active
updated: 2026-10-01
---

# Decision log

Each entry records one durable decision: what was decided, why, what follows from it, and which
[ledger concepts](Concepts.md) it constrains. Ledger invariants cite these entries. Rationale lives
here and nowhere else.

Entries are never renumbered. When a decision changes, edit its entry and record the date and the
superseding session. Retire an entry by marking it superseded; do not delete it.
[Plan.md](Plan.md#resolved-decisions) keeps a one-line index.

Decisions 1 through 15 were seeded from the resolved-decision list in `Plan.md`. Decisions 16 onward
were seeded from rationale that was embedded in canonical topics during Phase 13 Session 5A.

## Decision 1

**Decision.** Stable column IDs carry durable references. Column names are mutable labels.

**Rationale.** Renaming a column must not break face choices, sort and filter state, formulas, or
views. IDs that never change let every durable reference survive renames. Runtime SQL resolves
current names at execution.

**Consequences.** Column slot bindings and sort and filter state store column IDs. Rename healing
can recompile recognized views against new names.

**Constrains.** Column, Column slot, Face choice, Sort and filter state, Query spec.

## Decision 2

**Decision.** User-meaningful data belongs in matrixes. Invariant-bearing relationships and caches
belong in system tables.

**Rationale.** Matrix data can be inspected and edited through standard surfaces without breaking
anything. Edges, ownership, and derived indexes carry invariants that only typed operations can
maintain safely.

**Consequences.** Edges, matrix ownership, type-node identity, view SQL, and face choices live in
system tables. Writes to system tables go through typed operations.

**Constrains.** Matrix, Edge, Closure, Scroll index, View, Face choice.

## Decision 3

**Decision.** The workspace matrix is the single root matrix: the only matrix in the product without
an owning node. It has exactly a `label` column and a `content` column and does not grow user-domain
columns.

**Rationale.**

- _One root._ The interface has one literal root, and every other matrix is reached through it as
  the owned matrix of a container node or type node. No product operation creates an ownerless
  matrix, so the workspace matrix is the entry point to everything and must stay durable and stably
  addressable.
- _Label and content._ Every row is both an outline bullet and a potential document; the difference
  is zoom level, not data type. Two fixed columns remove the boundary between an outliner and a
  document editor.
- _No domain columns._ Columns are matrix-wide, so a domain column such as "priority" would attach
  to every bullet. Domain structure goes through aspects instead. Promoting a subtree to a table is
  therefore a real matrix migration, not an in-place face swap.

**Consequences.** The workspace plugin declares the matrix and recovers it at each registration
through its persisted matrix-key mapping, not a fixed ID. `label` and `content` are plugin-managed,
so rename and removal are refused without `force`. Adding a column is not blocked in code; the rule
is policy, and the focus panel shows any extra column as an overflow field. The development matrix
browser can still create an unowned matrix as an admin-surface exception. Other matrixes join the
tree through ordinary edges, and stream items render label and content as editors.

**Constrains.** Matrix, Column role, Container node, Type node, Aspect, Stream item, Plugin.

**Sources.** [Phase 7c §4.4](archive/phases/Phase-7c.md#44-where-intrinsic-columns-fit),
[Phase 10 open questions](archive/phases/Phase-10.md), the Phase 10 Session 2 visual companion §7,
and [Phase 5b](archive/phases/Phase-5b.md) for managed columns.

## Decision 4

**Decision.** `own` carries structure and lifecycle. `ref` carries association. `portal` carries an
additional position.

**Rationale.** Separating the three relations lets deletion, ordering, and association follow
simple rules. Only `own` cascades; only `own` and `portal` place a row in the tree.

**Consequences.** Removing a `ref` or `portal` edge never deletes its target. Inline references use
`ref`. Portals share sibling order with owned children.

**Constrains.** Edge, Home, Position, Inline reference.

## Decision 5

**Decision.** Ownership is single. Position is plural.

**Rationale.** One owner gives every row one unambiguous lifecycle home. Plural positions let the
same row appear wherever it is useful without copying data.

**Consequences.** Every live row has exactly one inbound `own` edge. The scroll index can hold
several positions per row, so position lookup by row identity is not unique. Deleting a home
orphans its surviving portal positions.

**Constrains.** Row, Node, Home, Position, Orphaned position, Scroll index.

## Decision 6

**Decision.** Matrix membership and tree position are independent.

**Rationale.** Classification must not silently move a row's lifecycle home. A shared type matrix
can contain rows created in many places.

**Consequences.** Container subjects read a matrix extent, not a subtree. Identity navigation needs
a defined ancestry resolution order.

**Constrains.** Matrix, Extent, Container node, Child source, Ancestry resolution.

## Decision 7

**Decision.** The stream is the primary rooted surface. Local focus navigates nearby. The launcher
finds globally. Admin surfaces contain only above-database concerns.

**Rationale.** One rooted surface keeps navigation coherent. Global finding reconstructs a rooted
focus instead of creating a second root.

**Consequences.** The shell mounts one stream root. The launcher is a gesture, never a place. The
matrix browser is an admin surface.

**Constrains.** Stream root, Place, Launcher, Admin surfaces, Matrix browser.

## Decision 8

**Decision.** Plugins contribute faces and commands. Hosts own chrome and nesting. Subjects own
data. Face choices own presentation.

**Rationale.** Centralizing chrome, nesting, sizing, fidelity, and navigation in hosts keeps those
invariants in one place. Faces stay small, replaceable, and unable to break shell behavior.

**Consequences.** Renderings draw only their own area. Panel regions, insertion, and navigation
stay host-owned. The shell is fixed infrastructure, not a plugin.

**Constrains.** Plugin, Face, Rendering, Host, Subject, Face choice, Panel regions.

## Decision 9

**Decision.** Query gestures compile to canonical SQL. SQL is the only stored and executed query
form.

**Rationale.** One storage story keeps sync, raw SQL mode, and future agent writes on the same
truth. Recognizing structure on read avoids a one-way conversion moment.

**Consequences.** Views store SQL. The query spec is derived in memory. Off-dialect SQL degrades
to opaque leaves or custom SQL rather than being rewritten.

**Constrains.** View, Query spec, Recognizer, Escalation tier, Raw SQL mode.

## Decision 10

**Decision.** Ghost, Null, and Wipeout share one interface and semantic state contract. Visual
theme, polarity, component variant, density, and fidelity are independent axes. A documented theme
geometry adapter may vary geometry and chrome without forking behavior.

**Rationale.** Themes must not fork capability or interaction logic. Independent axes avoid a
Cartesian product of renderers.

**Consequences.** No axis selects or mutates another. Theme-name branching appears only at a
documented theme geometry adapter.

**Constrains.** Visual theme, Polarity, Component variant, Density, Fidelity, Theme geometry
adapter.

## Decision 11

**Decision.** Every source-of-truth schema field declares replicated, derived, or device-local
status.

**Rationale.** Unclassified fields silently bypass replication. Making classification a test
failure keeps the sync boundary complete.

**Consequences.** The durability manifest covers the full schema. Each schema change adds a
two-replica case or states why existing coverage suffices.

**Constrains.** Durability class, every stored concept.

## Decision 12

**Decision.** Performance uses deterministic complexity and fan-out guards plus bounded browser
stress tests at a target-equivalent Chrome CPU slowdown.

**Rationale.** Deterministic guards catch structural regressions without timing noise. Throttled
browser runs catch constant-factor, layout, and DOM regressions that counts miss.

**Consequences.** Editor churn, mounted-item bounds, query plans, and invalidation fan-out are CI
assertions. Wall-clock thresholds are a backstop.

**Constrains.** Page, Retained range, Stream item, Performance guards.

## Decision 13

**Decision.** Schema version 0 remains reset-only until the durable dogfooding gate establishes
version 1.

**Rationale.** Before data must survive upgrades, rewriting bootstrap migrations is cheaper than
maintaining a migration chain for disposable databases.

**Consequences.** Incompatible development databases are reset. After the gate, every schema change
needs a forward migration and the backup contract in [Sync.md](Sync.md#migration-policy).

**Constrains.** Schema version, Durable dogfooding gate.

## Decision 14

**Decision.** Until a real multi-choice consumer exists, a matrix stores at most one face choice.
Hosts supply the fallback rendering implicitly. Automatic unused table choices are not created.

**Rationale.** A stored table choice that exists only to represent the fallback is compatibility
residue, not a user decision. One choice per matrix keeps face resolution deterministic without
ordering rules.

**Consequences.** Matrix creation does not create a face choice. A default face choice applies only
when none exists. Applying the same face is idempotent, and replacement reuses the choice's
replica-stable ID. Multiple choices and a preferred-choice pointer stay deferred.

**Constrains.** Face choice, Default face choice, Face resolution, Fallback rendering.

## Decision 15

**Decision.** Visual theme may be selected at build or development-server startup through
`VITE_HILA_VISUAL_THEME` and defaults to Ghost. User-facing choice and persistence stay deferred.

**Rationale.** All three themes need live evaluation without committing to a chooser or a stored
preference.

**Consequences.** Missing or invalid input resolves to Ghost. The value never selects polarity,
density, component variants, shell layout, or fidelity.

**Constrains.** Visual theme.

## Decision 16

**Decision.** A view owns its SQL. A face choice never contains SQL.

**Rationale.** The query defines which rows a subject has. The face choice defines how they look.
Mixing them gave one matrix's presentation the power to redefine its rows and duplicated query
storage. Phase 11 removed SQL from face choices.

**Consequences.** `block_sources` holds view SQL keyed by the view's node. A face choice holds a
face, column slot bindings, settings, and sort and filter state.

**Constrains.** View, Face choice, Subject.

## Decision 17

**Decision.** A rendering never mounts another rendering. It yields nested subjects back to its
host.

**Rationale.** Nesting, fidelity inheritance, sizing, and insertion policy must stay in one place.
A rendering that mounted others would bypass face resolution and the no-ownership rule.

**Consequences.** Host services expose navigation, insertion, and yield only. They never expose
shell DOM or a mount callback.

**Constrains.** Rendering, Host services, Yield, Rendering mount.

## Decision 18

**Decision.** Every rendering mount supplies a fallback rendering. The fallback rendering always
draws at substrate fidelity.

**Rationale.** Any subject must stay visible and editable when its matrix has no face choice or its
face registers no rendering for that kind. The fallback shows every field, so it is also the
conformance reference for substrate fidelity.

**Consequences.** The fallback prop is required on a rendering mount. X-ray does not swap a
registered rendering for the fallback; it passes substrate fidelity to the registered rendering,
which must draw its own substrate form.

**Constrains.** Rendering mount, Fallback rendering, Substrate, X-ray.

## Decision 19

**Decision.** Query results never own rows, insert rows, or imply a position.

**Rationale.** A query result can move whenever data changes. Treating it as a location would
create rows in arbitrary places or reparent data through a filter.

**Consequences.** View collections and inline results offer no add-row, drag, reparent, portal, or
move-owner gestures. Recognized results keep field write-back. Views are excluded from loose scans.

**Constrains.** View, Inline results, No-ownership rule, Writable field.

## Decision 20

**Decision.** Write-back is decided per field by recognizing the query shape.

**Rationale.** A view may mix values that trace to one source field with computed values. Per-field
classification keeps the editable part editable without guessing.

**Consequences.** Recognized single-base-table queries yield writable fields. Computed and opaque
values are read-only fields. The compiler always emits recognizable SQL.

**Constrains.** Writable field, Read-only field, Recognizer.

## Decision 21

**Decision.** Query recognition is recomputed on read and never stored.

**Rationale.** Storing a recognized form would create a second source of truth that could drift
from the SQL.

**Consequences.** Escalation tier is a fact about the stored SQL. Raw SQL edits reclassify
immediately. Gestures rewrite only the clauses the recognizer owns.

**Constrains.** Recognizer, Escalation tier, Raw SQL mode.

## Decision 22

**Decision.** Identity navigation resolves ancestry in this order: the traversed provenance
position, then the home position, then a deterministic membership fallback. A portal position is
never chosen from identity alone.

**Rationale.** The user expects to return to where they came from. Picking an arbitrary portal
would place them somewhere they never were.

**Consequences.** Launcher results carry provenance when available. Surviving portal positions are
reported for a future chooser. Placeless creation homes under the node focused when the gesture
began.

**Constrains.** Place, Provenance, Ancestry resolution, Position.

## Decision 23

**Decision.** Production paths keep bounded data and rendering residency. No fallback may load a
complete result because paging is inconvenient.

**Rationale.** Forest size, portal expansion, or view size must not determine memory or DOM cost.

**Consequences.** Pages hold 100 items. The retained range keeps two pages beyond the visible pair
in each direction. Inline results contribute a count and gather only requested pages.

**Constrains.** Page, Retained range, Inline results, Navigation panel.

## Decision 24

**Decision.** Rendering identity is position. Editing and data identity is the row.

**Rationale.** A portaled row appears more than once, and each appearance needs its own key and
disclosure state. Edits must still reach the single underlying row.

**Consequences.** Stream items key on position. Commands resolve the underlying row. Focus is
preserved by row identity across mutations.

**Constrains.** Stream item, Position, Row, Node.

## Decision 25

**Decision.** Fidelity and x-ray are runtime presentation state. They are never stored in a face
choice or in user data.

**Rationale.** Fidelity describes how one session inspects the data, not a property of the data.
Storing it would replicate an inspection preference to other devices.

**Consequences.** X-ray resets on reload. Fidelity resolves through fidelity scopes at runtime.

**Constrains.** Fidelity, X-ray, Fidelity scope, Face choice.

## Decision 26

**Decision.** Shell layout is runtime-only and computed from the shell's own width. Retained
panels stay mounted in both layouts.

**Rationale.** Changing width must not destroy editor selection, pending saves, scroll, or
virtualizer state. Layout is not navigation state or user data.

**Consequences.** Hidden panels are inert and absent from layout and the accessibility tree but
keep their component state. No narrow-only route, history, or toolbar exists.

**Constrains.** Shell layout, Retained panels.

## Decision 27

**Decision.** Session memory lives in one in-memory store and resets on reload and database reset.

**Rationale.** Recents are recovery and ranking signals, not a durable history. Persisting them
would add a replicated or device-local preference without a reviewed need.

**Consequences.** Focus recency, recent Deep searches, and on-screen identities never cross the
worker, schema, or replication boundary. Persisted frecency is a separate deferred change.

**Constrains.** Session memory, Launcher.

## Decision 28

**Decision.** The launcher is a gesture, never a place. Save and insert-ref are its only persistent
exits.

**Rationale.** A launcher that held durable state would become a second root and a shadow bookmark
system.

**Consequences.** Deep preview never mounts a rendering, edits a field, or offers add-row. Saving
creates an ordinary view.

**Constrains.** Launcher, View.

## Decision 29

**Decision.** Command implementations stay on the main thread. Only serializable descriptors cross
the worker boundary.

**Rationale.** Functions cannot be structured-cloned, and commands need main-thread capabilities
such as editor focus.

**Consequences.** Plugin registration strips commands, renderings, and lifecycle hooks from the
worker payload. Discovery merges commands on the main thread.

**Constrains.** Command, Plugin.

## Decision 30

**Decision.** Plugin contributions are owned by plugin ID and installed transactionally.

**Rationale.** Partial installation or stale registrations would leave duplicate or dangling
commands and renderings.

**Consequences.** A registration reserves its full set before effects. Replacement removes omitted
entries. Teardown removes the owner's contributions before its `destroy` hook.

**Constrains.** Plugin, Command, Rendering.

## Decision 31

**Decision.** Matrixes outlive the plugin registration that created them.

**Rationale.** User data must not disappear when a plugin is unregistered or replaced.

**Consequences.** Unregistering removes the plugin row and runs `destroy`. Matrixes and rows
remain.

**Constrains.** Plugin, Matrix.

## Decision 32

**Decision.** Sticky items never own editing, drag, selection, or tree semantics. The stream item
remains the only tree item and editor owner.

**Rationale.** Duplicating editors or tree items would split selection and accessibility state
between two copies of one row.

**Consequences.** Sticky items expose named actions only. Session 7 reviews the visual seam
without changing ownership.

**Constrains.** Stream item, Sticky item.

## Decision 33

**Decision.** Component variants are validated by a registry and stay independent of theme,
polarity, and fidelity.

**Rationale.** An unknown persisted value must not reach CSS or select another axis.

**Consequences.** Missing or invalid values resolve to the key's default. A configuration control
appears only when a key has more than one value.

**Constrains.** Component variant.

## Decision 34

**Decision.** Components consume semantic tokens only. Token renames update every consumer in the
same change without aliases.

**Rationale.** Semantic names keep themes swappable. Aliases would let old names linger
indefinitely.

**Consequences.** Fundamental tokens are building blocks only. General-purpose tokens contain no
component name.

**Constrains.** Semantic token.

## Decision 35

**Decision.** The query spec has no projection dimension. Compiled SQL always selects `d.*`.

**Rationale.** Selecting every column keeps row identity and write-back recognizable by
construction. Column visibility belongs to presentation.

**Consequences.** Field visibility is a face choice concern. Fetch narrowing is a host execution
concern.

**Constrains.** Query spec, Face choice, Writable field.

## Decision 36

**Decision.** Relative date tokens freeze to literal ranges at compile time in v1.

**Rationale.** Live-relative tokens need runtime parameters and clock-based invalidation. No second
consumer of runtime parameters exists yet.

**Consequences.** A save nudge states the frozen interpretation. Live-relative tokens are designed
growth.

**Constrains.** Query spec, Chip.

## Decision 37

**Decision.** Table sort and filter state remains durable presentation state attached to the face
choice. It is not subject SQL or untyped settings.

**Rationale.** Sorting a table is a presentation choice. Writing it into SQL would change what the
subject is.

**Consequences.** Sort and filter rows use stable column IDs and stable filter IDs with explicit
order.

**Constrains.** Sort and filter state, Face choice.

## Decision 38

**Decision.** A device-local field requires reviewed approval before implementation.

**Rationale.** User-authored and user-visible state replicates by default. A local exception has a
user-visible cost on other devices.

**Consequences.** The active plan names the owner, the reason, and the consequence. A contract test
proves no trigger tracks the field. No device-local user preference is currently approved.

**Constrains.** Durability class.

## Decision 39

**Decision.** Derived caches never replicate and are always rebuildable from source truth.

**Rationale.** Replicating derived rows would double the sync surface and risk divergence between
cache and truth.

**Consequences.** Closure and the scroll index rebuild after remote apply. Their rows never enter
the changelog.

**Constrains.** Closure, Scroll index, Durability class.

## Decision 40

**Decision.** A view remains a place when its results are empty or its SQL is invalid.

**Rationale.** A broken query is still the user's named object. Removing or hiding it would lose the
name and position.

**Consequences.** The focus panel states the empty or error condition. Inline results degrade to
zero items without interrupting surrounding content.

**Constrains.** View, Place, Inline results.

## Decision 41

**Decision.** Density is a host-computed `wide` or `narrow` input, never stored. The 32-pixel
interaction target is fixed in both values.

**Rationale.** Density adapts to available space. Storing it would treat a layout fact as a
preference, and shrinking targets would break accessibility.

**Consequences.** Density can change text scale, inset, and gaps. It cannot change state meaning or
hide data.

**Constrains.** Density.

## Decision 42

**Decision.** Add registration surface, stored state, or contracts only after a real consumer needs
them.

**Rationale.** Speculative surface becomes compatibility debt. Phase 13 removed several such
residues.

**Consequences.** Named queries and mutations remain declaration-only until Phase 15. Multiple face
choices, per-position face choices, and a general region contract stay deferred.

**Constrains.** Plugin, Face choice, Per-position face choice, Host services.
