# Phase 6 -- Tasks and movie reviews (tag aspects in practice)

Concrete tasks for Phase 6. See [Plan.md](Plan.md) for context and objectives, [Plugins.md](Plugins.md) for the tags plugin design, and [Traits.md](Traits.md) for join kind semantics.

This phase uses two tag types — tasks and movie reviews — as prototypes to build and prove out general-purpose infrastructure: default values on row creation, a custom cell renderer registry, and richer column types. The tag types themselves are user-level constructs (created through the normal `#`-tag mechanism from Phase 5), not built-in system features. The infrastructure they motivate — default values, renderer registry, date pickers, select widgets — is general and benefits all matrixes and faces.

Tasks are likely universal enough that a "task" template (predefined columns and a task-oriented face) could ship as a built-in convenience, but that's a follow-up concern, not a Phase 6 deliverable.

### Current implementation state (prerequisites from Phase 5 / 5b)

What exists and Phase 6 builds on:
- **Tag type registry** as a matrix (`hila.tags` plugin, `registry` key). `createTagType` creates a new matrix with custom columns, registers it, provisions rank trait, and creates a table face.
- **`#` autocomplete** in both outline rows and note body text. `#` triggers tag type search; selecting creates an `own`-kind aspect row via `createDependentRow`. Typing an unrecognized name offers inline tag type creation.
- **Tag property panel** opens on tag badge click, showing editable fields hydrated from the aspect row. Uses `FieldEditor` (extracted to `src/shared/FieldEditor.tsx`).
- **Tag badge rendering** via `InlineRefView`: colored pill badges with tag type name, optional key property chips, ghost/empty states.
- **Tag browser face** (`hila.tag-browser`): lists tag types with instance counts, drill-down to instances with source row context, cross-face navigation.
- **Owned join lifecycle**: remove tag from text → aspect row deleted; delete source row → cascade; delete aspect row from identity face → inline node removed from source text.
- **Column identity and schema integrity** (Phase 5b): stable column IDs, column constraints (NOT NULL, UNIQUE, CHECK), plugin column ownership (`managed_by`), formula `{{columnId}}` references, normalized face config column references with FK cascades.
- **Table face column types**: text, number, date, boolean, select, reference. Cell display and editing handled by `CellDisplay` and `CellEditor` in `TableFace.tsx`, plus `ReferenceCellDisplay` for reference columns.
- **`FieldEditor`** in `src/shared/FieldEditor.tsx`: per-column-type editors used by the tag property panel. Supports text, number, date, boolean, select, reference.

What Phase 6 must account for — gaps and limitations:
- **No default/computed values on row creation.** `insertRow` and `createDependentRow` accept explicit `columnValues` but have no mechanism for column-level defaults. Every field is null unless explicitly provided.
- **No custom cell renderers.** The table face has one hardcoded `CellDisplay` component that formats values by display type (text, number, date, etc.) and one `CellEditor` component. There is no registry for plugging in alternative display or edit components for a column. Star ratings, status toggles, and date pickers with affordances all require this.
- **`createTagType` accepts `{ name, type }[]` columns only.** No way to specify constraints, display type, options, or default values when creating a tag type. Predefined tag types with rich column schemas need an extended column spec.
- **Tag types are always created with a single default `label` TEXT column** (unless columns are passed explicitly). No template mechanism for creating tag types with predefined schemas.

After this phase, the system has:
- Column-level default values applied automatically on row creation (literal values or SQL expressions)
- A cell renderer registry that maps (displayType, optional config) to custom display and edit components
- A task tag type template with status, due date, priority, and notes columns — demonstrating structured task management through tags
- A movie review tag type template with movie name, star rating, and auto-filled entry date — demonstrating custom renderers and default values
- Inline status toggling and date picking from tag badges in the outline
- A star rating widget as a custom cell renderer
- Extended `createTagType` accepting rich column specs (constraints, display type, options, defaults)

---

## 1. Default values on row creation

Core support for column-level defaults — literal values or SQL expressions — applied automatically when a new row is created. This is the first piece of general infrastructure motivated by the movie review use case (auto-filled `entry_date`), but applicable to any matrix.

