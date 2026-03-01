# Storage, files, and sync

The storage and sync layer sits beneath the core, managing local persistence (SQLite + file store in OPFS), change tracking, and continuous background synchronization with a remote provider. See [Architecture](./Architecture.md) for how this layer fits into the overall system.

## Storage model

Two local stores, both in OPFS, both mirrored to a remote provider:

- **SQLite database** (`/hila-db.sqlite3` in OPFS) -- all structured data.
- **File store** (`/hila-files/{hash[0:2]}/{hash}` in OPFS) -- content-addressed binary files (images, PDFs, etc.).

Both stores are authoritative. Remote is a mirror, not a master. Either side may be ahead at any moment:

- Local ahead: new file just added, not yet uploaded.
- Remote ahead: OPFS evicted a file, or a new device is connecting for the first time.

## Globally unique IDs

All entity IDs must be globally unique across devices. The standard SQLite `INTEGER PRIMARY KEY` auto-increment produces sequential IDs that collide when two devices create rows independently.

**Solution:** Replace auto-increment with random large integers (`abs(random())`, producing 63-bit positive values). Birthday paradox: ~3 billion rows needed before a 50% collision chance -- negligible risk for a personal note-taking app.

This applies to:

- Data table row IDs (`mx_{id}_data.id`).
- Matrix IDs (`matrix.id`).
- Any other auto-increment integer PKs.

For rank keys (BLOB), the `between()` function incorporates device-specific entropy (a few bytes derived from the device ID appended when generating new key segments) to prevent two devices from producing identical keys when inserting between the same siblings.

This is a prerequisite for all sync work and should be implemented first.

## Change tracking

Trigger-based changelog on all tracked tables. Every INSERT/UPDATE/DELETE fires a trigger that logs to `_sync_changelog`:

```sql
CREATE TABLE _sync_changelog (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  table_name TEXT NOT NULL,
  row_id INTEGER NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  data TEXT -- full row as JSON for INSERT/UPDATE; NULL for DELETE
) STRICT;

CREATE TABLE _sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
-- Stores: device_id, last_uploaded_seq, per-device high-water marks
```

Properties:

- **Full row data** stored (not deltas) -- makes LWW conflict resolution trivial (just overwrite with the newer version).
- Triggers added dynamically when matrixes are created (on `mx_{id}_data` tables).
- Also on core tables: `rank`, `joins`, `matrix`, `matrix_columns`, `files`, `file_attachments`.
- Closure tables are **not** change-tracked -- they are derived from rank and rebuilt after applying remote changes. This avoids tracking a high-volume derived table and sidesteps BLOB-in-composite-key serialization complexity.
- Sync triggers add a small overhead to every write operation. This is acceptable for the app's write frequency (note-taking, not high-throughput). The triggers execute inside the SQLite engine as part of the same transaction, so they don't add round trips.

**Closure rebuild:** After applying a batch of remote changes that touch the `rank` table, the sync engine triggers a closure table rebuild for affected matrixes. This is a one-time cost per sync batch, not per-row.

**Changelog retention:** The changelog is not aggressively compacted. It serves double duty as **per-row version history**. Retention policy: keep all entries for the last N days (configurable, default 30), plus always keep the last M versions per (table, rowid) pair. Compaction runs periodically, removing entries older than the retention window that exceed the per-row cap and that all known devices have acknowledged.

**Device identity:** Each app installation generates a UUID on first run, stored in `_sync_state`. This identifies the source of changes.

## Conflict detection and resolution

**When conflicts occur:** A conflict exists when `applyRemoteChanges` processes a change for (table, rowid) and the local `_sync_changelog` contains a modification to the same (table, rowid) since the last sync with that device.

**Default resolution:** LWW (last-write-wins) by timestamp. The newer edit wins and is applied. This is correct for the vast majority of cases with a single user across multiple devices.

**Conflict retention:** The losing version is never discarded. It is saved to `_sync_conflicts`:

```sql
CREATE TABLE _sync_conflicts (
  id INTEGER PRIMARY KEY,
  table_name TEXT NOT NULL,
  row_id INTEGER NOT NULL,
  winner TEXT NOT NULL CHECK (winner IN ('local', 'remote')),
  losing_data TEXT NOT NULL,   -- full row JSON of the version that lost
  winning_data TEXT NOT NULL,  -- full row JSON of the version that won
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved INTEGER NOT NULL DEFAULT 0
) STRICT;
```

### Conflict scenarios

- **Same row content edited on two devices.** LWW picks the newer timestamp. Losing version saved to `_sync_conflicts`. The natural table separation in our schema helps -- content (data table) and position (rank table) are independent rows, so editing text on one device and moving the row on another produces no conflict at all.
- **Row deleted on one device, edited on another.** Treated as a conflict. If delete is newer, the row is deleted but the edited version is preserved in `_sync_conflicts` and can be restored. If edit is newer, the row survives. Soft deletes (deferred enhancement) would make this cleaner.
- **Structural conflicts (reordering/reparenting).** LWW on the rank table entry. The row ends up in one position. No data loss, just potentially unexpected placement that the user can fix.
- **Row creation on both devices.** No conflict due to random ID generation. Each device produces unique IDs.
- **Schema conflicts (same column name added on both devices).** LWW on the `matrix_columns` row. Rare for a single user.

