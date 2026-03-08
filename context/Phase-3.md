# Phase 3 -- Sync-readiness

Concrete tasks for Phase 3. See [Plan.md](Plan.md) for context and objectives, and [Sync.md](Sync.md) for the full specification.

This phase puts in place the core infrastructure that all subsequent phases build on top of: globally unique IDs, device identity, change tracking triggers, the changeset abstraction, conflict detection, and closure rebuild. No live sync, no file storage, no Dropbox -- those come in [Phase 10](Phase-10.md). The goal here is to ensure that from this point forward, every data mutation is tracked and the schema is sync-safe.

Ordered by dependency: unique IDs first (prerequisite for everything), then device identity and change tracking, then the changeset and conflict layers on top.

---

## 1. Globally unique IDs

All entity IDs must be globally unique across devices before any sync work can begin. The current schema uses SQLite auto-increment (`INTEGER PRIMARY KEY`) for both matrix IDs and data row IDs, producing sequential values that collide when two devices create rows independently.

Replace auto-increment with random 63-bit positive integers via `abs(random())`. Birthday paradox: ~3 billion rows before a 50% collision chance -- negligible for a personal app.

- [ ] Update `initMatrixSchema` in `matrix.ts`: change the `matrix` table definition so that `id` defaults to `abs(random())` instead of relying on auto-increment:
  ```sql
  CREATE TABLE IF NOT EXISTS matrix (
    id INTEGER PRIMARY KEY DEFAULT (abs(random())),
    title TEXT NOT NULL DEFAULT ''
  ) STRICT;
  ```
