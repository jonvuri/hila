# Traits

Traits are per-matrix metadata tables that provide structural capabilities. A matrix "has the rank trait" or "has the closure trait." The core provisions the underlying tables and provides operations on them. Any consumer -- plugins, faces, or the system itself -- can request traits for any matrix.

A trait is **not** a plugin. It has no lifecycle, no faces, no independent agency. It is a purpose-specific data structure that the core knows how to create, maintain, and optimize.

All trait operations are expressed as SQL and execute inside the SQLite engine. See [Architecture - Execution model](./Architecture.md#execution-model) for the overall approach.

## Provisioning model

Traits are auto-provisioned on first request and shared by all consumers.

**`ensureTrait(type, matrixId)`** is the provisioning interface. If the backing table for the requested trait already exists, the existing handle is returned. If not, the core creates it.

- **Idempotent.** Requesting an already-provisioned trait is a no-op that returns the existing handle.
- **Shared.** Multiple plugins and faces read/write the same trait tables. If the outline plugin and a note plugin both need rank for the same matrix, they share one table.
- **Lazy.** Traits are provisioned when first requested, not eagerly. A matrix starts with no traits.
- **Persistent.** Once provisioned, a trait persists even if the requesting consumer is disabled or removed. Trait tables are matrix infrastructure, not plugin state.

**Face-triggered provisioning.** When a face type with trait requirements is applied to a matrix, the system auto-provisions the needed traits. For example, applying the outline face to a note matrix provisions rank and closure traits for that matrix, even though the note plugin never requested them.

## Rank

Provides tree-position ordering of rows using Lexorank sort keys. The rank table is global (shared across all matrixes) and uses `matrix_id` to separate entries. Provisioning rank for a matrix records the intent in `matrix_traits`; the global rank table already exists.

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

Provides ancestor/descendant hierarchy tracking within a matrix. Any consumer can request a closure trait for a matrix, and the core provisions a per-matrix closure table for it (`mx_{matrixId}_closure`).

A closure table has one row for every ancestor-descendant relationship, including the identity relationship between a row and itself (depth 0).

### Invariant with rank

When a matrix has both rank and closure traits, the closure table is the source of truth for the matrix's tree structure and the depth of each row. However, it must match up with the Lexorank structure in the rank table when it comes to ancestor/descendant/sibling relationships. All operations that modify either table should use transactions and be carefully tested to ensure this invariant.

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

## Current scope and future evolution

The trait system currently has two types: rank and closure. They have an intentional asymmetry:

- **Closure** is per-matrix (each matrix gets its own `mx_{id}_closure` table) and genuinely lazy -- the table is created on demand by `ensureTrait`. This is the cleanest fit for the trait model: optional, shared, provisioned transparently.

- **Rank** is a global table that uses `matrix_id` to partition entries. Provisioning rank is bookkeeping (a `matrix_traits` row) rather than table creation. The global rank table encodes both ordering and hierarchy in the Lexorank key structure -- a parent's key is a prefix of its children's keys. This makes it tree-position infrastructure, not a generic ordering primitive.

**Why this matters for future consumers.** The current rank design serves tree-structured views (outline, hierarchical note lists) well. But non-tree orderings -- flat list positions, kanban column positions, spaced-repetition schedules -- have fundamentally different shapes. A kanban ordering doesn't use hierarchical Lexorank keys. A flashcard review order might be computed from interval data rather than stored as position keys.

When a non-tree ordering consumer arrives, it has two clean options:

1. **Plugin-specific table.** If the ordering is internal to one plugin, it can create its own position table (using the Lexorank utilities for `between()` calculations) without involving the trait system. Traits only add value for genuinely shared structural metadata.

2. **New trait type.** If the ordering needs to be shared across consumers (e.g. a flat ordering used by both a list face and a calendar face), the trait system could evolve to support additional ordering types. This would mean new trait types with their own provisioning logic, not scoping the existing rank table.

The Lexorank algorithm (`between`, `makeKey`, `parseKey`, `nextPrefix`) is shared utility code regardless of how ordering tables evolve.

## Join

The join table is **global infrastructure**, not a per-matrix trait. It is always present and provides cross-matrix row references. Every matrix can participate in joins without requesting anything.

### Schema

```sql
CREATE TABLE IF NOT EXISTS joins (
  source_matrix_id  INTEGER NOT NULL,
  source_row_id     INTEGER NOT NULL,
  target_matrix_id  INTEGER NOT NULL,
  target_row_id     INTEGER NOT NULL,
  kind              TEXT NOT NULL DEFAULT 'ref',
  PRIMARY KEY (source_matrix_id, source_row_id, target_matrix_id, target_row_id)
) STRICT;
```

Indexes should support efficient queries in both directions (source -> targets, target -> sources).

### Join kinds

The `kind` column distinguishes two flavors of cross-matrix relationship:

- **`ref`** (reference). An independent link -- "this row mentions that row." Neither end affects the other's lifecycle. Removing the join or deleting the source row has no effect on the target row. This is the default and the kind used by `@`-references (wiki-links, foreign-key cell values, backlinks).

- **`own`** (owned). A lifecycle-bound relationship -- "this row created and owns that row as an aspect." The target row exists *because of* this join. When the join is removed or the source row is deleted, the target row is cascade-deleted. This is the kind used by `#`-tags, where tagging a row creates a dependent aspect row in the tag's matrix.

Each row has at most one `own` join pointing to it (single ownership). Multiple `ref` joins may point to the same target. Ownership is not transferable -- it is set at creation time and follows the relationship until it is severed.

### Lifecycle rules

The core enforces two rules based on join kind:

1. **Source deletion cascades to owned targets.** When `deleteRow(matrixId, rowId)` is called, all join entries where `(source_matrix_id, source_row_id) = (matrixId, rowId)` and `kind = 'own'` trigger cascade deletion of their target rows. The cascade is recursive -- if an owned target itself owns further targets, those cascade too.

2. **Removing an `own` join deletes the target.** When an `own` join entry is removed (e.g. because an inline `#`-tag was deleted from rich text, or a cell was cleared), the target row is deleted. This is the same cascade as rule 1, applied to join removal rather than source row deletion.

`ref` joins have no lifecycle side effects. Removing a `ref` join or deleting its source row simply removes the join entry.

**Reverse deletion from the identity face.** A dependent (owned) row is a real row in its target matrix and appears in that matrix's identity face. Deleting it from the identity face is permitted -- the core removes the `own` join entry and cleans up the source-side reference (nulling the cell value, or removing the inline node from the source row's rich text content). The specifics of source-side cleanup depend on the reference surface (inline text vs. table cell) and are handled by the plugin that manages that surface.