### Conflict UI tiers

- **Tier 1 (ships with sync):** Conflict detection + retention in `_sync_conflicts`. No UI initially -- data is preserved for recovery.
- **Tier 2 (add when face system exists):** Visual indicator on rows with unresolved conflicts (small icon or colored border). Clicking shows both versions for user to choose or manually merge.
- **Tier 3 (deferred):** Full version history UI -- browse all past versions of any row via the changelog. "Revert to this version" action.
- **Tier 4 (deferred):** Soft deletes (`deleted_at` column on data tables) to improve delete-vs-edit conflict resolution.

## Changeset abstraction

The sync engine works with **changesets** -- serializable descriptions of what changed -- without knowing how they are produced or how conflicts are resolved. This is the seam between the sync/transport layer and the change-tracking layer.

```typescript
type ChangeEntry = {
  table: string
  rowId: number | string
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

type ChangeTracker = {
  getLocalChanges(sinceSeq: number): Promise<Changeset>
  applyRemoteChanges(changeset: Changeset): Promise<ApplyResult>
  getLastSeq(): Promise<number>
}

type ApplyResult = {
  applied: number
  conflicts: ConflictRecord[]
}
```

The initial `ChangeTracker` implementation uses the trigger-based change logging described above. A future cr-sqlite-based implementation could use `crsql_changes` to produce and consume changesets in the same format, plugging into the same sync engine (see [Future extensibility](#future-extensibility)).

## File management

### Schema

```sql
CREATE TABLE files (
  hash TEXT PRIMARY KEY,        -- SHA-256 hex
  name TEXT NOT NULL,           -- original filename
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,        -- bytes
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  local_status TEXT NOT NULL DEFAULT 'present',  -- 'present' | 'absent'
  remote_status TEXT NOT NULL DEFAULT 'pending'  -- 'pending' | 'synced'
) STRICT;

CREATE TABLE file_attachments (
  matrix_id INTEGER NOT NULL,
  row_id INTEGER NOT NULL,
  file_hash TEXT NOT NULL REFERENCES files(hash),
  attached_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (matrix_id, row_id, file_hash)
) STRICT;
```

### Storage

**Content-addressed:** Files are named by their SHA-256 hash. Automatic deduplication. Immutable once written.

**OPFS layout:** `/hila-files/{first 2 hex chars}/{full hash}` -- directory sharding avoids flat listings with many files.

**Operations:** Main thread handles OPFS file I/O via async `FileSystemDirectoryHandle` APIs. Worker handles DB metadata (files/file_attachments table operations). Since files are content-addressed (immutable once written), concurrent OPFS access from main thread and worker is safe.

### Attachment model

Files are associated with rows via `file_attachments` (not inline in ProseMirror). The outline face shows attached files as a list or thumbnail strip below or beside the row's text content. Clicking previews or downloads the file.

### File sync

Hybrid strategy -- metadata eager, content lazy:

- File metadata (the `files` table rows) syncs with the database changelog like any other table.
- File content syncs separately:
  - For files with `remote_status = 'pending'`: upload content from OPFS to remote `files/{hash}`.
  - For files with `local_status = 'absent'` that are needed (attached to visible rows): download from remote `files/{hash}` to OPFS on demand, with a loading indicator.
  - "Download all" option: eagerly fetch all remote files that aren't in local OPFS.

## Sync engine

The sync engine runs as a service in the **main thread**, coordinating between:

- The SQLite worker (for changeset reads via `ChangeTracker` and applying remote changes).
- OPFS (for file I/O).
- The network (provider API via `fetch`).

```
Main Thread                          SQLite Worker
+-----------------------+            +----------------------+
|  Sync Engine          |<-- write ->|  ChangeTracker       |
|  - Changeset upload   |  notified  |  (_sync_changelog    |
|  - Remote polling     |            |   trigger-populated) |
|  - Changeset apply    |            |                      |
|  - File sync          |            |                      |
+-----------+-----------+            +----------------------+
            |
            v
    SyncProvider (Dropbox, S3, ...)
```

The worker already sends write-invalidation notifications for reactive queries. The sync engine piggybacks on these: when a write notification fires, the sync engine knows there may be new changelog entries to upload.

## Sync protocol

### Remote storage layout

Dropbox folder structure (under the app's scoped folder):

```
/Apps/Hila/
  db/
    snapshot.sqlite3          -- periodic full database snapshot
    snapshot.meta.json        -- {device_id, seq, timestamp}
  changes/
    {device_id}_{seq_from}_{seq_to}.json  -- changeset files
  files/
    {hash}                    -- content-addressed file mirror
  state/
    devices.json              -- {device_id: last_acked_seq, ...}
```

### Upload flow (local to remote)

1. Write-notification fires from worker.
2. Sync engine debounces briefly (1-2s of quiet, or max 5s).
3. Calls `changeTracker.getLocalChanges(lastUploadedSeq)` to get pending changeset.
4. Serializes as JSON, uploads to `changes/{device_id}_{from}_{to}.json`.
5. Updates `state/devices.json` with new high-water mark.

### Download flow (remote to local)

1. Long-poll provider (`watchChanges`) for changes in `changes/` directory.
2. When changes detected: list new changeset files from other devices.
3. Download and parse changeset files.
4. Call `changeTracker.applyRemoteChanges(changeset)` for each (handles conflict resolution internally).
5. If rank table was modified: trigger closure rebuild for affected matrixes.
6. Update local high-water marks in `_sync_state`.

### Periodic snapshot

Every N sync cycles (or on user request), export the full SQLite database and upload as `db/snapshot.sqlite3`. This enables fast bootstrapping of new devices without replaying the full changelog.

## Provider interface

Abstract the remote storage behind an object-store interface:

```typescript
type SyncProvider = {
  list(prefix: string): Promise<{ key: string; lastModified: Date; size: number }[]>
  get(key: string): Promise<Uint8Array | null>
  put(key: string, data: Uint8Array, options?: { overwrite?: boolean }): Promise<void>
  delete(key: string): Promise<void>
  watchChanges(
    prefix: string,
    cursor: string | null,
  ): Promise<{ cursor: string; hasChanges: boolean }>
}
```

The `watchChanges` method abstracts over Dropbox's long-poll. For S3 (future), this would be polling-based.

## Dropbox integration

The first sync provider implementation.

- **Auth:** OAuth 2.0 PKCE flow (no server needed). Register a Dropbox app with scopes: `files.content.write`, `files.content.read`, `files.metadata.write`, `files.metadata.read`.
- **Token management:** Access + refresh tokens stored in `_sync_state` table (or localStorage for pre-DB-init access). Auto-refresh on expiry.
- **App folder:** Dropbox "App folder" permission (scoped to `/Apps/Hila/` -- no access to user's other files).
- **Long-poll:** `POST /2/files/list_folder/longpoll` with cursor for continuous change detection. Timeout 60-120s, restart on return.
- **Upload:** `POST /2/files/upload` for files under 150MB. `upload_session` for larger files (unlikely for changesets, possible for large file attachments).
- **Batch operations:** `POST /2/files/upload_session/finish_batch` for uploading multiple files efficiently.

## Research context

The sync layer design is informed by a survey of off-the-shelf SQLite sync solutions:

- **cr-sqlite (`@vlcn.io/crsqlite-wasm`):** The strongest off-the-shelf option. A SQLite extension adding CRDT-based merge with a transport-agnostic design: extract changes via `crsql_changes`, ship them however you want, apply on the other side. Column-level CRDTs merge non-conflicting field edits automatically. Not adopted immediately because it requires replacing `@sqlite.org/sqlite-wasm` with a different WASM build (different async API), the npm package hasn't been published since December 2023, it has a single primary maintainer, and BLOB primary key support is unverified against our schema. Kept as an upgrade path -- the `ChangeTracker` abstraction means swapping in cr-sqlite would only change the changeset backend.
- **SQLite Sync (sqliteai):** CRDT-based, actively maintained, but oriented toward their SQLite Cloud service. Custom transport support is unclear.
- **ElectricSQL, Turso/libSQL, PowerSync, Evolu:** All require a server component or cloud service. Disqualified for our "sync via user-owned storage, no server" model.
- **SQLite Session Extension:** Not available in standard WASM builds (requires compile-time flags, adds ~200KB to WASM binary, binding work incomplete).

## Future extensibility

- **cr-sqlite upgrade:** Swap `@sqlite.org/sqlite-wasm` for `@vlcn.io/crsqlite-wasm`, implement `ChangeTracker` against `crsql_changes`. The sync engine, provider layer, file storage, and UI remain unchanged. This gives column-level CRDT merge and eliminates the custom trigger/changelog code. Defer until cr-sqlite publishes a WASM build with OPFS support, or the LWW approach demonstrably loses edits in practice.
- **Version history UI:** The changelog already retains history. Add a UI to browse past versions of any row, with "revert to this version" action.
- **S3-compatible provider:** Implement `SyncProvider` for S3. Replace `watchChanges` with polling (`ListObjectsV2` with `StartAfter`). Auth via user-provided credentials.
- **Field-level merge:** The changeset format stores full row data, so a field-level merge strategy (compare individual columns, merge non-conflicting changes) can be added without format changes. Middle ground between row-level LWW and full CRDTs.
- **Soft deletes:** Add `deleted_at` column to data tables for better delete-vs-edit conflict handling and undo support.
- **Inline files in ProseMirror:** Add ProseMirror node types (image, file-embed) that reference file hashes. The storage/sync layer doesn't change; only the UI rendering does.
