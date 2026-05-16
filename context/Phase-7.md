# Phase 7 -- Workspace plugin and stream view

Concrete tasks for Phase 7. See [Plan.md](Plan.md) for context and objectives, [Architecture.md](Architecture.md) for cross-face data sharing, and [Plugins.md](Plugins.md) for the workspace plugin design.

Merge the outline and notes plugins into a single **workspace plugin** with a unified matrix and a new **stream view** face. The stream view replaces the separate Outline, Notes, and Notes Outline tabs with a composable multi-panel interface where hierarchy flows left-to-right and detail flows top-to-bottom. Each row is simultaneously an outline bullet and a potential document -- the distinction is one of zoom level, not data type.

### Current implementation state (prerequisites from Phase 6)

What exists and Phase 7 builds on:
- **Outline plugin** (`hila.outline`): single matrix with `content` TEXT column, rank + closure traits, `hila.outline` face type with `primary_content` slot, side-columns overflow. Full outline interactions: Enter, Tab/Shift-Tab, Backspace, arrow keys, collapse/expand, drag-and-drop, focus view, breadcrumbs, paged virtualization.
- **Notes plugin** (`hila.notes`): separate matrix with `title` TEXT and `body` TEXT columns, rank trait (no closure -- notes are flat). Note list face, single-note editor face with ProseMirror body, backlinks panel.
- **Inline references plugin** (`hila.inlineref`): `@`-references and `#`-tags in ProseMirror content. Join table sync on doc save. Reference states (live/empty/ghost). Wired into both outline rows and note body text.
- **Tags plugin** (`hila.tags`): tag type registry, `#` autocomplete, tag property panel, tag browser face, owned join lifecycle.
- **Table face**: general-purpose spreadsheet face with column types (text, number, date, boolean, select, reference), sort/filter, formula columns.
- **Column display roles** (Phase 6): `matrix_columns.role` with `'label'` and `'content'` values, partial unique index, `updateColumnRole` op, roles in `MatrixSpec` and `ColumnDefinition`.
- **Face system**: face type definitions with slots, trait requirements, overflow behavior. Face config with slot bindings (column ID), sort, filters. `applyFaceToMatrix`, `resolveSlotBindings`.
- **App shell**: tab-based navigation with Outline, Table, Notes, Notes Outline, and Tags views. Sidebar with Matrix Browser and SQL Runner.

What Phase 7 replaces or removes:
- **Outline plugin** (`hila.outline`) → replaced by workspace plugin
- **Notes plugin** (`hila.notes`) → replaced by workspace plugin
- **`NoteListFace.tsx`** → removed (note list is replaced by navigation panels)
- **`NoteFace.tsx`** → removed (note editing is replaced by focus panels)
- **Notes Outline tab** → removed (cross-face wiring no longer needed)
- **Outline, Notes tabs** → replaced by single Workspace tab

What Phase 7 preserves:
- **`OutlineFace.tsx` interactions** → refactored into navigation panel component (Enter, Tab, Backspace, drag-drop, collapse/expand, virtualization)
- **`OutlineRow.tsx`** → evolved to show label + content preview
- **ProseMirror editor setup** → reused for both label (single-line) and content (multi-line) editing
- **Inline references** → wired for both label and content columns
- **Backlinks query** → moved from NoteFace to focus panel

---

## 1. Workspace plugin definition

Replace `hila.outline` and `hila.notes` with a single `hila.workspace` plugin.

- [ ] **Create `src/workspace/workspace-plugin.ts`.**

  Define the plugin with a single matrix and two columns:
  ```typescript
  export const workspacePlugin: PluginDefinition = {
    id: 'hila.workspace',
    name: 'Workspace',
    version: '1.0.0',
    faceTypes: [workspaceFaceTypeDefinition],
    matrixes: [
      {
        key: 'root',
        title: 'Workspace',
        columns: [
          { name: 'label', type: 'TEXT', role: 'label' },
          { name: 'content', type: 'TEXT', role: 'content' },
        ],
      },
    ],
    traits: [
      { type: 'rank', matrixKey: 'root' },
      { type: 'closure', matrixKey: 'root' },
    ],
    namedQueries: { /* ... */ },
    namedMutations: {},
    faceBindings: [
      { key: 'main', faceTypeId: 'hila.workspace', matrixKey: 'root' },
    ],
    init: async (ctx) => {
      const matrixId = ctx.matrixIds['root']
      if (matrixId !== undefined) {
        await seedWelcomeRow(matrixId, welcomeLabelJson, welcomeContentJson)
      }
    },
  }
  ```