- [ ] **Add `default_value` column to `matrix_columns`.** TEXT, nullable. Stores either a literal value (e.g. `'todo'`) or a SQL expression (e.g. `date('now')`). The expression is evaluated by SQLite at insert time.
  ```sql
  ALTER TABLE matrix_columns ADD COLUMN default_value TEXT;
  ```

- [ ] **Update `ColumnDefinition` type** to include `defaultValue: string | null`.

- [ ] **Update `getColumns`** to return the `defaultValue` field.

- [ ] **Extend `MatrixSpec` column declarations** with optional `defaultValue`:
  ```typescript
  type MatrixSpec = {
    key: string
    title: string
    columns: {
      name: string
      type: string
      constraints?: string
      displayType?: string
      options?: string
      defaultValue?: string
    }[]
  }
  ```

- [ ] **Update `createMatrix`** to store `default_value` in `matrix_columns` when provided. Do NOT compile defaults into the data table DDL (`DEFAULT` clauses) — the default mechanism is application-level, not SQLite-level, because some defaults are SQL expressions that need to be evaluated at insert time with full context (e.g. `date('now')`) rather than at table creation time.

- [ ] **Update `addColumn`** to accept an optional `defaultValue` parameter and store it in `matrix_columns`.

- [ ] **Update `insertRow`** to apply defaults. Before inserting, query `matrix_columns` for columns with non-null `default_value` where the caller did not provide an explicit value. For each:
  1. If the default looks like a SQL expression (contains parentheses or function calls), evaluate it: `SELECT {expression} AS val`.
  2. If it's a plain literal, use it directly.
  3. Merge the resolved defaults into the column values before the INSERT.

  This runs inside the same transaction as the INSERT, so expression evaluation and insertion are atomic.

- [ ] **Update `createDependentRow`** — it calls `insertRow` internally, so defaults are applied automatically when creating tag aspect rows. No additional work needed beyond the `insertRow` change, but verify the flow end-to-end.

- [ ] **Update worker message types** in `matrix-types.ts`: `addColumn` params gain `defaultValue?: string`. `getColumns` result type gains `defaultValue`.

- [ ] **Update `registerPlugin`** to pass `defaultValue` through when creating columns from `MatrixSpec`.

- [ ] Tests: create a matrix with a column that has `defaultValue: "'draft'"` (literal). Insert a row without specifying that column. Verify the value is `'draft'`. Create a column with `defaultValue: "date('now')"` (expression). Insert a row. Verify the value is today's date. Insert a row with an explicit value for a column that has a default. Verify the explicit value wins. Verify `createDependentRow` applies defaults to the aspect row. Verify `addColumn` with `defaultValue` stores the default. Verify `getColumns` returns `defaultValue`. Verify columns without defaults continue to be null when not specified.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 2. Cell renderer registry

A general mechanism for plugging in custom display and edit components for table cells, tag property panel fields, and any future surface that renders column values. Motivated by star ratings and status toggles, but designed as open infrastructure.

- [ ] **Define the renderer interface** in `src/table/cell-renderers.ts`:
  ```typescript
  type CellRendererProps = {
    value: unknown
    columnDef: ColumnDefinition
    rowId: number
    matrixId: number
    selected: boolean
    isEditing: boolean
    onSave: (value: unknown) => void
    onStartEdit: () => void
    onCancelEdit: () => void
  }

  type CellRendererRegistration = {
    displayType: string
    variant?: string
    displayComponent: Component<CellRendererProps>
    editorComponent?: Component<CellRendererProps>
    inlineToggle?: boolean
  }
  ```
  - `displayType`: the column display type this renderer handles (e.g. `'select'`, `'number'`, `'date'`).
  - `variant`: optional sub-variant (e.g. `'star-rating'` for a number column, `'status-toggle'` for a select column). Stored in the column's `options` JSON under a `renderer` key.
  - `displayComponent`: the Solid component for display mode.
  - `editorComponent`: optional override for edit mode (if absent, the default `CellEditor` is used).
  - `inlineToggle`: if true, clicking the display component directly toggles/cycles the value without entering a separate edit mode (used for booleans, status toggles, star ratings).

