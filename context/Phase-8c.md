# Phase 8c -- Matrix ownership and tags-as-nodes

> Part C of the data-layer ownership-spine work. See [Phase 8](Phase-8.md) for the umbrella and settled foundational decisions, and [Phase 8b](Phase-8b.md) for the derived projections. This part adds the thin `matrix.owner` fact, realizes **own-matrix** (a node owning a dedicated matrix), dissolves the tag registry into named **type-nodes**, and splits "tag" into **label (`ref`)** vs **type (`own`)**. The promotion taxonomy falls out. Depends on Phase 8 (edges + sentinel); reads cleaner after Phase 8b (global closure/scroll index).

The core duality this part encodes: **a node owning a matrix is a *class* (it holds the extent + schema); a node owning a row is an *instance* (a slot in some extent).** Same primitive read at two grains.

---

## 1. The `matrix.owner` fact

- [ ] **Add owner columns to `matrix`.** `owner_matrix_id INTEGER` and `owner_row_id INTEGER`, both nullable (migration via `ALTER TABLE matrix ADD COLUMN ...`). `matrix.owner = (matrix_id, row_id)` is the **thin coordinating fact**: it enables schema isolation, a fast whole-table drop, and "this matrix is a dedicated container of node X." It is **not** the primary structural tie -- ancestry stays a uniform `own`-chain (no special "hop via `matrix.owner`" rule).
- [ ] **Cardinality and nullability (resolution §2.3).** `owner` is **N:1** (a node may own several matrixes; each matrix has ≤1 owner -- the matrix-grain mirror of row single-ownership) and **nullable** (the everything/system matrixes are unowned and hold the forest roots). Enforce ≤1 owner per matrix structurally (it is a column on `matrix`, so this is automatic).
- [ ] Tests: a matrix can be created owned or unowned; setting/clearing owner works; the workspace ("everything") matrix is unowned.

## 2. own-matrix: a node owning a dedicated matrix

