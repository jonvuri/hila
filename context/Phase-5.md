# Phase 5 -- Tags plugin (aspects via owned joins)

Concrete tasks for Phase 5. See [Plan.md](Plan.md) for context and objectives, [Plugins.md](Plugins.md) for the tags plugin design, and [Traits.md](Traits.md) for join kind semantics.

This phase introduces the tags plugin as the third formal plugin, proving cross-plugin composition through SQL and the join table's `own`-kind lifecycle. Tags build on the inline references plugin from Phase 4b: the `inlineref` PM node already supports `kind: 'own'`, the `createDependentRow` core operation exists, and cascade deletion flows through owned joins. Phase 5 adds the `#` trigger mode, tag type management, the tag property panel, and the tag browser face.

### Current implementation state (prerequisites from Phase 4b)

What exists and Phase 5 builds on:
- **Join table with `kind`**: `ref`/`own` semantics, `createDependentRow`, cascade deletion on `deleteRow`, `deleteOwnedTarget`, `deleteJoinByTarget` — all implemented and tested.
- **`inlineref` PM node**: schema supports `targetMatrixId`, `targetRowId`, `kind`, `cachedTitle` attrs.
- **`syncInlineRefs`**: diffs PM doc against join table on save; handles `own`-kind removal → cascade deletion.
- **`InlineRefView` node view**: renders live/empty/ghost states. Currently renders `own`-kind identically to `ref`-kind (both as linked title badges) — Phase 5 differentiates.

What Phase 5 must account for — gaps and limitations:
- **Outline rows do NOT wire up inline references.** `OutlineRow.tsx` creates `EditorView` with only `paragraph` and `heading` node views, does not mount `createInlinerefPlugin`, and does not call `syncInlineRefs` on save. The PM schema includes `inlineref` (shared), but outline editors cannot trigger or render inline references today. **Phase 5 must wire inline refs into outline rows** before `#` tags can appear there.
- **`createInlinerefPlugin` is scoped to a single matrix.** It takes `matrixId` and hardcodes `SELECT id, title FROM "mx_${matrixId}_data"` for autocomplete search. The `#` trigger needs to search the `tag_types` registry table instead. The plugin must be refactored to accept a **pluggable search provider** so `@` searches notes/rows while `#` searches tag types.
- **`insertInlinerefNode` always sets `kind: 'ref'`** (line 122). The `#` path needs to set `kind: 'own'`.
- **No reverse cleanup from identity face.** `deleteJoinByTarget` exists and returns the join info, but no code removes the inline PM node from the source row's text when an aspect row is deleted. Phase 4b deferred this (ghost state was acceptable). Phase 5 implements it.
- **No `src/tags/` directory or tag-related code exists.** Everything is built from scratch.
- **`wikilink` string still appears in `notes-plugin.test.ts`** — minor, may need cleanup.

After this phase, the system has:
- A tag type registry (plugin-managed table tracking which matrixes are tag types)
- Inline `#` tag creation in outline and note text, with autocomplete over registered tag types
- Automatic aspect row creation via `createDependentRow` when a `#` tag is inserted
- Full owned-join lifecycle end-to-end: remove tag from text → aspect row deleted; delete source row → aspect row deleted; delete aspect row from identity face → inline node removed
- Tag property panel for editing aspect row columns in place
- Tag browser face for listing tag types, their instances, and reverse lookups
- A solidified plugin API extracted from four real consumers

---

## 1. Tag type registry

A plugin-managed table that records which matrixes are tag types. The registry is the data backing `#` autocomplete and the tag browser. Each entry maps a tag type name to a matrix.

- [x] Create the tags plugin definition in `src/tags/tags-plugin.ts`:
  ```typescript
  const tagsPlugin: PluginDefinition = {
    id: 'hila.tags',
    name: 'Tags',
    version: '1.0.0',
    matrixes: [],
    traits: [],
    namedQueries: {},
    namedMutations: {},
    faceBindings: [],
    init: async (ctx) => { /* ensure tag_types table exists */ },
  }
  ```
  The tags plugin itself does not create any data matrixes at registration time — tag type matrixes are created dynamically when the user defines new tag types. The plugin's `init` hook ensures the `tag_types` registry table exists.

- [x] Create the `tag_types` table in the tags plugin's `init` hook:
  ```sql
  CREATE TABLE IF NOT EXISTS tag_types (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    matrix_id INTEGER NOT NULL REFERENCES matrix(id),
    color TEXT,
    icon TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  ) STRICT;
  ```
  - `name`: the tag type name as typed by the user (e.g. `task`, `movie-review`). Case-insensitive uniqueness.
  - `matrix_id`: the matrix that stores instances of this tag type.
  - `color`: optional badge color for rendering (hex or named color). Defaults to a color derived from the name hash if null.
  - `icon`: optional icon identifier for the badge.
  - Install change-tracking triggers on this table (Phase 3 sync infrastructure).

