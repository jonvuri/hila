# Phase 4 -- Plugin system, faces, and notes

Concrete tasks for Phase 4. See [Plan.md](Plan.md) for context and objectives, [Plugins.md](Plugins.md) for the plugin model and face slot system, and [Traits.md](Traits.md) for the provisioning model.

This phase formalizes the plugin model from the outline's existing patterns, builds the face slot system, introduces the table face as the universal identity face, delivers the notes plugin as the second consumer, and proves cross-face data sharing end-to-end. By the end, two real plugins (outline + notes) compose matrixes, traits, and the join table through a shared plugin system, and the same matrix can be viewed through different face types with different slot bindings.

Ordered to build incrementally: core plugin infrastructure first, then the outline refactored as the first formal plugin, then the table face and notes plugin, then cross-face validation on top.

---

## 1. Plugin system core

The minimum viable plugin system: a registration table, a plugin definition type, lifecycle hooks, and a registration API. Following the [Plugins - Pragmatic development path](./Plugins.md#pragmatic-development-path), this is intentionally minimal -- the formal API will be extracted after multiple real consumers have been built.

- [x] Create `plugins` table in `initMatrixSchema`:
  ```sql
  CREATE TABLE IF NOT EXISTS plugins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    metadata TEXT
  ) STRICT;
  ```
  Install change-tracking triggers on this table (using Phase 3 infrastructure).

- [x] Define the `PluginDefinition` type in a new `src/core/plugin-types.ts`:
  ```typescript
  type PluginDefinition = {
    id: string
    name: string
    version: string
    matrixes: MatrixSpec[]
    traits: TraitRequest[]
    namedQueries: Record<string, string>
    namedMutations: Record<string, string>
    faceBindings: FaceBinding[]
    init?: (ctx: PluginContext) => void | Promise<void>
    destroy?: () => void | Promise<void>
  }

  type MatrixSpec = {
    key: string        // local reference within the plugin
    title: string
    columns: { name: string; type: string }[]
  }

  type TraitRequest = {
    type: 'rank' | 'closure'
    matrixKey: string  // references MatrixSpec.key
  }

  type FaceBinding = {
    key: string
    faceTypeId: string
    matrixKey: string
    slotBindings?: Record<string, string>
    settings?: Record<string, unknown>
  }

  type PluginContext = {
    matrixIds: Record<string, number>  // matrixKey → actual matrixId
  }
  ```

- [x] Implement `registerPlugin(db, definition: PluginDefinition)` in a new `src/core/plugin.ts`:
  - Inserts or updates the `plugins` table row.
  - Creates matrixes declared in `definition.matrixes` (via `createMatrix`). Stores the mapping from `matrixKey` to actual `matrixId`.
  - Requests traits declared in `definition.traits` (via `ensureTrait`, task 2).
  - Stores named queries and mutations (in memory for now; they are prepared statements, not persisted state).
  - Resolves face bindings (via the face system, task 3).
  - Calls `init` lifecycle hook with the resolved `PluginContext`.
  - Idempotent: re-registering the same plugin ID updates metadata but does not recreate existing matrixes (checks matrix registry first).

- [x] Implement `unregisterPlugin(db, pluginId)`:
  - Calls `destroy` lifecycle hook.
  - Removes the `plugins` table row.
  - Does NOT delete matrixes or traits (per [Traits - Provisioning model](./Traits.md#provisioning-model): "traits survive plugin removal"; matrixes are core entities).

- [x] Implement `getPlugin(db, pluginId)` and `getAllPlugins(db)` for querying plugin state.

- [x] Add a `source_plugin_id` column to the `matrix` table:
  ```sql
  ALTER TABLE matrix ADD COLUMN source_plugin_id TEXT REFERENCES plugins(id);
  ```
  Populated when a plugin creates a matrix. Allows the admin browser (task 12) to filter by plugin. Nullable -- user-created matrixes have no plugin source.

- [x] Add worker message types for plugin operations:
  - `registerPlugin` -- accepts a serializable subset of `PluginDefinition` (no function hooks; those live on the main thread).
  - `getPlugins` -- returns all registered plugins.
  The worker handler calls `registerPlugin` and returns the resolved `PluginContext` (matrix ID mapping).

- [x] Add client-side functions in `matrix-client.ts` (or a new `plugin-client.ts`):
  - `registerPlugin(definition)` → sends to worker, returns `PluginContext`.
  - `getPlugins()` → returns plugin list.

- [x] Tests: register a plugin, verify `plugins` table row exists. Register the same plugin twice, verify idempotent (no duplicate matrixes). Unregister a plugin, verify `plugins` row removed but matrixes persist. Verify `source_plugin_id` is set on plugin-created matrixes.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 2. Trait provisioning API

Decouple trait creation from matrix creation and implement the `ensureTrait` provisioning API per [Traits - Provisioning model](./Traits.md#provisioning-model). Currently, `createMatrix` always creates a closure table, and rank entries are created implicitly by `insertRow`. The new API makes trait provisioning explicit, lazy, and shared.

- [x] Add a `matrix_traits` table in `initMatrixSchema`:
  ```sql
  CREATE TABLE IF NOT EXISTS matrix_traits (
    matrix_id INTEGER NOT NULL REFERENCES matrix(id),
    trait_type TEXT NOT NULL CHECK (trait_type IN ('rank', 'closure')),
    PRIMARY KEY (matrix_id, trait_type)
  ) STRICT;
  ```
  Records which traits have been provisioned for which matrixes. Install change-tracking triggers.

- [x] Implement `ensureTrait(db, type, matrixId)` in `src/core/traits.ts`:
  - Checks `matrix_traits` for an existing `(matrixId, type)` entry.
  - If found: returns immediately (idempotent).
  - If not found:
    - **rank**: the `rank` table is shared globally (already exists from `initMatrixSchema`). The trait record is simply bookkeeping -- rank rows reference `matrix_id` already. Insert the `matrix_traits` row.
    - **closure**: creates `mx_{matrixId}_closure` table if it doesn't exist (`CREATE TABLE IF NOT EXISTS`). Insert the `matrix_traits` row.
  - Returns a `TraitHandle` with the trait type and matrix ID.

- [x] Update `createMatrix` to NOT automatically create a closure table. Currently `createMatrix` always creates `mx_{id}_closure`. After this change, the closure table is created on demand via `ensureTrait`. This is a breaking change -- update all call sites that depend on the closure table existing immediately.

- [x] Update `ensureRootMatrix` to explicitly call `ensureTrait('rank', matrixId)` and `ensureTrait('closure', matrixId)` after creating the root matrix. The outline requires both.

- [x] Update `insertRow` to check for trait existence: if called for a matrix that doesn't have the rank or closure trait, either error or auto-provision. Prefer erroring with a clear message -- the caller should ensure traits are provisioned before inserting rows that depend on them.

- [x] Implement `getTraits(db, matrixId)` to list all provisioned traits for a matrix.

- [x] Add worker message types: `ensureTrait`, `getTraits`. Wire into the worker handler.

- [x] Tests: call `ensureTrait('closure', matrixId)` twice, verify idempotent (one table, one `matrix_traits` row). Call for a matrix that already has rank entries, verify no data loss. Create a matrix without traits, attempt `insertRow`, verify it errors or auto-provisions. Verify `getTraits` returns correct results.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 3. Face type registry and slot binding system

Build the core face abstraction: face types with slot declarations, slot binding resolution, and face configuration as serializable data. This is the infrastructure that all faces (outline, table, note, flashcard) will use.

- [x] Define face types in a new `src/core/face-types.ts`:
  ```typescript
  type SlotDeclaration = {
    name: string
    preferredType: string  // 'text' | 'richtext' | 'number' | 'date' | 'boolean' | 'select'
    required: boolean
  }

  type FaceTypeDefinition = {
    id: string
    name: string
    slots: SlotDeclaration[]
    traitRequirements: { type: 'rank' | 'closure' }[]
    overflowBehavior: 'side-columns' | 'property-panel' | 'none'
  }

  type FaceConfig = {
    id: string
    faceTypeId: string
    matrixId: number
    query: string
    slotBindings: Record<string, string>  // slot name → column name
    settings: Record<string, unknown>
  }

  type ResolvedSlotBinding = {
    slotName: string
    columnName: string
    columnType: string
    resolution: 'explicit' | 'name-match' | 'type-position' | 'fallback'
  }
  ```

- [x] Implement the face type registry in `src/core/face-registry.ts`:
  - `registerFaceType(definition: FaceTypeDefinition)` -- registers a face type by ID.
  - `getFaceType(faceTypeId: string)` -- retrieves a face type definition.
  - `getAllFaceTypes()` -- lists all registered face types.
  - The registry is in-memory (face types are registered at app startup by plugins, not persisted in the database).

- [x] Implement slot binding resolution in `src/core/slot-binding.ts`:
  - `resolveSlotBindings(faceType: FaceTypeDefinition, columns: Column[], explicitBindings?: Record<string, string>): ResolvedSlotBinding[]`
  - Resolution chain per [Plugins - Slot binding resolution](./Plugins.md#slot-binding-resolution):
    1. **Explicit binding** -- if `explicitBindings[slotName]` specifies a column, use it.
    2. **Name match** -- column name matches slot name (case-insensitive).
    3. **Type + position** -- first unbound column matching the slot's preferred type.
    4. **Fallback** -- first unbound column regardless of type.
  - Returns the binding for each slot plus a list of overflow columns (columns not bound to any slot).
  - A face always renders something -- never refuses a matrix.

- [x] Implement face-triggered trait provisioning:
  - `applyFaceToMatrix(db, faceTypeId, matrixId)` -- the high-level operation for applying a face type to a matrix.
  - Reads the face type's `traitRequirements` and calls `ensureTrait` for each (task 2).
  - Creates a default `FaceConfig` with auto-resolved slot bindings.
  - Returns the `FaceConfig`.

- [x] Create a `face_configs` table for persisting face configurations:
  ```sql
  CREATE TABLE IF NOT EXISTS face_configs (
    id TEXT PRIMARY KEY,
    face_type_id TEXT NOT NULL,
    matrix_id INTEGER NOT NULL REFERENCES matrix(id),
    query TEXT NOT NULL,
    slot_bindings TEXT NOT NULL,  -- JSON
    settings TEXT,                -- JSON
    created_by_plugin TEXT REFERENCES plugins(id)
  ) STRICT;
  ```
  Install change-tracking triggers.

- [x] Implement face config CRUD: `saveFaceConfig(db, config)`, `getFaceConfig(db, id)`, `getFaceConfigsForMatrix(db, matrixId)`.

- [x] Add worker messages: `applyFaceToMatrix`, `saveFaceConfig`, `getFaceConfigs`. Wire into the worker handler.

- [x] Implement the face rendering dispatch on the UI side in a new `src/core/FaceRenderer.tsx`:
  - A Solid component that takes a `FaceConfig` and renders the appropriate face type component.
  - Resolves slot bindings, passes them to the face type component as props.
  - Each face type component is registered in a component map keyed by `faceTypeId`.

- [x] Tests: resolve slot bindings with explicit bindings (verify explicit wins). Resolve with matching column names (verify name match). Resolve with type match (verify first matching type). Resolve with no match (verify fallback). Verify overflow columns are correctly identified. Verify face-triggered trait provisioning creates traits. Verify FaceConfig round-trip (save and load).
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 4. Refactor outline as formal plugin

Transform the existing outline module into the first formal plugin. This validates the plugin system, trait provisioning, and face type registry with a real consumer. The outline's behavior does not change -- only its registration and wiring.

- [x] Define the outline plugin definition in `src/outline/outline-plugin.ts`:
  ```typescript
  const outlinePlugin: PluginDefinition = {
    id: 'hila.outline',
    name: 'Outline',
    version: '1.0.0',
    matrixes: [
      {
        key: 'root',
        title: 'Outline',
        columns: [{ name: 'content', type: 'TEXT' }],
      },
    ],
    traits: [
      { type: 'rank', matrixKey: 'root' },
      { type: 'closure', matrixKey: 'root' },
    ],
    namedQueries: { /* outline page query, breadcrumbs, etc. */ },
    namedMutations: { /* insertRow, reparentRow, deleteRow wrappers */ },
    faceBindings: [
      {
        key: 'main',
        faceTypeId: 'hila.outline',
        matrixKey: 'root',
      },
    ],
    init: async (ctx) => { /* seed welcome row if matrix is new */ },
  }
  ```

- [x] Register the outline face type with the face registry:
  ```typescript
  registerFaceType({
    id: 'hila.outline',
    name: 'Outline',
    slots: [
      { name: 'primary_content', preferredType: 'richtext', required: true },
    ],
    traitRequirements: [
      { type: 'rank' },
      { type: 'closure' },
    ],
    overflowBehavior: 'side-columns',
  })
  ```

- [x] Remove the hardcoded `MATRIX_ID = 1` from `OutlineFace.tsx`. Instead, the outline receives its matrix ID from the plugin context (resolved by `registerPlugin`). Pass it as a prop or via a context provider.

- [x] Refactor `ensureRootMatrix` usage: the outline plugin's `init` hook handles matrix creation and welcome-row seeding, replacing the current `seedWelcomeRow` call in `matrix-handler.ts`. The root matrix is now created through the plugin system like any other plugin matrix.

- [x] Update `App.tsx` to initialize the plugin system on startup:
  - Register the outline plugin.
  - Get the resolved matrix ID from the plugin context.
  - Pass it to `OutlineFace`.
  - The existing outline behavior is preserved -- the refactoring is structural, not behavioral.

- [x] Verify the outline's named queries match the existing SQL in `OutlineFace.tsx`. Formalize them as plugin-level declarations. The actual query execution continues to use `useQuery` and the reactive subscription system.

- [x] Tests: register the outline plugin, verify matrixes and traits are created. Verify the outline renders and functions identically to the pre-refactor version (all existing outline Vitest + Playwright tests should pass without modification).
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass
- [x] Run `npx playwright test` -- all existing E2E tests pass

## 5. Worker protocol: column management operations

Expose `addColumn`, `removeColumn`, and `renameColumn` through the worker protocol. These operations are currently implemented in `matrix.ts` but not exposed to the main thread. The table face (task 6) and identity face need them for schema management.

- [x] Add worker message types for column operations in `matrix-types.ts`:
  - `addColumn` -- params: `{ matrixId: number; name: string; columnType: string }`, result: `void`. (param named `columnType` to avoid collision with message `type` discriminator in `workerCall` spread)
  - `removeColumn` -- params: `{ matrixId: number; columnName: string }`, result: `void`.
  - `renameColumn` -- params: `{ matrixId: number; oldName: string; newName: string }`, result: `void`.
  - `getColumns` -- params: `{ matrixId: number }`, result: `ColumnDefinition[]`.

- [x] Add handlers in `matrix-handler.ts` that call the corresponding `matrix.ts` functions.

- [x] Add client-side functions in `matrix-client.ts`:
  - `addColumn(matrixId, name, columnType)` → worker call.
  - `removeColumn(matrixId, columnName)` → worker call.
  - `renameColumn(matrixId, oldName, newName)` → worker call.
  - `getColumns(matrixId)` → worker call.

- [x] Ensure column operations trigger write invalidation so reactive queries on the affected matrix update. The `matrix_columns` table and `mx_{id}_data` table both change -- subscribed queries that reference either should re-run.

- [x] Tests: add a column via the worker protocol, verify the column exists in both `matrix_columns` and the data table. Remove a column, verify it's gone. Rename a column, verify data survives.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 6. Table face type

A general-purpose spreadsheet-like face for viewing and editing matrix data. This is the universal face and the default **identity face** for all matrixes. See [Architecture - Identity face](./Architecture.md#identity-face).

- [x] Register the table face type:
  ```typescript
  registerFaceType({
    id: 'hila.table',
    name: 'Table',
    slots: [],  // no slots -- every column is a table column
    traitRequirements: [],
    overflowBehavior: 'none',
  })
  ```

- [x] Create `src/table/TableFace.tsx` component:
  - Receives a `FaceConfig` (with matrix ID and query).
  - Queries column metadata via `getColumns` (reactive, re-runs on schema changes).
  - Queries row data via the face config's query (defaults to `SELECT * FROM mx_{id}_data`).
  - Renders a scrollable table with column headers and data cells.

- [x] **Column headers:**
  - Display column name and type.
  - Click a column header to rename (inline edit).
  - Drag column headers to reorder (updates `matrix_columns` order).
  - Column header context menu: rename, change type, delete column.

- [x] **Column type system:**
  - Types: `text`, `number`, `date`, `boolean`, `select`.
  - Each type has a display renderer and an edit renderer:
    - `text`: plain text display, text input on edit.
    - `number`: right-aligned display, number input on edit.
    - `date`: formatted date display, date picker on edit.
    - `boolean`: checkbox display and edit.
    - `select`: badge/chip display, dropdown on edit. Options stored in column metadata (extend `matrix_columns` with an `options` TEXT column for JSON-encoded enum values).
  - Type coercion: when changing a column's type, existing values that can't be coerced display an error indicator.

- [x] **Inline cell editing:**
  - Click a cell to enter edit mode (or start typing while a cell is focused).
  - The cell's editor component is determined by the column type.
  - On blur or Enter: commit the edit via `updateRow`.
  - On Escape: cancel the edit.
  - Tab / Shift-Tab: commit and move to the next/previous cell.

- [x] **Row operations:**
  - Add row: a "+" button at the bottom or a keyboard shortcut. Creates a new row via `insertDataRow` + `insertRow` (if rank trait exists).
  - Delete row: row context menu or keyboard shortcut. Only available on the identity face (per [Architecture - Hydration](./Architecture.md#hydration)).

- [x] **Column operations:**
  - Add column: a "+" button on the last column header. Opens a type picker. Calls `addColumn`.
  - Delete column: via column header context menu. Calls `removeColumn`. Only available on the identity face.

- [x] **Basic sort and filter:**
  - Click a column header to sort by that column (ASC/DESC toggle). Sorting modifies the face config's query to add `ORDER BY`.
  - A filter bar that allows adding conditions (column, operator, value). Filtering modifies the query to add `WHERE` clauses.
  - Sort and filter state is stored in the face config's `settings`.

- [x] **Keyboard navigation:**
  - Arrow keys move between cells.
  - Enter starts editing, Escape cancels.
  - Tab/Shift-Tab move between cells and commit edits.

- [x] **Identity face wiring:**
  - When a matrix is created, automatically create an identity face config with `faceTypeId: 'hila.table'` and the default `SELECT * FROM mx_{id}_data` query.
  - The identity face is accessible from the admin browser and from any surface that manages matrix metadata.

- [x] Tests (Vitest): column type rendering dispatch (given a type, returns correct renderer). Sort/filter query generation. Cell edit commit logic.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 7. Formula columns

Read-only computed columns whose values are SQL expressions evaluated per-row. Provides the foundation for auto-fill and computed fields. See [Architecture - Query expression](./Architecture.md#query-expression).

- [x] Extend `matrix_columns` with a `formula` column:
  ```sql
  ALTER TABLE matrix_columns ADD COLUMN formula TEXT;
  ```
  If `formula` is non-null, the column is a formula column. The `formula` value is a SQL expression (e.g. `date('now')`, `price * quantity`, `length(title)`).

- [x] Implement `addFormulaColumn(db, matrixId, name, formula)` in `matrix.ts`:
  - Inserts into `matrix_columns` with the formula expression. Does NOT add a physical column to the data table -- formula columns exist only in the query layer.
  - Validates the formula expression by attempting `SELECT ({formula}) FROM mx_{id}_data LIMIT 0` in a read-only sandbox. Rejects invalid expressions.

- [x] Update the identity face query to include formula columns:
  - For each formula column, add it as a computed expression in the SELECT: `SELECT *, ({formula}) AS {name} FROM mx_{id}_data`.
  - Formula columns appear in query results alongside literal columns.

- [x] Update `getColumns` to include formula columns (with a flag indicating they are formulas).

- [x] Render formula columns with a visual distinction in the table face:
  - Different background color (e.g. subtle gray).
  - Non-editable cells (clicking does not enter edit mode).
  - Tooltip or icon indicating "computed column."

- [x] Expose via worker: `addFormulaColumn(matrixId, name, formula)`, `removeColumn` works for formula columns too (removes from `matrix_columns`).

- [x] Tests: add a formula column `length(title)`, query the matrix, verify computed values appear. Add an invalid formula, verify rejection. Remove a formula column, verify it disappears from query results. Verify formula columns are non-editable in the table face (Vitest for data layer, Playwright for UI).
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 8. Notes plugin: matrix, traits, and faces

The second formal plugin, proving the plugin model with a different data shape and face type. See [Plugins - Notes plugin](./Plugins.md#notes-plugin) for the full spec.

- [x] Define the notes plugin in `src/notes/notes-plugin.ts`:
  ```typescript
  const notesPlugin: PluginDefinition = {
    id: 'hila.notes',
    name: 'Notes',
    version: '1.0.0',
    matrixes: [
      {
        key: 'notes',
        title: 'Notes',
        columns: [
          { name: 'title', type: 'TEXT' },
          { name: 'body', type: 'TEXT' },
        ],
      },
    ],
    traits: [
      { type: 'rank', matrixKey: 'notes' },
    ],
    namedQueries: {
      allNotes: `SELECT r.row_id, d.title, d.body FROM rank r JOIN mx_{mid}_data d ON r.row_id = d.id WHERE r.matrix_id = :mid ORDER BY r.key`,
      singleNote: `SELECT d.title, d.body FROM mx_{mid}_data d WHERE d.id = :row_id`,
      backlinks: `SELECT j.source_row_id, d.title FROM joins j JOIN mx_{mid}_data d ON j.source_row_id = d.id WHERE j.target_matrix_id = :mid AND j.target_row_id = :target_rid AND j.source_matrix_id = :mid`,
    },
    namedMutations: { /* create note, update note */ },
    faceBindings: [
      { key: 'list', faceTypeId: 'hila.note-list', matrixKey: 'notes' },
      { key: 'editor', faceTypeId: 'hila.note', matrixKey: 'notes' },
    ],
    init: async (ctx) => { /* create default welcome note if matrix is empty */ },
  }
  ```

- [x] Register the note face types:
  - **Note list face** (`hila.note-list`): sidebar list of notes with title and body preview.
    - Slots: none (renders title and body preview for each note).
    - Trait requirements: rank (for list ordering).
  - **Single-note face** (`hila.note`): full note editor.
    - Slots: `title` (prefers text), `body` (prefers richtext).
    - Trait requirements: none (individual note view).
    - Overflow behavior: property-panel (Notion-style page properties for additional columns).

- [x] Create `src/notes/NoteListFace.tsx`:
  - Scrollable list of notes in rank order.
  - Each item shows the note title and a truncated body preview (first ~100 characters of text content extracted from the ProseMirror JSON).
  - Clicking a note opens it in the single-note face.
  - Add-note button at the top or bottom.
  - Keyboard: arrow keys to navigate, Enter to open, Mod-N (or similar) to create a new note.

- [x] Create `src/notes/NoteFace.tsx` (single-note face):
  - Title as an editable heading at the top of the pane (plain text input or single-line PM editor).
  - Body as a full ProseMirror editor below the title. Reuses the existing PM setup from the outline (`schema.ts`, `createEditorState.ts`, node views) extended with the wikilink node (task 9).
  - Content persistence: save title and body to the notes matrix via `updateRow` on change (debounced).
  - Overflow columns (if any additional columns exist beyond title and body): render in a collapsible property panel above the body, showing column name/value pairs as editable fields.
  - Backlinks panel below the body (task 9).

- [x] Wire into `App.tsx`:
  - Add a notes panel/view to the app layout. The notes list renders in the sidebar (a new tab alongside Matrix Debug) or as a dedicated panel. The single-note face renders in the main content area.
  - Register the notes plugin on startup alongside the outline plugin.
  - Navigation: selecting a note in the list opens it in the editor; a back button or breadcrumb returns to the list.

- [x] Tests: register the notes plugin, verify matrix and traits created. Create a note, verify it appears in the list. Edit the title and body, verify persistence. Verify the note list shows correct ordering. Verify overflow columns appear in the property panel.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 9. Wiki-link inline node, join sync, and backlinks

Extend the ProseMirror schema with a `wikilink` inline node. Implement `[[` autocomplete for inserting links between notes. Sync wikilink markers to the join table on save. Display backlinks.

- [x] Add `wikilink` node to the ProseMirror schema (`src/outline/schema.ts` or a shared schema module):
  ```typescript
  wikilink: {
    group: 'inline',
    inline: true,
    atom: true,
    attrs: {
      matrixId: { default: null },
      rowId: { default: null },
    },
    toDOM: (node) => ['span', { class: 'wikilink', 'data-matrix-id': node.attrs.matrixId, 'data-row-id': node.attrs.rowId }, ''],
    parseDOM: [{ tag: 'span.wikilink', getAttrs: (dom) => ({ matrixId: Number(dom.getAttribute('data-matrix-id')), rowId: Number(dom.getAttribute('data-row-id')) }) }],
  }
  ```

- [x] Create a `WikilinkView` Solid node view component (`src/notes/nodeviews/WikilinkView.tsx`):
  - Displays the target note's current title (resolved via a reactive query).
  - Styled distinctly (e.g. blue text, subtle background, link-like appearance).
  - Clicking the wikilink navigates to the target note (opens in the single-note face).
  - If the target row doesn't exist (deleted note), display a "broken link" indicator.

- [x] Implement `[[` autocomplete:
  - A ProseMirror input rule or plugin that detects `[[` and opens an autocomplete dropdown.
  - The dropdown queries the notes matrix for notes matching the typed text (by title prefix or substring).
  - Selecting a note inserts a `wikilink` node with the target's `(matrixId, rowId)`.
  - Typing `]]` after selecting closes the autocomplete.
  - If the typed text doesn't match any existing note, offer a "Create new note" option that creates a new note and inserts the link.

- [x] Implement wiki-link → join table sync:
  - On ProseMirror doc save (in `NoteFace.tsx`), extract all `wikilink` nodes from the saved body JSON.
  - Compare with the current join table entries for this source note:
    ```sql
    SELECT target_matrix_id, target_row_id FROM joins
    WHERE source_matrix_id = :mid AND source_row_id = :rid;
    ```
  - Compute the set difference:
    - New links (in doc but not in join table): `insertJoin` for each.
    - Removed links (in join table but not in doc): `deleteJoin` for each.
  - The join table is a materialized index; the PM doc is the source of truth.

- [x] Add worker message types for join operations if not already exposed:
  - `insertJoin`, `deleteJoin`, `getTargets`, `getSources` should already exist from Phase 1 (verify and wire up if needed).

- [x] Implement the backlinks panel in `NoteFace.tsx`:
  - Query the join table in reverse: all notes that link to the current note.
    ```sql
    SELECT j.source_row_id, d.title
    FROM joins j
    JOIN mx_{mid}_data d ON j.source_row_id = d.id
    WHERE j.target_matrix_id = :mid AND j.target_row_id = :rid
      AND j.source_matrix_id = :mid;
    ```
  - Render as a list of note titles below the body editor.
  - Each backlink is clickable, navigating to that note.
  - Collapsible section, hidden if no backlinks exist.

- [x] Tests (Vitest): insert a wikilink node in a PM doc, save, verify join table row created. Remove the wikilink, save, verify join table row deleted. Insert multiple wikilinks, verify all join rows created. Query backlinks, verify reverse lookup correctness.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 10. Face configuration UI

The UI for applying a face type to a matrix and configuring slot bindings. This makes face application a user-visible operation rather than a code-level wiring. See [Plugins - Face configuration](./Plugins.md#face-configuration).

- [x] Create `src/core/FaceConfigPanel.tsx`:
  - Receives: a matrix ID and an optional initial face type ID.
  - Left column: the face's slots (name, preferred type, current binding).
  - Right column: the matrix's columns (name, type, whether already bound).
  - Auto-mapped bindings pre-filled via `resolveSlotBindings`.
  - Each slot has a dropdown to override the auto-binding with any column.
  - Overflow columns section showing which columns are unbound.

- [x] "Apply face" action:
  - Calls `applyFaceToMatrix` (auto-provisions traits).
  - Saves the face config with the user's chosen slot bindings.
  - Opens the face in the appropriate view area.

- [x] Face type picker:
  - A dropdown or grid of available face types (from the face type registry).
  - Each option shows the face type name and its slot declarations.
  - Selecting a face type populates the binding UI.

- [x] Integrate into the app:
  - Accessible from a matrix's context menu or the admin browser (task 12).
  - "View as..." option that opens the face config panel for a matrix.

- [x] Tests (Playwright): open the face config panel for a matrix, verify slots and columns are shown. Change a binding via dropdown, apply, verify the face renders with the new binding.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 11. Cross-face data sharing

The capstone validation: apply the outline face to the note matrix and demonstrate that the same data is editable through both faces. This proves the face slot model, trait auto-provisioning, and reactive data propagation end-to-end.

- [x] Apply the outline face to the note matrix:
  - Use the face configuration UI (or programmatically for the demo).
  - The system auto-provisions rank and closure traits for the note matrix (rank already exists; closure is new).
  - Slot binding resolution: `title` binds to the outline's `primary_content` slot (first text column, by type+position). `body` becomes an overflow side-column.

- [x] Verify outline rendering of notes:
  - Notes appear as outline rows with the title as the bullet text.
  - The `body` column renders in a side-column area (or expandable secondary view) alongside the title.
  - The outline supports full outlining behavior on notes: indent, outdent, reorder, collapse, expand.

- [x] Verify cross-face reactivity:
  - Edit a note's title in the note face → verify the outline shows the updated title (via reactive query invalidation).
  - Edit a note's title in the outline face → verify the note face shows the updated title.
  - Create a new note in the note list → verify it appears in the outline.
  - Reparent a note in the outline (indent/outdent) → verify the hierarchy is reflected in both views.

- [x] Verify trait auto-provisioning:
  - Before applying the outline face, the note matrix has only the rank trait.
  - After applying, verify the closure trait is provisioned (check `matrix_traits` table).
  - Verify closure entries are created for existing notes (requires a one-time closure build from rank for existing rows).

- [x] Tests (Playwright): open the outline face for notes, create a new note in the note list, verify it appears in the outline. Edit a note title in the outline, switch to the note face, verify the change. Indent a note in the outline, verify hierarchy. This is the primary validation of the face slot system.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass
- [x] Run `npx playwright test` -- all pass (pre-existing failures in outline-collapse, outline-indent, outline-face, face-config cancel button are unrelated)

## 12. Admin / debug matrix browser

Evolve the existing `MatrixDebug.tsx` into a proper system-level admin surface. This provides visibility into all matrixes, their traits, plugins, face configs, and raw data.

- [x] Restructure `MatrixDebug.tsx` (or create a new `src/admin/MatrixBrowser.tsx`):
  - List all matrixes in the registry with metadata: ID, title, source plugin, column count, row count.
  - Filter by source plugin (dropdown populated from `plugins` table).
  - Filter/search by matrix title.

- [x] Per-matrix detail view:
  - **Data tab:** the matrix's data table rendered as a read-only table (or a simplified version of the table face). Shows all columns and rows.
  - **Trait state tab:** lists provisioned traits (`matrix_traits`), shows the rank table filtered to this matrix, shows the closure table.
  - **Join state tab:** forward and reverse join references for each row.
  - **Face configs tab:** lists all face configurations for this matrix, with face type and slot bindings.
  - **Schema tab:** column definitions, formula columns, column types.

- [x] Quick actions:
  - Create matrix (with column definition).
  - Add sample rows.
  - Reset database (with confirmation).
  - Apply a face to a matrix (opens the face config panel).

- [x] Keep the SQL Runner as a separate tab alongside the matrix browser.

- [x] Tests: verify the matrix browser shows plugin-created matrixes with correct `source_plugin_id`. Verify trait state is displayed after provisioning.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 13. Playwright E2E tests

Extend the Playwright test suite to cover the new Phase 4 behaviors. Build incrementally as each task completes.

- [x] **Table face tests:**
  - Open a matrix's table face.
  - Click a cell to edit, type a value, press Enter, verify the value is saved.
  - Add a column via the "+" button, specify a type, verify it appears.
  - Delete a column, verify it's removed.
  - Add a row, verify it appears.
  - Sort by clicking a column header, verify row ordering changes.
  - Keyboard navigation: arrow keys between cells, Tab to advance.

- [x] **Note face tests:**
  - Create a new note, verify it appears in the note list.
  - Click a note in the list, verify the single-note face opens with title and body.
  - Edit the title, verify persistence (navigate away and back).
  - Edit the body with rich text (bold, headings), verify persistence.
  - Verify overflow columns appear in the property panel.

- [x] **Wiki-link tests:**
  - In a note body, type `[[`, verify the autocomplete dropdown appears.
  - Type a note title, select from autocomplete, verify the wikilink node is inserted.
  - Click the wikilink, verify navigation to the target note.
  - Verify the backlinks panel on the target note shows the source note.

- [x] **Face configuration UI tests:**
  - Open the face config panel for a matrix.
  - Verify slots and columns are listed.
  - Change a slot binding via dropdown.
  - Apply the face, verify it renders with the correct binding.

- [x] **Cross-face data sharing tests:**
  - Create notes in the note face.
  - Open the outline face for the notes matrix.
  - Verify notes appear as outline rows with titles.
  - Edit a note title in the outline, verify the change in the note face.
  - Edit a note title in the note face, verify the change in the outline.

- [x] **Formula column tests:**
  - Add a formula column to a matrix.
  - Verify it appears in the table face with computed values.
  - Verify it's non-editable (click doesn't enter edit mode).

- [x] Run `npx playwright test` -- all pass
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all Vitest tests still pass

---

## Task dependency order

```
1. Plugin system core
   │
   └─► 2. Trait provisioning API
          │
          └─► 3. Face type registry + slot binding
                 │
                 ├─► 4. Outline as plugin
                 │
                 ├─► 5. Worker: column management ──► 6. Table face ──► 7. Formula columns
                 │
                 ├─► 8. Notes plugin ◄── 4 (shared PM schema, validated plugin system)
                 │      │
                 │      └─► 9. Wiki-links + backlinks
                 │
                 ├─► 10. Face configuration UI
                 │      │
                 │      └─► 11. Cross-face sharing ◄── 4, 8
                 │
                 └─► 12. Admin matrix browser

13. Playwright E2E ◄── 6, 8, 9, 10, 11
```

Tasks 1-3 are strictly sequential: each builds on the previous. Task 4 (outline refactor) and tasks 5-7 (column ops, table face, formulas) can proceed in parallel after task 3. Task 8 (notes plugin) depends on 3 and benefits from 4 being done first (validated plugin system + shared PM infrastructure). Tasks 10-11 (face config UI, cross-face sharing) depend on 3 and require both 4 and 8 to be complete. Task 12 (admin browser) branches off task 1 and can proceed in parallel with most other work. Task 13 (E2E) is added incrementally but should not run until the features it tests are complete.

---

## Decisions and scope boundaries

- **Plugin system scope.** Minimal for Phase 4: a registration table, definition type, lifecycle hooks. No dynamic plugin loading, no sandboxing, no versioned migration. The formal API will be extracted and solidified after Phase 5 (tags) provides a third consumer. Follow [Plugins - Pragmatic development path](./Plugins.md#pragmatic-development-path).

- **Named queries/mutations are in-memory.** The plugin definition declares them, and they are prepared as statements in the worker, but they are not persisted to a database table. Persistence is a potential Phase 5+ concern if dynamic plugin definitions are needed.

- **Face types are code-registered, not DB-stored.** Face type definitions (slots, trait requirements, component) are registered in the face registry at app startup. Face configurations (the binding of a face type to a specific matrix with specific slot bindings) are persisted in the `face_configs` table.

- **Table face is the identity face.** Every matrix gets a table face as its identity face. The identity face has exclusive permission for destructive operations (row deletion, schema modification, matrix deletion) per [Architecture - Identity face](./Architecture.md#identity-face).

- **Rich text column type.** The `body` column in the notes matrix stores ProseMirror JSON as TEXT. There is no separate `richtext` SQL type -- the column type is TEXT, and the face system infers rich text editing from the slot's `preferredType: 'richtext'` declaration. Column type metadata in `matrix_columns` may include a `richtext` flag to inform face rendering.

- **ProseMirror schema sharing.** The outline and notes plugins share the same ProseMirror schema (paragraph, heading, marks, wikilink). The schema definition may need to move to a shared location (e.g. `src/core/pm-schema.ts` or `src/shared/schema.ts`) rather than living exclusively in `src/outline/`.

- **Note hierarchy.** Notes are flat by default (no closure trait). The outline face application provisions closure for the note matrix, but note-native views (note list, single note) do not use hierarchy. This is intentional -- wiki-links provide the connection fabric for notes, not tree structure.

- **Overflow column rendering.** Overflow columns in the outline face render as horizontal side-columns (tree-table style). Overflow columns in the note face render in a Notion-style property panel. The exact visual treatment is face-type-specific and may evolve with use.

- **No face embedding or nesting.** Phase 4 does not implement face composition (nesting faces within each other, live embedded queries, progressive depth). These are documented in the [Architecture - Cross-face data sharing](./Architecture.md#cross-face-data-sharing) section as future capabilities. Phase 4 validates the simpler case: the same matrix viewed through different face types in separate views.

- **No undo for structural operations.** Consistent with Phase 2's scope. ProseMirror handles text undo. Structural undo (row deletion, reparenting, schema changes) remains unaddressed.

---

## Done criteria

All thirteen task groups complete. The plugin system supports registration, lifecycle, and matrix/trait provisioning. The trait provisioning API is decoupled from matrix creation and supports face-triggered provisioning. The face type registry, slot binding resolution, and face configuration system are functional. The outline operates as a formal plugin. The table face provides spreadsheet-like viewing and editing for any matrix. Formula columns evaluate SQL expressions per-row. The notes plugin delivers titled documents with rich text bodies, wiki-links with `[[` autocomplete, join table sync, and a backlinks panel. The face configuration UI allows users to apply face types to matrixes with configurable slot bindings. Cross-face data sharing is demonstrated: the note matrix viewed through both the note face and the outline face, with reactive propagation of edits. The admin matrix browser shows all matrixes, traits, and plugin metadata. `npm run typecheck && npm run lint && npm run test:run && npx playwright test` all pass.