- [ ] **own-matrix = `own`-edges to the matrix's root rows + the `matrix.owner` fact.** A node that owns a dedicated matrix has `own`-edges to that matrix's root rows (cross-matrix, exactly like a hosted aspect row from Phase 8 §3). Interior nesting (e.g. subtasks) uses ordinary intra-matrix `own`-edges. The `matrix.owner` fact records the container relationship for drop/isolation.
- [ ] **Creation op.** Add an op that, given an owner node, creates a new matrix with `owner = (node)`, optionally seeds root rows, and attaches them via `own`-edges to the node. This is the "new dedicated matrix" / "make this a sub-table" gesture's data path (the UX gesture itself is [Phase 9 §unified creation gesture](Phase-9.md)).
- [ ] **Matrix-drop cascade (the second deletion dependency, resolution §2.5).** Dropping a matrix via its identity face = sever `matrix.owner` + drop the data table + cascade its rows. This composes with the Phase 8b row cascade: deleting the owner node cascades its `own`-children (including the matrix's root rows) **and** drops the owned matrix. Deleting a `#task`'s host kills that task (row cascade); deleting the `task` type-node drops the table and every task (matrix cascade). Implement both and prove they are independent axes.
- [ ] Tests: creating an own-matrix wires owner + root `own`-edges; dropping the matrix removes the table and cascades rows; deleting the owner node drops the owned matrix; a hosted aspect row's ancestry still climbs through its host (not via `matrix.owner`).

## 3. own-matrix vs own-rows: shared vs dedicated has a structural signature

The own-matrix/own-rows distinction is type-vs-instance, and **shared vs dedicated is structural, not just a UX knob (resolution §2.4):**

- [ ] **Dedicated** (private sub-table): matrix-owner and row-owners are the **same** node. The node owns both the matrix (class) and all its rows (instances).
- [ ] **Shared** (tag type): the type-node owns the **matrix**; **many hosts** own the **rows**. Ownership **diverges** -- the type-node owns the extent/schema, each host owns its own aspect row.
- [ ] Capture this signature in a query/helper so the UX (Phase 9) can detect "is this collection shared or dedicated?" by comparing matrix-owner against the row-owners, rather than storing a redundant flag.
- [ ] Tests: a dedicated sub-table has matrix-owner == every row-owner; a shared tag type has matrix-owner (type-node) ≠ row-owners (hosts).

## 4. Tags reduced to nodes + ownership

Today the tags plugin (`src/tags/*`) tracks tag types in a **registry matrix** and creates aspect rows via `createDependentRow`. The ownership model dissolves the registry.

- [ ] **"Tag" was two things; cleave by edge kind.**
  - A **label** -- a named node you associate rows with, no schema. **label = a `ref`-edge to a node.** A label is *not a data kind*: it is any node with inbound `ref`-edges; its backlinks are its members. The existing backlinks mechanism covers this with no new machinery.
  - A **type** -- a record schema you instantiate per host. **type = an `own`-edge to a typed (owned) matrix.**
- [ ] **A tag type is an everything-matrix node that owns a matrix and is flagged globally invocable.** The **registry matrix dissolves** into "the set of named type-nodes." The type's name is the node's **`label`-role column** (reuse the existing role; no new field). The type-node is simultaneously a name, a place (navigable, can hold notes), a schema (its owned matrix), and a collection root.
- [ ] **Promotion/visibility flag for `#` autocomplete.** A child matrix and a tag-type matrix are the *same structure* (a matrix owned by a node); the only difference is whether the owner-node carries a **globally invocable name**. Taggability is therefore a **promotion/visibility flag on the owner-node**, not a property of the matrix. *Any* owned matrix is a candidate; only **promoted** ones appear in `#` autocomplete. Store this flag on the node (or a small `invocable` fact) -- it is the gate that keeps autocomplete from drowning in private sub-tables. **Possible ≠ offered.**
- [ ] **Migrate the tags plugin.** Replace the registry-matrix lookups (`hila.tags` `registry` key, `createTagType`, the `#` autocomplete search provider, the tag browser) with type-node queries: "promoted type-nodes" instead of "registry rows." `createTagType` becomes "create an own-matrix on a new promoted type-node." Keep the user-facing behavior identical where possible.
- [ ] Tests: a tag type is a promoted node owning a matrix; `#` autocomplete lists exactly the promoted type-nodes; the type name is the node's label column; an unpromoted owned matrix does not appear in autocomplete.

## 5. Tagging gestures map onto the two edges

- [ ] **`#task` (create)** → an `own`-edge to a **new** aspect row in the type's matrix (today's `createDependentRow`, now with the edge key from Phase 8).
- [ ] **Tag an existing entity** → a `ref`-edge (link, not own). *This resolves `Plan.md` open question #3: create-vs-link **is** own-vs-ref.* Update Plan.md's #3 to "resolved."
- [ ] **`#label` (no schema)** → a `ref`-edge to the label-node.
- [ ] **Two ownership grains coexist** without violating single-parent (they own *different things*): the **type-node owns the matrix**; each **host owns its aspect row**.
- [ ] **Hostless aspect rows are first-class.** A task created directly in the Tasks table is owned by the **type-node** (a "task unto itself"). `owner = host` is a **default, not a law**. Contextualizing such a task later = **reparenting its `own`-edge** from the type-node to a host bullet (an ordinary cross-matrix reparent from Phase 8 §4).
- [ ] Tests: `#task` creates an own aspect row; tagging an existing row creates a `ref`-edge; a hostless task is owned by the type-node and can be reparented onto a host; removing a `#`-tag cascades the aspect row (existing lifecycle, on the edge model).

## 6. The promotion taxonomy

Every "this got more serious" migration is a crossing of two axes -- **`ref`→`own`** (add lifecycle) and **add-a-matrix** (add schema). Capture these as named ops/migrations where useful (resolution §2.7):