- [x] Implement tag type CRUD operations in `src/tags/tag-types.ts`:
  ```typescript
  type TagType = {
    id: number
    name: string
    matrixId: number
    color: string | null
    icon: string | null
  }

  const createTagType = (
    db: Database, name: string, columns?: { name: string; type: string }[]
  ): TagType
  ```
  `createTagType` atomically:
  1. Creates a new matrix via `createMatrix` with the given columns (or a default `label` TEXT column if none specified). Sets `source_plugin_id = 'hila.tags'`.
  2. Provisions the rank trait for the new matrix (tag instances have a user-defined order in the tag browser).
  3. Inserts a `tag_types` row mapping the name to the new matrix.
  4. Creates the identity face config (table face) for the new matrix.
  5. Returns the `TagType` record.

  ```typescript
  const getTagType = (db: Database, name: string): TagType | null
  const getTagTypeById = (db: Database, id: number): TagType | null
  const getTagTypeByMatrixId = (db: Database, matrixId: number): TagType | null
  const getAllTagTypes = (db: Database): TagType[]
  const updateTagType = (db: Database, id: number, updates: { name?: string; color?: string; icon?: string }): void
  const deleteTagType = (db: Database, id: number): void
  ```
  `deleteTagType` removes the `tag_types` row but does NOT delete the matrix (matrixes are core entities that persist independently, per the plugin model). The matrix becomes an unregistered matrix, still accessible through its identity face. A confirmation flow may offer to also delete the matrix and cascade-delete all owned aspect rows.

- [x] Add worker message types for tag type operations in `matrix-types.ts`:
  - `createTagType` — params: `{ name: string; columns?: { name: string; type: string }[] }`, result: `TagType`.
  - `getTagType` — params: `{ name: string }`, result: `TagType | null`.
  - `getAllTagTypes` — params: `{}`, result: `TagType[]`.
  - `updateTagType` — params: `{ id: number; name?: string; color?: string; icon?: string }`, result: `void`.
  - `deleteTagType` — params: `{ id: number }`, result: `void`.

- [x] Add worker handlers and client functions. Wire into `matrix-handler.ts` and `matrix-client.ts` (or a new `tag-client.ts`).

- [x] Register the tags plugin on startup in `App.tsx`, alongside outline and notes plugins.

- [x] Tests: create a tag type, verify `tag_types` row and matrix created. Create with custom columns, verify matrix schema matches. Create with duplicate name (case-insensitive), verify rejection. Get tag type by name. Get all tag types. Update tag type color/name. Delete tag type, verify `tag_types` row removed but matrix persists. Verify `source_plugin_id` is set to `'hila.tags'` on the created matrix.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 2. Wire inline references into outline rows

The outline currently does NOT support inline references. `OutlineRow.tsx` creates `EditorView` with only `paragraph` and `heading` node views, does not mount `createInlinerefPlugin`, and does not call `syncInlineRefs` on save. Before `#` tags can appear in outline text, inline references must work there.

- [x] Add `InlineRefView` to `OutlineRow.tsx` node views. The shared `inlineref` schema node already exists, but outline editors don't register a node view for it. Add `inlineref` to the `nodeViews` map in the `EditorView` constructor, using the same `InlineRefView` component from `src/notes/nodeviews/InlineRefView.tsx` (or its shared location in `src/editor/nodeviews/`).

- [x] Mount `createInlinerefPlugin` in outline editors. Currently the plugin takes a `matrixId` and searches only that matrix. For the outline, pass the outline's matrix ID so `@` references can link to other outline rows (or notes, once cross-matrix search is supported). This also enables the `#` trigger once task 3 adds it.

- [x] Add `syncInlineRefs` to outline save. `OutlineRow.tsx` saves via `debouncedSave` → `updateRow`. After saving, call `syncInlineRefs(doc, matrixId, rowId)` to materialize inline references to the join table, the same way `NoteFace.tsx` does. Also add `refreshCachedTitles` before persisting the doc JSON.

- [x] Handle the `contentIsPlainText` case. When `OutlineRow` is used with `contentIsPlainText={true}` (e.g. the notes-as-outline view), inline references should be disabled — plain text mode wraps/unwraps to a simple text string, so PM inline nodes would be lost. Guard the inlineref plugin mounting and sync behind `!isPlain()`.

- [x] Tests: verify that `@` references work in outline rows (insert via autocomplete, verify node rendered). Verify that `syncInlineRefs` creates join entries from outline row content. Verify that the `contentIsPlainText` mode does not break (no inlineref plugin, no sync). Verify existing outline tests still pass (no behavioral regression from adding the plugin).
- [x] Run `npm run typecheck && npm run lint && npm run test:run` — all pass
- [x] Run `pnpm test:e2e` — all existing outline tests still pass

## 3a. Autocomplete plugin refactor and `#` trigger detection

Refactor the inline reference autocomplete plugin (`src/editor/inlineref-plugin.ts`) from a hardcoded single-matrix search into a pluggable architecture, and add `#` as a recognized trigger character. This is a structural refactor — no new tag search or insertion logic yet.

- [x] Refactor `createInlinerefPlugin` to accept a pluggable search provider. Currently the plugin takes `matrixId: number` and hardcodes `SELECT id, title FROM "mx_${matrixId}_data"`. Refactor to accept a search configuration:
  ```typescript
  type InlinerefPluginConfig = {
    matrixId: number
    rowIdAccessor: () => number
    searchProvider?: (trigger: '@' | '[[' | '#', query: string) => Promise<AutocompleteOption[]>
  }
  ```
  - `rowIdAccessor`: returns the current source row ID (needed for `createDependentRow`). For notes, this is the note ID. For outline rows, this is the row ID.
  - `searchProvider`: optional custom search function. If not provided, falls back to the current single-matrix title search (backward compatible).
  - The default search handles `@`/`[[` (existing behavior). The `#` trigger calls a tag-specific search (implemented in 3b).

