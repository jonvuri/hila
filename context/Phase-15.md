# Phase 15 -- Live sync, files, and Dropbox

Concrete tasks for Phase 15. See [Plan.md](Plan.md) for context and objectives, and [Sync.md](Sync.md) for the full specification.

This phase builds on the sync-readiness infrastructure from [Phase 3](Phase-3.md) (unique IDs, change tracking, changeset abstraction, conflict detection) and adds the live pieces: content-addressed file storage, file attachments on outline rows, the sync engine coordinator, the Dropbox provider, and the sync UI. By the end, data flows continuously between devices via Dropbox.

Ordered by dependency: file storage first (independent of sync transport), then provider interface and Dropbox, then the sync engine that ties everything together, then UI on top.

---

## 1. File storage layer

Content-addressed file storage in OPFS for binary attachments (images, PDFs, etc.). File metadata lives in SQLite; file content lives in OPFS.

- [ ] Create `files` table in `initMatrixSchema`:
  ```sql
  CREATE TABLE IF NOT EXISTS files (
    hash TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    local_status TEXT NOT NULL DEFAULT 'present',
    remote_status TEXT NOT NULL DEFAULT 'pending'
  ) STRICT;
  ```
- [ ] Create `file_attachments` table:
  ```sql
  CREATE TABLE IF NOT EXISTS file_attachments (
    matrix_id INTEGER NOT NULL,
    row_id INTEGER NOT NULL,
    file_hash TEXT NOT NULL REFERENCES files(hash),
    attached_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (matrix_id, row_id, file_hash)
  ) STRICT;
  ```
- [ ] Install change-tracking triggers on `files` and `file_attachments` (using the infrastructure from Phase 3).
- [ ] Implement OPFS file operations in a new `src/core/file-store.ts` module (main thread, async):
  - `storeFile(content: ArrayBuffer, name: string, mimeType: string): Promise<FileRecord>` -- SHA-256 hash the content, write to OPFS at `/hila-files/{hash[0:2]}/{hash}`, insert metadata row into `files` table (via worker message). Returns the file record including hash.
  - `readFile(hash: string): Promise<ArrayBuffer | null>` -- read from OPFS. Returns null if the file is absent locally.
  - `deleteLocalFile(hash: string): Promise<void>` -- remove from OPFS, update `local_status` to 'absent'.
  - `fileExists(hash: string): Promise<boolean>` -- check OPFS.
  - OPFS directory sharding: use the first 2 hex chars of the hash as a subdirectory to avoid flat listings with many files.
- [ ] Add worker message types for file metadata operations:
  - `insertFileRecord` -- inserts into the `files` table.
  - `insertFileAttachment` -- inserts into `file_attachments`.
  - `deleteFileAttachment` -- removes from `file_attachments`.
  - `getFileAttachments(matrixId, rowId)` -- returns attached file metadata.
  - `getFileRecord(hash)` -- returns a single file's metadata.
- [ ] SHA-256 hashing: use the Web Crypto API (`crypto.subtle.digest('SHA-256', buffer)`) available in both main thread and workers.
- [ ] Tests: store a file, verify hash is correct (compare against known SHA-256 of test content). Read it back, verify content matches. Store the same content twice, verify deduplication (same hash, single OPFS file). Delete, verify OPFS file removed and `local_status` updated. Attach a file to a row, query attachments, verify the association.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 2. Attachment UI

File drop/paste/select on outline rows. Attachment display and preview.

- [ ] Add a file input mechanism to the outline:
  - **Drop zone:** each `OutlineRow` (or the `OutlineFace` as a whole) accepts file drops. On drop, call `storeFile` and then `insertFileAttachment` for the target row.
  - **Paste:** handle `paste` events containing files (e.g. pasted images) in the ProseMirror editor. Intercept via a ProseMirror plugin or a DOM paste handler on the row container.
  - **File picker:** a button or keyboard shortcut to open a native file picker dialog. On selection, store and attach.
- [ ] Attachment display on outline rows:
  - Below (or beside) each row's text content, show a list of attached files.
  - For images: render inline thumbnails (small, e.g. 48px height).
  - For non-images: render a file icon with the filename and size.
  - The attachment list is driven by a reactive query on `file_attachments` joined with `files` for the row's `(matrix_id, row_id)`.