### Core operations

**`createDependentRow(sourceMatrixId, sourceRowId, targetMatrixId, columnValues)`** atomically:
1. Inserts a new row in the target matrix with the given column values.
2. Inserts a join entry with `kind = 'own'`.
3. Returns the new target row ID.

This is used by any plugin that needs lifecycle-bound cross-matrix rows (tags, file attachments, inline embeds, etc.).

**`createRefJoin(sourceMatrixId, sourceRowId, targetMatrixId, targetRowId)`** inserts a join entry with `kind = 'ref'`. The target row must already exist.

### Semantics

- A join row says "this row in this matrix references that row in that matrix," with `kind` indicating whether the relationship carries lifecycle ownership.
- Joins are many-to-many: a single row can reference multiple rows across multiple matrixes, and a single row can be referenced by many others.
- Joins are orthogonal to traits. A note can join to a tag row in a matrix that has no rank or closure traits.
- Joins can serve as a **materialized index** of relationships that are encoded elsewhere (e.g. inline references in rich text), or as the **primary source of truth** for a relationship (e.g. a foreign-key cell in a table), depending on the surface.

> **Anchoring (view-layer consequence).** This "where the source of truth lives" distinction is load-bearing for the UI, not just bookkeeping. An `own`-join whose source of truth is an inline `#`-ref in prose is **content-anchored** (its edge lives *inside* a node's content, and moving it is a prose edit); an `own`-join whose source of truth is a structural table or an FK cell is **structurally-anchored** (moving it is a pure structural write); a node-scoped query with no join row is **unanchored**. The [Phase 9.2](Phase-9.2.md) rendering model builds directly on these three anchoring tiers (tether geometry, move-from-anchor gestures, and which presentations a related set may take).

### Hydration

Join reference columns follow the same hydration rules as any other column. When a query selects a join reference (the target matrix and row IDs), that column is **hydrated** -- it is live and editable. The user can relink, unlink, or create links by editing the visible reference value. If the join reference is not selected in the query, the join relationship is invisible and cannot be modified from that face.

Edits to join reference cells respect the `kind` semantics: clearing an `own`-kind cell deletes the target row; clearing a `ref`-kind cell just removes the join entry.

See [Architecture - Hydration](./Architecture.md#hydration) for the full editability model.

### SQL access patterns

```sql
-- Forward lookup: all targets for a source row
SELECT target_matrix_id, target_row_id, kind FROM joins
WHERE source_matrix_id = :mid AND source_row_id = :rid;

-- Reverse lookup: all sources referencing a target row
SELECT source_matrix_id, source_row_id, kind FROM joins
WHERE target_matrix_id = :mid AND target_row_id = :rid;

-- All rows in matrix A that reference any row in matrix B
SELECT DISTINCT source_row_id FROM joins
WHERE source_matrix_id = :a AND target_matrix_id = :b;

-- Find owned targets for cascade deletion
SELECT target_matrix_id, target_row_id FROM joins
WHERE source_matrix_id = :mid AND source_row_id = :rid AND kind = 'own';
```