- [x] Add `#` as a third trigger alongside `@` and `[[` in `handleTextInput`:
  - `#` starts autocomplete mode immediately (single character trigger, like `@`).
  - The `AutocompleteState.trigger` type expands to `'@' | '[[' | '#' | null`.
  - The trigger character determines: which search provider to call, the `kind` for the inserted node, and the visual style of autocomplete items.

- [x] Update `OutlineRow.tsx` and `NoteFace.tsx` to pass the new `InlinerefPluginConfig` shape. No functional change — both continue to use the default search provider for `@`/`[[`. This ensures the structural refactor does not regress existing behavior.

- [x] Tests: verify `@`/`[[` still work identically after refactor (no regression). Verify `#` is recognized as a trigger and opens autocomplete (results may be empty/stubbed without the tag search provider from 3b). Verify the `searchProvider` callback is invoked with the correct trigger character.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 3b. Tag search, insertion, and inline tag type creation

Build the tag-specific functionality on top of the pluggable autocomplete from 3a: tag type search for `#` trigger, owned aspect row creation via `createDependentRow`, and inline tag type creation for unmatched names.

- [x] Implement tag-mode autocomplete search. When `#` is the trigger:
  - Primary results: search registered tag types by name prefix/substring from `tag_types`:
    ```sql
    SELECT tt.id, tt.name, tt.matrix_id, tt.color
    FROM tag_types tt
    WHERE tt.name LIKE '%' || :query || '%'
    ORDER BY tt.name
    LIMIT 20
    ```
  - Each result item shows the tag type name (e.g. "task") with its color badge.
  - A "Create tag type" option at the bottom of the results when the typed text doesn't match any existing tag type exactly. Selecting this calls `createTagType` with the typed name and default columns, then proceeds to create the aspect row.

- [x] Implement tag insertion. When a tag type is selected from `#` autocomplete:
  1. Call `createDependentRow(sourceMatrixId, sourceRowId, tagType.matrixId, {})` via the worker to atomically create the aspect row and the `own`-kind join.
  2. Insert an `inlineref` node with `kind: 'own'` (currently `insertInlinerefNode` hardcodes `kind: 'ref'` — update to derive `kind` from trigger: `#` → `'own'`, `@`/`[[` → `'ref'`):
     ```
     { type: 'inlineref', attrs: {
       targetMatrixId: tagType.matrixId,
       targetRowId: newRowId,
       kind: 'own',
       cachedTitle: tagType.name,
     }}
     ```
  3. The autocomplete replaces the `#` trigger and typed text with this node.

- [x] Handle inline tag type creation. When the user types `#project` and no tag type named "project" exists:
  - The autocomplete shows a "Create 'project' tag type" option.
  - Selecting it calls `createTagType('project')` to create the tag type with default columns.
  - Then immediately calls `createDependentRow` to create the first instance as an aspect of the source row.
  - The `inlineref` node is inserted with the new tag type's matrix ID and the new row ID.

- [x] Verify tags work in both outline text and note body text:
  - The outline's `sourceMatrixId` and `sourceRowId` are correctly resolved (from `OutlineRow` props).
  - The note's `sourceMatrixId` and `sourceRowId` are correctly resolved (from `NoteFace` props).
  - `syncInlineRefs` on save (both outline and notes) correctly processes `own`-kind joins.

- [x] Tests: verify `#` triggers tag type search. Verify tag types appear in autocomplete results. Verify selecting a tag type creates an aspect row via `createDependentRow`. Verify the `inlineref` node is inserted with `kind: 'own'`. Verify `@`/`[[` triggers still insert `kind: 'ref'` (no regression). Verify "Create tag type" option appears for nonexistent names. Verify inline tag type creation creates the matrix and the first instance. Verify tags work in both outline text and note body text.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 4. Tag badge rendering

Update `InlineRefView` to render `own`-kind (`#`) references distinctly from `ref`-kind (`@`) references.

- [x] Extend `InlineRefView` (`src/editor/nodeviews/InlineRefView.tsx`) rendering for `kind: 'own'`:
  - **Live state**: render as a colored badge with the tag type name. The badge color is resolved from the `tag_types` registry (query by `targetMatrixId`). Display format: `#tagname` in the badge.
  - Optionally show key property chips alongside the badge — e.g. a task tag might show "⏰ Friday" from the aspect row's `due_date` column. This requires querying the aspect row's data and the tag type's column schema to determine which columns are "key" properties (see task 4 for the property panel; key properties are the first 1–2 non-label columns).
  - **Ghost state**: render the cached tag name with strikethrough and a muted color, indicating the aspect row was deleted.
  - **Empty state**: should not normally occur for `own`-kind references (they always create the target row immediately), but handle gracefully with the cached title.

- [x] Add CSS styles for tag badges in the editor stylesheet:
  - `.inlineref[data-kind="own"]`: colored background, rounded pill shape, smaller font.
  - Color derived from the tag type's `color` field, or a default palette based on the tag type name.
  - Hover state: slightly elevated, cursor pointer.
  - Distinguish from `ref`-kind references (which render as blue linked text).

- [x] Implement reactive tag type metadata resolution:
  - `InlineRefView` needs to resolve the tag type name and color from `targetMatrixId`. Create a lightweight reactive query or cache for tag type metadata keyed by matrix ID.
  - Consider a `useTagType(matrixId)` hook that returns `{ name, color, icon } | null`. Returns null if the matrix is not a registered tag type (in which case, fall back to the default `own`-kind rendering).