- [ ] Click-to-preview/download:
  - Clicking a thumbnail opens a larger preview (modal or lightbox for images).
  - Clicking a non-image file triggers a download (create a blob URL from the OPFS content and trigger a download link).
  - If `local_status = 'absent'`, show a "downloading..." indicator and fetch from remote (once sync is wired).
- [ ] Remove attachment: a small "x" button on each attachment to remove the association (delete from `file_attachments`; the file itself stays in `files` for deduplication and other references).
- [ ] Tests (Playwright): drop a file onto a row, verify the attachment appears. Click the attachment, verify preview/download. Remove the attachment, verify it disappears.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 3. Provider interface

Abstract the remote storage behind an object-store interface so the sync engine is transport-agnostic.

- [ ] Define the `SyncProvider` type in `src/core/sync-types.ts`:
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
- [ ] Document the remote storage layout convention (in code comments on the type):
  ```
  /db/snapshot.sqlite3          -- periodic full database snapshot
  /db/snapshot.meta.json        -- {device_id, seq, timestamp}
  /changes/{device_id}_{seq_from}_{seq_to}.json  -- changeset files
  /files/{hash}                 -- content-addressed file mirror
  /state/devices.json           -- {device_id: last_acked_seq, ...}
  ```
- [ ] Run `npm run typecheck && npm run lint` -- all pass

## 4. Dropbox provider

The first concrete `SyncProvider` implementation.

- [ ] Register a Dropbox app with scopes: `files.content.write`, `files.content.read`, `files.metadata.write`, `files.metadata.read`. App folder permission (scoped to `/Apps/Hila/`).
- [ ] Implement OAuth 2.0 PKCE flow in `src/sync/dropbox-auth.ts`:
  - Generate code verifier + code challenge.
  - Open Dropbox authorization URL in a popup or redirect.
  - Handle the callback, exchange the authorization code for access + refresh tokens.
  - Store tokens in `_sync_state` table (access_token, refresh_token, token_expiry).
  - Auto-refresh on expiry: before any API call, check token_expiry; if expired, use refresh_token to get a new access_token.
- [ ] Implement `DropboxProvider` in `src/sync/dropbox-provider.ts` implementing `SyncProvider`:
  - `list(prefix)`: `POST /2/files/list_folder` with path = `/` + prefix. Handle pagination via `list_folder/continue`.
  - `get(key)`: `POST /2/files/download` with path = `/` + key. Return content as `Uint8Array`.
  - `put(key, data)`: `POST /2/files/upload` with path = `/` + key. Use `mode: 'overwrite'` or `'add'` based on options.
  - `delete(key)`: `POST /2/files/delete_v2` with path = `/` + key.
  - `watchChanges(prefix, cursor)`:
    - If no cursor: `POST /2/files/list_folder` to get initial cursor, return `{ cursor, hasChanges: true }`.
    - If cursor provided: `POST /2/files/list_folder/longpoll` with the cursor. Timeout 60s. Returns whether changes occurred. Then `list_folder/continue` to get the new cursor.
  - Handle Dropbox error responses (rate limiting with `Retry-After`, auth errors triggering re-auth).
  - For large files (>150MB): use upload sessions. Unlikely for changesets but possible for large file attachments.
- [ ] Tests: unit tests with mocked fetch for each provider method. Verify correct Dropbox API endpoints, headers, and request bodies. Verify token refresh flow. Verify error handling (rate limit, auth expiry).
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 5. Sync engine

The main-thread coordinator that ties together the change tracker, file store, and provider to perform continuous background sync.

- [ ] Implement `SyncEngine` class in `src/sync/sync-engine.ts`:
  - Constructor takes: a reference to the worker client (for changeset operations), the file store, and a `SyncProvider` (or null if not connected).
  - Exposes: `start()`, `stop()`, `forceSync()`, `getStatus(): SyncStatus`.
  - `SyncStatus`: `{ state: 'idle' | 'syncing' | 'error' | 'disconnected', lastSyncAt: string | null, pendingChanges: number, error: string | null }`.