- [ ] **Implement the registry** in `src/table/cell-renderers.ts`:
  ```typescript
  const registerCellRenderer = (reg: CellRendererRegistration): void
  const getCellRenderer = (displayType: string, options: string | null): CellRendererRegistration | null
  ```
  `getCellRenderer` checks `options` JSON for a `renderer` key to select a variant, falls back to a base registration for the display type, then falls back to null (use the default `CellDisplay`/`CellEditor`).

- [ ] **Register built-in renderers.** Move the existing `CellDisplay` and `CellEditor` logic for each display type into registered renderers. This is a structural refactor — no behavioral change. The existing boolean checkbox, select dropdown, date input, and number input become registered renderers rather than hardcoded switch cases.

- [ ] **Update `TableFace.tsx`** to resolve renderers from the registry. Replace the inline `CellDisplay` / `CellEditor` / `ReferenceCellDisplay` dispatch with:
  ```typescript
  const renderer = getCellRenderer(col.displayType, col.options)
  ```
  If a renderer is found, render its `displayComponent` / `editorComponent`. Otherwise fall back to the existing default components (backward compatible).

- [ ] **Update `FieldEditor`** (`src/shared/FieldEditor.tsx`) to also use the renderer registry for consistency. The tag property panel, which uses `FieldEditor`, should automatically gain custom renderers for columns that have them.

- [ ] Tests: register a custom renderer for display type `'number'` with variant `'star-rating'`. Verify `getCellRenderer('number', '{"renderer":"star-rating"}')` returns it. Verify `getCellRenderer('number', null)` returns the base number renderer. Verify `getCellRenderer('text', null)` returns the base text renderer. Verify existing table face behavior is unchanged after the refactor (all built-in types still render correctly).
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 3. Extended `createTagType` column spec

Extend `createTagType` to accept rich column specifications so that predefined tag types can declare constraints, display types, options, and default values. This is the bridge between the general infrastructure (stages 1–2) and the concrete tag types (stages 4–5).

- [ ] **Extend the `createTagType` column parameter type:**
  ```typescript
  type TagTypeColumnSpec = {
    name: string
    type: string
    constraints?: string
    displayType?: string
    options?: string
    defaultValue?: string
  }

  const createTagType = (
    db: Database,
    name: string,
    columns?: TagTypeColumnSpec[],
  ): TagType
  ```

- [ ] **Update `createTagType` implementation.** When creating the matrix via `createMatrix`, pass through `constraints` from the column spec. After matrix creation, update `matrix_columns` rows to set `display_type`, `options`, and `default_value` for columns that specify them. (Alternatively, extend `createMatrix` to accept these fields — evaluate which is cleaner.)

- [ ] **Extend `createMatrix`** to accept optional `displayType`, `options`, and `defaultValue` on column specs. This is a natural extension: `createMatrix` already writes `matrix_columns` rows, so it can write these fields at the same time rather than requiring a post-hoc update. The extended column spec type:
  ```typescript
  type MatrixColumnSpec = {
    name: string
    type: string
    constraints?: string
    displayType?: string
    options?: string
    defaultValue?: string
  }
  ```
  This also benefits `registerPlugin` → `MatrixSpec` — plugin-declared matrixes can specify full column metadata.

- [ ] **Update worker message types** for `createTagType` to accept the extended column spec.

- [ ] Tests: create a tag type with columns specifying constraints, display types, options, and defaults. Verify `matrix_columns` rows have the correct values. Verify `getColumns` returns all specified metadata. Verify `insertRow` into the tag matrix applies defaults. Verify constraint violations are correctly reported.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 4. Star rating renderer

A custom cell renderer for number columns that displays and edits values as clickable stars. This is the first custom renderer and validates the renderer registry from stage 2.

- [ ] **Create `src/table/renderers/StarRatingRenderer.tsx`:**
  - Display component: renders 1–5 stars (filled/empty) based on the numeric cell value. Null or 0 shows all empty stars.
  - The star count is configurable via the column's `options` JSON: `{ "renderer": "star-rating", "maxStars": 5 }`. Defaults to 5 if not specified.
  - Clicking a star sets the value to that star's position (1-indexed). Clicking the currently-active star clears the value (sets to null). This is an `inlineToggle` renderer — no separate edit mode.
  - Stars are rendered as Unicode characters or SVG, styled with gold fill for active and gray outline for inactive. Hover state previews the rating that would be set.
  - The component calls `onSave` immediately on click (no blur/Enter save flow).

