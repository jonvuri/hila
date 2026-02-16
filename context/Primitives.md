# Structural primitives

Structural primitives are core-provided building blocks that plugins can request for their matrixes. The core provisions the underlying tables and provides operations on them. Plugins choose which primitives they need and compose them to build their functionality.

A primitive is **not** a plugin. It has no lifecycle, no faces, no independent agency. It is a data structure that the core knows how to create, maintain, and optimize on behalf of plugins.

## Rank

Provides ordered positioning of entries within a scope, using Lexorank sort keys. A plugin requests a rank scope, and the core provisions a rank table for it.

Different plugins can maintain independent rank scopes over the same or different matrixes. For example, the outline plugin ranks entries by user-chosen position, while a kanban plugin might rank the same entries by priority.

### Lexorank encoding

Uses **`0x00`-terminated, variable-length segments** (no length headers):

- **Segment content bytes:** `0x01..0xFF` (never `0x00`).
- **Terminator:** each segment ends with a single `0x00`.
- **Key:** concatenation of one or more terminated segments.
- **Natural sort:** plain lexicographic BLOB order over the key equals outline order.
- **Parent/child relation:** a parent's key is a strict prefix ending in `0x00`; a child appends another terminated segment. Parents always sort before descendants.

### Key operations

- **Subtree range query:** for a node key `P`, the subtree is `[P, nextPrefix(P))`, where `nextPrefix(P)` is `P` with its final `0x00` incremented to `0x01`. If no upper bound exists (rare edge), the subtree extends to table end.
- **Fractional indexing / insert-between:** generate a child segment strictly between two sibling segments. If no room at current length, extend the segment by appending bytes (no ancestor changes required).
- **Reordering:** large reordering operations (including reparenting that rewrites descendant keys) are acceptable by design.

### Properties of this encoding

- Variable lengths at the same level do **not** break sorting.
- No sibling can accidentally be a prefix of another sibling (prefix implies ancestry only).
- Simple, fast windowed scans and subtree operations.

### Example access patterns

- Get all entries in order, with a limit and offset.
- Using a Lexorank prefix, get all descendants of a specific entry in order (an entry focus view).
- Add a new entry after a specific entry (usually, between two existing entries).
- Reorder entries within a parent or across parents.

## Closure

Provides ancestor/descendant hierarchy tracking within a matrix. A plugin requests a closure scope for a matrix, and the core provisions a closure table for it.

A closure table has one row for every ancestor-descendant relationship, including the identity relationship between an entry and itself (depth 0).

### Invariant with rank

When a plugin uses both rank and closure on the same matrix, the closure table is the source of truth for the matrix's outline structure and the depth of each entry. However, it must match up with the Lexorank structure in the rank table when it comes to ancestor/descendant/sibling relationships. All operations that modify either table should use transactions and be carefully tested to ensure this invariant.

### Example access patterns

- Get all ancestors of a specific entry up to the root (navigation breadcrumbs).
- Look up previous and next siblings of a specific entry.
- Get all entries in order, filtering out entries that are descendants of a set of 'collapsed' entries (using both rank and closure).

## Join

Provides cross-matrix row references. The join table is a single global table (analogous to how the matrix registry is global) that links rows across matrixes.

### Schema

```sql
CREATE TABLE IF NOT EXISTS joins (
  source_matrix_id  INTEGER NOT NULL,
  source_entry_id   INTEGER NOT NULL,
  target_matrix_id  INTEGER NOT NULL,
  target_entry_id   INTEGER NOT NULL,
  PRIMARY KEY (source_matrix_id, source_entry_id, target_matrix_id, target_entry_id)
) STRICT;
```

Indexes should support efficient queries in both directions (source → targets, target → sources).

### Semantics

- A join row says "this entry in this matrix references that entry in that matrix."
- Joins are many-to-many: a single entry can reference multiple entries across multiple matrixes, and a single entry can be referenced by many others.
- Joins are orthogonal to the outline hierarchy. A note in the user's outline can join to a tag row in a plugin-managed matrix that has never appeared in any outline.
- Joins can serve as a **materialized index** of relationships that are encoded elsewhere (e.g. inline tag markers in note text), or as the **primary source of truth** for a relationship, depending on the plugin's design.

### Example access patterns

- Given a source entry, find all target entries it references (with optional matrix filter).
- Given a target entry, find all source entries that reference it (reverse lookup).
- Find all entries in matrix A that reference any entry in matrix B.