- [ ] **Upload flow:**
  1. Listen for write-invalidation notifications from the worker (piggyback on the existing notification mechanism).
  2. Debounce: wait for 1-2s of quiet, or max 5s since first notification.
  3. Call `getLocalChanges(lastUploadedSeq)` via the worker.
  4. Serialize the changeset as JSON, upload to `changes/{device_id}_{from}_{to}.json` via the provider.
  5. Upload any files with `remote_status = 'pending'`: read content from OPFS, upload to `files/{hash}` via the provider.
  6. Update `last_uploaded_seq` in `_sync_state` and `state/devices.json` on the remote.

- [ ] **Download flow:**
  1. Call `provider.watchChanges('changes/', cursor)` in a loop (long-poll).
  2. When changes detected: `provider.list('changes/')` to find new changeset files from other devices.
  3. Download and parse each changeset file.
  4. Call `applyRemoteChanges(changeset)` via the worker for each changeset.
  5. Download any newly-referenced files that are `local_status = 'absent'` and attached to visible rows (lazy file sync).
  6. Update local high-water marks in `_sync_state`.

- [ ] **Periodic snapshot:**
  - Every N sync cycles (configurable, default 50), or on explicit user request:
    - Export the full SQLite database as a binary blob (via the worker -- `sqlite3_serialize` or a file copy from OPFS).
    - Upload as `db/snapshot.sqlite3`.
    - Upload `db/snapshot.meta.json` with `{ device_id, seq, timestamp }`.
  - Snapshot enables fast bootstrapping of new devices.

- [ ] **Changelog compaction:** call `compactChangelog` (from Phase 3) periodically -- e.g. after every snapshot or every N sync cycles.

- [ ] **Error handling and retry:**
  - On network errors: exponential backoff (1s, 2s, 4s, ..., max 60s).
  - On auth errors: pause sync, surface to UI as "re-authentication needed".
  - On conflict during apply: handled by `applyRemoteChanges` (LWW), not the engine.

- [ ] **Lifecycle:**
  - `start()`: begin the upload listener and download long-poll loop.
  - `stop()`: cancel pending uploads, close long-poll, flush any pending changes.
  - The engine is created in `App.tsx` (or a top-level provider) and started when a sync provider is configured.

- [ ] Add worker message types for sync operations:
  - `getLocalChanges(sinceSeq)` → returns `Changeset`.
  - `applyRemoteChanges(changeset)` → returns `ApplyResult`.
  - `getLastSeq()` → returns `number`.
  - `getSyncState(key)` / `setSyncState(key, value)` → read/write `_sync_state`.
  - `exportDatabase()` → returns the full database as `ArrayBuffer`.

- [ ] Tests: mock a `SyncProvider` in-memory. Verify upload flow: make local changes, trigger sync, verify changeset file uploaded to provider with correct format. Verify download flow: place a changeset file in the mock provider, trigger download, verify `applyRemoteChanges` called with correct data. Verify debounce: multiple rapid writes produce a single upload. Verify periodic snapshot: after N cycles, snapshot appears in provider. Verify error handling: provider throws, engine retries with backoff.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 6. Sync UI

User-facing controls for connecting a sync provider and monitoring sync status.

- [ ] **Settings panel:**
  - A new UI panel (accessible from the app shell, e.g. a gear icon) with a "Sync" section.
  - "Connect Dropbox" button: initiates the OAuth PKCE flow. On success, shows the connected Dropbox account and a "Disconnect" button.
  - "Disconnect" button: clears tokens from `_sync_state`, stops the sync engine.
  - "Download all files" button: triggers eager download of all remote files with `local_status = 'absent'`.
  - "Force sync now" button: triggers an immediate sync cycle.

- [ ] **Sync status indicator:**
  - A small persistent indicator in the app chrome (e.g. top-right corner or status bar).
  - States: idle (checkmark), syncing (spinner), error (warning icon with tooltip), disconnected (no indicator or grayed out).
  - Shows last sync timestamp on hover.
  - Clicking opens the settings panel.

- [ ] **Conflict indicators (Tier 2, if time permits):**
  - Visual indicator on outline rows that have unresolved entries in `_sync_conflicts`.
  - Small icon or colored border on the affected row.
  - Clicking shows both versions (winning and losing) for user review.
  - "Accept" dismisses the conflict (marks `resolved = 1`).
  - This is stretch goal territory -- the data layer (conflict retention in `_sync_conflicts`) is the priority; the UI can follow.

