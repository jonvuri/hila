# Phase 2 -- Outline with rich text

Concrete tasks for Phase 2. See [Plan.md](Plan.md) for context and objectives.

Ordered to build incrementally: data layer gaps first, then ProseMirror setup, then the outline component bottom-up, then interactions layered on top.

---

## 1. Data layer: reparent and delete operations

The `insertRow` function handles row creation with rank + closure, but reparenting and deletion are not implemented. Both are required before the outline can support indent/outdent, drag-and-drop reparenting, or row deletion.

- [x] Implement `reparentRow(db, matrixId, nodeKey, newParentKey, prevSiblingKey?, nextSiblingKey?)`:
  - Rewrites rank keys for the node and all its descendants (new prefix replaces old prefix)
  - Deletes old closure relationships (external-to-subtree links, preserving subtree-internal ones)
  - Grafts onto new parent (cross-join of new parent's ancestors with subtree descendants)
  - All in one transaction
  - Follow the SQL patterns from the Primitives spec (`DELETE` old external links, then `INSERT ... SELECT` cross-join for new ancestors)
  - Handle edge cases: reparent to root (no parent), reparent as first child vs. between existing children
- [x] Implement `deleteRow(db, matrixId, key)`:
  - Deletes the row from the rank table
  - Deletes all closure entries where the key is ancestor or descendant
  - Deletes the row from the data table (`mx_{id}_data`)
  - Does NOT delete children -- orphan handling is a policy decision for the caller. The outline will re-parent children to the deleted row's parent before calling delete.
- [x] Implement `deleteSubtree(db, matrixId, key)`:
  - Deletes the row and all its descendants (rank, closure, data table entries)
  - Uses subtree range query (`[key, nextPrefix(key))`) for the rank table
  - Deletes all closure entries referencing any key in the subtree
- [x] Implement `getChildren(db, matrixId, parentKey)`:
  - Returns direct children (depth=1 in closure) in rank order
  - Needed for collapse/expand UI and for re-parenting children on single-row delete
- [x] Implement `getParent(db, matrixId, childKey)`:
  - Returns the parent key (ancestor at depth=1) or null for root rows
  - Needed for backspace-at-start (outdent to parent's level), breadcrumbs, and reparent logic
- [x] Implement `getDepth(db, matrixId, key)`:
  - Returns the depth of a row (max depth in closure where descendant = key)
  - Needed for indentation rendering
- [x] Tests: reparent to new parent (verify rank key prefixes, closure integrity, data table unaffected), reparent to root, reparent with children, delete leaf row, delete subtree, getChildren ordering, getParent for root/nested rows, depth computation
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 2. Worker protocol: row-level operations

The current worker protocol only exposes `createMatrix`, `addSampleRows`, and `resetDatabase`. The outline needs fine-grained row operations. While reactive queries (`subscribe`) handle reads, structural mutations need dedicated messages because they involve rank + closure transactions that can't be expressed as a single SQL `execute` call.

- [x] Add worker message types for row operations:
  - `insertRow` -- creates a new row with positioning (parent, prev/next sibling). Returns the new row's rank key and rowid.
  - `updateRow` -- updates column values for a row by rowid. For the outline, this stores the ProseMirror document JSON.
  - `deleteRow` -- deletes a single row (re-parents its children first).
  - `reparentRow` -- moves a row (and its subtree) to a new parent/position.
  - `deleteSubtree` -- deletes a row and all its descendants.
- [x] Add corresponding handlers in `matrix-handler.ts` that call the `matrix.ts` functions
- [x] Add client-side functions in `matrix-client.ts` that send messages and return promises
- [x] Ensure mutations trigger write invalidation so subscribed queries update reactively
- [x] Tests: round-trip insert → query → verify via reactive subscription update
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 3. Content column and row data model

The outline stores ProseMirror document state as JSON in each row. This needs a well-defined content column.

- [ ] Update `ensureRootMatrix` to create the root matrix with a `content` column (type `TEXT`, stores JSON-serialized ProseMirror document). Keep the existing `title` column -- it will be derived from content for display (e.g. first line of text) or removed later.
- [ ] Implement `updateRow(db, matrixId, rowId, values: Record<string, unknown>)`:
  - Generic column update: `UPDATE mx_{id}_data SET col1=?, col2=? WHERE id=?`
  - Validates column names against the matrix schema
  - Used by the worker's `updateRow` handler
- [ ] Add empty-document default for new rows: when `insertRow` creates a data table row, set `content` to a minimal ProseMirror doc JSON (`{"type":"doc","content":[{"type":"paragraph"}]}`)
  - This avoids null-handling in the editor and gives each new row an immediately editable empty paragraph
- [ ] Tests: insert row with default content, update content, verify JSON round-trip
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 4. ProseMirror setup

Install ProseMirror and port the core editor infrastructure from the coastline reference.

- [ ] Install ProseMirror dependencies:
  - `prosemirror-model`, `prosemirror-state`, `prosemirror-view`, `prosemirror-transform`
  - `prosemirror-keymap`, `prosemirror-inputrules`, `prosemirror-commands`, `prosemirror-history`
  - `@prosemirror-adapter/solid` (bridge between ProseMirror and Solid.js)
- [ ] Define the ProseMirror schema (`src/outline/schema.ts`):
  - Nodes: `doc`, `paragraph`, `heading` (with `level` attribute, 1-6)
  - Marks: `bold`, `italic`, `code`, `link` (with `href` attribute)
  - The schema should be minimal and focused -- this is the MVP rich text set
- [ ] Create editor state factory (`src/outline/createEditorState.ts`):
  - Takes a JSON document (or null for empty) and returns a ProseMirror `EditorState`
  - Configures plugins: history, keymap (base + custom), input rules
  - Input rules: `#` at start of line → heading (1-6 levels with repeated `#`), markdown-style bold (`**`), italic (`*`), code (`` ` ``)
- [ ] Create custom keymap (`src/outline/keymap.ts`):
  - **Shift-Enter**: insert a hard break / newline within the current row (soft break within PM)
  - **Enter**: dispatched to the outline (creates a new sibling row -- handled by the outline component, not PM)
  - **Backspace at start**: dispatched to the outline (merge with previous row or outdent)
  - **Tab / Shift-Tab**: dispatched to the outline (indent / outdent)
  - **Mod-b / Mod-i / Mod-e**: bold / italic / code toggle (standard)
  - **Mod-k**: link insertion
  - The "dispatched to the outline" commands should call a callback provided to the keymap factory, keeping PM decoupled from outline logic
- [ ] Port Solid node views from coastline (`src/outline/nodeviews/`):
  - `ParagraphView.tsx`: Solid component for paragraph nodes
  - `HeadingView.tsx`: Solid component for heading nodes (renders h1-h6 based on level attribute)
  - Use `@prosemirror-adapter/solid`'s `useNodeViewFactory` for registration
- [ ] Verify ProseMirror editor creates, renders, and accepts input in a simple test harness (temporary, can be done in the existing dev UI)
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 5. Outline row component

The atomic unit of the outline: a single row with a ProseMirror editor, depth-based indentation, and a drag handle.

- [ ] Create `OutlineRow` component (`src/outline/OutlineRow.tsx`):
  - Receives: row data (rowid, rank key, content JSON, depth)
  - Renders: indentation spacer (depth × indent unit), drag handle, PM editor
  - Creates an `EditorView` from the row's content JSON on mount
  - Saves content back to the database on doc changes (debounced, via `updateRow`)
  - Exposes an imperative handle for focus management (the outline needs to programmatically focus a row's editor and place the cursor)
- [ ] Content persistence strategy:
  - On ProseMirror `dispatchTransaction`: update local editor state immediately, then debounce a save to the worker (e.g. 300ms idle)
  - On unmount (virtualization scroll-out): flush any pending save immediately
  - On mount (virtualization scroll-in): recreate `EditorView` from the latest content JSON (fetched via the reactive query)
- [ ] Indentation rendering:
  - Use the row's depth (from closure table) to compute left margin/padding
  - Indent unit: ~24px per level (configurable)
  - Depth is part of the outline's reactive query results, not computed per-row
- [ ] Drag handle:
  - A small grip icon to the left of the content
  - Wired to the drag-and-drop system (task 9) -- for now, render it but leave DnD unwired
- [ ] Bullet / collapse toggle:
  - A disclosure triangle or bullet between the drag handle and content
  - If the row has children: renders as a toggle (▶ collapsed, ▼ expanded). Clicking toggles collapse.
  - If the row has no children: renders as a simple bullet (•)
  - Whether a row has children can be derived from the query (or a reactive signal)
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 6. Outline face: virtualized outline view

The main outline surface that composes `OutlineRow` components in a virtualized scroll container.

- [ ] Create `OutlineFace` component (`src/outline/OutlineFace.tsx`):

  - The primary outline surface, combining paginated data fetching and rendering through the `ScrollVirtualizer`.
  - Filters out collapsed subtrees (task 8) and scopes to the focus root (task 9).

- [ ] **Single-level page virtualization using `ScrollVirtualizer`.**

  Data residency and DOM rendering operate at the same granularity: the **page**. Each `ScrollVirtualizer` window is a page of ~100 rows. Every row in a live page has its data in memory and its ProseMirror editor mounted. GHOST pages release both.

  **Why one level is sufficient:** ProseMirror `EditorView` instances are lightweight enough to handle a few hundred simultaneously. The page size is chosen so that at minimum row height (~30px for a single line of text), each page comfortably exceeds viewport height (~3000px vs. ~800-1200px viewport). This means the latch pair model (expecting 1-2 windows in the viewport) works correctly. With `THRESHOLD_DISTANCE = 2`, ~6 live pages = ~600 mounted editors -- well within budget.

  **How it maps to `ScrollVirtualizer`:**

  - Each window = one page of ~100 rows.
  - A VISIBLE window subscribes to a paginated reactive query for its chunk of rows and renders an `OutlineRow` for each. All rows in the page are mounted with PM editors.
  - A GHOST window retains its remembered height (for scroll positioning) but its content is unmounted (editors destroyed, pending saves flushed) and query data released.
  - The latch pair keeps ~2 windows in the viewport + `THRESHOLD_DISTANCE` windows buffered on each side.
  - Write invalidation re-runs only the subscriptions for affected pages, not a monolithic query.

  **`ScrollVirtualizer` modifications needed:**

  - **`totalWindows` signal.** Derived from `ceil(totalVisibleRows / pageSize)`. Tells the virtualizer where content ends and enables shrinking when rows are deleted or subtrees collapsed. The total visible row count comes from a lightweight `COUNT(*)` subscription (fast, no content transfer).
  - **Window cleanup.** When `totalWindows` decreases, windows beyond the new total should be removed (currently the window array only grows).

  **Keyset pagination.**
  OFFSET-based pagination is problematic at scale: with the outline query's JOINs (data table for content, closure subquery for depth), `OFFSET N` evaluates the full JOIN for all N skipped rows -- at 100K rows that's ~100K unnecessary content reads. Keyset pagination avoids this entirely: `WHERE key > :boundary ORDER BY key LIMIT :page_size` seeks directly to the boundary in the B-tree index and reads only the page's rows.

  Each page's lower bound is the previous page's last key, propagated as a Solid signal:

  - Page 0: no lower bound. `ORDER BY key LIMIT :page_size`. Exposes its last key as a signal.
  - Page 1: lower bound = page 0's last key signal. `WHERE key > :prev_last_key ORDER BY key LIMIT :page_size`. Exposes its last key.
  - Page N: lower bound = page N-1's last key signal. Etc.

  On write invalidation, all live page subscriptions re-run. Each page produces a new result (potentially with a different last key), which cascades through the next page's bound signal. The cascade is confined to live pages (~6 at most) and settles within a single Solid reactive flush.

  **Page boundary behavior on insert/delete:**
  When a row is inserted or deleted, pages after the mutation point have their row assignments shifted by 1. Each affected page's reactive subscription re-runs and returns the correct new data. At each page boundary, at most 1 row migrates between adjacent pages -- its editor is destroyed in one page and recreated in the other. Pending saves are flushed on unmount, so the recreated editor loads the latest content. The user is focused near the mutation point, not at a distant boundary, so this is imperceptible in practice.

  **Phase 2 start:** begin with a single page (one window, one query, no LIMIT). The `ScrollVirtualizer` wraps it with `totalWindows = 1`. The keyset pagination structure is in place from the start; switching to multi-page is just a matter of setting `pageSize` and letting the virtualizer create additional windows as the row count grows. The component structure doesn't change.

- [ ] **Outline page query design.**

  Per-page query:

  ```sql
  SELECT r.key, r.row_id, d.content,
         COALESCE(c.depth, 0) as depth
  FROM rank r
  JOIN mx_{mid}_data d ON r.row_id = d.id
  LEFT JOIN (
    SELECT descendant_key, MAX(depth) as depth
    FROM mx_{mid}_closure
    GROUP BY descendant_key
  ) c ON r.key = c.descendant_key
  WHERE r.matrix_id = :mid
    AND r.key > :page_lower_bound   -- page 0 uses empty bound (no filter)
    -- Collapse filter (task 8) and focus scope (task 9) added later.
  ORDER BY r.key
  LIMIT :page_size                  -- omitted for single-page start
  ```

- [ ] **Row identity and PM editor reuse.**

  The page renderer must use `<For each={rows()}>` keyed by `row_id`, not by array index. This is critical: when a page's query result changes (row inserted/deleted, boundary shift), Solid's `<For>` diffs the old and new row ID lists and reuses existing `OutlineRow` component instances for rows that remain. Only rows that enter or leave the page's result set trigger editor mount/unmount. If keyed by index instead, every row in the page after the mutation point gets a fresh `OutlineRow` -- destroying and recreating PM editors unnecessarily.

- [ ] **Virtualization debug instrumentation.**

  The interaction between page pagination, reactive query updates, and PM editor lifecycle is a high-risk area for subtle bugs. Add debug logging and visual overlays, each controlled by a flag (e.g., a debug signals object or `localStorage` flags) so they can be toggled at runtime without code changes.

  **PM lifecycle tracking (`OutlineRow`):**

  - On mount: log `[PM] mount row={rowId} page={pageIndex}`. Increment a global `pmMountCount` signal.
  - On unmount: log `[PM] unmount row={rowId} page={pageIndex}`. Increment a global `pmUnmountCount` signal.
  - On content update from query (row data changed while editor is mounted): log `[PM] content-sync row={rowId}` with whether the editor state was replaced or already matched.
  - These counters and logs are the primary tool for verifying that mutations cause minimal PM churn.

  **Page boundary overlay (visual):**

  - When enabled, render a thin colored line at the top of each page's rendered output, labeled with the page index and its boundary key (hex-truncated).
  - Also show the page's row count and row ID range (first and last `row_id`).
  - This makes page boundaries visible during development and testing, so boundary shifts can be observed directly.

  **Mutation log overlay (visual):**

  - A small floating panel (bottom-right corner, toggleable) showing the last ~10 high-level operations.
  - Each entry: operation type (insert, delete, reparent, collapse, expand), timestamp, and the resulting page impact:
    - Pages affected (which pages re-queried and returned different results).
    - PM instances created / destroyed across all pages (from the lifecycle counters, differenced per operation).
  - The mutation log listens to the worker response messages (insertRow, deleteRow, etc.) and snapshots the PM counters before/after each reactive update settles.
  - This gives an at-a-glance summary of whether a mutation was "clean" (1-2 PM instances touched per boundary) or pathological (entire pages rebuilt).

- [ ] Row focus management:
  - Track the currently focused row (rank key or rowid)
  - After structural operations (insert, delete, indent), move focus to the appropriate row
  - The `OutlineFace` manages focus state; individual `OutlineRow` components expose focus methods
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 7. Outline keyboard interactions

Layer the core outlining keybindings on top of the outline face. Each interaction is described in terms of what it does at the data layer and what happens in the UI.

- [ ] **Enter** (create sibling row):
  - If cursor is at the end of a row's content: create a new empty row after the current one (same parent, prev = current row). Focus the new row.
  - If cursor is in the middle of content: split the content at the cursor. Current row keeps content before the cursor; new row gets content after the cursor. Focus the new row at position 0.
  - Data: `insertRow` with `parentKey` = current row's parent, `prevKey` = current row's key. Then update both rows' content if splitting.
- [ ] **Tab** (indent / make child of previous sibling):
  - The current row becomes the last child of the previous sibling.
  - Data: `reparentRow` with `newParentKey` = previous sibling's key, placed after the previous sibling's last child.
  - Guard: no previous sibling → no-op. Already at max depth → no-op (if we want a depth limit).
  - The row's subtree moves with it.
- [ ] **Shift-Tab** (outdent / move to parent's level):
  - The current row becomes the next sibling of its parent.
  - Data: `reparentRow` with `newParentKey` = grandparent's key, `prevSiblingKey` = current parent's key.
  - Guard: already at root level → no-op.
  - The row's subtree moves with it. Siblings that were after this row under the old parent stay under the old parent.
- [ ] **Backspace at start of row**:
  - If the row is empty and has no children: delete the row, focus the previous row at its end.
  - If the row is empty and has children: delete the row, re-parent children to the deleted row's parent. Focus the first child (now promoted).
  - If the row has content: merge content into the previous row (append current row's content to previous row's content). Delete the current row. Focus the previous row at the merge point (original end of previous row's content).
  - Guard: first row in the outline → no-op.
- [ ] **Arrow Up / Arrow Down** (inter-row navigation):
  - When the cursor is at the top of a row's editor, Up arrow moves focus to the previous visible row (cursor at end).
  - When the cursor is at the bottom of a row's editor, Down arrow moves focus to the next visible row (cursor at start).
  - For single-line rows (most common), up/down always cross rows.
  - For multi-line rows (multiple paragraphs or headings), up/down navigate within the PM editor until hitting the top/bottom edge, then cross to the adjacent row.
  - Implementation: use ProseMirror's `endOfTextblock('up')` / `endOfTextblock('down')` to detect edge positions, then dispatch to the outline for cross-row navigation.
- [ ] Tests (Vitest): each keyboard interaction at the data layer level -- insert-after, split content, reparent as child, reparent to parent level, delete with merge, delete empty row
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 8. Collapse / expand

Allow subtrees to be collapsed, hiding their children from the visible outline.

- [ ] Collapsed state storage:
  - Track collapsed keys in a Solid signal (a `Set<string>` of rank key hex strings or a similar serializable representation).
  - Persist collapsed state to a dedicated table or a matrix metadata field. For the MVP, an in-memory signal is sufficient -- collapsed state resets on page reload. Persistence can be added later.
- [ ] Collapsed subtree filtering in the outline query:
  - Add a `NOT IN` or `NOT EXISTS` clause that excludes rows whose ancestors include any collapsed key (at depth > 0).
  - This means clicking a collapse toggle re-runs the query (reactively) and the virtualizer renders the updated row list.
  - The collapsed row itself remains visible (it's the parent); only its descendants are hidden.
- [ ] Toggle interaction:
  - Clicking the disclosure triangle on a row toggles its key in/out of the collapsed set.
  - Keyboard shortcut: when a row is focused, a keybinding (e.g. `Mod-Enter` or left arrow on a collapsed row) toggles collapse.
- [ ] Visual feedback:
  - Collapsed rows show a `▶` indicator; expanded rows with children show `▼`.
  - Optional: show a subtle child count badge on collapsed rows.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 9. Focus view (zoom into subtree)

Navigate into a subtree, showing only that subtree's rows. Breadcrumb navigation to zoom back out.

- [ ] Focus state:
  - A signal holding the current "focus root" rank key (or null for the full outline).
  - When focused, the outline query adds a range filter: `key >= :focus_key AND key < nextPrefix(:focus_key)`.
  - The focus root row itself is shown as a "title" at the top of the view.
- [ ] Zoom in:
  - Double-click a row's bullet/handle, or a keybinding (e.g. `Mod-Down`), or an explicit "zoom in" button.
  - Sets the focus root to that row's key.
- [ ] Breadcrumb bar:
  - Shows the ancestor chain from root to the current focus root.
  - Each breadcrumb is clickable, zooming to that ancestor.
  - Derived from the closure table (`getAncestors` query: `SELECT ancestor_key, depth FROM closure WHERE descendant_key = :focus_key AND depth > 0 ORDER BY depth DESC`).
- [ ] Zoom out:
  - Click a breadcrumb to zoom to that level.
  - Keybinding (e.g. `Mod-Up` or `Escape`) to zoom out one level (focus on current root's parent).
  - When focus root is null (already at top level), zoom-out is a no-op.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 10. Drag-and-drop reordering

Visual drag-and-drop to reorder rows and reparent subtrees.

- [ ] Drag initiation:
  - Drag starts from the drag handle (grip icon) on each row.
  - While dragging, the dragged row (and its visible children if expanded) are visually lifted/ghosted.
- [ ] Drop target indicators:
  - As the user drags, show a drop indicator line between rows (for sibling reorder) or indented under a row (for reparent as child).
  - Indentation of the drop indicator determines the drop depth:
    - Same depth as surrounding rows → sibling reorder.
    - One level deeper than the row above → reparent as last child of that row.
  - The drop indicator snaps to valid positions based on cursor x-position (left/right determines depth).
- [ ] Within-parent reorder (rank-only operation):
  - The row stays under the same parent, just moves to a new position.
  - Data: compute new rank key via `between(prevSibling.key, nextSibling.key)`. Single rank table update; no closure changes.
  - This is simpler than reparent and should be the common case.
- [ ] Cross-parent reparent (rank + closure operation):
  - The row moves to a different parent.
  - Data: `reparentRow` -- rewrites rank key prefixes for the subtree and updates the closure table.
- [ ] Implementation approach:
  - Use native HTML drag events or a lightweight library. Evaluate whether native drag events provide enough control for the drop-indicator UX, or whether pointer events with manual state management are needed.
  - The key challenge is computing the target position (parent + sibling) from the cursor position and the visible row layout. This requires mapping cursor Y to a row index and cursor X to an indentation level.
- [ ] Tests (Vitest): reorder within parent (verify rank keys), reparent via drag (verify rank keys and closure)
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 11. App shell restructuring

Replace the debug-only `App.tsx` with a real app shell that hosts the outline as the primary view, while keeping dev tools accessible.

- [ ] Create a new `App.tsx` layout:
  - Main content area: the outline face (full width/height, the primary surface)
  - A sidebar or panel system for secondary views (matrix debug, SQL runner) -- keep them accessible but not front-and-center
  - Basic responsive layout: at narrow widths (~600px), panels collapse or stack
- [ ] Create the initial outline matrix on first load:
  - If no outline exists (first run), create a root matrix with the `content` column and insert a welcome row
  - Subsequent loads open the existing outline
- [ ] Keyboard shortcut system:
  - A global shortcut handler that routes keybindings to the focused context (outline, panel, etc.)
  - Phase 2 shortcuts: outline navigation and editing (already defined in task 7), collapse/expand (task 8), focus view (task 9)
  - The system should be extensible for future phases (table navigation, tag insertion, etc.)
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 12. Playwright E2E test setup and tests

Phase 2 introduces Playwright alongside Vitest. The outlining interactions are the first nontrivial UI behaviors that need E2E coverage.

- [ ] Install and configure Playwright:
  - `@playwright/test` as a dev dependency
  - `playwright.config.ts` configured to start the Vite dev server and run tests against it
  - A base test fixture that navigates to the app and waits for the outline to load
- [ ] E2E test suite for outline interactions:
  - **Row creation**: click into a row, press Enter, verify a new row appears below. Type text, verify it persists after blur.
  - **Content splitting**: type text, move cursor to the middle, press Enter, verify content is split across two rows.
  - **Indent / outdent**: create rows, press Tab to indent, verify visual indentation changes. Press Shift-Tab to outdent.
  - **Backspace merge**: create two rows with text, move to start of second row, press Backspace, verify content merged into one row.
  - **Delete empty row**: create a row, leave it empty, press Backspace, verify row is removed.
  - **Arrow key navigation**: create multiple rows, use up/down arrow keys to navigate between them.
  - **Collapse / expand**: create a parent with children, collapse the parent, verify children are hidden. Expand, verify they reappear.
  - **Drag-and-drop**: drag a row to a new position, verify the order changed.
  - **Focus view**: zoom into a subtree, verify only that subtree is visible. Click breadcrumb, verify navigation back.
  - **Rich text**: select text, apply bold (Mod-B), verify styling. Same for italic, code.
- [ ] E2E tests for page boundary health (multi-page mode):

  These tests verify that structural operations cause minimal PM editor churn across page boundaries. They require enough rows to span multiple pages (~200+ rows to get at least 2 pages). The tests read from the PM lifecycle counters (`pmMountCount`, `pmUnmountCount`) exposed as globals or data attributes in debug mode.

  - **Insert at page boundary**: populate enough rows to fill 2+ pages. Insert a new row at the last position of page 0. Verify: PM mount count increases by 1 (the new row), PM unmount count increases by at most 1 (the boundary-migrating row), all other editors in both pages are untouched (no unnecessary destroy/recreate cycle).
  - **Delete at page boundary**: delete the last row of page 0. Verify: PM unmount count increases by 1 (the deleted row), PM mount count increases by at most 1 (row migrating from page 1 into page 0), all other editors untouched.
  - **Collapse large subtree spanning pages**: create a parent with enough children to span page 0 and page 1. Collapse the parent. Verify: PM unmount count matches the number of hidden children (they're removed from the query result), and no spurious mount/unmount cycles on rows in pages that weren't affected by the collapse.
  - **Expand subtree**: reverse of collapse. Expand and verify mount count matches the revealed children, with no churn on unrelated rows.
  - **Insert in the middle of a page (control test)**: insert a row in the middle of page 0 (far from any boundary). Verify: exactly 1 PM mount (the new row), 0 PM unmounts. This confirms that within-page inserts cause no boundary effects at all.

- [ ] Run `npx playwright test` -- all pass
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all Vitest tests still pass

---

## Task dependency order

```
1. Data layer (reparent, delete, query helpers)
   │
   ├─► 2. Worker protocol (exposes operations to client)
   │      │
   │      ├─► 3. Content column + row data model
   │      │
   │      └──────────────────────────┐
   │                                 │
   4. ProseMirror setup              │
   │  (can proceed in parallel       │
   │   with 1-3)                     │
   │                                 │
   └─► 5. Outline row component ◄───┘
          │
          └─► 6. Outline face (virtualized view)
                 │
                 ├─► 7. Keyboard interactions
                 │      │
                 │      ├─► 8. Collapse / expand
                 │      │
                 │      └─► 9. Focus view
                 │
                 ├─► 10. Drag-and-drop
                 │
                 └─► 11. App shell restructuring
                        │
                        └─► 12. Playwright E2E tests
```

Tasks 1-3 (data layer) and task 4 (ProseMirror setup) are independent and can proceed in parallel. Task 5 (outline row) requires both. Tasks 7-10 can be interleaved after task 6 is working. Task 12 (Playwright) should be set up as soon as the outline face is rendering (task 6) and tests added incrementally as each interaction is built.

---

## Decisions and scope boundaries

- **Rich text scope**: paragraphs, headings (h1-h6), bold, italic, code, link. No images, embeds, code blocks with syntax highlighting, or tables yet.
- **Content storage**: ProseMirror document JSON stored in a TEXT column. No separate text extraction or FTS indexing in this phase.
- **Virtualization**: Data and DOM operate at the same granularity -- the page (~100 rows per `ScrollVirtualizer` window). Keyset pagination (`WHERE key > :boundary LIMIT :page_size`) from the start, avoiding OFFSET's O(N) JOIN evaluation at large scales. Phase 2 starts single-page; multi-page activates by setting a page size and letting the virtualizer create windows.
- **Collapse state persistence**: in-memory for now. Will be persisted in a later phase.
- **Single matrix**: Phase 2 operates on one root matrix (the outline). Multi-matrix outline placement is a Phase 3+ concern.
- **No undo for structural operations**: ProseMirror handles text undo natively. Structural operations (indent, reparent, delete) have no undo mechanism yet. This is acceptable for Phase 2; structural undo is addressed in Phase 3+.

---

## Done criteria

All twelve task groups complete. The app renders a functional rich-text outline backed by SQLite. Users can create rows, type rich text, indent/outdent to create hierarchy, collapse/expand subtrees, zoom into subtrees, drag-and-drop to reorder, and navigate entirely by keyboard. ProseMirror document state round-trips through JSON storage. Both Vitest (data layer) and Playwright (UI interactions) test suites pass. `npm run typecheck && npm run lint && npm run test:run && npx playwright test` all pass.
