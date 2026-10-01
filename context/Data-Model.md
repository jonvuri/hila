---
title: Data model
kind: canonical
state: active
updated: 2026-10-01
---

# Data model

This document owns the current matrix, ownership, edge, position, and derived-cache model. Terms
follow the [concept ledger](Concepts.md).
The historical rank/closure trait model is archived in
[Traits-pre-reconciliation.md](archive/superseded-topics/Traits-pre-reconciliation.md).

## Principles

- Matrixes provide extent and schema. The ownership forest provides structure and lifecycle.
- `own` is the sole lifecycle edge. `ref` is an association. `portal` is an additional position.
- Ownership is single. Position is plural.
- Sibling order lives on structural edges. Hierarchy does not live inside the order key.
- Closure and scroll order are derived caches. They are never independent user-authored truth.
- User-meaningful data belongs in matrixes. Invariant-bearing indexes and relations belong in
  system tables.
- The tree is the position plane: it has ancestry and order. Matrix extent is the membership plane:
  it has no navigable ancestry and appears through container nodes, views, and launcher families.

Examples of the data boundary:

- Matrixes: workspace prose, task fields, review ratings, user-defined schema.
- System truth: `own`, `ref`, and `portal` edges, matrix ownership, type node identity, view SQL,
  and face choices.
- Derived system state: closure and the scroll index.
- Device-local state: device identity and sync cursors.
- Runtime-only state: session memory, the current focus chain, shell layout, and on-screen
  identities. These reset on reload and plugin or database reset.

## Matrixes and columns

Matrix and row IDs are random positive integers that are safe to serialize in JavaScript and safe
to create independently on different devices. Column IDs are stable independently of names.

A matrix is a typed SQLite data table plus registry metadata. Each row belongs to exactly one
matrix, which determines its columns and intrinsic data identity.

`matrix` stores:

- stable random `id`;
- display `title`;
- optional `source_plugin_id`;
- optional `(owner_matrix_id, owner_row_id)`.

`matrix.owner` is a thin matrix-grain fact: a node may own several matrixes; each matrix has at most
one owner. It supports schema isolation and whole-matrix lifecycle. It does not replace row
ancestry.

`matrix_columns` stores stable column IDs, mutable names, SQLite type, display type, order,
constraints, plugin ownership, optional formula metadata, and optional column role. Durable
column references use IDs. Runtime SQL resolves current names.

Column roles are:

- `label` — short identifying content used by navigation, references, and search;
- `content` — long-form rich content.

At most one column per role exists in a matrix. Roles may be assigned only to physical `TEXT`
columns. Formula columns are derived, read-only values and cannot carry either column role.
Role values may remain plain text or serialized ProseMirror JSON; the durable representation is not
yet narrower than `TEXT`.

## The ownership forest

The global `joins` table carries all row relationships:

```sql
(source_matrix_id, source_row_id) -> (target_matrix_id, target_row_id)
kind: own | ref | portal
edge_key: BLOB | NULL
```

### `own`

An `own` edge points from parent to child and carries the child's sibling-local `edge_key`.

- Every live row has one inbound `own` edge.
- Roots are children of the virtual `(0, 0)` sentinel.
- Removing an `own` edge or deleting its source cascades through the owned target.
- Reparenting changes one edge source and key. It does not rewrite descendant keys.
- Cross-matrix ownership is ordinary. A workspace row can own a task row or a root of an owned
  matrix using the same primitive.

Owner means where the row was created. Classification or matrix membership does not silently move
its lifecycle home.

### `ref`

A `ref` edge is a non-owning association. Removing it never deletes the target. Inline `@`
references and non-owning labels use this relation. Rich-text references keep cached display data
for empty and dangling states; the edge is the searchable relation index.

### `portal`

A `portal` edge is a non-owning position. It carries an `edge_key`, occupies the same
sibling order as owned children, and transcludes the target's owned subtree.

- A row keeps one ownership home and can have many portals.
- Detaching a portal is non-destructive.
- Deleting the home orphans surviving portal positions.
- `move-owner` relocates the home and leaves a portal at the old position.

The partial unique owner index applies only to `kind = 'own'`, so portals never create a second
owner.

## Positions and derived caches

### Closure

`closure` is the global transitive closure of `own` edges, keyed by row identity. It answers
ancestry and descendant questions. Structural operations maintain it incrementally. A full rebuild
derives it from `joins` after repair or remote apply.

Portals do not alter ownership closure.

### Scroll index