- [x] Tests: verify `own`-kind `inlineref` renders as a colored badge (not a blue link). Verify the badge shows the tag type name. Verify ghost state rendering for deleted aspect rows. Verify ref-kind references still render as blue linked text (no regression).
- [x] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 5. Tag property panel

A popover or sidebar that opens when clicking a `#` tag, showing the aspect row's columns as editable fields. The fields are hydrated from the tag matrix and editable in place.

- [x] Create `src/tags/TagPropertyPanel.tsx`:
  - A Solid component that receives: `matrixId` (the tag type's matrix), `rowId` (the aspect row), and optionally `onClose` callback.
  - Queries the aspect row's data: `SELECT * FROM mx_{matrixId}_data WHERE id = :rowId`.
  - Queries the matrix's column schema via `getColumns(matrixId)`.
  - Renders each column as an editable field using the appropriate editor for the column type:
    - `text`: text input.
    - `number`: number input.
    - `date`: date picker.
    - `boolean`: checkbox.
    - `select`: dropdown with options from column metadata.
    - `reference`: reference cell editor (same as table face reference cells).
    - `richtext`: a compact rich text editor (optional — may defer to a simple text input for initial implementation).
  - Skips the `id` column and any formula columns (read-only, rendered with visual distinction).
  - Each field saves on blur or Enter via `updateRow(matrixId, rowId, { [columnName]: value })`.

- [x] Wire tag click to open the property panel:
  - In `InlineRefView`, when `kind === 'own'` and the user clicks the tag badge, open the `TagPropertyPanel` as a popover anchored to the badge.
  - Use a shared popover/floating UI mechanism (if one exists from the design system) or a simple absolute-positioned panel.
  - Clicking outside the panel or pressing Escape closes it.
  - The panel should not interfere with ProseMirror's focus management — opening the panel should not cause the editor to lose its selection state.

- [x] Implement live reactivity:
  - The property panel's data query is reactive (via `useQuery`). If the aspect row's data changes from another surface (e.g. editing the same row in the identity face's table view), the panel updates.
  - Edits in the panel write to the tag matrix via `updateRow`. The standard reactive query invalidation propagates changes to all faces showing the same data.

- [x] Update tag badge rendering (from task 3) to show key property values:
  - After the property panel is functional, add optional key property chips to the badge rendering.
  - Key properties: the first 1–2 columns after the primary label column, if they have values. E.g. a task badge might show `#task ⏰ Mar 15 🔴 high`.
  - The chips are read-only in the badge — clicking the badge opens the full property panel for editing.
  - This is a rendering enhancement, not a functional change. Defer if it adds too much complexity.

- [x] Tests: open the property panel for a tag, verify columns are displayed. Edit a text field, verify persistence. Edit a select field, verify persistence. Verify reactive updates (edit in table face, verify panel reflects change). Verify panel closes on Escape and outside click. Verify ProseMirror focus is restored on panel close.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 6. Owned join lifecycle: end-to-end validation

Phase 4b built the core owned join lifecycle (`createDependentRow`, cascade deletion on source row delete, cascade deletion on `own` join removal). Phase 5 exercises these paths end-to-end through the tag UX and fills in the remaining gap: reverse cleanup when an aspect row is deleted from its identity face.

- [x] **Forward lifecycle: remove tag from text → aspect row deleted.** This path already works via `syncInlineRefs` (Phase 4b, task 5). Validate it end-to-end with tags:
  - User types `#task` on an outline row → aspect row created in task matrix.
  - User deletes the `#task` badge from the text (Backspace over the inline node or select + delete).
  - On doc save, `syncInlineRefs` detects the removed `own`-kind reference, calls `deleteOwnedTarget`, cascade-deletes the aspect row.
  - Verify the aspect row no longer exists in the task matrix.

- [x] **Forward lifecycle: delete source row → aspect rows deleted.** Also already works via `deleteRow` cascade (Phase 4b, task 2). Validate end-to-end:
  - An outline row has two tags (`#task` and `#movie-review`).
  - Delete the outline row.
  - Both aspect rows are cascade-deleted.
  - Verify neither aspect row exists in their respective tag matrixes.

- [x] **Reverse lifecycle: delete aspect row from identity face → inline node removed.** This is the gap identified in Phase 4b (deferred as "non-trivial" in Phase 4b scope boundaries). Implement it now:
  - The core `deleteJoinByTarget` already returns the `own`-kind join info when a target row is deleted.
  - When a tag aspect row is deleted from its tag matrix's identity face (table face), the tags plugin needs to:
    1. Call `deleteJoinByTarget(targetMatrixId, targetRowId)` to get the source row info.
    2. Load the source row's content (PM JSON).
    3. Walk the PM doc to find the `inlineref` node with matching `targetMatrixId` and `targetRowId`.
    4. Remove that node from the doc.
    5. Save the updated doc back to the source matrix.
  - Implement this as an event handler or hook. Options:
    - **Option A**: A post-delete hook on the identity face that the tags plugin registers. When a row is deleted from a matrix that is a registered tag type, the hook fires.
    - **Option B**: The `deleteRow` handler checks for `own`-kind joins pointing at the row (via `deleteJoinByTarget`), and if found, emits an event that plugins can subscribe to.
    - **Option C**: A core utility `removeInlineRefFromDoc(sourceMatrixId, sourceRowId, targetMatrixId, targetRowId)` that handles the PM doc editing generically.
  - **Recommended: Option C** — the PM doc editing for removing an inline ref node is generic (not tag-specific). Implement `removeInlineRefFromDoc` in `src/editor/inlineref-sync.ts` and call it from `deleteRow` when an `own`-kind join target is being cascade-deleted OR when `deleteJoinByTarget` is called explicitly. This keeps the logic in one place and works for any future `own`-kind inline reference surface.

  ```typescript
  const removeInlineRefFromDoc = async (
    sourceMatrixId: number, sourceRowId: number,
    targetMatrixId: number, targetRowId: number
  ): Promise<void>
  ```
  Loads the source row, parses the content column as PM JSON, filters out the matching `inlineref` node, saves the modified doc. If the source row's content column is not PM JSON (not rich text), this is a no-op.

- [x] Add worker message type for `removeInlineRefFromDoc` if needed (or integrate into existing `deleteRow` / `deleteJoinByTarget` paths).

- [x] Tests: delete an aspect row from the tag matrix's identity face, verify the inline `#` node is removed from the source row's content. Verify the source row's remaining content is preserved (only the specific tag node is removed, not other text or references). Verify that deleting an aspect row that has no inline ref source (e.g. created via table cell, not inline text) is a no-op for source cleanup. Recursive cascade: source row owns aspect A, aspect A owns aspect B (nested tags); delete source, verify A and B both deleted.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 7. Forward and reverse lookup queries

Provide named queries that plugins and faces can use to navigate between source rows and their tag aspects. These are the data foundation for the tag property panel, tag browser, and any face that shows tagged rows.

- [x] Implement forward lookup (row → its tags):
  ```sql
  -- All tag aspects for a specific source row
  SELECT j.target_matrix_id, j.target_row_id, tt.name AS tag_type_name, tt.color
  FROM joins j
  JOIN tag_types tt ON tt.matrix_id = j.target_matrix_id
  WHERE j.source_matrix_id = :source_mid
    AND j.source_row_id = :source_rid
    AND j.kind = 'own'
  ```
  This returns all tag aspects attached to a row, with their tag type metadata. Used by the tag badge rendering (to show key properties) and any future "tags for this row" display.

- [x] Implement reverse lookup (tag type → all tagged rows):
  ```sql
  -- All source rows that have a specific tag type
  SELECT j.source_matrix_id, j.source_row_id, d.*
  FROM joins j
  JOIN mx_{source_mid}_data d ON j.source_row_id = d.id
  WHERE j.target_matrix_id = :tag_mid
    AND j.kind = 'own'
  ```
  This returns all rows that have been tagged with a specific tag type. Used by the tag browser's reverse lookup view.

- [x] Implement specific aspect lookup (source row + tag type → aspect row data):
  ```sql
  -- The aspect row for a specific (source row, tag type) pair
  SELECT t.*
  FROM mx_{tag_mid}_data t
  JOIN joins j ON j.target_matrix_id = :tag_mid AND j.target_row_id = t.id
  WHERE j.source_matrix_id = :source_mid
    AND j.source_row_id = :source_rid
    AND j.kind = 'own'
  ```
  Used by the tag property panel to load a specific aspect row's data.

- [x] Expose these as worker query operations (or as parameterized queries available to the tag browser face and property panel). The queries involve joins across `joins`, `tag_types`, and dynamic `mx_{id}_data` tables, so they may need to be built dynamically or use the query expression sandbox.

- [x] Tests: create a row with multiple tags, verify forward lookup returns all of them with correct tag type metadata. Create multiple rows with the same tag type, verify reverse lookup returns all tagged rows. Verify specific aspect lookup returns the correct aspect row data. Verify lookups return empty results when no tags exist.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 8a. Tag browser face: registration, tag type list, and app layout

Register the tag browser face, build the tag type list view, and wire it into the app's top-level navigation. This establishes the scaffold; instance drill-down and cross-face navigation come in 8b.

- [x] Register the tag browser face type:
  ```typescript
  registerFaceType({
    id: 'hila.tag-browser',
    name: 'Tag Browser',
    slots: [],
    traitRequirements: [],
    overflowBehavior: 'none',
  })
  ```

- [x] Create `src/tags/TagBrowserFace.tsx` with the **tag type list** (primary view):
  - Lists all registered tag types from `tag_types`, each showing: name (with color badge), instance count, and a link to the tag type's identity face.
  - "New tag type" button at the top — opens a dialog/form to create a tag type with a name, optional column definitions, and optional color.

- [x] Wire the tag browser into the app layout:
  - Add a "Tags" tab or view alongside the outline and notes views.
  - The tag browser renders in a sidebar panel or as a standalone view.
  - Quick access from the global navigation.

- [x] Create the tag browser's face config:
  - The face binding is created by the tags plugin on init.
  - The face is not bound to a specific matrix (it's a cross-matrix view over `tag_types` and their instances).

- [x] Tests: verify the tag browser lists all registered tag types. Verify instance counts are correct. Verify "New tag type" creates a tag type and it appears in the list.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 8b. Tag browser face: instance drill-down, navigation, and context menus

Add the interactive layer to the tag browser: selecting a tag type shows its instances with source row context, clicking an instance navigates to the source row, and context menus provide tag type management actions.

- [x] **Tag instances** (right panel or drill-down view):
  - Selecting a tag type shows its instances, each with key column values from the tag matrix.
  - Each instance shows the source row context: the source matrix name and a snippet of the source row's primary content column.
  - Clicking a tag instance navigates to the source row (opens the source row's face context — outline or note).
  - A link to "View all in table" opens the tag type's identity face (table face) for spreadsheet-style editing of all instances.

- [x] **Context menus** on each tag type row: rename, change color, open identity face, delete tag type.

- [x] **Reverse lookup**: selecting a tag instance highlights or navigates to the source row, showing the tagged row in context.

- [x] Tests: verify clicking a tag type shows its instances. Verify clicking an instance navigates to the source row. Verify context menu actions (rename, change color, delete). Verify "View all in table" opens the identity face.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 9a. Solidify plugin API

With four real plugin consumers (outline, notes, inline references, tags), extract and formalize the plugin registration, lifecycle, and cross-plugin patterns. This is not a rewrite — it's a review and extraction pass that tightens the existing informal patterns into documented, tested contracts.

- [x] **Add `faceTypes` to `PluginDefinition`.** Currently each plugin exports a separate `registerXyzFaceType()` function that must be called manually in `App.tsx` before `registerPlugin()`. Add an optional `faceTypes?: FaceTypeDefinition[]` field to `PluginDefinition`. Update `registerPlugin` to register face types (both locally and in the worker) before creating matrixes and face bindings. Update each plugin's definition to include its face types and remove the manual `registerXyzFaceType()` calls from `App.tsx` (except for the table face type, which is core infrastructure registered first).

- [x] **Register inline references as a plugin.** Create a minimal `PluginDefinition` for inline references (no matrixes, no traits, no face bindings — it is shared editor infrastructure, not a data plugin). Register it in `App.tsx` for identity and discoverability. Move `InlineRefView` from `src/notes/nodeviews/InlineRefView.tsx` to `src/editor/nodeviews/InlineRefView.tsx` since it is shared infrastructure consumed by both outline and notes. Update imports in `OutlineRow.tsx` and `NoteFace.tsx`.

- [x] **Formalize the table face type as core infrastructure.** Document that the table face type is always registered first during app init, before any plugins. It is a core dependency, not a plugin. Add a comment in `App.tsx` and document in `Plugins.md`.

- [x] **Document `PluginContext` as-is (no expansion needed).** After reviewing all four consumers: no plugin needs direct `db` access in `init` (they all use the async client layer); no plugin uses event handlers (cross-plugin interaction is through SQL over shared tables); `matrixIds: Record<string, number>` is sufficient. Add doc comments to the `PluginContext` type explaining the minimal shape. Future extensions (e.g. `schedule()` for Phase 7) will be added when motivated by real consumers.

- [x] **Document the plugin lifecycle contract** in `Plugins.md`, based on the four real consumers:
  - What happens during `registerPlugin` (table creation, trait provisioning, face config creation).
  - What `init` can assume (matrixes exist, traits provisioned, face configs stored).
  - What `destroy` should clean up (subscriptions, timers, in-memory state — NOT matrixes or traits).
  - Dynamic resources: plugins can create additional matrixes at runtime via the op layer (e.g. `createTagType`). These are not declared in `PluginDefinition`.
  - How plugins interact cross-plugin (through SQL queries over shared matrixes and the join table, NOT through direct API calls).

- [x] **Document the cross-plugin interaction pattern** in `Plugins.md`. The tags + inline references interaction is the canonical example:
  - Inline references (shared editor infrastructure): provides the `#` autocomplete trigger, PM node rendering, and calls `createDependentRow` for tag insertion.
  - Tags plugin: manages the tag type registry, provides the tag browser face and tag property panel.
  - The interaction is through shared data (tag type registry, `joins` table, tag matrix data tables), not through plugin-to-plugin API calls.

- [x] **Extract shared utilities.** Three concrete extraction candidates:
  - Column field rendering (`FieldEditor`): extract from `TagPropertyPanel.tsx` to `src/shared/FieldEditor.tsx`.
  - Reactive row data hook (`useRowData`): extract from the pattern in `InlineRefView`/`TagPropertyPanel` to `src/sql/useRowData.ts`.
  - PM doc text extraction (`extractTextFromPmJson`): extract from `TagBrowserFace`/`OutlineRow` to `src/editor/pm-text.ts`.

- [x] Tests: verify existing plugin registration tests still pass. Add tests for `faceTypes` registration, extracted shared utilities.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 9b. Migrate tag type registry to matrix

Convert the `tag_types` system table into a matrix declared in the tags plugin's `PluginDefinition`. The tag type registry is user-managed data (users create, rename, color, browse, and delete tag types), so it belongs in a matrix — not a hand-created system table. This brings the tags plugin into full consistency with the architecture: all user-managed data lives in matrixes. As a matrix, the registry gets automatic sync change tracking, participates in the standard query namespace, and can be viewed through any face type.

- [x] **Add `registry` matrix to tags plugin definition.** Declare a matrix with columns: `name` (TEXT), `matrix_id` (INTEGER), `color` (TEXT), `icon` (TEXT). The tags plugin now has one declared matrix (the registry) plus dynamically created per-tag-type matrixes.

- [x] **Remove `ensureTagTypesTable`.** Delete the DDL `CREATE TABLE IF NOT EXISTS tag_types ...`, the manual `installChangeTrackingTriggers` call, and the `ensureTagTypesTable` worker op. Remove from `matrix-types.ts`, `matrix-client.ts`, `matrix-handler.ts`, and the tags plugin's `init` hook.

- [x] **Rewrite tag type CRUD operations.** Update `createTagType`, `getTagType`, `getTagTypeById`, `getTagTypeByMatrixId`, `getAllTagTypes`, `updateTagType`, `deleteTagType` in `src/tags/tag-types.ts` to operate on `mx_N_data` (the registry matrix) instead of the `tag_types` system table. The registry matrix ID is discovered from plugin metadata on the worker side and cached in a module-level variable on the main thread.

- [x] **Add application-level name uniqueness checking.** The `UNIQUE COLLATE NOCASE` constraint on `name` was enforced at the SQLite level in the system table. In the matrix, enforce uniqueness in the application layer: check for existing names (case-insensitive via `LOWER()`) before inserting in `createTagType` and before renaming in `updateTagType`. This is a temporary workaround — the [column identity and schema integrity](./Plan.md#column-identity-and-schema-integrity) work will restore engine-level constraint enforcement via column constraints declared in the plugin definition.

- [x] **Make the registry matrix ID discoverable.** Two discovery paths: (1) main thread — `getRegistryMatrixId()` exported from `tags-plugin.ts`, set in the `init` hook from `ctx.matrixIds['registry']`; (2) worker thread — `getRegistryMatrixIdFromDb(db)` in `tag-types.ts` queries the `plugins` table metadata.

- [x] **Update all queries** that reference `tag_types` table:
  - `src/tags/tag-queries.ts`: `buildTagTypesWithCountsQuery`, `buildTagsForRowQuery` — accept `registryMatrixId` parameter, use `FROM "mx_N_data" tt`.
  - `src/editor/nodeviews/InlineRefView.tsx`: tag type metadata query — uses `getRegistryMatrixId()` to build the dynamic table name.
  - `src/tags/TagBrowserFace.tsx`: tag type list query — passes `getRegistryMatrixId()` to query builder.

- [x] **Update all tests.** `tags-plugin.test.ts`, `tag-queries.test.ts`, `tag-search.test.ts`, `tag-property-panel.test.ts` — removed `ensureTagTypesTable` calls, updated assertions for registry matrix.

- [x] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 10a. Playwright E2E: tag insertion and tag type creation

E2E coverage for the `#` autocomplete flow and inline tag type creation. Depends on stages 3b and 4.

- [x] **Tag insertion tests:**
  - In an outline row, type `#`, verify autocomplete opens.
  - Type a tag type name that exists, select it, verify a colored tag badge is inserted.
  - Verify the aspect row is created in the tag matrix (check via admin browser or SQL runner).
  - In a note body, type `#`, verify autocomplete opens and tag insertion works identically.

- [x] **Tag type creation tests:**
  - Type `#newtype` where "newtype" is not an existing tag type.
  - Select "Create 'newtype' tag type" from autocomplete.
  - Verify the tag type is created (appears in tag browser).
  - Verify the tag badge is inserted with the new tag type's name.

- [x] Run `pnpm test:e2e` — all pass
- [x] Run `npm run typecheck && npm run lint && npm run test:run` — all Vitest tests still pass

## 10b. Playwright E2E: property panel and owned join lifecycle

E2E coverage for the tag property panel and all three owned join lifecycle directions. Depends on stages 5 and 6.

- [x] **Tag property panel tests:**
  - Click a `#` tag badge in the outline, verify the property panel opens.
  - Edit a field in the property panel, verify the change persists.
  - Close the panel (Escape), verify ProseMirror focus returns to the editor.
  - Open the tag's identity face (table view), verify the same data is shown.
  - Edit the aspect row in the table face, return to the outline, verify the tag badge reflects changes (if key properties are shown).

- [x] **Tag lifecycle tests:**
  - Insert a `#task` tag on an outline row. Delete the tag badge from the text (Backspace). Save. Verify the aspect row no longer exists in the task matrix.
  - Insert `#task` and `#review` tags on an outline row. Delete the outline row. Verify both aspect rows are cascade-deleted.
  - Create a `#task` tag on an outline row. Open the task matrix's identity face. Delete the aspect row from the table face. Return to the outline. Verify the `#task` badge is removed from the outline row's text.

- [x] Run `pnpm test:e2e` — all pass
- [x] Run `npm run typecheck && npm run lint && npm run test:run` — all Vitest tests still pass

## 10c. Playwright E2E: tag browser and cross-plugin interaction

E2E coverage for the tag browser's full interactive flow and cross-plugin data consistency. Depends on stage 8b.

- [x] **Tag browser tests:**
  - Open the tag browser. Verify it lists all registered tag types.
  - Create tags on several rows. Verify instance counts update.
  - Select a tag type, verify its instances are listed with source row context.
  - Click a tag instance, verify navigation to the source row.
  - Create a new tag type from the tag browser UI. Verify it appears in the list.

- [x] **Cross-plugin interaction tests:**
  - Create a note with `#task` in its body text. Verify the task aspect row is created.
  - Open the tag browser, select the task tag type, verify the note appears as a tagged row.
  - Edit the task's properties from the note's inline tag panel. Open the tag browser, verify the updated properties are shown.

- [x] Run `pnpm test:e2e` — all pass
- [x] Run `npm run typecheck && npm run lint && npm run test:run` — all Vitest tests still pass

---

## Task dependency order

```
1. Tag type registry          2. Wire inline refs into outline rows
   │                              │
   ├──────────┬───────────────────┘
   │          ▼
   │   3a. Autocomplete refactor + # trigger detection ◄── 1 + 2
   │          │
   │          ▼
   │   3b. Tag search, insertion, inline creation ◄── 3a
   │          │
   │          ├─► 4. Tag badge rendering
   │          │      │
   │          │      └─► 5. Tag property panel ◄── (click badge → open panel)
   │          │
   │          └─► 6. Owned join lifecycle end-to-end ◄── (reverse cleanup)
   │
   └─► 7. Forward/reverse lookup queries ◄── (used by 5, 8a)
          │
          └─► 8a. Tag browser: list + layout ◄── (uses lookups, tag types)
                  │
                  └─► 8b. Tag browser: drill-down + navigation

9a. Solidify plugin API ◄── 1–8b (extract after all features land)
9b. Migrate tag type registry to matrix ◄── 9a

10a. E2E: insertion + creation ◄── 3b, 4
10b. E2E: property panel + lifecycle ◄── 5, 6
10c. E2E: tag browser + cross-plugin ◄── 8b, 9b
```

Tasks 1 (tag type registry) and 2 (wire inline refs into outline) are independent and can proceed in parallel. Task 3a (autocomplete refactor) depends on both 1 and 2; task 3b (tag search/insertion) depends on 3a. Tasks 4 (badge rendering) and 6 (lifecycle) branch from 3b and can proceed in parallel. Task 5 (property panel) depends on task 4 (clicking the badge opens the panel). Task 7 (lookup queries) branches from task 1 and can proceed in parallel with 2–6. Task 8a (tag browser list) depends on tasks 1 and 7; task 8b (drill-down/navigation) depends on 8a. Task 9a (plugin API solidification) is a horizontal pass after all features are built. Task 9b (tag type registry migration to matrix) depends on 9a and is a separate session. E2E tests are split into three groups that can each begin as their dependencies land: 10a after 3b+4, 10b after 5+6, 10c after 8b+9b (tag browser queries change in 9b).

---

## Decisions and scope boundaries

- **Instance tags only.** All `#` tags create new aspect rows (instance tags). Singleton tags — where `#project-alpha` references an existing, independently-living row — are deferred per [Plan.md - Open design questions](./Plan.md#open-design-questions). The `@`-reference mechanism covers the "link to an existing entity" use case. If singleton tags prove necessary, they can be added as a `#` autocomplete option that creates a `ref`-kind join instead of `own`-kind.

- **No labeled joins.** The join table carries `kind` (`ref`/`own`) but no role label (e.g. "author", "assignee"). Labeled joins are deferred per Plan.md. For Phase 5, the tag type name (from the target matrix's `tag_types` entry) provides sufficient context for display and filtering. If labeled joins are needed later, they would be an additive schema change.

- **Default columns for new tag types.** When a user creates a tag type inline (typing `#newtype`), the matrix gets a single default `label` TEXT column. The user can add more columns later via the identity face. Predefined tag types with specific columns (like `#task` with status/due_date/priority) are Phase 6 scope — Phase 5 provides only the generic tag type creation.

- **Tag type color is cosmetic.** The `color` column in `tag_types` drives badge rendering. If null, a deterministic color is derived from the tag type name (e.g. hash the name into an HSL value). No per-instance colors.

- **No tag-specific face types.** Tags are viewed through their matrix's identity face (table face). Custom face types for specific tag types (e.g. a kanban view for tasks) are future work. The tag browser is a cross-matrix face, not a per-tag-type face.

- **Key properties in badge are optional.** Showing key property chips alongside the tag badge (e.g. `#task ⏰ Friday`) is a rendering enhancement. If it adds significant complexity to the initial implementation, defer it to after the core tag flow is working. The property panel (click to expand) is the primary editing surface.

- **Reverse cleanup scope.** The `removeInlineRefFromDoc` utility handles the case where a tag is deleted from the identity face and the source row's inline text needs cleanup. It does NOT handle the case where a reference cell (table cell) references an owned target — that cleanup path (nulling the cell value) is a separate concern and may be deferred if table cell `own`-kind references are not actively used in Phase 5.

- **Plugin API solidification is extractive, not speculative.** Task 9a documents and tightens what exists, rather than designing capabilities for hypothetical future plugins. Task 9b (tag type registry → matrix migration) is a concrete consistency fix driven by the architecture principle that all user-managed data lives in matrixes. The plugin API continues to evolve as new consumers are built.

---

## Done criteria

All sixteen task groups complete (1, 2, 3a, 3b, 4, 5, 6, 7, 8a, 8b, 9a, 9b, 10a, 10b, 10c). The tag type registry tracks which matrixes are tag types — stored as a matrix (not a system table) for consistency with the architecture. Inline references (including `#` tags) work in outline rows as well as notes. The `#` trigger in inline reference autocomplete searches tag types and creates owned aspect rows via `createDependentRow`. Tag badges render as colored pills with the tag type name, distinct from `@`-reference styling. The tag property panel opens on click, showing hydrated editable fields from the aspect row. Owned join lifecycle works end-to-end in both directions: remove tag from text → aspect row deleted; delete source row → all aspect rows cascade-deleted; delete aspect row from identity face → inline node removed from source text. Forward and reverse lookup queries enable navigation between source rows and their tags. The tag browser face lists all tag types with instance counts and provides reverse lookup navigation. The plugin API is documented and tightened based on patterns from four real consumers: `faceTypes` field in `PluginDefinition`, inline references registered as a plugin, shared utilities extracted, lifecycle and cross-plugin contracts documented. `npm run typecheck && npm run lint && npm run test:run && pnpm test:e2e` all pass.