- [ ] **Register the star rating renderer** in `src/table/cell-renderers.ts`:
  ```typescript
  registerCellRenderer({
    displayType: 'number',
    variant: 'star-rating',
    displayComponent: StarRatingDisplay,
    inlineToggle: true,
  })
  ```

- [ ] **Add CSS styles** for star rating display: inline flex layout, clickable stars with hover preview, appropriate sizing for both table cells and the tag property panel.

- [ ] Tests: render a star rating cell with value 3, verify 3 filled and 2 empty stars. Click star 4, verify `onSave` called with 4. Click star 3 when value is 3 (active star), verify `onSave` called with null. Render with null value, verify all stars empty. Verify the renderer is resolved via `getCellRenderer('number', '{"renderer":"star-rating"}')`. Verify it renders correctly in both `TableFace` and `FieldEditor` contexts.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 5. Status toggle renderer

A custom cell renderer for select columns that provides a compact inline toggle, cycling through status options on click. This is the second custom renderer, proving the registry works for multiple types.

- [ ] **Create `src/table/renderers/StatusToggleRenderer.tsx`:**
  - Display component: renders the current select value as a colored badge/chip. The color is derived from the option index or specified in column options.
  - Clicking the badge cycles to the next option in the select's option list. Shift-clicking cycles backward. This is an `inlineToggle` renderer.
  - Option list is read from `columnDef.options` (same JSON format as the existing select type: `{ "options": ["todo", "in-progress", "done"], "renderer": "status-toggle" }`).
  - Each status option has a visual treatment: "todo" = gray, "in-progress" = blue, "done" = green (colors configurable via options or derived from position).
  - Null/empty renders as the first option ("todo") or a placeholder.

- [ ] **Register the status toggle renderer:**
  ```typescript
  registerCellRenderer({
    displayType: 'select',
    variant: 'status-toggle',
    displayComponent: StatusToggleDisplay,
    inlineToggle: true,
  })
  ```

- [ ] **Add CSS styles** for status badges: colored pill shapes matching the tag badge aesthetic, compact sizing for inline display in tag badges.

- [ ] Tests: render a status toggle with value "in-progress" and options ["todo", "in-progress", "done"]. Verify the badge shows "in-progress" in blue. Click to cycle to "done". Click again to cycle to "todo". Verify shift-click cycles backward. Verify null value renders as first option. Verify the renderer is resolved correctly from the registry.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 6. Date picker enhancement

Enhance the existing date column editor with a proper date picker affordance, replacing the plain `<input type="date">` with a more usable component. This benefits all date columns, not just task due dates.

- [ ] **Create `src/table/renderers/DatePickerRenderer.tsx`:**
  - Display component: renders the date value as a formatted string (e.g. "May 9, 2026" or relative like "Tomorrow", "Next Friday" for near-future dates). Falls back to the raw ISO string if invalid.
  - Editor component: a dropdown calendar picker that opens below/above the cell. Uses a simple month grid with clickable day cells. Navigation arrows for month/year. "Today" shortcut button. "Clear" button to null the value.
  - The picker positions itself relative to the cell using the same floating UI approach as existing popovers (tag property panel pattern).
  - Keyboard navigation: arrow keys to move between days, Enter to select, Escape to cancel.

- [ ] **Register the date picker** as the default renderer for `'date'` display type (no variant — it replaces the built-in date behavior):
  ```typescript
  registerCellRenderer({
    displayType: 'date',
    displayComponent: DatePickerDisplay,
    editorComponent: DatePickerEditor,
  })
  ```

- [ ] Tests: open the date picker on a date cell. Select a date. Verify the value is saved as an ISO date string. Verify "Today" button sets today's date. Verify "Clear" nulls the value. Verify keyboard navigation. Verify display formatting (relative dates for near future, absolute for distant dates).
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 7. Task tag type template

Define the task tag type as a predefined template that users can instantiate via the tag browser or inline via `#task`. The template specifies the full column schema with constraints, display types, options, defaults, and renderer variants.

