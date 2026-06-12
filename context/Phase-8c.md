# Phase 8c -- Matrix ownership and tags-as-nodes

> Part C of the data-layer ownership-spine work. See [Phase 8](Phase-8.md) for the umbrella and settled foundational decisions, and [Phase 8b](Phase-8b.md) for the derived projections. This part adds the thin `matrix.owner` fact, realizes **own-matrix** (a node owning a dedicated matrix), dissolves the tag registry into named **type-nodes**, and splits "tag" into **label (`ref`)** vs **type (`own`)**. The promotion taxonomy falls out. Depends on Phase 8 (edges + sentinel); reads cleaner after Phase 8b (global closure/scroll index).

The core duality this part encodes: **a node owning a matrix is a *class* (it holds the extent + schema); a node owning a row is an *instance* (a slot in some extent).** Same primitive read at two grains.

---

## 1. The `matrix.owner` fact

- [x] **Add owner columns to `matrix`.** `owner_matrix_id INTEGER` and `owner_row_id INTEGER`, both nullable (migration via `ALTER TABLE matrix ADD COLUMN ...`). `matrix.owner = (matrix_id, row_id)` is the **thin coordinating fact**: it enables schema isolation, a fast whole-table drop, and "this matrix is a dedicated container of node X." It is **not** the primary structural tie -- ancestry stays a uniform `own`-chain (no special "hop via `matrix.owner`" rule).
- [x] **Cardinality and nullability (resolution §2.3).** `owner` is **N:1** (a node may own several matrixes; each matrix has ≤1 owner -- the matrix-grain mirror of row single-ownership) and **nullable** (the everything/system matrixes are unowned and hold the forest roots). Enforce ≤1 owner per matrix structurally (it is a column on `matrix`, so this is automatic).
- [x] Tests: a matrix can be created owned or unowned; setting/clearing owner works; the workspace ("everything") matrix is unowned.

## 2. own-matrix: a node owning a dedicated matrix