| Promotion | Crossing(s) |
|---|---|
| label → type | `ref`→`own` + add-a-matrix |
| folksonomy member → owned aspect | `ref`→`own` |
| shared collection → dedicated sub-table | add-a-matrix (+ re-home rows) |
| subtree → table | add-a-matrix (+ re-home rows) |

- [ ] **"Promote subtree to table" stays a real migration** because of **column-locality** (columns are matrix-wide; the everything matrix must not grow domain columns), **not** anything in the ownership model. The `own`-edges survive a re-home unchanged -- re-homing moves rows into a new owned matrix and keeps their edges.
- [ ] Implement the promotions that have concrete near-term consumers (at minimum label→type and member→owned-aspect, which the tags UX needs); leave subtree→table and shared→dedicated as documented migration recipes if no consumer needs them yet (do not over-build).
- [ ] Tests: label→type converts a `ref` label into an own-matrix type-node and re-points members as appropriate; member→owned-aspect upgrades a `ref` to an `own` aspect row.

---

## 7. Performance guards -- Part C (ownership and joins at scale)

Uses the Stage P0 harness ([Phase 8 -- Performance testing strategy](Phase-8.md)). The key risk here: `joins` is now O(total rows) (every row has an `own`-edge), so it is one of the largest tables and **no join access path can afford to be index-blind**.

- [ ] **Backlinks and forward lookups are index-covered against the huge `joins` table (EQP):** `getSources` (ref-only backlinks) and `getTargets` use `kind`-aware partial indexes, with no full `SCAN` of `joins` and no `USING AUTOMATIC`, verified at representative scale where `joins` is dominated by `own`-edges. (Add the partial `kind`-filtered indexes if missing.)
- [ ] **Matrix drop is a whole-table drop, not a per-row cascade (work-count):** dropping an owned matrix via its identity face performs O(1) table drops + an owner sever, not O(rows) individual deletes -- this is the payoff of the `matrix.owner` fact for large tag types (e.g. dropping a `#task` type with thousands of instances).
- [ ] **`#` autocomplete is bounded (EQP / work-count):** listing promoted type-nodes scans only promoted nodes (index or small bounded set), never the whole everything-matrix or every owned matrix.
- [ ] **Shared-vs-dedicated detection is cheap (work-count):** comparing matrix-owner against row-owners (§3) is a bounded lookup, not a scan of all rows in the matrix.

## Done criteria (Phase 8c)

`matrix.owner` is a thin N:1 nullable fact; own-matrix is realized as `own`-edges to a matrix's roots plus the owner fact, with a creation op and a matrix-drop cascade that is independent of the row cascade. Shared vs dedicated is detectable by comparing matrix-owner to row-owners. The tag registry is dissolved: tag types are promoted type-nodes that own a matrix, named by their `label` column; `#` autocomplete lists only promoted nodes. Tagging maps cleanly to the two edges (create=own, link=ref, label=ref), hostless aspect rows are first-class and reparentable, and the create-vs-link resolution closes `Plan.md` #3. The promotion taxonomy is documented and its near-term members implemented. The Part C performance guards (§7) pass -- join lookups stay index-covered against the now-large `joins` table and matrix drop is a whole-table operation. Static analysis, unit tests, and the tag/outline E2E suites pass.

## Dependency notes

Depends on [Phase 8](Phase-8.md) (edges + sentinel) and reads cleaner after [Phase 8b](Phase-8b.md) (global closure/scroll index, row cascade). Reshapes how the tags plugin stores tag types, so sequence it before further tag work; the tasks/movie-reviews work ([Phase 11](Phase-11.md)) builds on the type-node model from here. Closes `Plan.md` open question #3 (create-vs-link = own-vs-ref) and narrows #4 (only `ref`-edges want optional labels). Unlocks the [Phase 9](Phase-9.md) view-layer surfaces (property surface, embedded collections, dedicated sub-tables, cross-matrix navigation).
