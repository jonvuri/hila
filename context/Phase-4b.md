# Phase 4b -- Inline references and owned joins

Retrofits the Phase 4 wiki-link implementation with the generalized inline reference system and adds owned join lifecycle to the core. See [Architecture - Inline references](./Architecture.md#inline-references), [Traits - Join kinds](./Traits.md#join-kinds), and [Plugins - Inline references plugin](./Plugins.md#inline-references-plugin) for the design.

After this phase, the system has:
- Join table with `ref`/`own` kind semantics and cascade deletion
- `createDependentRow` and `createRefJoin` core operations
- A unified `inlineref` ProseMirror node (replacing `wikilink`) with `@` and `[[` triggers
- Live/empty/ghost reference states with cached metadata
- Table cell `reference` column type
- Foundation ready for Phase 5 (tags plugin) to add `#` mode and tag types

The `#` tag trigger, tag type registry, and tag property panel are Phase 5 scope. This phase builds the core primitive and the `@`-reference UX on top of it.

---

## 1. Join table `kind` column

Add the `kind` column to the join table schema and migrate existing data. See [Traits - Join kinds](./Traits.md#join-kinds).

- [x] Update `initMatrixSchema` in `src/core/matrix.ts` to include `kind` in the `joins` table DDL:
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

- [x] Add migration logic for existing databases: if `joins` table exists but lacks the `kind` column, `ALTER TABLE joins ADD COLUMN kind TEXT NOT NULL DEFAULT 'ref'`. Existing wiki-link joins automatically get `kind = 'ref'`, which is correct.

- [x] Update sync changelog triggers on the `joins` table to include the `kind` column (Phase 3 infrastructure).

- [x] Update the `JoinRow` type in `matrix.ts` to include `kind: 'ref' | 'own'`. Added `JoinKind` type alias exported from `matrix.ts`.

- [x] Update `insertJoin` to accept an optional `kind` parameter (default `'ref'`):
  ```typescript
  export const insertJoin = (
    db: Database, sourceMatrixId: number, sourceRowId: number,
    targetMatrixId: number, targetRowId: number, kind: 'ref' | 'own' = 'ref'
  ): void
  ```

- [x] Add `createRefJoin` as an alias for `insertJoin` with `kind = 'ref'` (explicit API per [Traits - Core operations](./Traits.md#core-operations)). Added in both `matrix.ts` (core) and `matrix-client.ts` (client).

- [x] Update `getTargets` and `getSources` to return `kind` in their results.

- [x] Update worker message types in `matrix-types.ts`: `insertJoin` params gain `kind?: JoinKind`. `getTargets` and `getSources` results gain `kind`. Imports `JoinKind` from `matrix.ts`.

- [x] Update worker handler and client functions accordingly. Worker handler passes `kind` through. Client `insertJoin` accepts optional `kind`. Client adds `createRefJoin` convenience function. Client return types for `getTargets`/`getSources` updated.

- [x] Tests: verify migration adds `kind` column. Insert a join with default kind, verify `kind = 'ref'`. Insert a join with `kind = 'own'`, verify it persists. `getTargets` and `getSources` return the correct `kind` value. Mixed ref/own joins coexist correctly. `createRefJoin` alias works. Schema column presence verified. All existing join tests updated to include `kind: 'ref'` in assertions (including `notes-plugin.test.ts`).
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass (459 tests)

## 2. Owned join lifecycle: `createDependentRow` and cascade deletion

Implement the core lifecycle rules for `own`-kind joins per [Traits - Lifecycle rules](./Traits.md#lifecycle-rules).

- [x] Implement `createDependentRow` in `src/core/matrix.ts`:
  ```typescript
  export const createDependentRow = (
    db: Database, sourceMatrixId: number, sourceRowId: number,
    targetMatrixId: number, columnValues: Record<string, unknown>
  ): number  // returns new targetRowId
  ```
  Atomically in one transaction:
  1. Insert a new row in `mx_{targetMatrixId}_data` with the given column values (using `insertDataRow` or equivalent).
  2. Insert a join entry with `kind = 'own'`.
  3. Return the new row ID.
  Validate that no existing `own` join already points to the same target row (single ownership invariant).

- [x] Update `deleteRow` cascade logic. Currently `deleteRow` removes all joins where the row is source or target. Expand to:
  1. Before deleting the row, find all `own`-kind joins where the row is the source: `SELECT target_matrix_id, target_row_id FROM joins WHERE source_matrix_id = ? AND source_row_id = ? AND kind = 'own'`.
  2. Recursively `deleteRow` each owned target (cascade).
  3. Then delete joins and the row itself as before.
  The cascade is recursive -- owned targets that themselves own further targets cascade too. Use a worklist or recursive function; guard against cycles (should not occur with tree-structured ownership, but defensively cap depth).

- [x] Implement `deleteOwnedTarget` for the case where an `own` join is removed without deleting the source row (e.g. when a `#`-tag is removed from rich text, or an `own`-kind cell is cleared):
  ```typescript
  export const deleteOwnedTarget = (
    db: Database, targetMatrixId: number, targetRowId: number
  ): void
  ```
  Deletes the target row (triggering its own cascades). Called by the join sync process when an `own`-kind join entry is removed.

- [x] Implement reverse deletion support: `deleteJoinAndCleanup` for when a dependent row is deleted from its identity face:
  ```typescript
  export const deleteJoinByTarget = (
    db: Database, targetMatrixId: number, targetRowId: number
  ): JoinRow | null  // returns the removed own-join entry, if any
  ```
  Finds and removes the `own`-kind join pointing to this target. Returns the join info so the calling plugin can clean up the source-side reference (remove the inline node from PM text, or null a cell). The actual source-side cleanup is plugin responsibility -- the core just removes the join.

- [x] Add worker message types: `createDependentRow`, `deleteOwnedTarget`, `deleteJoinByTarget`. Wire into handler and client.

- [x] Tests: `createDependentRow` creates both the row and the `own` join atomically. Deleting the source row cascade-deletes the owned target. Deleting a source row with multiple owned targets cascades all of them. Recursive cascade: A owns B, B owns C; deleting A deletes B and C. Removing an `own` join via `deleteJoin` then calling `deleteOwnedTarget` deletes the target row. `deleteJoinByTarget` returns the correct join info. The single-ownership invariant rejects a second `own` join to the same target.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass (468 tests)

## 3. Evolve ProseMirror node: `wikilink` → `inlineref`

Rename and expand the ProseMirror inline node to support the generalized inline reference model. Migrate existing document data.

- [x] Update the PM schema in `src/editor/schema.ts`. Replace the `wikilink` node with `inlineref`:
  ```typescript
  inlineref: {
    group: 'inline',
    inline: true,
    atom: true,
    attrs: {
      targetMatrixId: { default: null },
      targetRowId: { default: null },
      kind: { default: 'ref' },
      cachedTitle: { default: null },
    },
    toDOM: (node) => ['span', {
      class: 'inlineref',
      'data-target-matrix-id': node.attrs.targetMatrixId,
      'data-target-row-id': node.attrs.targetRowId,
      'data-kind': node.attrs.kind,
      'data-cached-title': node.attrs.cachedTitle,
    }, ''],
    parseDOM: [
      { tag: 'span.inlineref', getAttrs: (dom) => ({
        targetMatrixId: dom.getAttribute('data-target-matrix-id') ? Number(dom.getAttribute('data-target-matrix-id')) : null,
        targetRowId: dom.getAttribute('data-target-row-id') ? Number(dom.getAttribute('data-target-row-id')) : null,
        kind: dom.getAttribute('data-kind') || 'ref',
        cachedTitle: dom.getAttribute('data-cached-title'),
      })},
      // Backward compat: parse old wikilink DOM nodes
      { tag: 'span.wikilink', getAttrs: (dom) => ({
        targetMatrixId: dom.getAttribute('data-matrix-id') ? Number(dom.getAttribute('data-matrix-id')) : null,
        targetRowId: dom.getAttribute('data-row-id') ? Number(dom.getAttribute('data-row-id')) : null,
        kind: 'ref',
        cachedTitle: null,
      })},
    ],
  }
  ```

- [ ] Write a data migration that updates stored PM JSON in existing note bodies. The migration walks all rows in all matrixes that have `TEXT` columns containing PM JSON, and replaces `"type":"wikilink"` nodes:
  - `"type": "wikilink"` → `"type": "inlineref"`
  - `"attrs": { "matrixId": N, "rowId": M }` → `"attrs": { "targetMatrixId": N, "targetRowId": M, "kind": "ref", "cachedTitle": null }`
  Run this migration in `initMatrixSchema` (or a dedicated migration step) on database open. Only touch rows that contain `"wikilink"` in their JSON to minimize writes.

- [x] Rename `src/notes/nodeviews/WikilinkView.tsx` → `src/notes/nodeviews/InlineRefView.tsx` (or a shared location like `src/editor/nodeviews/InlineRefView.tsx`). Update all imports.

- [x] Evolve `InlineRefView` to read the new attrs (`targetMatrixId`, `targetRowId`, `kind`, `cachedTitle`) and implement the three reference states:
  - **Live**: target exists. Resolve title via reactive query (as before). Render as linked badge.
  - **Empty**: `targetMatrixId` and `targetRowId` are null. Render `cachedTitle` with a "create" affordance (dimmed or dashed style, click to create the target).
  - **Ghost**: `targetMatrixId` and `targetRowId` are non-null but the query returns no row. Render `cachedTitle` with a deletion indicator (trash icon or strikethrough).
  - For `kind = 'own'`, render as a colored tag-style badge (foundation for Phase 5 `#` tags). For `kind = 'ref'`, render as a linked title badge (current wikilink style).

- [x] Update `NoteFace.tsx` to wire `InlineRefView` as the node view for `inlineref` (replacing `wikilink`).

- [x] Update all CSS class names: `.wikilink` → `.inlineref`, `.wikilink-broken` → `.inlineref-ghost`, etc. in `global.css` or CSS modules.

- [ ] Tests: verify old PM JSON with `wikilink` nodes migrates to `inlineref`. Verify `InlineRefView` renders live state correctly (title from query). Verify ghost state when target row is deleted (shows cached title + indicator). Verify empty state with null IDs.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 4. Autocomplete: `@` trigger and empty references

Evolve the autocomplete system to support `@` as a trigger alongside `[[`, and add the ability to create empty-state references to nonexistent targets.

- [x] Rename `src/notes/wikilink-plugin.ts` → `src/editor/inlineref-plugin.ts` (or similar shared location). This plugin is no longer notes-specific -- it provides inline reference autocomplete for any ProseMirror editor.

- [x] Update the autocomplete trigger to detect both `@` and `[[`:
  - `@` starts autocomplete mode immediately (single character trigger).
  - `[[` works as before (two-character trigger).
  - Both open the same autocomplete dropdown. The trigger character(s) are tracked so the correct range is replaced on selection.

- [x] Update the autocomplete search to query across all matrixes (not just the notes matrix). The query should return results with matrix name + row title for disambiguation:
  ```sql
  SELECT m.id AS matrixId, m.title AS matrixTitle, d.id AS rowId, d.{titleColumn} AS rowTitle
  FROM matrix m
  JOIN mx_{m.id}_data d ON ...
  WHERE d.{titleColumn} LIKE :query
  ```
  In practice, this may need to be a union query across known matrixes, or a pre-built search index. For Phase 4b, querying the notes matrix (the main consumer) is sufficient; cross-matrix search can be extended later.

- [x] Update the "Create new" option in autocomplete: instead of immediately creating a note and inserting a wikilink, insert an **empty-state** `inlineref` node:
  ```
  { type: 'inlineref', attrs: {
    targetMatrixId: null,
    targetRowId: null,
    kind: 'ref',
    cachedTitle: "Typed text"
  }}
  ```
  The node renders in empty state with the user's typed text as the cached title.

- [x] Implement "click to create" on empty-state references in `InlineRefView`:
  - Clicking an empty `inlineref` creates the target row (e.g. a new note with the cached title as its title).
  - Updates the `inlineref` node attrs with the new `targetMatrixId` and `targetRowId`.
  - Creates a `ref`-kind join entry.
  - Navigates to the newly created target.

- [x] Update the `PluginKey` name from `'wikilink'` to `'inlineref'`.

- [x] Tests: verify `@` triggers autocomplete. Verify `[[` still triggers autocomplete. Verify selecting an existing note inserts an `inlineref` with correct attrs. Verify typing a nonexistent name and selecting "Create new" inserts an empty-state node. Verify clicking an empty-state reference creates the target and transitions to live state.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass (470 tests)

## 5. Join table sync and backlinks

Update the PM doc → join table sync to work with the new `inlineref` node and `kind` semantics. Update backlinks.

- [x] Rename `src/notes/wikilink-sync.ts` → `src/editor/inlineref-sync.ts` (or similar shared location).

- [x] Update `extractWikilinks` → `extractInlineRefs`:
  ```typescript
  type InlineRef = {
    targetMatrixId: number
    targetRowId: number
    kind: 'ref' | 'own'
  }
  export const extractInlineRefs = (doc: Node): InlineRef[]
  ```
  Walks the PM doc and collects all `inlineref` nodes where `targetMatrixId` and `targetRowId` are non-null (skip empty-state refs -- they have no join entry).

- [x] Update `syncWikilinks` → `syncInlineRefs`:
  ```typescript
  export const syncInlineRefs = (
    doc: Node, sourceMatrixId: number, sourceRowId: number
  ): Promise<void>
  ```
  - Extracts inline refs from the doc.
  - Gets current join entries for this source row.
  - Computes set difference:
    - New refs: `insertJoin` with the appropriate `kind`.
    - Removed refs: `deleteJoin`. If the removed entry had `kind = 'own'`, call `deleteOwnedTarget` to cascade-delete the target row.
  - Refreshes `cachedTitle` attrs in the PM doc from current target state (query each live target's title, update the node attrs). This step may require a PM transaction to update attrs in-place without triggering a full re-render.

- [x] Update the `cachedTitle` refresh logic: after syncing joins, walk the doc's `inlineref` nodes and update `cachedTitle` from the target's current title. This keeps the cache fresh for ghost/empty fallback. The refresh should be a pre-save step that produces the final doc JSON to persist (so the cached title is saved alongside the text).

- [x] Update backlinks query in `NoteFace.tsx` to include `kind`:
  ```sql
  SELECT j.source_matrix_id, j.source_row_id, j.kind, d.title
  FROM joins j
  JOIN mx_{mid}_data d ON j.source_row_id = d.id
  WHERE j.target_matrix_id = :mid AND j.target_row_id = :rid
    AND j.source_matrix_id = :mid
  ```
  Optionally render `ref` and `own` backlinks with different visual treatment (e.g. `own` backlinks indicate "this note is tagged from..." while `ref` backlinks indicate "this note is linked from...").

- [x] Update `NoteFace.tsx` save flow: replace `syncWikilinks` call with `syncInlineRefs`.

- [x] Tests: save a doc with `inlineref` nodes, verify join entries created with correct `kind`. Remove an `inlineref` from text, save, verify join entry removed. Remove an `own`-kind `inlineref`, save, verify target row cascade-deleted. Verify `cachedTitle` is refreshed on save. Verify backlinks include `kind`.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass (479 tests)

## 6. Table cell reference type

Add `reference` as a column display type in the table face. This is the table-cell analog of inline references -- a cell that holds a foreign-key-style link to a row in another matrix.

- [ ] Add `'reference'` to `ColumnDisplayType` in `src/table/TableFace.tsx`:
  ```typescript
  type ColumnDisplayType = 'text' | 'number' | 'date' | 'boolean' | 'select' | 'reference'
  ```
  Add it to `COLUMN_TYPES` with label "Reference", appropriate icon, and `sqliteType: 'TEXT'` (stores JSON `{ targetMatrixId, targetRowId, kind }`).

- [ ] Create a reference cell renderer:
  - Display: shows the target row's title (resolved via reactive query), or "Empty" if null, with reference iconography matching inline refs.
  - Edit: clicking the cell opens a search/autocomplete dropdown (same UX pattern as `@` autocomplete). Selecting a row sets the cell value.
  - The cell value is stored as JSON in the TEXT column: `{ "targetMatrixId": N, "targetRowId": M, "kind": "ref" }`.

- [ ] On cell edit (reference set or changed):
  - If the old value had a join entry, remove it. If it was `own`-kind, cascade-delete the old target.
  - If the new value is non-null, create a join entry with the appropriate kind.

- [ ] On cell clear:
  - Remove the join entry. If `own`-kind, cascade-delete the target.
  - Set the cell value to null.

- [ ] Reference cell column configuration: when adding a reference column, allow specifying:
  - Target matrix (which matrix the reference points to).
  - Default kind (`ref` or `own`). For Phase 4b, default to `ref`. `own`-kind cells are the Phase 5 "cascade-delete foreign key" used by tags.

- [ ] Tests: add a reference column. Set a cell to reference a row in another matrix, verify join entry created. Clear the cell, verify join entry removed. Verify the cell renders the target row's title. Change the reference to a different target, verify old join removed and new join created.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 7. Playwright E2E tests

Extend the E2E suite to cover the new Phase 4b behaviors.

- [ ] **Inline reference tests (evolve existing `wikilink.spec.ts`):**
  - Rename test file to `inlineref.spec.ts`.
  - Verify `@` triggers autocomplete in a note body.
  - Verify `[[` still triggers autocomplete.
  - Type a note title, select from autocomplete, verify an `inlineref` node is inserted (not `wikilink`).
  - Click the reference, verify navigation to the target note.
  - Verify the backlinks panel on the target note shows the source note.

- [ ] **Empty and ghost reference tests:**
  - Type a nonexistent note title in `@` autocomplete, select "Create new", verify an empty-state reference is inserted.
  - Click the empty-state reference, verify the target note is created and the reference transitions to live state.
  - Create a reference to an existing note, then delete the target note. Verify the reference shows ghost state (cached title + deletion indicator).

- [ ] **Reference cell tests:**
  - Add a reference column to a matrix via the table face.
  - Click a reference cell, verify autocomplete opens.
  - Select a target row, verify the cell shows the target's title.
  - Clear the cell, verify it returns to empty.

- [ ] **Cascade deletion tests:**
  - Create a note with an `own`-kind inline reference (can be done programmatically or via a test helper that inserts the PM JSON directly, since `#` trigger is Phase 5).
  - Delete the source row, verify the owned target row is also deleted.
  - Verify the target no longer appears in the target matrix's identity face.

- [ ] Run `pnpm test:e2e` -- all pass
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all Vitest tests still pass

---

## Task dependency order

```
1. Join table `kind` column
   │
   └─► 2. Owned join lifecycle (createDependentRow, cascade)
          │
          ├─► 3. PM node: wikilink → inlineref (schema, view, migration)
          │      │
          │      ├─► 4. Autocomplete: @ trigger + empty refs
          │      │
          │      └─► 5. Join sync + backlinks
          │
          └─► 6. Table cell reference type

7. Playwright E2E ◄── 3, 4, 5, 6
```

Tasks 1–2 are strictly sequential (lifecycle rules depend on the `kind` column). Task 3 (PM node evolution) depends on task 2 (needs the `kind` field in the join API). Tasks 4 and 5 branch from task 3 and can proceed in parallel. Task 6 branches from task 2 (needs `kind`-aware join ops but not the PM node changes). Task 7 is added incrementally as features land.

---

## Decisions and scope boundaries

- **`#` tag trigger is Phase 5.** This phase builds the core primitive (`own`-kind joins, cascade deletion, `inlineref` node with `kind` attr) and the `@`-reference UX. The `#` trigger, tag type registry, tag type creation, and tag property panel are Phase 5. However, the `inlineref` node already supports `kind: 'own'` so that Phase 5 can use it directly.

- **Cross-matrix autocomplete is scoped.** The `@` autocomplete in Phase 4b searches the notes matrix (the current consumer). Searching across all matrixes requires a search index or union queries that can be added later. The autocomplete architecture should be extensible (accept a search provider function) so Phase 5 can plug in tag type search.

- **PM JSON migration is one-time.** The migration from `wikilink` to `inlineref` node types runs on database open. It should be idempotent (safe to run multiple times). The `parseDOM` backward compat for `span.wikilink` is a safety net for any edge cases the JSON migration misses.

- **`cachedTitle` refresh is best-effort.** The cache is refreshed on doc save for open documents. Documents that haven't been opened since a target was renamed will have stale caches until they're next opened and saved. This is acceptable -- the cache is a fallback, not the source of truth.

- **Reference cell kind defaults to `ref`.** `own`-kind cells (cascade-delete foreign keys) are supported by the infrastructure but the table face UI defaults to `ref` in Phase 4b. Phase 5 can add a column configuration option to set the default kind.

- **No reverse cleanup from identity face yet.** The core `deleteJoinByTarget` returns the join info for plugin-side cleanup, but the actual PM doc editing (removing the inline node from the source row's text) requires PM transaction access from outside the editor. This is non-trivial and may require an event/callback system. For Phase 4b, deleting an owned target from the identity face removes the join and the target row, but leaves a ghost-state inline node in the source text (which is the correct ghost behavior). Full reverse cleanup can be deferred.

---

## Done criteria

All seven task groups complete. The join table supports `ref`/`own` kinds with correct lifecycle enforcement: `createDependentRow` atomically creates owned rows; `deleteRow` cascades to owned targets; removing an `own` join deletes its target. The `wikilink` PM node is migrated to `inlineref` with expanded attrs (`targetMatrixId`, `targetRowId`, `kind`, `cachedTitle`). Existing data is migrated. The `@` trigger and `[[` trigger both open inline reference autocomplete. Empty-state and ghost-state references render correctly. The join sync process handles `kind`-aware diffing and cascade deletion. The table face supports reference-type cells. `npm run typecheck && npm run lint && npm run test:run && pnpm test:e2e` all pass.
