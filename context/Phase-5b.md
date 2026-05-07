# Phase 5b -- Column identity and schema integrity

Concrete tasks for Phase 5b. See [Plan.md](Plan.md) for context and objectives, [Architecture - Column identity](./Architecture.md#column-identity) for the design rationale, and [Plugins.md](Plugins.md) for the plugin model.

Core infrastructure to make column schema mutations safe, automatic, and extensible. Motivated by Phase 5's tag registry migration (which moved engine-level constraints to fragile application-level checks) and the need for plugin schema contracts before Phase 6 introduces predefined tag type columns.

### Current implementation state (prerequisites from Phase 5)

What exists and Phase 5b builds on:
- **`matrix_columns` table** with composite PK `(matrix_id, name)`. Columns: `matrix_id`, `name`, `type`, `display_type`, `"order"`, `options`, `formula`. No stable identity column, no constraints field, no ownership tracking.
- **`ColumnDefinition` type** returns `{ name, type, displayType, order, options, formula }`. No `id` field.
- **`createMatrix`** builds data table DDL as bare `"colname" TYPE` with no constraint compilation.
- **`addColumn`** inserts into `matrix_columns` with `(matrix_id, name, type, display_type, "order", options)`.
- **`removeColumn` and `renameColumn`** operate by column name only. No ownership check, no dependency validation.
- **`addFormulaColumn`** stores raw SQL formula strings referencing column names directly. No dependency tracking — removing a column that a formula uses silently breaks the formula.
- **`face_configs` table** stores `slot_bindings` and `settings` as JSON blobs. `slot_bindings` maps slot names to column names (strings). `settings.sort` and `settings.filters` reference column names. No FK cascade on rename or removal.
- **`resolveSlotBindings`** works with `{ name, type }` column objects. Explicit bindings are column names, not IDs.
- **`buildTableQuery`** inlines formula expressions by column name: `(formula) AS "colname"`.
- **`SortConfig`/`FilterConfig`** reference columns by name string.
- **Tags plugin** declares registry columns `{ name: 'name', type: 'TEXT' }` etc. with no constraints. Application-level uniqueness check in `createTagType` via `SELECT 1 FROM ... WHERE LOWER(name) = LOWER(?)`.
- **`MatrixSpec`** column type is `{ name: string; type: string }` — no constraints or ownership fields.
- **`registerPlugin`** creates matrixes via `createMatrix` and does not record which columns belong to which plugin.

What Phase 5b delivers:
- Columns have stable integer IDs that survive renames
- Column constraints (NOT NULL, UNIQUE, CHECK) compile to DDL at matrix creation
- Plugin-declared columns are protected from accidental mutation
- Face slot bindings, sort, and filter configs are FK-backed to `matrix_columns.id` with cascade behavior
- Formula expressions reference columns by stable ID, with dependency tracking that prevents breaking changes
- The tags plugin's registry constraints are engine-enforced again

---

## 1. Stable column IDs

Add a stable integer identity to columns in `matrix_columns`, independent of the mutable column name. This is the foundation for all subsequent stages — every FK-backed column reference targets this ID.

- [x] **Alter `matrix_columns` schema.** Add an `id` INTEGER column as the new primary key (random ID, same pattern as row IDs and matrix IDs). Demote the current `(matrix_id, name)` composite PK to a UNIQUE constraint. The new schema:
  ```sql
  CREATE TABLE IF NOT EXISTS matrix_columns (
    id           INTEGER PRIMARY KEY DEFAULT (random_id_expr),
    matrix_id    INTEGER NOT NULL REFERENCES matrix(id) ON DELETE CASCADE,
    name         TEXT    NOT NULL,
    type         TEXT    NOT NULL,
    display_type TEXT    NOT NULL DEFAULT 'text',
    "order"      INTEGER NOT NULL,
    options      TEXT,
    formula      TEXT,
    UNIQUE (matrix_id, name)
  ) STRICT;
  ```

- [x] **Update `ColumnDefinition` type.** Add `id: number` as the first field:
  ```typescript
  type ColumnDefinition = {
    id: number
    name: string
    type: string
    displayType: string
    order: number
    options: string | null
    formula: string | null
  }
  ```

- [x] **Update `getColumns`** to return the new `id` field. The query becomes `SELECT id, name, type, display_type, "order", options, formula FROM matrix_columns WHERE matrix_id = ? ORDER BY "order"`.

- [x] **Update `createMatrix`** to generate random IDs when inserting column definitions. The table DEFAULT handles ID generation automatically.

- [x] **Update `addColumn`** to generate a random ID for the new column. Return the generated column ID (previously returned void — now returns `number`).

- [x] **Update `addFormulaColumn`** to generate a random ID. Now returns `number`.

- [x] **Update `removeColumn`** — the current `DELETE FROM matrix_columns WHERE matrix_id = ? AND name = ?` continues to work since `(matrix_id, name)` is still unique. No change needed to the SQL.

- [x] **Update `renameColumn`** — same situation, the `UPDATE matrix_columns SET name = ? WHERE matrix_id = ? AND name = ?` continues to work. The column's `id` is preserved across the rename (this is the core value of stable IDs).

- [x] **Update sync triggers on `matrix_columns`** to include the `id` column in change tracking.

- [x] **Update `MatrixOperationMap` types** in `matrix-types.ts`: `getColumns` result type gains `id`. `addColumn` and `addFormulaColumn` result types changed from `void` to `number`.

- [x] **Update all consumers of `getColumns`** that destructure or map over column definitions. Raw SQL queries in `TableFace`, `FaceConfigPanel`, and `MatrixBrowser` now SELECT the `id` field. The admin browser's local `ColumnDef` type updated.

- [x] Tests: column ID generation on `createMatrix` (each column gets a unique non-zero ID). Column ID preserved across `renameColumn`. Column ID returned by `getColumns`. `addColumn` assigns a new ID. `addFormulaColumn` assigns a new ID. No regression in existing column operations (add, remove, rename, reorder).
- [x] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 2. Column constraints and plugin column ownership

Add engine-level constraint enforcement for column definitions and protect plugin-declared columns from accidental schema mutations. These two features both extend `matrix_columns` and `MatrixSpec`, and are tightly related: plugins declare columns with constraints, and those columns are marked as plugin-managed.

### Column constraints

- [x] **Add `constraints` column to `matrix_columns`.** TEXT, nullable. Stores the raw constraint clause as a string (e.g. `'NOT NULL UNIQUE COLLATE NOCASE'`). Migration: `ALTER TABLE matrix_columns ADD COLUMN constraints TEXT`.

- [x] **Extend `MatrixSpec` column declarations.** Add optional `constraints` field:
  ```typescript
  type MatrixSpec = {
    key: string
    title: string
    columns: { name: string; type: string; constraints?: string }[]
  }
  ```

- [x] **Update `ColumnDefinition` type** to include `constraints: string | null`.

- [x] **Update `createMatrix`** to compile constraints into the data table DDL. When a column has constraints, the DDL becomes `"colname" TYPE CONSTRAINTS` instead of bare `"colname" TYPE`:
  ```typescript
  const columnDefs = columns
    .map((col) => {
      const def = `${quoteIdent(col.name)} ${col.type}`
      return col.constraints ? `${def} ${col.constraints}` : def
    })
    .join(',\n        ')
  ```
  Also store the constraints in `matrix_columns`:
  ```sql
  INSERT INTO matrix_columns (id, matrix_id, name, type, display_type, "order", constraints)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ```

- [x] **Update `addColumn`** to accept an optional `constraints` parameter and compile it into the `ALTER TABLE ADD COLUMN` DDL.

- [x] **Update `getColumns`** to return the `constraints` field.

- [x] **Update the tags plugin's registry matrix definition** to declare constraints:
  ```typescript
  columns: [
    { name: 'name', type: 'TEXT', constraints: 'NOT NULL UNIQUE COLLATE NOCASE' },
    { name: 'matrix_id', type: 'INTEGER', constraints: 'NOT NULL' },
    { name: 'color', type: 'TEXT' },
    { name: 'icon', type: 'TEXT' },
  ]
  ```

- [x] **Remove the application-level uniqueness check in `createTagType`.** The `SELECT 1 FROM ... WHERE LOWER(name) = LOWER(?)` guard is replaced by the UNIQUE COLLATE NOCASE constraint. Catch the SQLite constraint violation error and surface a user-friendly message:
  ```typescript
  try {
    insertRow(db, registryMatrixId, { values: { name, matrix_id: matrixId } })
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
      throw new Error(`Tag type "${name}" already exists`)
    }
    throw err
  }
  ```

- [x] **Handle constraint errors in `insertRow` and `updateRow`.** When a constraint violation occurs (NOT NULL, UNIQUE, CHECK), the SQLite error should propagate as a typed error that the UI can distinguish from other errors. Define a `ConstraintViolationError` class or error code convention.

### Plugin column ownership

- [x] **Add `managed_by` column to `matrix_columns`.** TEXT, nullable, references `plugins.id`. Migration: `ALTER TABLE matrix_columns ADD COLUMN managed_by TEXT REFERENCES plugins(id) ON DELETE SET NULL`.

- [x] **Update `ColumnDefinition` type** to include `managedBy: string | null`.

- [x] **Update `registerPlugin`** to set `managed_by` when creating columns from a plugin's `MatrixSpec`. When `createMatrix` is called inside `registerPlugin`, the resulting columns should have `managed_by = definition.id`. Two approaches:
  - **Option A**: Pass `managedBy` through `createMatrix`. Add an optional `managedBy` param to `createMatrix` and propagate it to each `INSERT INTO matrix_columns`.
  - **Option B**: After `createMatrix` returns, batch-update the columns: `UPDATE matrix_columns SET managed_by = ? WHERE matrix_id = ? AND managed_by IS NULL`.
  - Prefer Option A for atomicity and clarity.

- [x] **Update `removeColumn`** to check `managed_by`. If the column has a non-null `managed_by` and the caller hasn't passed `force: true`, reject with an error:
  ```typescript
  if (col.managedBy && !options?.force) {
    throw new Error(
      `Column "${columnName}" is managed by plugin "${col.managedBy}" and cannot be removed. Pass force: true to override.`
    )
  }
  ```
  Update the worker message type to accept an optional `force` parameter.

- [x] **Update `renameColumn`** with the same `managed_by` guard and `force` option.

- [x] **Update `getColumns`** to return `managed_by`.

- [x] **Update client functions** (`removeColumn`, `renameColumn`) to accept an optional `force` parameter.

- [x] Tests: create a matrix with constraints, verify DDL includes constraints (probe with INSERT that violates NOT NULL — expect error, INSERT that violates UNIQUE — expect error). Plugin column ownership: register a plugin with matrixes, verify `managed_by` is set on plugin columns. Attempt to `removeColumn` on a managed column without force — expect rejection. With `force: true` — succeeds. Attempt to `renameColumn` on a managed column without force — expect rejection. With `force: true` — succeeds. User-added columns have `managed_by = NULL` and can be removed/renamed freely. Tag type creation with duplicate name (case-insensitive) — rejected by constraint, user-friendly error message returned.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 3. Normalize face config column references

Extract structured column references from `face_configs` JSON blobs into normalized tables with FK cascades to `matrix_columns.id`. This is the largest single stage — it migrates an existing data format, creates three new tables, and updates all face config read/write paths.

- [ ] **Create `face_slot_bindings` table:**
  ```sql
  CREATE TABLE IF NOT EXISTS face_slot_bindings (
    face_config_id TEXT    NOT NULL REFERENCES face_configs(id) ON DELETE CASCADE,
    slot_name      TEXT    NOT NULL,
    column_id      INTEGER REFERENCES matrix_columns(id) ON DELETE SET NULL,
    PRIMARY KEY (face_config_id, slot_name)
  ) STRICT;
  ```
  `ON DELETE SET NULL` on `column_id`: if a bound column is removed, the binding becomes unresolved (the face degrades gracefully via fallback re-resolution).

- [ ] **Create `face_sort_config` table:**
  ```sql
  CREATE TABLE IF NOT EXISTS face_sort_config (
    face_config_id TEXT    NOT NULL REFERENCES face_configs(id) ON DELETE CASCADE,
    column_id      INTEGER NOT NULL REFERENCES matrix_columns(id) ON DELETE CASCADE,
    direction      TEXT    NOT NULL CHECK (direction IN ('ASC', 'DESC')),
    PRIMARY KEY (face_config_id)
  ) STRICT;
  ```
  `ON DELETE CASCADE` on `column_id`: if the sorted column is removed, the sort config is automatically cleaned up.

- [ ] **Create `face_filter_configs` table:**
  ```sql
  CREATE TABLE IF NOT EXISTS face_filter_configs (
    id             INTEGER PRIMARY KEY,
    face_config_id TEXT    NOT NULL REFERENCES face_configs(id) ON DELETE CASCADE,
    column_id      INTEGER NOT NULL REFERENCES matrix_columns(id) ON DELETE CASCADE,
    operator       TEXT    NOT NULL,
    value          TEXT    NOT NULL
  ) STRICT;
  ```
  `ON DELETE CASCADE` on `column_id`: if the filtered column is removed, filter entries referencing it are dropped.

- [ ] **Install change-tracking triggers** on the three new tables (Phase 3 sync infrastructure).

- [ ] **Migrate existing face config data.** Write a migration that runs on database open:
  1. For each row in `face_configs`:
     a. Parse `slot_bindings` JSON. For each `{ slotName: columnName }` entry, look up `column_id` from `matrix_columns WHERE matrix_id = face_configs.matrix_id AND name = columnName`. Insert into `face_slot_bindings`.
     b. Parse `settings` JSON. If `settings.sort` exists (`{ column, direction }`), look up `column_id` and insert into `face_sort_config`.
     c. If `settings.filters` exists (array of `{ column, operator, value }`), look up `column_id` for each and insert into `face_filter_configs`.
  2. Clear the `slot_bindings` column in `face_configs` (set to `'{}'` — keep the column for backward compat but stop using it for bindings).
  3. Remove `sort` and `filters` keys from `settings` JSON where present.
  Migration is idempotent: check whether the new tables are already populated before running.

- [ ] **Update `FaceConfig` type.** The in-memory representation shifts from name-based to ID-based:
  ```typescript
  type FaceConfig = {
    id: string
    faceTypeId: string
    matrixId: number
    query: string
    slotBindings: Record<string, number | null>  // slot name → column ID (null if unresolved)
    settings: Record<string, unknown>             // non-column-referencing settings only
    createdByPlugin: string | null
    sort: { columnId: number; direction: 'ASC' | 'DESC' } | null
    filters: { columnId: number; operator: string; value: string }[]
  }
  ```

- [ ] **Update `saveFaceConfig`** to write the normalized tables instead of JSON blobs:
  1. Upsert `face_configs` row (with empty `slot_bindings` JSON and `settings` without sort/filter).
  2. Delete + re-insert `face_slot_bindings` for this `face_config_id`.
  3. Delete + re-insert `face_sort_config` for this `face_config_id`.
  4. Delete + re-insert `face_filter_configs` for this `face_config_id`.

- [ ] **Update `getFaceConfig`** to JOIN the normalized tables and assemble the `FaceConfig` object. Query pattern:
  ```sql
  SELECT fc.*, fsb.slot_name, fsb.column_id AS slot_column_id
  FROM face_configs fc
  LEFT JOIN face_slot_bindings fsb ON fsb.face_config_id = fc.id
  WHERE fc.id = ?
  ```
  Plus separate queries for sort and filters (or a multi-result approach).

- [ ] **Update `getFaceConfigsForMatrix`** similarly.

- [ ] **Update `applyFaceToMatrix`** to write slot bindings to the normalized table. The `resolveSlotBindings` call continues to work with column objects, but the results are stored as column IDs:
  ```typescript
  const columns = getColumns(db, matrixId)
  const { bindings } = resolveSlotBindings(faceType, columns)
  
  const slotBindings: Record<string, number | null> = {}
  for (const b of bindings) {
    const col = columns.find(c => c.name === b.columnName)
    slotBindings[b.slotName] = col?.id ?? null
  }
  ```

- [ ] **Update `resolveSlotBindings`** to accept columns with IDs. The resolution logic itself doesn't change (it matches by name and type), but the `ResolvedSlotBinding` result type gains a `columnId` field alongside `columnName`:
  ```typescript
  type ResolvedSlotBinding = {
    slotName: string
    columnId: number
    columnName: string
    columnType: string
    resolution: 'explicit' | 'name-match' | 'type-position' | 'fallback'
  }
  ```
  Update explicit bindings to accept column IDs as input (for re-resolution after a column rename).

- [ ] **Update the table face** (`TableFace.tsx`) to persist sort and filter through the normalized tables. The `persistSettings` function currently writes sort/filter into the settings JSON blob; update it to:
  1. Resolve column names to column IDs from the current `columns()` signal.
  2. Call `saveFaceConfig` with the ID-based sort/filter data.
  3. On load, resolve column IDs back to current names for the query builder.

- [ ] **Update `SortConfig` and `FilterConfig` types** to use column IDs internally while resolving to names for SQL generation:
  ```typescript
  type SortConfig = { columnId: number; direction: 'ASC' | 'DESC' }
  type FilterConfig = { columnId: number; operator: FilterOperator; value: string }
  ```
  `buildTableQuery` receives these and resolves IDs to current column names via a lookup map.

- [ ] **Update `buildTableQuery`** to accept a column ID → name resolution map and resolve IDs before generating SQL:
  ```typescript
  const buildTableQuery = (
    matrixId: number,
    sort: SortConfig | null,
    filters: FilterConfig[],
    columns: ColumnDefinition[],
  ): string => {
    const nameById = new Map(columns.map(c => [c.id, c.name]))
    // ... resolve sort.columnId, filter.columnId to names via nameById
  }
  ```

- [ ] **Verify FK cascade behavior.** After migration:
  - Rename a column → `matrix_columns.name` updates. Slot bindings, sort, and filter configs are unaffected (they reference by ID, not name). The next query resolution picks up the new name automatically.
  - Remove a column → `matrix_columns` row deleted. Slot bindings get `column_id = NULL` (graceful degradation). Sort and filter configs referencing that column are cascade-deleted.

- [ ] Tests: save a face config with slot bindings, sort, and filters. Verify normalized tables are populated correctly. Load the face config, verify it round-trips. Rename a column, verify slot bindings still resolve (same ID, different name). Remove a sorted column, verify sort config is cascade-deleted. Remove a filtered column, verify filter config is cascade-deleted. Remove a slot-bound column, verify slot binding gets `column_id = NULL`. Migration test: create a face config with the old JSON format, run migration, verify normalized tables match. `buildTableQuery` resolves column IDs to names correctly. Table face persists sort/filter through normalized tables.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 4. Formula column references

Replace raw column-name references in formula expressions with stable `{{columnId}}` syntax. Track formula dependencies in a normalized table so that removing a column used by a formula is rejected rather than silently breaking.

### Backend: compilation and dependency tracking

- [ ] **Define `{{columnId}}` reference syntax.** Formula expressions use `{{123456}}` to reference a column by its stable ID. Raw SQL operators and literals pass through unchanged. Example: `{{123456}} * 2 + {{789012}}` compiles to `"price" * 2 + "tax"` if column 123456 is named "price" and 789012 is named "tax".

- [ ] **Create `formula_column_deps` table:**
  ```sql
  CREATE TABLE IF NOT EXISTS formula_column_deps (
    formula_col_id INTEGER NOT NULL REFERENCES matrix_columns(id) ON DELETE CASCADE,
    dep_col_id     INTEGER NOT NULL REFERENCES matrix_columns(id) ON DELETE RESTRICT,
    PRIMARY KEY (formula_col_id, dep_col_id)
  ) STRICT;
  ```
  - `ON DELETE CASCADE` on `formula_col_id`: removing the formula column cleans up its dependency records.
  - `ON DELETE RESTRICT` on `dep_col_id`: attempting to remove a column that a formula depends on is rejected by SQLite. The error is caught and surfaced as a user-friendly message identifying the dependent formula(s).

- [ ] **Implement `compileFormula(formula: string, columns: ColumnDefinition[]): string`.** Replaces `{{id}}` references with quoted column names:
  ```typescript
  const compileFormula = (formula: string, columns: ColumnDefinition[]): string => {
    const byId = new Map(columns.map(c => [c.id, c.name]))
    return formula.replace(/\{\{(\d+)\}\}/g, (_, idStr) => {
      const id = Number(idStr)
      const name = byId.get(id)
      if (!name) throw new Error(`Formula references unknown column ID ${id}`)
      return quoteIdent(name)
    })
  }
  ```

- [ ] **Implement `parseFormulaRefs(formula: string): number[]`.** Extracts all column IDs referenced in a formula expression:
  ```typescript
  const parseFormulaRefs = (formula: string): number[] => {
    const refs: number[] = []
    const re = /\{\{(\d+)\}\}/g
    let match
    while ((match = re.exec(formula)) !== null) {
      refs.push(Number(match[1]))
    }
    return refs
  }
  ```

- [ ] **Update `addFormulaColumn`** to:
  1. Parse `{{id}}` references from the formula via `parseFormulaRefs`.
  2. Validate all referenced column IDs exist in the matrix.
  3. Compile the formula to SQL (resolve `{{id}}` to column names) for probe validation.
  4. Run the existing probe query with the compiled formula.
  5. Store the original `{{id}}`-based formula in `matrix_columns.formula` (not the compiled form — the IDs are the durable representation).
  6. Populate `formula_column_deps` with one row per referenced column.

- [ ] **Update `buildTableQuery`** to compile formula expressions before generating SQL. The formula column's stored formula contains `{{id}}` references; these are compiled to current column names at query time:
  ```typescript
  const formulaCols = columns?.filter(c => c.formula !== null) ?? []
  if (formulaCols.length > 0) {
    const extras = formulaCols.map(c => {
      const compiled = compileFormula(c.formula!, columns!)
      return `(${compiled}) AS ${quoteIdent(c.name)}`
    }).join(', ')
    selectClause = `SELECT *, ${extras} FROM "mx_${matrixId}_data"`
  }
  ```

- [ ] **Update `removeColumn`** to handle `ON DELETE RESTRICT` errors from `formula_column_deps`. When removing a column that a formula depends on, SQLite's FK engine rejects the deletion. Catch this error and produce a message like: `Column "price" cannot be removed because formula column "total" depends on it.`
  Query `formula_column_deps` to identify the dependent formula(s) for the error message:
  ```sql
  SELECT mc.name FROM formula_column_deps fcd
  JOIN matrix_columns mc ON mc.id = fcd.formula_col_id
  WHERE fcd.dep_col_id = ?
  ```

- [ ] **Backward compatibility for existing formulas.** Existing formulas stored as raw SQL (pre-Phase 5b) contain column names, not `{{id}}` references. Write a migration that converts existing formula strings:
  1. For each `matrix_columns` row where `formula IS NOT NULL`:
     a. Parse the formula to identify column name references (heuristic: quoted identifiers or bare names that match sibling column names in the same matrix).
     b. Replace each with `{{columnId}}`.
     c. Populate `formula_column_deps`.
  2. This migration is best-effort — complex formulas with SQL functions may have ambiguous references. Log warnings for formulas that cannot be fully converted. A conservative approach: only convert formulas that are simple expressions of known column names.

### Frontend: token-aware formula dialog

- [ ] **Create a `FormulaInput` component** (`src/table/FormulaInput.tsx`) — a token-aware text input for editing formula expressions:
  - Text between tokens is raw SQL (operators, literals, function calls).
  - Column references display as styled tokens showing the current column name (e.g., a pill badge similar to inline reference badges). The token's underlying value is `{{columnId}}`.
  - Typing a column name or selecting from an autocomplete dropdown inserts a `{{id}}` token.
  - The autocomplete shows available columns from the matrix (excluding formula columns themselves to prevent circular references).
  - Deleting a token (Backspace over it) removes the `{{id}}` reference from the expression.
  - The component's value is the raw formula string with `{{id}}` references (what gets stored in `matrix_columns.formula`).

- [ ] **Update the formula dialog in `TableFace.tsx`** to use `FormulaInput` instead of a plain text input. The dialog currently takes raw SQL; update it to:
  1. Load existing formula (if editing) and render `{{id}}` references as tokens.
  2. On submit, pass the `{{id}}`-based formula string to `addFormulaColumn`.
  3. Show a validation error if the compiled formula fails the probe query.

- [ ] Tests: `compileFormula` resolves `{{id}}` to column names correctly. `parseFormulaRefs` extracts all referenced IDs. `addFormulaColumn` with `{{id}}` references populates `formula_column_deps`. `removeColumn` on a formula-dependency rejects with the RESTRICT error and a user-friendly message. Removing the formula column itself succeeds and cleans up `formula_column_deps` via CASCADE. `buildTableQuery` compiles formula `{{id}}` to current column names. Rename a column, verify formula still works (ID is stable, compiled name updates). Backward compat migration: existing raw-SQL formula is converted to `{{id}}` form.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` — all pass

## 5. Face query references and Playwright E2E

Extend the query sandbox to support `{{columnId}}` references in face queries (optional enhancement), and build comprehensive E2E coverage for all Phase 5b features.

### Face query references (optional)

- [ ] **Extend query sandbox compilation** to resolve `{{columnId}}` references in face queries before evaluation. Reuse the same `compileFormula` function (it works for any SQL expression with `{{id}}` references). Apply compilation as a preprocessing step in the query evaluation pipeline, before the authorizer-based sandbox runs.

- [ ] **Face queries continue to accept raw column names** for simplicity. The `{{id}}` syntax is available but not required. The face query editor can offer autocomplete that inserts `{{id}}` references for users who want rename-safe queries.

- [ ] **Update the face query editor** (if one exists in the admin browser or face configuration UI) to offer column autocomplete that inserts `{{id}}` references.

### Playwright E2E tests

- [ ] **Column constraint enforcement:**
  - Create a tag type (which uses the constrained registry matrix). Attempt to create a duplicate tag type name with different casing. Verify rejection with a user-friendly error message.
  - Add a column with a NOT NULL constraint via a test helper or fixture. Insert a row with a null value for that column. Verify rejection.

- [ ] **Plugin column ownership:**
  - In the admin browser or table face, attempt to rename a plugin-managed column. Verify rejection or warning UI.
  - Verify that user-added columns can be renamed and removed freely.

- [ ] **Formula column with token input:**
  - Open the formula dialog in the table face. Type a column name, verify autocomplete appears. Select from autocomplete, verify a styled token is inserted. Complete the formula and submit. Verify the formula column appears with computed values.
  - Rename a column that a formula depends on. Verify the formula column still shows correct values (the `{{id}}` reference is stable).
  - Attempt to remove a column that a formula depends on. Verify the error message identifies the dependent formula.

- [ ] **Sort and filter survive column rename:**
  - Apply a sort on a column. Rename the column. Verify the sort still applies (the face config references the column by ID, not name).
  - Apply a filter on a column. Rename the column. Verify the filter still applies.
  - Remove a sorted column. Verify the sort is cleared (cascade delete).
  - Remove a filtered column. Verify the filter is cleared (cascade delete).

- [ ] Run `pnpm test:e2e` — all pass
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` — all Vitest tests still pass

---

## Task dependency order

```
1. Stable column IDs
   │
   ├─► 2. Column constraints + plugin column ownership
   │
   ├─► 3. Normalize face config column references
   │
   └─► 4. Formula column references
              │
              └─► 5. Face query references + E2E
```

Stage 1 (stable column IDs) is a prerequisite for all other stages — every FK-backed column reference targets `matrix_columns.id`. Stages 2, 3, and 4 are independent of each other and can proceed in any order after Stage 1 (they each add FK tables or constraints that reference `matrix_columns.id`). Stage 5 depends on Stages 2–4 being complete for comprehensive E2E coverage, and reuses Stage 4's `compileFormula` for face query references.

---

## Decisions and scope boundaries

- **Migration strategy for `matrix_columns`.** The PK change from `(matrix_id, name)` to `id` requires a table rebuild (SQLite does not support altering the primary key). This is safe because `matrix_columns` is a metadata table with modest row counts. The migration generates random IDs for existing columns and verifies no collisions.

- **Constraint syntax is raw SQL.** The `constraints` field stores a raw SQL constraint clause (e.g. `'NOT NULL UNIQUE COLLATE NOCASE'`). This is intentionally unstructured — parsing and validating arbitrary SQL constraints is not worth the complexity. The constraint string is appended verbatim to the column DDL. Invalid constraints will cause `createMatrix` to fail with a SQLite error, which is acceptable.

- **`managed_by` uses `ON DELETE SET NULL`.** When a plugin is unregistered, its columns become unmanaged (rather than being deleted or orphaned with a dangling reference). This is consistent with the architecture principle that matrixes and their schemas survive plugin removal.

- **Slot bindings use `ON DELETE SET NULL`.** When a bound column is removed, the slot binding becomes unresolved (`column_id = NULL`). The face degrades gracefully — `resolveSlotBindings` re-runs with the remaining columns and finds the next-best match. This is better than CASCADE (which would silently remove the binding record and lose the slot name association).

- **Sort and filter use `ON DELETE CASCADE`.** When a sorted/filtered column is removed, the sort/filter config is automatically cleaned up. There is no useful "degraded" state for a sort referencing a nonexistent column.

- **Formula deps use `ON DELETE RESTRICT`.** Removing a column that a formula depends on is a destructive operation that would silently break the formula. RESTRICT makes this a hard error with a clear message. The user must remove or modify the formula first.

- **Formula backward compatibility is best-effort.** Existing raw-SQL formulas are migrated to `{{id}}` syntax heuristically. Complex formulas with SQL functions or subqueries may not be fully convertible. These are logged as warnings and left as-is (they continue to work until the referenced column is renamed). Users can manually update them via the new token-aware formula dialog.

- **Face query references are optional.** The `{{columnId}}` syntax in face queries is a power-user feature. Most face queries are identity queries (`SELECT * FROM ...`) that don't reference columns by name. The feature is available but not required.

- **No changes to runtime read/write hot paths.** `updateRow`, `insertRow`, and `SELECT *` queries continue to use column names as SQL identifiers. The column ID is a persistence and dependency-tracking concern, not a runtime data-access concern. The only runtime cost is formula compilation (replacing `{{id}}` with column names), which is a fast string operation.

- **`buildTableQuery` signature change.** The `columns` parameter becomes required (was previously optional) since the function now needs column IDs for formula compilation and column ID → name resolution for sort/filter. All callers already pass columns when formula columns exist.

---

## Done criteria

All five stages complete. `matrix_columns` has a stable integer `id` primary key with the former `(matrix_id, name)` as a unique constraint. The `constraints` field compiles to DDL on matrix creation — the tags plugin's registry matrix has engine-level UNIQUE COLLATE NOCASE on `name` and NOT NULL on `matrix_id`. Plugin-declared columns carry `managed_by` and are protected from accidental rename/remove. Face slot bindings, sort configurations, and filter configurations are stored in normalized FK-backed tables that cascade correctly on column rename and removal. Formula expressions use `{{columnId}}` references compiled to current column names at query time, with `formula_column_deps` tracking dependencies via RESTRICT. The formula dialog provides a token-aware input with column autocomplete. Face queries optionally support `{{columnId}}` references. `npm run typecheck && npm run lint && npm run test:run && pnpm test:e2e` all pass.
