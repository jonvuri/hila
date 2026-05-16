# Phase 6 -- Column display roles

Concrete tasks for Phase 6. See [Plan.md](Plan.md) for context and objectives, and [Architecture.md](Architecture.md) for the column display roles design rationale.

A small, targeted addition to the column schema that gives columns semantic roles beyond their data type. Roles indicate what a column represents in the matrix's conceptual model -- `label` (the short identifying text) or `content` (the rich body) -- enabling the workspace stream view (Phase 7) and future search infrastructure to locate the right columns without hardcoded names.

### Current implementation state (prerequisites from Phase 5b)

What exists and Phase 6 builds on:
- **`matrix_columns` table** with columns: `id` (stable integer PK), `matrix_id`, `name`, `type`, `display_type`, `"order"`, `options`, `formula`, `constraints`, `managed_by`. No `role` column.
- **`ColumnDefinition` type** returns `{ id, name, type, displayType, order, options, formula, constraints, managedBy }`. No `role` field.
- **`MatrixSpec`** column declarations: `{ name: string; type: string; constraints?: string }`. No `role` field.
- **`createMatrix`** stores columns in `matrix_columns` with constraints and managed_by. No role handling.
- **`addColumn`** accepts `{ name, type, displayType?, options?, constraints? }`. No role parameter.
- **`getColumns`** returns all columns for a matrix ordered by `"order"`. No role in the SELECT.
- **Outline plugin** declares a single `content` TEXT column (no role annotation).
- **Notes plugin** declares `title` TEXT and `body` TEXT columns (no role annotations).
- **Tags plugin** declares `name` TEXT and `matrix_id` INTEGER columns for the registry matrix.

After this phase:
- Columns carry an optional `role` annotation (`'label'` or `'content'`), enforced unique per matrix by a partial unique index
- `ColumnDefinition`, `MatrixSpec`, and all column operations are role-aware
- The workspace plugin (Phase 7) can declare columns with roles and locate them by semantic meaning
- Future search (FTS5) can index columns by role

---

## 1. Schema: add `role` column to `matrix_columns`

Add the `role` column and uniqueness constraint.

- [x] **Add `role` column via migration.** TEXT, nullable. Only `'label'` and `'content'` are valid values. Migration in `initSchema` (same pattern as `constraints` and `managed_by`):
  ```sql
  ALTER TABLE matrix_columns ADD COLUMN role TEXT CHECK (role IN ('label', 'content'));
  ```
  Wrapped in try/catch for idempotency (column already exists on new databases or previously migrated).