- [ ] **Create `src/tags/templates/task-template.ts`:**
  ```typescript
  const taskTagTypeTemplate: TagTypeColumnSpec[] = [
    {
      name: 'status',
      type: 'TEXT',
      constraints: "NOT NULL DEFAULT 'todo'",
      displayType: 'select',
      options: JSON.stringify({
        options: ['todo', 'in-progress', 'done'],
        renderer: 'status-toggle',
      }),
      defaultValue: "'todo'",
    },
    {
      name: 'due_date',
      type: 'TEXT',
      displayType: 'date',
    },
    {
      name: 'priority',
      type: 'TEXT',
      displayType: 'select',
      options: JSON.stringify({
        options: ['low', 'medium', 'high', 'urgent'],
      }),
    },
    {
      name: 'notes',
      type: 'TEXT',
      displayType: 'text',
    },
  ]
  ```

- [ ] **Create a template registry** in `src/tags/templates/index.ts`:
  ```typescript
  type TagTypeTemplate = {
    name: string
    columns: TagTypeColumnSpec[]
    color?: string
    icon?: string
  }

  const TAG_TYPE_TEMPLATES: Map<string, TagTypeTemplate>

  const getTemplate = (name: string): TagTypeTemplate | null
  const getAllTemplates = (): TagTypeTemplate[]
  ```
  Register the task template. Templates are matched by name (case-insensitive) — when a user types `#task` and the tag type doesn't exist yet, the system checks if a template matches the name and uses its column spec instead of the default single `label` column.

- [ ] **Wire templates into tag type creation.** Update the `#` autocomplete creation flow (in `tag-search-provider.ts` or equivalent): when creating a new tag type, check `getTemplate(name)`. If a template matches, pass its columns and metadata to `createTagType`. If no template matches, use the default `[{ name: 'label', type: 'TEXT' }]` as before.

- [ ] **Update the tag browser "New tag type" UI** to offer templates. The creation dialog shows a list of available templates alongside the custom option. Selecting a template pre-fills the name and column spec.

- [ ] **Task-specific face configuration.** After creating a task tag type from the template, configure its identity face (table face) with default sort (by due date) and optional grouping by status. This may be a manual step or encoded in the template.

- [ ] Tests: type `#task` in the outline (no existing "task" tag type). Verify the template is detected. Verify the created tag matrix has status, due_date, priority, and notes columns with correct types, display types, options, and defaults. Verify inserting a task aspect row gets `status = 'todo'` by default. Verify the task table face shows status toggle and date picker renderers. Verify typing `#custom` (no template match) creates a tag type with the default `label` column.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 8. Movie review tag type template

Define the movie review tag type template, primarily to prove auto-fill default values and the star rating renderer in practice.

- [ ] **Create `src/tags/templates/movie-review-template.ts`:**
  ```typescript
  const movieReviewTagTypeTemplate: TagTypeColumnSpec[] = [
    {
      name: 'movie_name',
      type: 'TEXT',
      displayType: 'text',
    },
    {
      name: 'star_rating',
      type: 'REAL',
      displayType: 'number',
      options: JSON.stringify({
        renderer: 'star-rating',
        maxStars: 5,
      }),
    },
    {
      name: 'entry_date',
      type: 'TEXT',
      displayType: 'date',
      defaultValue: "date('now')",
    },
  ]
  ```

- [ ] **Register the template** in the template registry alongside the task template.

- [ ] Tests: type `#movie-review` in the outline. Verify the template is detected and the matrix is created with movie_name, star_rating, and entry_date columns. Verify creating a movie review aspect row auto-fills `entry_date` with today's date. Verify the star_rating column renders with the star rating widget. Verify clicking stars sets the rating value. Verify the tag property panel shows the star rating renderer for the star_rating field and a date picker for entry_date.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 9. Inline tag affordances

Wire the custom renderers into the inline tag badge and tag property panel so that key property chips on tag badges are interactive — status toggles and date pickers work directly from the outline without opening the full property panel.

- [ ] **Update tag badge key property chips** (in `InlineRefView.tsx`): when rendering key property chips on a tag badge, use the renderer registry to determine how each chip renders. A status column with `renderer: 'status-toggle'` renders as a clickable status badge chip. A date column renders as a compact date string. A star_rating column renders as mini stars.