- [ ] **Define `workspaceFaceTypeDefinition`:**
  ```typescript
  export const workspaceFaceTypeDefinition: FaceTypeDefinition = {
    id: 'hila.workspace',
    name: 'Workspace',
    slots: [
      { name: 'label', preferredType: 'richtext', required: true },
      { name: 'content', preferredType: 'richtext', required: false },
    ],
    traitRequirements: [{ type: 'rank' }, { type: 'closure' }],
    overflowBehavior: 'property-panel',
  }
  ```

- [ ] **Update `seedWelcomeRow`** (or add a new seeding mechanism) to accept both label and content values. The welcome row: label = "Welcome to Hila", content = getting-started prose explaining the stream view basics.

- [ ] **Port outline query builders** from `outline-plugin.ts` to `workspace-plugin.ts`. Update column references from `d.content` to `d.label, d.content` in the SELECT. The main paged outline query becomes:
  ```sql
  SELECT r.key, r.row_id, d.label, d.content,
         COALESCE(c.depth, 0) as depth,
         CASE WHEN ch.ancestor_key IS NOT NULL THEN 1 ELSE 0 END as has_children
  FROM rank r
  JOIN "mx_{mid}_data" d ON r.row_id = d.id
  LEFT JOIN (...) c ON r.key = c.descendant_key
  LEFT JOIN (...) ch ON r.key = ch.ancestor_key
  WHERE r.matrix_id = {mid}
  {filterClauses}
  ORDER BY r.key
  ```

- [ ] **Add single-row query** for focus panels:
  ```sql
  SELECT d.* FROM "mx_{mid}_data" d WHERE d.id = {rowId}
  ```

- [ ] **Port breadcrumb query** from `outline-plugin.ts`. Update to select `d.label` instead of `d.content`.

- [ ] **Add backlinks query** (ported from `NoteFace.tsx`):
  ```sql
  SELECT j.source_row_id AS id, j.kind, d.label
  FROM joins j
  JOIN "mx_{mid}_data" d ON j.source_row_id = d.id
  WHERE j.target_matrix_id = {mid} AND j.target_row_id = {rid}
    AND j.source_matrix_id = {mid}
  ORDER BY d.label
  ```

- [ ] Tests: workspace plugin registers correctly with `registerPlugin`. The matrix is created with two columns (`label`, `content`). Both columns have correct roles assigned. Rank and closure traits are provisioned. The face type is registered. The welcome row is seeded with both label and content.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 2. Navigation panel component

The navigation panel is the core of the stream view -- a scrollable, virtualized outline with full editing interactions. It refactors `OutlineFace.tsx` into a reusable component that can appear at root level or as a child subtree inside a focus panel.

- [ ] **Create `src/workspace/NavigationPanel.tsx`.**

  Props:
  ```typescript
  type NavigationPanelProps = {
    matrixId: number
    rootKey?: Uint8Array    // if set, shows subtree starting at this row
    onOpenFocus: (rowId: number, key: Uint8Array) => void  // right-arrow click
    focusedRowId?: number   // highlight the row that has an open focus panel
  }
  ```

- [ ] **Port outline interactions from `OutlineFace.tsx`.** The navigation panel retains all existing outline behavior:
  - Enter creates new sibling (inserts row with empty `label`, null `content`)
  - Tab / Shift-Tab indent / outdent
  - Backspace at start merges / deletes
  - Arrow keys move between rows
  - Collapse / expand subtrees
  - Drag-and-drop reordering
  - Focus view (zoom into subtree via breadcrumb)
  - Virtualized scrolling via `ScrollVirtualizer`

- [ ] **Update row rendering.** Each row in the navigation panel shows:
  1. **Label**: full display, wrapping to multiple lines. Edited inline via a single-line ProseMirror editor (paragraph-only schema, no headings). This is the primary editing surface.
  2. **Content preview**: smaller font below the label, clamped to two lines (CSS `-webkit-line-clamp` or similar). Shows extracted text from content column. When focused/clicked, expands into a full ProseMirror editor for inline editing.
  3. **Right-arrow button**: aligned to right edge of the row, visible on hover (dimmed) or focus (primary color). Clicking calls `onOpenFocus(rowId, key)`.

