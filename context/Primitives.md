# Structural primitives

Structural primitives are core-provided building blocks that plugins can request for their matrixes. The core provisions the underlying tables and provides operations on them. Plugins choose which primitives they need and compose them to build their functionality.

A primitive is **not** a plugin. It has no lifecycle, no faces, no independent agency. It is a data structure that the core knows how to create, maintain, and optimize on behalf of plugins.

All primitive operations are expressed as SQL and execute inside the SQLite engine. See [Architecture - Execution model](./Architecture.md#execution-model) for the overall approach.

## Rank

Provides ordered positioning of rows within a scope, using Lexorank sort keys. A plugin requests a rank scope, and the core provisions a rank table for it.

Different plugins can maintain independent rank scopes over the same or different matrixes. For example, the outline plugin ranks rows by user-chosen position, while a kanban plugin might rank the same rows by priority.

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

### Custom SQLite functions

The `between(a, b)` algorithm is byte-level and procedural -- it does not map naturally to set-based SQL. It is registered as a **custom SQLite function** (`lexo_between`) at init, authored in TypeScript but executing inside the SQLite engine. This allows it to be called inline in SQL statements without a round trip:

```sql
INSERT INTO rank (key, matrix_id, row_kind, row_id)
VALUES (lexo_between(:prev_key, :next_key), :matrix_id, :kind, :row_id);
```

Similarly, `nextPrefix` is a simple BLOB operation expressible as inline SQL:

```sql
-- nextPrefix: replace trailing 0x00 with 0x01
substr(:key, 1, length(:key) - 1) || X'01'
```

### SQL access patterns

All rank queries are pure SQL:

```sql
-- Get all rows in order
SELECT * FROM rank WHERE matrix_id = :mid ORDER BY key;

-- Subtree query (all descendants of a node)
SELECT * FROM rank
WHERE key >= :parent_key
  AND key < substr(:parent_key, 1, length(:parent_key) - 1) || X'01'
ORDER BY key;

-- Reparent: rewrite descendant keys with new prefix
UPDATE rank
SET key = :new_prefix || substr(key, length(:old_prefix) + 1)
WHERE key >= :old_prefix
  AND key < substr(:old_prefix, 1, length(:old_prefix) - 1) || X'01'
  AND matrix_id = :matrix_id;
```

## Closure

Provides ancestor/descendant hierarchy tracking within a matrix. A plugin requests a closure scope for a matrix, and the core provisions a closure table for it.

A closure table has one row for every ancestor-descendant relationship, including the identity relationship between a row and itself (depth 0).

### Invariant with rank

When a plugin uses both rank and closure on the same matrix, the closure table is the source of truth for the matrix's outline structure and the depth of each row. However, it must match up with the Lexorank structure in the rank table when it comes to ancestor/descendant/sibling relationships. All operations that modify either table should use transactions and be carefully tested to ensure this invariant.

### SQL operations

Closure operations are naturally set-based and map to SQL more cleanly than to imperative code.

**Add a child row** (insert self-reference + all ancestor relationships):

```sql
-- Self-reference
INSERT INTO closure (ancestor_key, descendant_key, depth)
VALUES (:new_key, :new_key, 0);

-- All ancestor relationships in one shot
INSERT INTO closure (ancestor_key, descendant_key, depth)
SELECT ancestor_key, :new_key, depth + 1
FROM closure
WHERE descendant_key = :parent_key;
```

The `INSERT ... SELECT` generates all ancestor rows inside the engine in a single statement, replacing a fetch-loop-insert pattern.

**Reparent a subtree:**

```sql
-- Remove old ancestor relationships (preserve subtree-internal ones)
DELETE FROM closure
WHERE descendant_key IN (
    SELECT descendant_key FROM closure WHERE ancestor_key = :node_key
  )
  AND ancestor_key NOT IN (
    SELECT descendant_key FROM closure WHERE ancestor_key = :node_key
  );

-- Graft onto new parent
INSERT INTO closure (ancestor_key, descendant_key, depth)
SELECT a.ancestor_key, d.descendant_key, a.depth + d.depth + 1
FROM closure a
CROSS JOIN closure d
WHERE a.descendant_key = :new_parent_key
  AND d.ancestor_key = :node_key;
```

**Delete a row:**

```sql
DELETE FROM closure
WHERE ancestor_key = :key OR descendant_key = :key;
```

**Get ancestors (breadcrumbs):**

```sql
SELECT ancestor_key, depth FROM closure
WHERE descendant_key = :key AND depth > 0
ORDER BY depth;
```

### Combined transactions

Rank and closure operations compose into single atomic transactions. For example, inserting a new row after a sibling under a parent:

```sql
BEGIN TRANSACTION;

-- Find next sibling and compute key (via custom function)
WITH next_sibling AS (
  SELECT key FROM rank
  WHERE matrix_id = :matrix_id
    AND key > :prev_key
    AND key < substr(:parent_key, 1, length(:parent_key) - 1) || X'01'
  ORDER BY key ASC
  LIMIT 1
)
INSERT INTO rank (key, matrix_id, row_kind, row_id)
VALUES (
  lexo_between(:prev_key, COALESCE((SELECT key FROM next_sibling), X'')),
  :matrix_id, :kind, :row_id
)
RETURNING key;

-- Closure: self-reference
INSERT INTO closure (ancestor_key, descendant_key, depth)
VALUES (:new_key, :new_key, 0);

-- Closure: ancestor relationships
INSERT INTO closure (ancestor_key, descendant_key, depth)
SELECT ancestor_key, :new_key, depth + 1
FROM closure
WHERE descendant_key = :parent_key;

COMMIT;
```

This replaces hundreds of lines of interleaved TypeScript and SQL with a handful of declarative statements in one transaction.

## Join

Provides cross-matrix row references. The join table is a single global table (analogous to how the matrix registry is global) that links rows across matrixes.

### Schema

```sql
CREATE TABLE IF NOT EXISTS joins (
  source_matrix_id  INTEGER NOT NULL,
  source_row_id     INTEGER NOT NULL,
  target_matrix_id  INTEGER NOT NULL,
  target_row_id     INTEGER NOT NULL,
  PRIMARY KEY (source_matrix_id, source_row_id, target_matrix_id, target_row_id)
) STRICT;
```

Indexes should support efficient queries in both directions (source → targets, target → sources).

### Semantics

- A join row says "this row in this matrix references that row in that matrix."
- Joins are many-to-many: a single row can reference multiple rows across multiple matrixes, and a single row can be referenced by many others.
- Joins are orthogonal to the outline hierarchy. A note in the user's outline can join to a tag row in a plugin-managed matrix that has never appeared in any outline.
- Joins can serve as a **materialized index** of relationships that are encoded elsewhere (e.g. inline tag markers in note text), or as the **primary source of truth** for a relationship, depending on the plugin's design.

### Hydration

Join reference columns follow the same hydration rules as any other column. When a query selects a join reference (the target matrix and row IDs), that column is **hydrated** -- it is live and editable. The user can relink, unlink, or create links by editing the visible reference value. If the join reference is not selected in the query, the relationship is invisible and cannot be modified from that face.

See [Architecture - Hydration](./Architecture.md#hydration) for the full editability model.

### SQL access patterns

```sql
-- Forward lookup: all targets for a source row
SELECT target_matrix_id, target_row_id FROM joins
WHERE source_matrix_id = :mid AND source_row_id = :rid;

-- Reverse lookup: all sources referencing a target row
SELECT source_matrix_id, source_row_id FROM joins
WHERE target_matrix_id = :mid AND target_row_id = :rid;

-- All rows in matrix A that reference any row in matrix B
SELECT DISTINCT source_row_id FROM joins
WHERE source_matrix_id = :a AND target_matrix_id = :b;
```