- [ ] Update `createMatrix` in `matrix.ts`: the `INSERT INTO matrix (title) VALUES (?) RETURNING id` pattern still works -- SQLite applies the DEFAULT expression when id is omitted. Verify the returned id is the random value.
- [ ] Update per-matrix data table creation (`createMatrix`, `ensureRootMatrix`): change `id INTEGER PRIMARY KEY` to `id INTEGER PRIMARY KEY DEFAULT (abs(random()))` in `mx_{id}_data` table DDL.
- [ ] Update `insertDataRow` in `matrix.ts`: the `INSERT ... DEFAULT VALUES RETURNING id` and `INSERT ... (columns) VALUES (...) RETURNING id` patterns still work since we are not providing `id`. Verify random IDs are returned.
- [ ] Update `addSampleRowsToMatrix`: verify it still works with random IDs (it doesn't hardcode row IDs).
- [ ] Fix the OPFS database filename: the current `worker-db.ts` uses `/hioa-db.sqlite3` but [Sync.md](Sync.md) specifies `/hila-db.sqlite3`. Rename for consistency.
- [ ] Tests: create multiple matrixes, verify IDs are non-sequential and positive. Bulk-create 1000 rows, verify no collisions. Verify existing operations (insertRow, reparentRow, deleteRow, getChildren, getParent) work correctly with random IDs. Verify the outline query still works (it keys on rank keys, not row IDs, but row IDs appear in JOINs).
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 2. Device-specific entropy in rank keys

When two devices insert between the same siblings, the deterministic `between()` function produces identical rank keys. Add device-specific entropy to new key segments to prevent this.

- [ ] Create `_sync_state` table in `initMatrixSchema`:
  ```sql
  CREATE TABLE IF NOT EXISTS _sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT;
  ```
- [ ] Generate a device UUID on first run: after schema init, check if `_sync_state` has a `device_id` key. If not, insert one using `crypto.randomUUID()` (available in workers). Store it for the lifetime of the session.
- [ ] Expose device ID to the rank key system: the worker handler should read the device ID at init and pass it (or a short derivative) to the lexorank functions.
- [ ] Modify `between()` in `lexorank.ts` to accept an optional entropy parameter (a few bytes derived from the device ID). When generating a new key segment and there is room between the two boundaries, incorporate the entropy bytes into the midpoint computation so that two devices choosing the same midpoint diverge. When no entropy is provided (tests, backward compat), behavior is unchanged.
- [ ] Update `lexo_between` custom SQLite function registration to pass the device entropy.
- [ ] Tests: call `between()` with two different entropy values for the same (prev, next) pair, verify distinct results. Call without entropy, verify deterministic behavior is preserved. Run the full lexorank test suite to verify no regressions.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 3. Change tracking infrastructure

Trigger-based changelog on all tracked tables. Every INSERT/UPDATE/DELETE fires a trigger that logs to `_sync_changelog`. This is the foundation for the sync engine and doubles as per-row version history.

- [ ] Create `_sync_changelog` table in `initMatrixSchema`:
  ```sql
  CREATE TABLE IF NOT EXISTS _sync_changelog (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    table_name TEXT NOT NULL,
    row_id INTEGER NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    data TEXT
  ) STRICT;
  ```
  Note: `seq` uses AUTOINCREMENT here intentionally -- it is a monotonic sequence number for ordering changes, not an entity ID.
- [ ] Implement `installChangeTrackingTriggers(db, tableName, deviceId)` in a new `src/core/sync.ts` module:
  - Creates three triggers (INSERT, UPDATE, DELETE) on the given table.
  - INSERT trigger: logs the full row as JSON via `json_object(...)` over known columns.
  - UPDATE trigger: logs the full NEW row as JSON.
  - DELETE trigger: logs with `data = NULL`.
  - Trigger names follow a convention: `_sync_track_{tableName}_{operation}`.
  - Idempotent: uses `CREATE TRIGGER IF NOT EXISTS`.
- [ ] Install triggers on core tables at schema init time: `rank`, `joins`, `matrix`, `matrix_columns`. The device_id for triggers is read from `_sync_state`.
- [ ] Install triggers dynamically on `mx_{id}_data` tables when a matrix is created (`createMatrix`, `ensureRootMatrix`). The trigger column list is derived from `matrix_columns` for that matrix.
- [ ] Handle `addColumn` / `removeColumn` / `renameColumn`: when a matrix's schema changes, drop and recreate the data table's changelog triggers so the JSON serialization reflects the current columns.
- [ ] Closure tables are **not** change-tracked -- they are derived from rank and rebuilt after remote changes. Confirm no triggers are installed on `mx_{id}_closure`.
- [ ] Tests: insert a row, verify a changelog entry appears with correct table_name, row_id, operation='INSERT', and data containing the full row JSON. Update a row, verify 'UPDATE' entry. Delete a row, verify 'DELETE' entry with data=NULL. Verify device_id is populated correctly. Add a column to a matrix, insert a row, verify the new column appears in the changelog JSON.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 4. Changeset abstraction

The sync engine works with changesets -- serializable descriptions of what changed -- without knowing the trigger mechanics. This is the seam between the change-tracking layer and the sync/transport layer.

- [ ] Define the changeset types in `src/core/sync-types.ts`:
  ```typescript
  type ChangeEntry = {
    table: string
    rowId: number
    operation: 'INSERT' | 'UPDATE' | 'DELETE'
    timestamp: string
    data: Record<string, unknown> | null
  }

  type Changeset = {
    deviceId: string
    fromSeq: number
    toSeq: number
    entries: ChangeEntry[]
  }

  type ApplyResult = {
    applied: number
    conflicts: ConflictRecord[]
  }
  ```
- [ ] Implement `getLocalChanges(db, sinceSeq): Changeset` in `sync.ts`:
  - Queries `_sync_changelog` for entries with `seq > sinceSeq` from the local device.
  - Reads device_id from `_sync_state`.
  - Returns a `Changeset` with the range `[sinceSeq+1, maxSeq]`.
- [ ] Implement `getLastSeq(db): number` -- reads the max `seq` from `_sync_changelog`.
- [ ] Store `last_uploaded_seq` in `_sync_state` to track what has been uploaded.
- [ ] Tests: insert several rows across different tables, call `getLocalChanges(0)`, verify the changeset contains all entries in order. Call `getLocalChanges(N)` where N is a mid-point seq, verify only later entries are returned. Verify `getLastSeq` returns the correct value.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 5. Conflict detection and resolution

When applying remote changes, detect conflicts (same row modified locally since last sync with that device) and resolve via LWW. Preserve the losing version.

- [ ] Create `_sync_conflicts` table in `initMatrixSchema`:
  ```sql
  CREATE TABLE IF NOT EXISTS _sync_conflicts (
    id INTEGER PRIMARY KEY DEFAULT (abs(random())),
    table_name TEXT NOT NULL,
    row_id INTEGER NOT NULL,
    winner TEXT NOT NULL CHECK (winner IN ('local', 'remote')),
    losing_data TEXT NOT NULL,
    winning_data TEXT NOT NULL,
    detected_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved INTEGER NOT NULL DEFAULT 0
  ) STRICT;
  ```
- [ ] Implement `applyRemoteChanges(db, changeset): ApplyResult` in `sync.ts`:
  - For each entry in the changeset:
    - **Conflict check:** query `_sync_changelog` for local modifications to the same `(table_name, row_id)` since the last sync with the remote device (tracked per-device in `_sync_state` as `last_acked_seq_{deviceId}`).
    - **No conflict:** apply the change directly (INSERT/UPDATE/DELETE on the target table).
    - **Conflict detected:** compare timestamps. The newer edit wins (LWW). Save both versions to `_sync_conflicts`. Apply the winner.
  - **INSERT handling:** deserialize `data` JSON and execute `INSERT OR REPLACE` on the target table.
  - **UPDATE handling:** deserialize `data` JSON and execute `UPDATE` with the full row data.
  - **DELETE handling:** execute `DELETE` on the target table.
  - Disable change-tracking triggers during remote apply (to avoid re-logging remote changes as local). Use a session-scoped flag or temporarily drop/recreate triggers. Alternatively, use a `_sync_applying` flag in `_sync_state` that the triggers check.
  - After all entries are applied: if any entries touched the `rank` table, trigger a closure rebuild for the affected matrixes (task 6).
  - Update per-device high-water mark in `_sync_state`.
  - Return `ApplyResult` with count of applied changes and any conflict records.
- [ ] Implement the trigger-suppression mechanism. Preferred approach: the triggers check a runtime flag so that changes applied during remote sync are not re-logged. Options:
  - A `TEMP` table with a single row that triggers inspect via `EXISTS`.
  - A custom SQLite function (`sync_is_applying()`) that returns a flag set by TypeScript before/after apply.
  - Evaluate and pick the simplest reliable approach.
- [ ] Tests:
  - Apply a remote INSERT for a row that doesn't exist locally -- verify row appears.
  - Apply a remote UPDATE for a row with no local modifications -- verify row updated, no conflict.
  - Apply a remote UPDATE for a row that was also locally modified (set up by inserting, modifying locally, then applying a remote change with a newer timestamp) -- verify LWW picks remote, conflict record saved with local as loser.
  - Same scenario but local timestamp is newer -- verify LWW picks local, conflict record saved with remote as loser.
  - Apply a remote DELETE for a row edited locally -- verify conflict detection.
  - Verify remote changes do NOT appear in `_sync_changelog` (trigger suppression works).
  - Verify per-device high-water marks are updated.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 6. Closure rebuild after remote rank changes

When remote changes modify the `rank` table (reordering, reparenting on another device), the local closure tables may be stale. Rather than change-tracking the closure table (high-volume derived data), rebuild it from rank after applying remote changes.

- [ ] Implement `rebuildClosure(db, matrixId)` in `matrix.ts`:
  - Drops all rows in `mx_{matrixId}_closure`.
  - Scans `rank` for all rows belonging to the matrix, ordered by key.
  - Reconstructs the full closure table by walking the rank key hierarchy: for each row, derive its parent from the rank key prefix structure, then insert the self-reference and all ancestor relationships.
  - Runs as a single transaction.
- [ ] Wire into `applyRemoteChanges`: after applying a batch, collect the set of matrix IDs whose rank entries were modified, and call `rebuildClosure` for each.
- [ ] Tests: create a matrix with a hierarchy (parent + children + grandchildren). Manually modify rank entries to simulate a remote reparent (move a child to a different parent by rewriting its rank key prefix). Call `rebuildClosure`. Verify the closure table reflects the new hierarchy (correct ancestors, correct depths). Verify the outline query returns correct results after rebuild.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 7. Changelog retention

The changelog doubles as per-row version history and should not grow unbounded.

- [ ] Implement `compactChangelog(db)` in `sync.ts`:
  - Retention policy: keep all entries from the last N days (configurable, default 30).
  - Per-row cap: always keep the last M versions per `(table_name, row_id)` pair (configurable, default 10).
  - Only compact entries that all known devices have acknowledged (check per-device high-water marks in `_sync_state`).
  - Delete entries that are older than the retention window, exceed the per-row cap, and are below all devices' acknowledged seq.
- [ ] Wire into a periodic maintenance path: for now, expose `compactChangelog` as a worker message so it can be called on demand or on a timer. The sync engine (Phase 10) will call it automatically.
- [ ] Tests: create a matrix, insert and update a row many times (exceeding the per-row cap), run compaction, verify only the last M entries per row remain. Verify entries within the retention window are preserved regardless of count. Verify entries above a device's high-water mark are preserved (not compacted away before the device has seen them).
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

---

## Task dependency order

```
1. Globally unique IDs
   │
   └─► 2. Device entropy in rank keys
          │
          └─► 3. Change tracking infrastructure
                 │
                 ├─► 4. Changeset abstraction
                 │      │
                 │      └─► 5. Conflict detection + resolution
                 │             │
                 │             └─► 6. Closure rebuild after remote changes
                 │
                 └─► 7. Changelog retention
```

Tasks are strictly sequential: each builds on the previous. Task 7 (changelog retention) branches off task 3 and can proceed in parallel with 4-6.

---

## Decisions and scope boundaries

- **ID generation:** `abs(random())` for 63-bit positive integers. No UUID strings -- integer PKs preserve SQLite's rowid optimization and keep JOINs fast. If collisions become a concern (they won't at personal-app scale), switch to a stronger random source later.
- **Trigger-based change tracking, not cr-sqlite:** The `ChangeTracker` abstraction means we can swap in cr-sqlite later if needed. For now, SQLite triggers are simpler, require no alternative WASM build, and are fully under our control. See [Sync.md - Research context](Sync.md#research-context).
- **LWW conflict resolution:** Row-level last-write-wins by timestamp. Acceptable for a single-user-multiple-devices scenario. Field-level merge is a future enhancement that the full-row-data format supports without schema changes.
- **Closure tables not change-tracked:** Derived from rank. Rebuilt after remote rank changes. Avoids tracking a high-volume table with BLOB keys.
- **No live sync in this phase.** File storage, Dropbox integration, the sync engine, and sync UI are deferred to [Phase 10](Phase-10.md). This phase establishes the infrastructure so that all data mutations from Phase 4 onward are tracked and sync-safe.
- **No file storage in this phase.** The `files` and `file_attachments` tables, OPFS file I/O, and attachment UI are deferred to Phase 10.

---

## Done criteria

All seven task groups complete. Entity IDs are globally unique random integers. Device identity is established and incorporated into rank key generation. Change tracking triggers log all mutations to the changelog. The changeset abstraction supports exporting local changes and importing remote changes with LWW conflict resolution. Closure tables can be rebuilt from rank after remote changes. Changelog retention keeps the changelog bounded. All data mutations from this point forward are tracked. `npm run typecheck && npm run lint && npm run test:run` all pass.
