---
title: Data model
kind: canonical
state: active
updated: 2026-08-29
---

# Data model

This document owns the current matrix, ownership, relationship, position, and derived-cache model.
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

## Matrixes and columns

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
constraints, plugin ownership, optional formula metadata, and optional semantic role. Durable
column references use IDs. Runtime SQL resolves current names.

Column roles are:

- `label` — short identifying content used by navigation, references, and search;
- `content` — long-form rich content.

At most one column per role exists in a matrix.

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
for empty and ghost states; the join is the searchable relation index.

### `portal`

A `portal` edge is a non-owning structural appearance. It carries an `edge_key`, occupies the same
sibling order as owned children, and transcludes the target's owned subtree.

- A row keeps one ownership home and can have many portals.
- Detaching a portal is non-destructive.
- Deleting the home ghosts surviving portal positions.
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
`global_lexkey` concatenates sibling edge keys along one appearance path, making every rendered
subtree a contiguous key range.

A row may have several entries: its home and each portal appearance. Identity lookup is therefore
non-unique. Each entry records depth plus ghost/lazy flags.

The index drives bounded key-range pagination. It is rebuildable from relationship truth and is not
replicated independently.

## Matrix ownership and type-nodes

A node that owns a matrix is a container. Its matrix defines extent and schema; the rows still have
ordinary `own` homes.

- A dedicated container's rows are homed beneath the container node.
- A shared type container can contain rows homed at many creation sites.
- Dropping an owned matrix follows the matrix-axis cascade, cleans dependent references, and then
  follows surviving cross-matrix ownership edges.

`promoted_nodes` marks nodes that act as named types. A promoted type-node owns a matrix and appears
in `#` discovery. The type name is the node's label; `matrix.title` is a derived display cache.

## Child-sourcing modes

Every subject supplies children through one of three modes:

| Mode        | Source                        | Ownership                           | Insert |
| ----------- | ----------------------------- | ----------------------------------- | ------ |
| `loose`     | direct owned/portal positions | owned rows keep their homes         | yes    |
| `container` | one matrix extent             | matrix and row axes remain distinct | yes    |
| `view`      | stored SQL result             | owns nothing                        | no     |

A grid is a rendering of a homogeneous run, not a fourth data mode.

## View blocks

A `view` block consists of:

- a real marker node positioned by an `own` edge;
- one `block_sources` row keyed by marker identity containing its SQL.

The marker's writable `label`-role field stores the view name. Creating a view therefore requires
the marker matrix to have that field. The marker is a normal named place for reference discovery
and identity navigation, but loose outline scans exclude it because its inline presentation already
occupies that position. Inline and focused presentations use the same marker identity and
`block_sources` row.

The marker's inbound `own` edge is its home and records the provenance under which it was created.
Navigation from a concrete appearance preserves that appearance's ancestry; identity-only
navigation chooses the ownership home. Ordinary deletion removes the marker data and SQL and
ghosts surviving portal appearances. Hard deletion removes every appearance. A ghost is not an
executable view.

Empty results and invalid SQL do not invalidate the place. The focused collection shows an empty
or stated error state while preserving the marker identity and name. Inline folding degrades an
invalid collection to zero rows without interrupting surrounding loose content.

`block_sources` is replicated source of truth. Phase 11 Stage 2 removed its Phase 9.7 device-local
exception before launcher save creates durable views.

## Source of truth and replication

Every table and column must have one declared durability class:

1. **Replicated source of truth** — user-authored or user-visible durable data.
2. **Derived/rebuildable** — cache or index reproducible from source of truth.
3. **Device-local** — deliberately local preference or transient state with a stated reason.

Phase 11 installs a schema-policy contract test that fails when a table or column is unclassified,
or when the tracked column set differs from the declared replicated schema.

Current known classifications:

- Replicated: matrix data tables, matrix and column metadata, ownership/reference/portal edges,
  face configuration, plugin metadata, matrix ownership, promoted-node identity, and saved view
  SQL.
- Derived: closure, scroll index, matrix-title caches where reconstructible, and reactive query
  state.
- Device-local: device identity, sync high-water marks, and transient session UI state.

## Structural upgrades

The model supports several possible in-place upgrades:

- label to type/container;
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
- A `view` never mints ownership from query results.
- Derived caches can be dropped and rebuilt without losing user data.
- Every source-of-truth schema addition declares its replication policy.