- [x] **own-matrix = `own`-edges to the matrix's root rows + the `matrix.owner` fact.** A node that owns a dedicated matrix has `own`-edges to that matrix's root rows (cross-matrix, exactly like a hosted aspect row from Phase 8 §3). Interior nesting (e.g. subtasks) uses ordinary intra-matrix `own`-edges. The `matrix.owner` fact records the container relationship for drop/isolation.
- [x] **Creation op.** Add an op that, given an owner node, creates a new matrix with `owner = (node)`, optionally seeds root rows, and attaches them via `own`-edges to the node. This is the "new dedicated matrix" / "make this a sub-table" gesture's data path (the UX gesture itself is [Phase 9 §unified creation gesture](Phase-9.md)).
- [x] **Matrix-drop cascade (the second deletion dependency, resolution §2.5).** Dropping a matrix via its identity face = sever `matrix.owner` + drop the data table + cascade its rows. This composes with the Phase 8b row cascade: deleting the owner node cascades its `own`-children (including the matrix's root rows) **and** drops the owned matrix. Deleting a `#task`'s host kills that task (row cascade); deleting the `task` type-node drops the table and every task (matrix cascade). Implement both and prove they are independent axes.
- [x] Tests: creating an own-matrix wires owner + root `own`-edges; dropping the matrix removes the table and cascades rows; deleting the owner node drops the owned matrix; a hosted aspect row's ancestry still climbs through its host (not via `matrix.owner`).

## 3. own-matrix vs own-rows: shared vs dedicated has a structural signature

The own-matrix/own-rows distinction is type-vs-instance, and **shared vs dedicated is structural, not just a UX knob (resolution §2.4):**

- [x] **Dedicated** (private sub-table): matrix-owner and row-owners are the **same** node. The node owns both the matrix (class) and all its rows (instances).
- [x] **Shared** (tag type): the type-node owns the **matrix**; **many hosts** own the **rows**. Ownership **diverges** -- the type-node owns the extent/schema, each host owns its own aspect row.
- [x] Capture this signature in a query/helper so the UX (Phase 9) can detect "is this collection shared or dedicated?" by comparing matrix-owner against the row-owners, rather than storing a redundant flag.
- [x] Tests: a dedicated sub-table has matrix-owner == every row-owner; a shared tag type has matrix-owner (type-node) ≠ row-owners (hosts).

## 4. Tags reduced to nodes + ownership

Today the tags plugin (`src/tags/*`) tracks tag types in a **registry matrix** and creates aspect rows via `createDependentRow`. The ownership model dissolves the registry.

- [x] **"Tag" was two things; cleave by edge kind.**
  - A **label** -- a named node you associate rows with, no schema. **label = a `ref`-edge to a node.** A label is *not a data kind*: it is any node with inbound `ref`-edges; its backlinks are its members. The existing backlinks mechanism covers this with no new machinery.
  - A **type** -- a record schema you instantiate per host. **type = an `own`-edge to a typed (owned) matrix.**
- [x] **A tag type is an everything-matrix node that owns a matrix and is flagged globally invocable.** The **registry matrix dissolves** into "the set of named type-nodes." The type's name is the node's **`label`-role column** (reuse the existing role; no new field). The type-node is simultaneously a name, a place (navigable, can hold notes), a schema (its owned matrix), and a collection root.
- [x] **Promotion/visibility flag for `#` autocomplete.** A child matrix and a tag-type matrix are the *same structure* (a matrix owned by a node); the only difference is whether the owner-node carries a **globally invocable name**. Taggability is therefore a **promotion/visibility flag on the owner-node**, not a property of the matrix. *Any* owned matrix is a candidate; only **promoted** ones appear in `#` autocomplete. Store this flag on the node (or a small `invocable` fact) -- it is the gate that keeps autocomplete from drowning in private sub-tables. **Possible ≠ offered.**
- [x] **Migrate the tags plugin.** Replace the registry-matrix lookups (`hila.tags` `registry` key, `createTagType`, the `#` autocomplete search provider, the tag browser) with type-node queries: "promoted type-nodes" instead of "registry rows." `createTagType` becomes "create an own-matrix on a new promoted type-node." Keep the user-facing behavior identical where possible.
- [x] Tests: a tag type is a promoted node owning a matrix; `#` autocomplete lists exactly the promoted type-nodes; the type name is the node's label column; an unpromoted owned matrix does not appear in autocomplete.

## 5. Tagging gestures map onto the two edges

- [x] **`#task` (create)** → an `own`-edge to a **new** aspect row in the type's matrix (today's `createDependentRow`, now with the edge key from Phase 8).
- [x] **Tag an existing entity** → a `ref`-edge (link, not own). *This resolves `Plan.md` open question #3: create-vs-link **is** own-vs-ref.* Update Plan.md's #3 to "resolved."
- [x] **`#label` (no schema)** → a `ref`-edge to the label-node.
- [x] **Two ownership grains coexist** without violating single-parent (they own *different things*): the **type-node owns the matrix**; each **host owns its aspect row**.
- [x] **Hostless aspect rows are first-class.** A task created directly in the Tasks table is owned by the **type-node** (a "task unto itself"). `owner = host` is a **default, not a law**. Contextualizing such a task later = **reparenting its `own`-edge** from the type-node to a host bullet (an ordinary cross-matrix reparent from Phase 8 §4).
- [x] Tests: `#task` creates an own aspect row; tagging an existing row creates a `ref`-edge; a hostless task is owned by the type-node and can be reparented onto a host; removing a `#`-tag cascades the aspect row (existing lifecycle, on the edge model).

## 6. The promotion taxonomy

Every "this got more serious" migration is a crossing of two axes -- **`ref`→`own`** (add lifecycle) and **add-a-matrix** (add schema). Capture these as named ops/migrations where useful (resolution §2.7):

| Promotion | Crossing(s) |
|---|---|
| label → type | `ref`→`own` + add-a-matrix |
| folksonomy member → owned aspect | `ref`→`own` |
| shared collection → dedicated sub-table | add-a-matrix (+ re-home rows) |
| subtree → table | add-a-matrix (+ re-home rows) |

- [x] **"Promote subtree to table" stays a real migration** because of **column-locality** (columns are matrix-wide; the everything matrix must not grow domain columns), **not** anything in the ownership model. The `own`-edges survive a re-home unchanged -- re-homing moves rows into a new owned matrix and keeps their edges.
- [ ] Implement the promotions that have concrete near-term consumers (at minimum label→type and member→owned-aspect, which the tags UX needs); leave subtree→table and shared→dedicated as documented migration recipes if no consumer needs them yet (do not over-build). *Deferred: the type-node infrastructure from §4 is the substrate these operate on; no near-term consumer exists yet.*
- [ ] Tests: label→type converts a `ref` label into an own-matrix type-node and re-points members as appropriate; member→owned-aspect upgrades a `ref` to an `own` aspect row. *Deferred with above.*

---

## 7. Performance guards -- Part C (ownership and joins at scale)

Uses the Stage P0 harness ([Phase 8 -- Performance testing strategy](Phase-8.md)). The key risk here: `joins` is now O(total rows) (every row has an `own`-edge), so it is one of the largest tables and **no join access path can afford to be index-blind**.