- [ ] **Wire inline references** for label editing. The ProseMirror setup for label uses the same `createInlinerefPlugin` and inline ref node views as the current outline. `@`-references and `#`-tags work in label text.

- [ ] **Wire inline references for content editing** when the content preview is expanded. Same ProseMirror setup with full schema (paragraphs, headings, marks).

- [ ] **Update `insertRow` calls.** New rows are inserted with `values: { label: emptyDocJson, content: null }` instead of `values: { content: emptyDocJson }`.

- [ ] **Breadcrumb display.** When `rootKey` is set (subtree mode), show breadcrumbs at the top of the panel. Port from existing `OutlineFace.tsx` breadcrumb rendering. Update query to select `d.label` for breadcrumb text.

- [ ] **Shift-Enter handler.** When pressing Shift-Enter in the label editor, move focus to the row's inline content editor (expanding the content preview into a full ProseMirror editor if it isn't already). This is analogous to Shift-Enter in Workflowy, which focuses the "note" field for the current bullet. If the content is null, initialize it with an empty PM doc and focus the new editor.

- [ ] **Cmd/Ctrl+L handler.** Opens a focus panel for the currently focused row (calls `onOpenFocus(rowId, key)`). This is the keyboard shortcut for the right-arrow button.

- [ ] Tests (Playwright): navigation panel renders rows with label text. Enter creates a new row. Tab indents, Shift-Tab outdents. Backspace merges. Arrow keys navigate. Collapse/expand works. Drag-and-drop reorders. Right-arrow button appears on hover. Breadcrumbs display in subtree mode.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 3. Focus panel component

The focus panel shows all details for a single row: label as header, content as full editor, overflow columns as properties, backlinks, and children.

- [ ] **Create `src/workspace/FocusPanel.tsx`.**

  Props:
  ```typescript
  type FocusPanelProps = {
    matrixId: number
    rowId: number
    rowKey: Uint8Array
    onOpenFocus: (rowId: number, key: Uint8Array) => void  // for nested navigation
    onClose: () => void
  }
  ```

- [ ] **Label section.** A large header at the top. ProseMirror editor with single-line schema (paragraph only, no headings). Styled at a consistent display size regardless of PM content -- if the richtext contains heading marks, they're stripped or ignored for display sizing. Debounced save to `updateRow` for the `label` column.

- [ ] **Content section.** A full ProseMirror editor below the label. Multi-paragraph schema (paragraphs, headings, bold/italic/code/link marks). Placeholder text when empty ("Start writing..."). Debounced save to `updateRow` for the `content` column. Wire inline references (`@` and `#`).