- [ ] Tests (Playwright): open settings panel, verify "Connect Dropbox" button is visible. Verify sync status indicator renders in the correct state (mock the sync engine status). If conflict indicators are implemented: create a mock conflict, verify the indicator appears on the affected row.
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all pass

## 7. Playwright E2E tests for file and sync flows

Extend the Playwright test suite to cover the new file and sync behaviors.

- [ ] **Attachment E2E tests:**
  - Drop a file onto an outline row, verify the attachment appears below the row.
  - Drop an image, verify a thumbnail is rendered.
  - Click the thumbnail, verify a preview opens.
  - Drop a non-image file, verify the filename and icon appear.
  - Click the non-image attachment, verify a download is triggered.
  - Remove an attachment via the "x" button, verify it disappears.
  - Paste an image into a row's editor, verify it's stored as an attachment (not inline in ProseMirror).
- [ ] **Sync status E2E tests:**
  - Verify the sync status indicator is visible when a provider is connected (mock or stub the provider).
  - Verify the settings panel opens and shows sync options.
- [ ] **OAuth flow tests (if testable):**
  - The Dropbox OAuth flow involves a redirect to an external domain, making it difficult to test end-to-end in Playwright without a real Dropbox app. Consider:
    - A mock OAuth server for testing the flow mechanics (PKCE generation, token exchange).
    - Testing just the UI side: click "Connect Dropbox", verify the redirect URL is correct, mock the callback.
  - Mark these as stretch tests -- the core flow is better covered by unit tests on the auth module.
- [ ] Run `npx playwright test` -- all pass
- [ ] Run `npm run typecheck && npm run lint && npm run test:run` -- all Vitest tests still pass

---

## Task dependency order

```
1. File storage layer
   │
   └─► 2. Attachment UI
                                    ┐
3. Provider interface               │
   │                                │
   └─► 4. Dropbox provider          │
          │                         │
          └─► 5. Sync engine ◄──── 1 (needs file store)
                 │
                 └─► 6. Sync UI
                        │
                        └─► 7. Playwright E2E tests ◄── 2
```

Task 1 (file storage) and tasks 3-4 (provider interface, Dropbox) can proceed in parallel. Task 5 (sync engine) is the integration point that requires file storage and the provider. Task 2 (attachment UI) depends on task 1 but is independent of sync. Tasks 6-7 (UI, E2E) come last.

All tasks depend on Phase 3 infrastructure (unique IDs, change tracking triggers, changeset abstraction, conflict detection).

---

## Decisions and scope boundaries

- **File sync is lazy:** File metadata syncs eagerly (changelog); file content syncs on demand (download when needed, upload when pending). "Download all" is an explicit user action.
- **Attachment model is external to ProseMirror:** Files attach to rows via `file_attachments`, not as inline ProseMirror nodes. Inline file nodes (images in rich text) are a future enhancement.
- **No multi-device testing in this phase:** The sync engine is tested with mock providers. Real multi-device sync (two browser tabs, or two devices via Dropbox) is validated manually. Automated multi-device test infrastructure is deferred.
- **Snapshot format:** The periodic snapshot is a raw SQLite database file, not a custom format. This enables fast bootstrapping (just download and open) at the cost of larger snapshot files.
- **No offline queue:** The sync engine requires a network connection to the provider. If the provider is unreachable, changes accumulate locally in the changelog. When the connection resumes, the engine uploads the accumulated changeset. There is no separate offline queue -- the changelog *is* the queue.

---

## Done criteria

All seven task groups complete. The file storage layer stores content-addressed files in OPFS with metadata in SQLite. The attachment UI allows dropping/pasting files onto outline rows with display and preview. The sync engine coordinates uploads, downloads, and periodic snapshots via the Dropbox provider. The sync UI provides connection management and status indication. Local changes propagate to Dropbox within seconds. A second device receives changes via long-poll. Conflicts are detected and the losing version is preserved. Files survive OPFS eviction via remote re-download. The provider interface is clean enough that adding S3 later is straightforward. Both Vitest (file hashing, OPFS operations, sync engine with mock provider) and Playwright (attachment UI, sync status) test suites pass. `npm run typecheck && npm run lint && npm run test:run && npx playwright test` all pass.
