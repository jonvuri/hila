# Phase 1 -- Foundation hardening

Concrete tasks for Phase 1. See [Plan.md](Plan.md) for context and objectives.

Ordered to minimize conflicts: rename first (wide but mechanical), then independent additions, then the reactive layer rewrite, then schema management.

---

## 1. Rename `element` → `row`, `ordering` → `rank`

Align code vocabulary with architecture docs before other changes land.

- [ ] Schema: rename `ordering` table → `rank`
- [ ] Schema: rename `element_kind` column → `row_kind`, `element_id` → `row_id`
- [ ] Rename `insertElement()` → `insertRow()` and update its parameter names (`elementKind` → `rowKind`, `elementId` → `rowId`)
- [ ] Rename `addSampleRowsToMatrix()` internals (references to `element_kind`, `element_id`)
- [ ] Rename `getMatrixDebugData()` query aliases (`element_kind`, `element_id` in the ordering query)
- [ ] Update `MatrixDebug.tsx` -- all references to `ordering`, `element_kind`, `element_id`
- [ ] Update `matrix-types.ts` and `matrix-handler.ts` if they reference old names
- [ ] Update all tests in `matrix.test.ts`
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 2. Implement the join table

Global `joins` table per the [Primitives spec](Primitives.md#join).

- [ ] Create `joins` table in `initMatrixSchema()`:
  ```sql
  CREATE TABLE IF NOT EXISTS joins (
    source_matrix_id  INTEGER NOT NULL,
    source_row_id     INTEGER NOT NULL,
    target_matrix_id  INTEGER NOT NULL,
    target_row_id     INTEGER NOT NULL,
    PRIMARY KEY (source_matrix_id, source_row_id, target_matrix_id, target_row_id)
  ) STRICT;
  ```
- [ ] Add reverse-lookup index: `CREATE INDEX joins_by_target ON joins(target_matrix_id, target_row_id)`
- [ ] Implement operations: `insertJoin`, `deleteJoin`, `getTargets(sourceMatrixId, sourceRowId)`, `getSources(targetMatrixId, targetRowId)`
- [ ] Tests: insert, delete, forward lookup, reverse lookup, duplicate insert is idempotent or errors cleanly, cascading behavior when a matrix or row is deleted
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 3. Worker resilience

Queue messages during worker init; replay when ready.

- [ ] In the worker, replace the direct `onmessage` assignment with a queuing wrapper:
  - On load, `onmessage` pushes incoming messages into a queue
  - Once SQLite DB and all handlers are initialized, drain the queue through the real handler
  - Then replace `onmessage` with the real handler for all subsequent messages
- [ ] The client side (`worker-client.ts`) should not need changes -- the queuing is internal to the worker
- [ ] Test: send messages before the worker signals ready; verify they are processed correctly after init completes
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 4. Replace RxJS with Solid reactive primitives

Replace the Observable-based query system with Solid signals. This also provides parameterized queries for free.

- [ ] Create `useQuery` hook in `src/sql/useQuery.ts`:
  ```typescript
  function useQuery(sql: () => string): { result: Accessor<SqlResult | null>, error: Accessor<Error | null> }
  ```
  - Uses `createEffect` to subscribe to the SQL query (via `addObserver`)
  - Uses `onCleanup` to unsubscribe (via `removeObserver`)
  - When `sql()` changes, automatically unsubscribes from old query, subscribes to new one
  - Returns Solid signals for result and error
- [ ] Extend worker-side `execQuery` to return results (currently returns `Promise<void>` via `executeAck`):
  - Add a new message type `executeResult` that carries the query result
  - Update `sql-handler.ts` to send results back
  - Update `sql-client.ts` `execQuery` to resolve with the result
- [ ] Create `execMutation` (or keep the void-returning version) for write operations that don't need results
- [ ] Update `MatrixDebug.tsx` to use `useQuery` instead of manual Observable subscriptions
- [ ] Update `SqlRunner.tsx` to use the new `execQuery` that returns results
- [ ] Remove `src/sql/querySubject.ts`
- [ ] Remove `src/sql/query.ts` (replaced by `useQuery` hook and promise-based `execQuery`)
- [ ] Update `src/sql/writeInvalidation.test.ts` to test the new reactive system
- [ ] Update `src/sql/querySubject.test.ts` → replace or remove (the behavior it tests should be covered by `useQuery` tests)
- [ ] Remove `rxjs` from `package.json` dependencies
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 5. Column schema management

Matrix registry tracks column definitions. Support add/remove/rename column operations.

- [ ] Extend the `matrix` registry table with a `columns` field (JSON text storing an array of `{ name, type, order }`), or create a separate `matrix_columns` table. Decide which is simpler.
- [ ] Update `createMatrix()` to store column definitions in the registry alongside creating the data table columns
- [ ] Implement `addColumn(matrixId, column: { name, type })`:
  - `ALTER TABLE mx_{id}_data ADD COLUMN {name} {type}`
  - Update the column definitions in the registry
- [ ] Implement `removeColumn(matrixId, columnName)`:
  - SQLite doesn't support `DROP COLUMN` in older versions; for the WASM build (3.50.x), `ALTER TABLE ... DROP COLUMN` should work. Verify.
  - Update the column definitions in the registry
- [ ] Implement `renameColumn(matrixId, oldName, newName)`:
  - `ALTER TABLE mx_{id}_data RENAME COLUMN {oldName} TO {newName}`
  - Update the column definitions in the registry
- [ ] Implement `getColumns(matrixId)` -- return the ordered column definitions for a matrix
- [ ] Update `ensureRootMatrix()` to store column definitions for the root matrix
- [ ] Tests: create matrix with custom columns, add column, remove column, rename column, verify data table schema matches registry, verify existing data survives column operations
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

---

## Done criteria

All five work items complete. `npm run typecheck && npm run lint && npm run test:run` all pass with no regressions. The codebase uses consistent vocabulary (row/rank), all three structural primitives are working and tested, the reactive query system uses Solid signals, and column schemas are tracked and mutable.