- [x] **Backlinks and forward lookups are index-covered against the huge `joins` table (EQP):** `getSources` (including ref-only backlinks) seeks via the plain `joins_by_target` index and `getTargets` via the primary key, with the `kind` filter applied after the indexed seek (few edges per node) -- no full `SCAN` of `joins`, no `USING AUTOMATIC`, verified at representative scale where `joins` is dominated by `own`-edges. Dedicated `kind`-filtered partial indexes were *not* added: the EQP guards pass without them, and they would add write overhead to the largest table without measured need.
- [x] **Matrix drop is a whole-table drop, not a per-row cascade (work-count):** dropping an owned matrix via its identity face performs O(1) table drops + an owner sever, not O(rows) individual deletes -- this is the payoff of the `matrix.owner` fact for large tag types (e.g. dropping a `#task` type with thousands of instances).
- [x] **`#` autocomplete is bounded (EQP / work-count):** listing promoted type-nodes scans only promoted nodes (index or small bounded set), never the whole everything-matrix or every owned matrix.
- [x] **Shared-vs-dedicated detection is cheap (work-count):** comparing matrix-owner against row-owners (§3) is a bounded lookup, not a scan of all rows in the matrix.

## 8. Review fixes (post-implementation review)

Issues found in review of the §1–§7 implementation, staged so each builds on the previous. Decisions settled at planning time:

- **No data migration.** The app is pre-release with no live databases; registry-era DBs are reset, not migrated.
- **The label column is the canonical tag name**; `matrix.title` is maintained as a derived cache so SQL never parses ProseMirror JSON.
- **Matrix drop does eager inlineref cleanup** — O(hosts-with-badges) doc edits are irreducible if stored content stays clean, and drops are rare interactive events.
- **`TagType.color`/`icon` are removed** (color is derived from the name; icon has no consumer).
- **No new partial indexes on `joins`** — the §7 backlinks checkbox is reworded to match the EQP-verified reality instead.

### 8.1 Matrix-drop cascade completeness (review #1, #4, #5 — high)

`dropOwnedMatrix` cleans only one level deep: rows of the dropped matrix vanish in bulk, but everything reachable *through* them leaks.

- [x] **Cascade cross-matrix own-children of dropped rows.** Before the bulk deletes, select `joins WHERE source_matrix_id = ? AND kind = 'own' AND target_matrix_id != ?` and `deleteRowCascade` each target — an aspect row can itself host aspects (a `#task` row carrying a `#review`). Thread the cascade `depth` through `dropOwnedMatrix` so `MAX_CASCADE_DEPTH` still guards the mutual recursion.
- [x] **Recurse into nested owned matrixes.** `SELECT id FROM matrix WHERE owner_matrix_id = ?` → `dropOwnedMatrix` recursively. Today a matrix owned by a row of the dropped matrix survives with a dangling owner pointer and an orphaned data table.
- [x] **Eager inlineref cleanup.** For own-edge sources outside the matrix (`joins WHERE target_matrix_id = ? AND kind = 'own' AND source_matrix_id != ?`, excluding the root sentinel), remove the inlineref nodes from the source docs *before* the joins bulk-delete — matching per-row delete. **Group by source row**: one doc parse/rewrite per host removing all of its refs into the dropped matrix, so a type-node with N hostless rows does not trigger N parses of the same doc.
- [x] **Clear the deleted node's own promotion.** `deleteRowCascade` deletes the node's `promoted_nodes` entry alongside its data row, so deleting a type-node via the generic outline path leaves no dangling promotion (and no resurrection hazard on random-ID reuse). `deleteTagType`'s explicit `demoteNode` becomes redundant — remove it.
- [x] Tests: deleting a type-node whose aspect rows host their own cross-matrix aspects removes the grandchildren and leaves **zero closure rows referencing them** (proves the spanning-pairs hole closes once children are cascaded first); a nested owned matrix is dropped recursively; host docs lose their `#` badges when the type matrix drops; plain `deleteRow` of a type-node clears its `promoted_nodes` entry; the depth guard still trips on ownership cycles.

### 8.2 Drop-before-cascade ordering (review #3 — medium)

- [x] In `deleteRowCascade`, drop owned matrixes **before** walking cross-matrix children. Children living in an about-to-drop matrix (hostless aspect rows owned by the type-node) are then bulk-deleted by 8.1's machinery rather than per-row cascaded; only children in surviving matrixes get the per-row walk.
- [x] Test (work-count): deleting a type-node owning a matrix with N hostless rows executes a bounded number of write statements (`createWorkCounter`), not O(N) per-row deletes.

### 8.3 Label column as the canonical name (review #2 — high)

§4 says the type's name *is* the node's label-role column; make that true. `matrix.title` stays as a derived cache kept in sync by core, so renaming a type-node by editing its outline row renames the tag everywhere.