- [ ] **Wire inline chip clicks to value updates.** Clicking a status chip on a tag badge in the outline toggles the status directly (cycles to next value), saving via `updateRow` to the aspect row. Clicking a date chip opens the date picker anchored to the chip. This avoids the overhead of opening the full property panel for quick single-field edits.

- [ ] **Ensure property panel uses renderers.** The `TagPropertyPanel` (via `FieldEditor`) should render the star rating widget for number columns with the star-rating renderer, the status toggle for select columns with the status-toggle renderer, and the date picker for date columns. Verify this works end-to-end.

- [ ] Tests: create a `#task` tag on an outline row. Verify the tag badge shows a status chip. Click the status chip. Verify the status cycles from "todo" to "in-progress" without opening the property panel. Verify the change persists in the task matrix. Open the property panel for the same tag. Verify the updated status is reflected. Verify the star rating renderer works in the property panel for a movie review tag.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 10. Playwright E2E

Comprehensive E2E coverage for all Phase 6 features. Split into three test groups that can begin as their dependencies land.

### 10a. Default values and custom renderers

- [ ] **Default value tests:**
  - Create a tag type with a column that has a default value. Insert a row (via `#` tag). Verify the default is applied.
  - Create a movie review tag. Verify `entry_date` is auto-filled with today's date.
  - Create a task tag. Verify `status` defaults to "todo".
  - Insert a row with an explicit value for a column that has a default. Verify the explicit value wins.

- [ ] **Star rating tests:**
  - Open a movie review tag's identity face (table view). Verify the star_rating column shows star widgets.
  - Click on the 4th star. Verify the value updates to 4.
  - Click on the 4th star again (active). Verify the value clears.

- [ ] **Status toggle tests:**
  - Open a task tag's identity face. Verify the status column shows toggle badges.
  - Click the status badge on a "todo" task. Verify it cycles to "in-progress".
  - Click again. Verify it cycles to "done".
  - Click again. Verify it cycles back to "todo".

- [ ] Run `pnpm test:e2e` — all pass

### 10b. Tag type templates and property panel

- [ ] **Template creation tests:**
  - Type `#task` in the outline (no existing task tag type). Verify the tag type is created with status, due_date, priority, and notes columns.
  - Verify the tag browser shows the new "task" tag type.
  - Type `#movie-review` in the outline. Verify it creates with movie_name, star_rating, and entry_date columns.
  - Type `#custom-thing` (no template). Verify it creates with the default `label` column.

- [ ] **Property panel tests:**
  - Click a `#task` badge. Verify the property panel shows status (as toggle), due_date (as date picker), priority (as dropdown), and notes (as text).
  - Edit the status via the toggle in the property panel. Verify persistence.
  - Set a due date via the date picker. Verify persistence.
  - Click a `#movie-review` badge. Verify the property panel shows star_rating as clickable stars. Set a rating. Verify persistence.

- [ ] Run `pnpm test:e2e` — all pass

### 10c. Inline tag affordances

- [ ] **Inline status toggle tests:**
  - Create a `#task` tag on an outline row. Verify the tag badge shows a status chip.
  - Click the status chip directly in the outline. Verify the status toggles without opening the property panel.
  - Verify the updated status is visible both on the badge and in the task matrix's table face.

- [ ] **Inline date interaction tests:**
  - Create a `#task` tag. Click the due date chip on the badge. Verify a date picker opens.
  - Select a date. Verify it persists and the chip updates.

- [ ] **Cross-surface consistency tests:**
  - Edit a task's status from the table face. Return to the outline. Verify the tag badge's status chip reflects the change.
  - Edit a movie review's star rating from the property panel. Open the table face. Verify the star rating column shows the updated value.

- [ ] Run `pnpm test:e2e` — all pass
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` — all Vitest tests still pass

---

## Task dependency order

```
1. Default values on row creation
   │
   ├──────────────────────────────────┐
   │                                  │
   ▼                                  ▼
2. Cell renderer registry     3. Extended createTagType column spec ◄── 1
   │                                  │
   ├─► 4. Star rating renderer        │
   │                                  │
   ├─► 5. Status toggle renderer      │
   │                                  │
   └─► 6. Date picker enhancement     │
          │                           │
          ├───────────────────────────┘
          ▼
   7. Task tag type template ◄── 2, 3, 5, 6
   │
   ▼
   8. Movie review tag type template ◄── 2, 3, 4, 6
   │
   ▼
   9. Inline tag affordances ◄── 4, 5, 6, 7, 8