- [x] **Add partial unique index.** At most one column per role per matrix. This must be created separately from the ALTER TABLE since it's an index, not a column attribute:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS matrix_columns_role_unique
    ON matrix_columns (matrix_id, role)
    WHERE role IS NOT NULL;
  ```
  Place this in `initSchema` after the migration block. `IF NOT EXISTS` makes it idempotent.

- [x] Tests: verify the migration runs without error on a fresh database. Verify the migration is idempotent (runs twice without error). Verify the CHECK constraint rejects invalid role values (e.g. `'foo'`). Verify the partial unique index rejects a second `'label'` column in the same matrix. Verify two different matrixes can each have a `'label'` column. Verify null roles are unrestricted (multiple columns with null role in the same matrix).
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 2. Update types and queries

Wire the `role` field through the type system and query layer.

- [x] **Update `ColumnDefinition` type** in `matrix.ts`:
  ```typescript
  export type ColumnDefinition = {
    id: number
    name: string
    type: string
    displayType: string
    order: number
    options: string | null
    formula: string | null
    constraints: string | null
    managedBy: string | null
    role: 'label' | 'content' | null
  }
  ```

- [x] **Update `getColumns`** to include `role` in the SELECT:
  ```sql
  SELECT id, name, type, display_type AS displayType, "order", options, formula,
         constraints, managed_by AS managedBy, role
  FROM matrix_columns WHERE matrix_id = ? ORDER BY "order"
  ```

- [x] **Extend `MatrixSpec` column declarations** in `plugin-types.ts` with optional `role`:
  ```typescript
  export type MatrixSpec = {
    key: string
    title: string
    columns: {
      name: string
      type: string
      constraints?: string
      role?: 'label' | 'content'
    }[]
  }
  ```

- [x] Tests: verify `getColumns` returns `role: null` for existing columns. Verify the `ColumnDefinition` type matches the query result shape.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 3. Update `createMatrix` to store roles

- [x] **Update `createMatrix`** to pass `role` when inserting into `matrix_columns`. Extend the INSERT statement:
  ```sql
  INSERT INTO matrix_columns (matrix_id, name, type, display_type, "order", constraints, managed_by, role)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ```
  Bind `columns[i].role ?? null` as the last parameter.

- [x] Tests: create a matrix with `columns: [{ name: 'label', type: 'TEXT', role: 'label' }, { name: 'content', type: 'TEXT', role: 'content' }]`. Verify `getColumns` returns the correct roles. Create a matrix with no roles specified. Verify all roles are null.
- [x] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 4. Update `addColumn` to accept a role

- [ ] **Update `addColumn`** signature to accept an optional `role` parameter:
  ```typescript
  export const addColumn = (
    db: Database,
    matrixId: number,
    column: {
      name: string
      type: string
      displayType?: string
      options?: string
      constraints?: string
      role?: 'label' | 'content'
    },
  ): number => {
  ```
  Include `role` in the INSERT into `matrix_columns`.

- [ ] **Update `MatrixOperationMap` for `addColumn`** in `matrix-types.ts` -- add `role?: 'label' | 'content'` to the params type.

- [ ] **Update the `addColumn` handler** in `matrix-handler.ts` to pass the role through.

- [ ] Tests: add a column with `role: 'label'` to a matrix that has no label column. Verify it succeeds and `getColumns` returns the role. Add a second column with `role: 'label'` to the same matrix. Verify it fails with a constraint violation (the partial unique index). Add a column with `role: 'content'` to the same matrix. Verify it succeeds (different role). Add a column with no role. Verify it succeeds (null role, no uniqueness conflict).
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 5. Add `updateColumnRole` operation

A new operation to set, change, or clear a column's role.

- [ ] **Add `updateColumnRole` to the op registry** in `matrix-types.ts`:
  ```typescript
  updateColumnRole: {
    params: { matrixId: number; columnName: string; role: 'label' | 'content' | null }
    result: void
  }
  ```

- [ ] **Implement `updateColumnRole`** in `matrix.ts`:
  ```typescript
  export const updateColumnRole = (
    db: Database,
    matrixId: number,
    columnName: string,
    role: 'label' | 'content' | null,
  ): void => {
    // Verify the column exists
    // UPDATE matrix_columns SET role = ? WHERE matrix_id = ? AND name = ?
    // The partial unique index enforces at-most-one-per-role-per-matrix
  }
  ```
  If the update would violate the uniqueness constraint (another column already has that role in this matrix), SQLite will throw. Catch the UNIQUE constraint error and rethrow with a descriptive message (e.g. "Matrix already has a column with role 'label': column_name").

- [ ] **Add handler** in `matrix-handler.ts` for the `updateColumnRole` message type.

- [ ] **Add client function** in `matrix-client.ts`:
  ```typescript
  export const updateColumnRole = (
    matrixId: number,
    columnName: string,
    role: 'label' | 'content' | null,
  ): Promise<void> =>
    matrixOp('updateColumnRole', { matrixId, columnName, role })
  ```

- [ ] Tests:
  - Set a column's role to `'label'`. Verify `getColumns` returns the role.
  - Set the same column's role to `'content'`. Verify it changes.
  - Clear the role (set to `null`). Verify it's null.
  - Set column A to `'label'`, then try to set column B to `'label'` in the same matrix. Verify the error message names the conflicting column.
  - Swap roles: column A has `'label'`, column B has `'content'`. Clear A's role, set B to `'label'`, set A to `'content'`. Verify the swap completes.
  - Verify `updateColumnRole` on a nonexistent column throws an appropriate error.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 6. Role survives column rename

Verify that renaming a column preserves its role (this should work automatically since `renameColumn` updates `matrix_columns.name` and `role` is on the same row, but an explicit test confirms it).

- [ ] Tests: create a matrix with a column that has `role: 'label'`. Rename the column. Verify `getColumns` still returns `role: 'label'` for the renamed column (same `id`, new name, same role).
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 7. Sync trigger update

- [ ] **Update sync change tracking triggers** on `matrix_columns` (if the role column is not already included). The existing trigger reinstallation on schema changes should pick up the new column, but verify that role changes to `matrix_columns` are captured in `_sync_changelog`.

- [ ] Tests: change a column's role, verify a changelog entry is written for the `matrix_columns` change.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

---

## Design decisions

- **Roles are orthogonal to slots.** Roles describe what a column *means* in the matrix's conceptual model (its identifying label, its body content). Slots describe where a column *renders* in a particular face. The workspace face (Phase 7) uses roles to locate its data columns; it could also use slot bindings, but roles provide a face-independent semantic layer. A column might have role `'label'` and be bound to a slot named `'label'` in the workspace face and to slot `'primary_content'` in the outline face -- the role is stable, the slot binding varies by face.

- **No UI surface in this phase.** Roles are set programmatically (by plugins in `MatrixSpec` or via `updateColumnRole`). A role column in the table face header or a role picker in the column settings panel are future enhancements when users need to assign roles to their own columns.

- **Only two roles for now.** `label` and `content` cover the immediate needs (workspace face, search). Additional roles (e.g. `'date'`, `'status'`) could be added later by extending the CHECK constraint. The partial unique index pattern generalizes to any number of roles.

- **Application-level, not DDL-level.** Roles are stored in `matrix_columns` metadata, not compiled into data table DDL. They have no effect on the SQLite data table schema -- they're purely advisory metadata consumed by the application layer (workspace face, search indexer, `@`-autocomplete display).