- [x] **Move `extractTextFromPmDoc` into core** (it is a pure JSON walk with no editor imports — e.g. `src/core/pm-text.ts`; keep a re-export at `src/editor/pm-text.ts` so existing importers are untouched).
- [x] **Core sync rule in `updateRow`:** when the written values include the matrix's label-role column and the row owns matrixes, set each owned matrix's `title` to the extracted plain text. This single hook covers both the editor path (worker `updateRow` message → core `updateRow`) and `updateTagType`.
- [x] **Simplify `updateTagType`:** write the label column and let the sync rule maintain titles (drop the manual `getOwnedMatrixes` title loop). Keep the promoted-name uniqueness check.
- [x] Tests: renaming a type-node via plain `updateRow` (the outline-edit path) renames the tag in `getTagType`, `getAllTagTypes`, and the autocomplete/browser queries; non-label-column writes do not touch titles; `updateTagType` rename still round-trips.

### 8.4 API and dependency hygiene (review #10, #11 — low)

- [x] Remove `color`/`icon` from `TagType`, `updateTagType`, `toTagType`, the `NULL AS color/icon` projections in `tag-queries.ts` and `InlineRefView`, and `TagBrowserFace`'s row types; rendering relies solely on `tagColorFromName`. *(Went further than planned: the tag browser's color-picker UI — context-menu item, picker input, `colorPicking` state — had been a silent no-op since the registry dissolved, and was removed along with the `tagTypeColor` plumbing through the inlineref event → App → TagPropertyPanel chain, the worker/client `updateTagType` message params, and `TagAutocompleteOption.color`.)*
- [x] Document the hard `hila.tags` → `hila.workspace` dependency on `tagsPlugin` (comment + a `getWorkspaceMatrixId` error message that names the requirement). The dependency is on workspace being registered before any tag *operation* runs, not before tags plugin registration itself (App.tsx registers tags first, harmlessly). No dependency mechanism — none exists and one consumer does not justify building one.

### 8.5 Guard and test hardening (review #7, #8, #9 — low)

- [x] Restore the case-insensitive duplicate assertions (`'Task'`, `'TASK'`) for `createTagType`, and add the same coverage for `updateTagType` rename collisions (including that renaming a type to a recasing of its own name is allowed).
- [x] Strengthen the §7 matrix-drop guard with `createWorkCounter`: dropping an N-row owned matrix performs a bounded number of write statements (the O(hosts-with-badges) inlineref doc updates counted separately) — the previous guard only checked end-state and would have passed a per-row implementation. The guard now compares statement counts at 50 vs 400 rows and requires exact equality.
- [x] Reword the §7 backlinks checkbox to match reality: the plain `joins_by_target` index covers ref-filtered backlinks (EQP-verified); kind-partial indexes were not added (write overhead on the largest table without measured need).
- [x] Run the full battery (format, lint, typecheck, unit, e2e) once 8.1–8.5 land. The four Phase-9 `test.fixme` e2e entries stay deferred (they hinge on the type-node rendering policy); the Phase-9 carry-over note now records that the revived deletion test should also assert 8.1's badge cleanup and promotion removal.

## Done criteria (Phase 8c)

`matrix.owner` is a thin N:1 nullable fact; own-matrix is realized as `own`-edges to a matrix's roots plus the owner fact, with a creation op and a matrix-drop cascade that is independent of the row cascade. Shared vs dedicated is detectable by comparing matrix-owner to row-owners. The tag registry is dissolved: tag types are promoted type-nodes that own a matrix, named by their `label` column; `#` autocomplete lists only promoted nodes. Tagging maps cleanly to the two edges (create=own, link=ref, label=ref), hostless aspect rows are first-class and reparentable, and the create-vs-link resolution closes `Plan.md` #3. The promotion taxonomy is documented and its near-term members implemented. The Part C performance guards (§7) pass -- join lookups stay index-covered against the now-large `joins` table and matrix drop is a whole-table operation. The review fixes (§8) land: the matrix-drop cascade is complete (cross-matrix children, nested owned matrixes, inlineref cleanup, promotion cleanup), owned matrixes drop before the per-row child walk, and the label column is the canonical tag name with `matrix.title` as a core-synced derived cache. Static analysis, unit tests, and the tag/outline E2E suites pass.

## Dependency notes

Depends on [Phase 8](Phase-8.md) (edges + sentinel) and reads cleaner after [Phase 8b](Phase-8b.md) (global closure/scroll index, row cascade). Reshapes how the tags plugin stores tag types, so sequence it before further tag work; the tasks/movie-reviews work ([Phase 11](Phase-11.md)) builds on the type-node model from here. Closes `Plan.md` open question #3 (create-vs-link = own-vs-ref) and narrows #4 (only `ref`-edges want optional labels). Unlocks the [Phase 9](Phase-9.md) view-layer surfaces (property surface, embedded collections, dedicated sub-tables, cross-matrix navigation).