10a. E2E: defaults + renderers ◄── 1, 4, 5
10b. E2E: templates + property panel ◄── 7, 8
10c. E2E: inline affordances ◄── 9
```

Stage 1 (default values) is a prerequisite for stages 3 and 8 (extended column specs need defaults; movie review needs auto-fill). Stage 2 (renderer registry) is a prerequisite for stages 4–6 (each is a custom renderer). Stage 3 (extended `createTagType`) depends on stage 1 and is needed before stages 7–8 (templates use rich column specs). Stages 4, 5, and 6 are independent of each other and can proceed in parallel after stage 2. Stages 7 and 8 depend on the renderers and extended column specs. Stage 9 (inline affordances) depends on the renderers and templates being in place. E2E tests can begin incrementally as dependencies land.

---

## Decisions and scope boundaries

- **Tag types are prototypes, not built-ins.** The task and movie review tag types are user-level constructs created through `#`-tagging, not special-cased system features. They demonstrate general infrastructure (defaults, renderers, templates). The system does not hard-code knowledge of "tasks" or "movie reviews" — it only knows about templates that happen to match those names.

- **Templates are a convenience, not a requirement.** When `#task` is typed and no tag type exists, the template provides predefined columns. But the user could also create a "task" tag type manually through the tag browser with whatever columns they want. Templates are suggestions, not constraints.

- **Task template could become a system template.** Tasks are common enough that a built-in "task" template is reasonable, possibly evolving into a first-class feature with a dedicated face (kanban board, filtered task list). But for Phase 6, it's just a template in the registry — nothing is hard-coded beyond the column spec.

- **Default values are application-level, not SQLite DEFAULT.** Column defaults are stored in `matrix_columns.default_value` and applied by `insertRow`, not compiled into the data table DDL. This keeps the mechanism flexible (expressions can reference runtime context) and avoids complications with `ALTER TABLE ADD COLUMN DEFAULT` on existing tables.

- **Expression defaults are evaluated per-insert.** A default like `date('now')` is evaluated by running `SELECT date('now')` at insert time, not once at table creation. This is correct for time-based defaults but means expression evaluation happens on every insert for columns with expression defaults.

- **Renderer registry is in-memory.** Custom renderers are registered at app startup via `registerCellRenderer()`. There is no persistent renderer storage — the registry is rebuilt from code on each app load. This is appropriate because renderers are code artifacts (Solid components), not user data.

- **No task-specific face type.** Tasks are viewed through the table face (the tag matrix's identity face) with appropriate sort/filter configuration. A dedicated task face (kanban, Gantt, calendar) is future work (Plan.md Phase 7+ or a separate plugin). Phase 6 proves tasks work through the existing face infrastructure.

- **Inline affordances are optional enhancement.** The inline status toggle and date picker on tag badges are a UX polish step. If they add too much complexity to the initial implementation, they can be deferred — the tag property panel (click badge → open panel) is the primary editing surface.

- **Star rating is the only fully custom renderer.** The status toggle and date picker are enhancements to existing display types (select, date). The star rating is genuinely new — a number displayed and edited as clickable stars. This proves the renderer registry works for renderers that are substantially different from the default.

---

## Done criteria

All ten stage groups complete (1, 2, 3, 4, 5, 6, 7, 8, 9, 10a–c). Column-level default values are applied automatically on row creation — both literal values and SQL expressions. The cell renderer registry maps (displayType, variant) to custom display/edit components, and the existing built-in types are refactored through it. The star rating renderer displays and edits numeric values as clickable stars. The status toggle renderer cycles through select options on click. The date picker provides a calendar dropdown for date columns. `createTagType` accepts rich column specs (constraints, display type, options, defaults). Tag type templates provide predefined column schemas for "task" and "movie-review", detected by name on inline creation. Inline tag affordances allow quick status toggling and date picking directly from tag badges in the outline. `npm run typecheck && npm run lint && npm run test:run && pnpm test:e2e` all pass.