`scroll_index` materializes the pre-order position graph over `own` and `portal` edges.
`global_lexkey` concatenates sibling keys along one position path, making every rendered
subtree a contiguous key range.

A node may have several entries: its home position and each portal position. Identity lookup is
therefore non-unique. Each entry records depth plus orphaned (`is_ghost`) and lazy flags.

The index drives bounded key-range pagination. It is rebuildable from relationship truth and is not
replicated independently.

## Matrix ownership and type nodes

A node that owns a matrix is a container node. Its matrix defines extent and schema; the rows still
have ordinary `own` homes.

- A dedicated container node's rows are homed beneath it.
- A shared container node, such as a type node, can contain rows homed at many creation sites.
- Dropping an owned matrix follows the matrix-axis cascade, cleans dependent references, and then
  follows surviving cross-matrix ownership edges.

`promoted_nodes` marks type nodes: nodes that act as named types. A type node owns a matrix and
appears in `#` discovery. The type name is the node's label; `matrix.title` is a derived display
cache.

## Child sources

Every subject supplies children through one of three child sources:

| Source      | Source                        | Ownership                           | Insert |
| ----------- | ----------------------------- | ----------------------------------- | ------ |
| `loose`     | direct owned/portal positions | owned rows keep their homes         | yes    |
| `container` | one matrix extent             | matrix and row axes remain distinct | yes    |
| `view`      | stored SQL result             | owns nothing                        | no     |

A grid is a rendering of a homogeneous run, not a fourth child source.

## Views

A view consists of:

- a real node positioned by an `own` edge;
- one `block_sources` row keyed by that node's identity containing its SQL.

The view's node stores the view name in its writable `label`-role field. Creating a view therefore
requires the node's matrix to have that field. The view is a normal named place for reference
discovery and identity navigation, but navigation panel scans exclude it because its inline results
already occupy that position. Inline results and the focus panel use the same node identity and
`block_sources` row. The focus panel renders the stored SQL as a fallback collection. Result rows
keep recognized field write-back but never expose structural insertion, reparenting, drag, or
ownership gestures ([Decision 19](Decisions.md#decision-19)).

The view's inbound `own` edge is its home and records the provenance under which it was created.
Navigation from a concrete position preserves that position's ancestry; identity-only navigation
follows [ancestry resolution](Launcher.md#ancestry-resolution). Ordinary deletion removes the
view's node data and SQL and orphans surviving portal positions. Hard deletion removes every
position. An orphaned position is not an executable view.

Empty results and invalid SQL do not invalidate the place. The focused collection shows an empty
or stated error state while preserving the view's identity and name. Inline results degrade an
invalid view to zero items without interrupting surrounding content.

`block_sources` is replicated source of truth. Phase 11 Stage 2 removed its Phase 9.7 device-local
exception before launcher save creates durable views.

## Source of truth and replication

Every table and column must have one declared durability class:

1. **Replicated source of truth** — user-authored or user-visible durable data.
2. **Derived/rebuildable** — cache or index reproducible from source of truth.
3. **Device-local** — deliberately local preference or transient state with a stated reason.

The schema-policy contract test fails when a table or column is unclassified, or when the tracked
column set differs from the declared replicated schema.

The shipped classifications include:

- Replicated: matrix data tables, matrix and column metadata, ownership/reference/portal edges,
  query-free face choices, plugin metadata, matrix ownership, type node identity, and saved
  view SQL.
- Derived: closure, scroll index, matrix-title caches where reconstructible, and reactive query
  state.
- Device-local: device identity, sync high-water marks, and transient session UI state.

Remote apply uses the same manifest to resolve stable logical identities. It reconstructs dynamic
matrix tables before their rows and rebuilds closure, scroll order, and formula dependencies after
source truth changes. It does not replicate those derived rows or emit local echo changes.

## Structural upgrades

The model supports several possible in-place upgrades:

- label to type node or container node;
- referenced member to owned aspect;
- shared collection to dedicated matrix;
- subtree to matrix-backed table;
- hostless row to contextualized home.

Their primitives exist in pieces, but not every ergonomic migration is justified. Phase 19 reviews
the complete structural interaction system and implements only upgrades that improve real
workflows.

## Invariants

- Every live row has exactly one ownership home.
- Structural position cycles are rejected.
- `own` and `portal` edges carry valid sibling keys; `ref` does not.
- Matrix membership and ownership position remain independent.
- The no-ownership rule: a view never mints ownership from query results.
- Derived caches can be dropped and rebuilt without losing user data.
- Every source-of-truth schema addition declares its replication policy.