- [ ] **Overflow columns section.** Query `getColumns` for the matrix. Any columns beyond `label` and `content` render as a property list (similar to NoteFace's property panel pattern). Use `FieldEditor` from `src/shared/FieldEditor.tsx` for per-column-type editing.

- [ ] **Backlinks section.** Collapsible section (default collapsed). Query the join table for rows that reference this row:
  ```sql
  SELECT j.source_row_id AS id, j.kind, d.label
  FROM joins j
  JOIN "mx_{mid}_data" d ON j.source_row_id = d.id
  WHERE j.target_matrix_id = {mid} AND j.target_row_id = {rid}
    AND j.source_matrix_id = {mid}
  ORDER BY d.label
  ```
  Each backlink is clickable -- clicking navigates to the source row (calls `onOpenFocus` to open it).

- [ ] **Children section.** At the bottom, a nested `NavigationPanel` rooted at this row's key, showing the subtree. If the row has no children, show a placeholder ("No children. Press Enter in the outline to add items."). The nested navigation panel has full outline interactions and can spawn further focus panels via `onOpenFocus`.

- [ ] **Child matrix reference handling.** If `row_kind = 1` (child matrix reference), the focus panel displays the matrix's identity face (table face) inline instead of the standard label/content/children layout. This requires checking `row_kind` from the data table and resolving the referenced matrix ID from the row's data.

- [ ] **Data loading.** Use `useQuery` with the single-row query to load label, content, and any overflow columns. The query re-fires reactively on changes (e.g. after save).

- [ ] **Keyboard: Escape.** Pressing Escape while in the focus panel's label or content editor signals `onClose` to return focus to the navigation panel.

- [ ] Tests (Playwright): focus panel displays label as header. Content editor is editable. Empty content shows placeholder. Backlinks section collapses/expands. Children navigation panel shows subtree. Typing in label saves (debounced). Typing in content saves. Escape returns focus to navigation panel.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 4. Stream view: panel management

The stream view composes navigation panels and focus panels into a left-to-right arrangement.

- [ ] **Create `src/workspace/StreamView.tsx`.**

  This is the top-level component for the workspace face. It manages the panel stack.

  State:
  ```typescript
  type PanelState =
    | { type: 'navigation'; rootKey?: Uint8Array }
    | { type: 'focus'; rowId: number; rowKey: Uint8Array }

  const [panels, setPanels] = createSignal<PanelState[]>([
    { type: 'navigation' }  // initial: root navigation panel
  ])
  ```

- [ ] **Panel opening logic.** When `onOpenFocus` is called from a navigation panel at index `i`:
  1. Remove all panels after index `i`.
  2. Append a focus panel for the target row. (The focus panel internally renders a nested navigation panel for the row's children -- this is a component concern, not panel-stack state.)
  3. If the resulting number of navigation panels exceeds 4, remove the leftmost navigation panel (and its associated focus panel, if any).

  The panel limit counts **navigation panels only**. A focus panel with its nested child navigation panel forms a single visual column. This means the state array can hold more than 4 entries, but at most 4 of them are `type: 'navigation'`.

- [ ] **Panel closing logic.** `onClose` from a focus panel removes it and any panels to its right. The panel to its left (the navigation panel that spawned it) receives focus.

- [ ] **Panel layout.** Panels are laid out left-to-right in a flex container. A navigation panel and the focus panel it spawned form a visual column together. Each column has a minimum width and grows to fill available space. When multiple columns are open, they share width proportionally. Consider horizontal scrolling if total minimum width exceeds viewport.

- [ ] **Ancestry constraint.** All visible panels represent a single line of ancestry. The combined breadcrumb chain is unbroken. This is enforced by the panel opening logic (replacing panels to the right).

- [ ] **Keyboard: Cmd/Ctrl+L.** Opens a focus panel for the currently focused row (same as clicking the right-arrow button). Handled in the navigation panel and forwarded to the stream view via `onOpenFocus`.

- [ ] **Keyboard: Cmd+Left.** Closes the rightmost panel (navigates back).

- [ ] Tests (Playwright): initial state is single navigation panel at full width. Click right-arrow on a row → focus panel opens to the right. Click right-arrow on a child row inside focus panel's children → second focus panel replaces the first. Navigation panel count never exceeds 4 (opening a 5th removes the leftmost column). Cmd/Ctrl+L opens focus panel. Cmd+Left closes rightmost panel.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 5. App shell restructuring

Replace the tab-based multi-view layout with the workspace as the default. The old database should be deleted before running the app for the first time after this change -- no data migration is needed.

- [ ] **Update `App.tsx`.** Replace the `outlinePlugin` and `notesPlugin` registrations with `workspacePlugin`. Remove:
  - `outlinePlugin` import and registration
  - `notesPlugin` import and registration
  - `outlineMatrixId` / `notesMatrixId` signals
  - `notesOutlineReady` signal and the Notes Outline tab logic
  - `selectedNoteId` signal and note selection logic
  - Lazy imports for `OutlineFace`, `NoteListFace`, `NoteFace`

  Add:
  - `workspacePlugin` import and registration
  - `workspaceMatrixId` signal
  - Lazy import for `StreamView`

- [ ] **Update tab structure.** The view tabs become:
  - **Workspace** (default, active on load) → renders `StreamView`
  - **Table** → renders `TableFace` for the workspace matrix
  - **Tags** → renders `TagBrowserFace`

- [ ] **Update `ActiveView` type.** Remove `'outline' | 'notes' | 'notes-outline'`, add `'workspace'`:
  ```typescript
  type ActiveView = 'workspace' | 'table' | 'tags'
  ```

- [ ] **Update tag browser integration.** The tag browser's "navigate to source row" action should open the workspace view and navigate to the row (open a focus panel for it). Port from the current outline navigation callback.

- [ ] **Update inline reference navigation.** Clicking an `@`-reference in the workspace navigates within the stream view (opens a focus panel for the target row) rather than switching tabs.

- [ ] Tests (Playwright): app loads with Workspace tab active. Stream view renders. Table tab shows workspace matrix in table face. Tags tab shows tag browser. No Outline, Notes, or Notes Outline tabs exist. Matrix browser shows the workspace matrix with label and content columns.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 6. Remove old outline and notes code

Clean up the codebase after the workspace plugin is fully wired.

- [ ] **Delete or archive:**
  - `src/outline/outline-plugin.ts` (query builders ported to workspace-plugin.ts)
  - `src/notes/notes-plugin.ts`
  - `src/notes/NoteFace.tsx`
  - `src/notes/NoteListFace.tsx`
  - `src/notes/notes-plugin.test.ts`

- [ ] **Evaluate what to keep from `src/outline/`:**
  - `OutlineFace.tsx` → most logic ported to `NavigationPanel.tsx`. Delete after confirming all behavior is ported.
  - `OutlineRow.tsx` / `OutlineRowHarness.tsx` / `EditorHarness.tsx` → evaluate if they're still used or if the navigation panel has its own row component.
  - `usePagedOutlineData.ts` → port to workspace or keep if reusable.
  - `drag-drop.ts` → keep if used by NavigationPanel, otherwise port.
  - Test files → update to target workspace equivalents.

- [ ] **Update imports everywhere.** Any remaining code that imports from `outline-plugin` or `notes-plugin` (e.g. tests, other plugins) must be updated.

- [ ] **Update Plugins.md.** The staged changes already update the plugin documentation to describe the workspace plugin. Verify the documentation matches the final implementation.

- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass
- [ ] Run `pnpm test:e2e` -- all pass (or update E2E tests as needed)

## 7. ProseMirror editor configuration

Two distinct editor configurations are needed for the workspace: single-line (label) and multi-line (content).

- [ ] **Single-line label editor.** A ProseMirror schema that allows only a single paragraph (no headings, no multi-block content). Custom keymap:
  - **Enter**: should NOT insert a newline. Instead, it creates a new sibling row (in navigation panel context) or does nothing (in focus panel context).
  - **Shift-Enter**: moves focus to the row's inline content editor (expanding it if collapsed). Analogous to Workflowy's Shift-Enter for focusing the note field.
  - Arrow keys, basic marks (bold, italic, code) work normally.
  - Inline references (`@`, `#`) work.

- [ ] **Multi-line content editor.** The full ProseMirror schema (paragraphs, headings, marks, inline refs). This is essentially the existing note body editor configuration.
  - **Enter**: creates a new paragraph (normal ProseMirror behavior).
  - **Shift-Enter**: soft newline / hard break.
  - Full mark support.

- [ ] **Extract shared editor setup.** Factor common ProseMirror configuration (inline ref plugin, node views, sync logic) into shared utilities. Both label and content editors use the same inline ref infrastructure but different schemas and keymaps.

- [ ] **Debounced save.** Both editors debounce saves. Label changes save to the `label` column, content changes save to the `content` column. Use the existing `updateRow` call pattern. Consider whether a single save call (both columns) or separate per-column saves are more appropriate. Per-column saves avoid unnecessary writes when only one field changes.

- [ ] Tests (Vitest): single-line schema rejects multi-paragraph content. Multi-line schema accepts paragraphs and headings. Inline ref sync works for both schemas. (Playwright): type in label editor → saves to label column. Type in content editor → saves to content column. `@`-reference works in both.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 8. Initial empty state and welcome content

- [ ] **Welcome row.** On first run (empty workspace matrix), seed one row:
  - `label`: `{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Welcome to Hila' }] }] }`
  - `content`: A PM JSON doc with getting-started text explaining the stream view: how to create rows (Enter), indent (Tab), expand inline content (Shift-Enter), open focus panels (click right-arrow or Cmd/Ctrl+L), and navigate back (Cmd+Left or Escape).

- [ ] **Empty state display.** When the workspace matrix is empty (all rows deleted), the navigation panel shows a centered prompt: "Press Enter to create your first row."

- [ ] Tests (Playwright): fresh app shows welcome row with "Welcome to Hila" label. Deleting all rows shows empty state. Pressing Enter in empty state creates a new row.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 9. Update E2E tests

Existing Playwright tests reference the outline face, notes face, and tab structure. They need to be updated for the workspace.

- [ ] **Audit existing E2E tests.** Identify all tests that:
  - Click the "Outline" tab or reference outline-specific selectors
  - Click the "Notes" or "Notes Outline" tabs
  - Interact with `NoteListFace` or `NoteFace` components
  - Use `outlineMatrixId` or `notesMatrixId` in helper functions

- [ ] **Update test helpers.** Replace outline/notes-specific helpers with workspace equivalents. The "Add Sample Rows" button in Matrix Debug should target the workspace matrix.

- [ ] **Rewrite affected tests.** Focus on:
  - Outline interaction tests → target navigation panel within workspace
  - Note editing tests → target focus panel within workspace
  - Cross-face navigation tests → test within stream view panel system
  - Tag insertion tests → verify tags work in label and content columns

- [ ] **Add new E2E tests** for stream view interactions:
  - Open focus panel via right-arrow button
  - Panel chaining (focus → child → second focus)
  - Navigation panel maximum (4 nav panels; 5th removes leftmost column)
  - Shift-Enter from label focuses inline content editor
  - Cmd/Ctrl+L opens focus panel for current row
  - Cmd+Left closes rightmost panel
  - Escape to return from focus panel
  - Backlinks display in focus panel
  - Content preview in navigation panel (clamped to 2 lines)

- [ ] Run `pnpm test:e2e` -- all pass

---

## Design decisions

- **Label is single-line richtext.** The label column uses a ProseMirror editor restricted to a single paragraph. Heading styling in the PM doc applies to the entire label (e.g. making it an H1 in the focus panel header), but the label never contains multiple blocks. This is a deliberate constraint: the label is the "bullet" in the outline, the "title" in the note list, the text shown in search results and `@`-autocomplete. It should be concise.

- **Content can be null.** Not every row needs body content. A simple outline bullet has a label and null content. The focus panel shows a placeholder when content is null, and the content editor is created lazily when the user starts typing. This keeps the workspace lightweight for pure outlining use.

- **Navigation panel is a reusable component.** The same `NavigationPanel` renders at the root level (left-most panel in the stream view) and as the children section inside focus panels. This recursive composition is the core UX mechanic of the stream view.

- **Maximum 4 navigation panels.** The panel limit counts navigation panels, not focus panels. A focus panel with its nested child navigation panel forms a single visual column. This means a fully expanded view could show 4 columns, each a navigation panel + focus panel pair, for a deep ancestry chain. The limit is a UX constraint, not a technical one -- it can be adjusted based on user feedback. On narrow screens, the limit could be reduced dynamically.

- **Existing outline code is ported, not rewritten.** The outline interactions (Enter, Tab, Backspace, drag-drop, virtualization, collapse/expand) are battle-tested. The navigation panel ports this logic wholesale, adding the label/content split and the right-arrow button. This minimizes regression risk.

- **Inline references work in both columns.** The `@` and `#` inline ref infrastructure is column-agnostic. Both label and content ProseMirror editors wire the same `createInlinerefPlugin` and `syncInlineRefs`. Join table entries track the source column only if needed for disambiguation (currently they don't -- they track source row).

- **No face affinity yet.** When a child matrix reference appears in a focus panel, it always renders as a table face. A "preferred face" annotation on matrixes is deferred to a future phase (listed as open design question 5 in Plan.md).

## Dependency order

Stages within this phase have the following dependencies:

```
Stage 1 (workspace plugin definition)
  │
  ├─────────────────────────────┐
  ▼                             ▼
Stage 2 (navigation panel)   Stage 7 (PM editor configs)
  │                             │
  ▼                             │
Stage 3 (focus panel) ◄────────┘
  │
  ▼
Stage 4 (stream view / panel mgmt)
  │
  ▼
Stage 5 (app shell restructuring)
  │
  ▼
Stage 6 (remove old code)
  │
  ▼
Stage 8 (welcome content)
  │
  ▼
Stage 9 (E2E tests)
```

Stages 2 and 7 can proceed in parallel. Stage 3 depends on both. Everything else is sequential.
