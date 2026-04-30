# Implementation Plan

## Target use cases

Six use cases serve as a north star. Each one proves out different slices of the architecture; together they validate the full system.

| Use case                                           | What it proves                                                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Outline with rich text**                         | Core data loop (SQLite → reactive query → UI → edit → SQLite), ProseMirror integration, rank + closure traits, virtualization, keyboard-driven UX |
| **Notes with inline references**                   | Face slot model, cross-face data sharing, `@`-references with `ref`-kind joins, trait auto-provisioning, Obsidian-like document editing     |
| **Tasks** (due dates, priority, reminders)         | Tag aspects via `#` and `own`-kind joins, scheduling infrastructure, notification system, structured data in spreadsheet view               |
| **Movie reviews** (name, rating, auto-filled date) | Tag aspects via `#` and `own`-kind joins, auto-fill/default values, custom cell renderers, lightweight structured data                      |
| **Spaced-repetition flashcards**                   | Custom face types with unique interaction models, time-based scheduling, join-based card sources                                           |
| **Micro-journaling** (timed prompts)               | Form-based faces, timed notification triggers, configurable schedules, aggregate/timeline views                                            |

### Cross-face workflows

The face slot model exists to serve concrete workflows, not as an abstraction exercise. These scenarios describe how face flexibility translates to real user value:

- **Switching faces for different tasks.** View flashcards as a compact outline for quick bulk editing of front/back text, then switch to the flashcard face for review sessions. Write outline bullets for structure, then switch to the note face to focus on longer prose for a particular item. The data stays the same; the interaction surface adapts to the task at hand.
- **Nesting faces within each other.** An outline row expands into an inline note face for writing longer content without leaving the outline context. A note embeds a live outline subtree or a live table showing filtered rows from another matrix. A project note contains an editable task table; a study guide outline contains embedded flashcard lists. Faces compose inside each other.
- **Live embedded queries.** A note includes a live, editable table of "all tasks tagged #project-X" or "all flashcards from this chapter." The embedded face is bound to a filtered query over another matrix. Edits propagate to the source. This bridges the gap between documents and databases -- structured data lives inside prose, not beside it.
- **Progressive depth.** An outline bullet expands into a full note face when focused, for writing longer prose. Collapse back to a one-line bullet. The data doesn't change -- just the rendering granularity. A bullet IS a note if you zoom in far enough. This eliminates the artificial boundary between outliners and document editors.
- **Side-by-side synchronized editing.** Two faces of the same matrix open in a split view. Edit a task's status in the table face; see the inline tag update in the outline in real time. Useful for bulk data management (table) alongside contextual editing (outline or notes).
- **Alternative visualizations.** The same task matrix viewed as a kanban board (status column mapped to lanes), a calendar (due date mapped to positions), or a table. No data duplication -- just different face types with different slot bindings. New visualization types can be added without touching the data model.

These workflows should guide the face system's design: if a design decision makes any of these harder, it's a signal to reconsider.

### Common capability threads

These threads run across multiple use cases and should be built as shared infrastructure, not per-use-case:

1. **Rich text editing** -- the foundational content surface (outline, notes, tasks, journaling all embed rich text via ProseMirror).
2. **Face slot system** -- faces declare slots, columns bind to them, overflow renders in secondary areas. Every face type uses this (outline, notes, table, flashcards).
3. **Face composition** -- nesting faces within each other, embedding live query faces in notes, progressive depth (outline bullet ↔ note). See cross-face workflows above.
4. **Trait provisioning** -- auto-provisioned, shared per-matrix metadata tables (rank, closure) requested by plugins or triggered by face application.
5. **Matrix schemas + table faces** -- structured data management as spreadsheet-like tables (tasks, reviews, SRS cards, journal entries all have typed columns).
6. **Inline references + tags** -- `@`-references (independent `ref`-kind joins) and `#`-tags (lifecycle-bound `own`-kind joins creating aspect rows). Tasks and reviews are tag aspects; SRS cards reference source material via `@`-joins. See [Architecture - Inline references](./Architecture.md#inline-references).
7. **Scheduling & time** -- time-based triggers and state machines (task reminders, SRS intervals, journal prompts).
8. **Custom faces** -- non-outline views with unique interaction (note editor, flashcard review, journal quick-entry, notification tray).
9. **Notifications** -- proactive alerts that surface across the app (task due dates, journal prompts, SRS review reminders).
10. **Op interface + MCP** -- the typed op registry, batch executor, Markdown I/O, and MCP server that make the system accessible to AI agents and external tools. See [Architecture - Operations](./Architecture.md#operations).

---

## Phased plan

Each phase delivers something usable, proves specific architectural concepts, and builds on the previous phase.

### Phase 1 -- Foundation hardening (COMPLETE)

> Detailed task list: [Phase-1.md](Phase-1.md)

Clean up the existing codebase and fill the gaps needed before real features. End state: a solid, tested core with rank and closure traits working, plus the global join table.

**Work:**

- **Rename `element` → `row`, `ordering` → `rank`** throughout schema, types, queries, and tests. Align code vocabulary with architecture docs.
- **Implement the join table.** Global `joins` table per the Traits spec, with indexes for both forward and reverse lookup. Basic insert/delete/query operations.
- **Worker resilience.** Queue messages during worker init; replay once ready. Prevents race conditions on cold start.
- **Replace RxJS with Solid reactive primitives.** The current `querySubject.ts` uses `BehaviorSubject` + `shareReplay` for replay and ref-counted lifecycle, but Solid signals and `createEffect` + `onCleanup` handle both natively. Replace with a `useQuery(sql)` hook that creates a signal-based subscription tied to component lifecycle. This also gives parameterized queries for free -- when the SQL signal changes, the effect re-runs, cleaning up the old subscription and starting a new one. Extend the worker-side `execQuery` to return results directly as a promise (currently returns `Promise<void>`).
- **Column schema management.** Matrix registry tracks column definitions (name, type, order). Support add/remove/rename column operations as SQL migrations on the data table.

**Testing:** Vitest unit and integration tests. All trait operations (rank, closure) and join table operations should have thorough tests against the SQLite database directly. The `useQuery` hook can be tested with Solid's test utilities. Worker message queuing should be tested for race condition scenarios.

---

### Phase 2 -- Outline with rich text

> Detailed task list: [Phase-2.md](Phase-2.md)

The first real user-facing feature. This is where the system becomes an app someone would actually use.

**Work:**

- **ProseMirror integration.**

  - Port and adapt the ProseMirror setup from `coastline`: `@prosemirror-adapter/solid`, custom node views as Solid components, per-row independent editor instances.
  - Schema: `doc > paragraph | heading`, marks for bold / italic / code / link. Headings with level attribute (h1-h6).
  - Store ProseMirror document state as JSON in each row's content column.
  - Custom keymap: Enter creates new sibling row, Shift-Enter is soft newline within a row.

- **Outline face.**

  - Virtualized scrolling list of ProseMirror editors (leverage existing `ScrollVirtualizer`). Consider adding a debug overlay for virtualizer window state (visible ranges, estimated sizes, scroll events) as a dev aid during development.
  - Depth-based indentation derived from closure table depth.
  - Each row is a "bullet" in the outline. Core outlining interactions:
    - **Enter** creates a new sibling row below the current one.
    - **Tab** / **Shift-Tab** indent / outdent (reparenting via rank + closure transaction).
    - **Backspace** at the start of a row merges its content into the previous row, or deletes if empty.
    - **Arrow keys** (up/down) move focus between rows. When the cursor is at the top of a row's editor, up-arrow moves to the previous row; at the bottom, down-arrow moves to the next.
  - Collapse / expand subtrees (closure-driven visibility filtering per the outline plugin spec).
  - Focus view: zoom into a subtree, breadcrumb navigation back out.

- **Drag-and-drop reordering.**

  - Within-parent reorder (rank key rewrite, no closure changes).
  - Cross-parent reparent (rank key prefix rewrite + closure table update, atomic transaction).

- **Implement reparent operations.** Complete the rank + closure combined transactions from the Traits spec that are currently stubbed.

**Testing:** This phase introduces Playwright E2E tests alongside Vitest. The outlining interactions (Enter to create row, Tab/Shift-Tab to indent/outdent, Backspace to merge/delete, arrow key navigation, collapse/expand, drag-and-drop) are nontrivial UI behaviors that need E2E coverage. Vitest continues to cover the data layer (reparent transactions, rank key correctness, closure table integrity). ProseMirror document serialization round-trips (JSON ↔ editor state) can also be tested at the unit level.

**Decisions:**

- _Rich text scope:_ Paragraphs, headings, and basic marks (bold/italic/code/link). Images, embeds, code blocks with syntax highlighting, and tables are future extensions.
- _Full-text search:_ Deferred. The ProseMirror JSON structure supports simple text extraction, so FTS5 indexing can be added later without schema changes.

---

### Phase 3 -- Sync-readiness

> Detailed task list: [Phase-3.md](Phase-3.md)
> Detailed specification: [Sync.md](Sync.md)

Core infrastructure changes to make the schema sync-safe and all data mutations trackable. No live sync, no file storage, no Dropbox -- those come in [Phase 10](#phase-10----live-sync-files-and-dropbox). The goal is to ensure that from this point forward, every data mutation is tracked and the system is ready for remote sync when the time comes.

**Work:**

- **Globally unique IDs.** Replace auto-increment integer PKs with random large integers for data tables and matrix registry. Add device-specific entropy to rank key generation (`between()`). Update all row creation code paths. This is a prerequisite for all sync work.

- **Device identity.** `_sync_state` table, device UUID generation on first run, entropy passed to rank key system.

- **Change tracking.** `_sync_changelog` table, dynamic triggers on matrix data tables and core tables (rank, joins, matrix, matrix_columns), trigger reinstallation on schema changes (add/remove/rename column). Closure tables are not tracked (derived from rank, rebuilt after remote changes).

- **Changeset abstraction.** `ChangeEntry`/`Changeset`/`ApplyResult` types, `getLocalChanges(sinceSeq)`, `getLastSeq()`, sequence tracking in `_sync_state`.

- **Conflict detection + resolution.** `_sync_conflicts` table, `applyRemoteChanges` with LWW resolution, trigger suppression during remote apply, per-device high-water marks.

- **Closure rebuild.** `rebuildClosure(matrixId)` reconstructs closure from rank key hierarchy after remote rank changes.

- **Changelog retention.** Compaction policy: time window + per-row cap + device acknowledgment.

**Testing:** Vitest for: unique ID generation (no collisions in bulk creation), change tracking (triggers fire correctly, changelog entries are accurate), changeset export/import (round-trip), conflict detection and LWW resolution (correct winner, loser preserved in `_sync_conflicts`), closure rebuild correctness after simulated remote rank changes, changelog compaction under various retention scenarios.

**Proves:** The schema is sync-safe. All data mutations are tracked with full row snapshots. Changesets can be exported and imported. Conflicts are detected and resolved with the losing version preserved. Closure tables can be reconstructed from rank. The infrastructure is ready for a live sync engine to plug into.

---

### Phase 4 -- Plugin system, faces, and notes (COMPLETE)

> Detailed task list: [Phase-4.md](Phase-4.md)

Formalize the plugin model from the outline's patterns. Build the face slot system. Introduce the notes plugin as the second consumer with wiki-links. Define how faces separate data from presentation and how the same matrix can be viewed through different face types.

### Phase 4b -- Inline references and owned joins

> Detailed task list: [Phase-4b.md](Phase-4b.md)

Retrofit the Phase 4 wiki-link implementation with the generalized inline reference system. Add `ref`/`own` join kinds to the core with cascade deletion lifecycle. Evolve the `wikilink` PM node to `inlineref` with `@`/`[[` triggers, live/empty/ghost states, and cached metadata. Add reference-type cells to the table face. Build the foundation for Phase 5's `#` tag mode.

**Work:**

- **Plugin system.**

  - Formalize registration: plugin ID, name, metadata, stored in a `plugins` table.
  - Declarative plugin definition: matrixes it creates, traits it requests, named queries, named mutations, face bindings.
  - Lifecycle hooks: `init` (called on app start or plugin enable), `destroy` (cleanup).
  - Refactor the outline into the first formal plugin using this system.

- **Trait provisioning system.**

  - Implement `ensureTrait(type, matrixId)` as the core provisioning API.
  - Idempotent: returns existing handle if the trait is already provisioned.
  - Shared: multiple consumers access the same trait tables.
  - Persistent: traits survive plugin removal.
  - Face-triggered provisioning: when a face type with trait requirements is applied to a matrix, the system auto-provisions the needed traits.

- **Face system with slots.**

  - Define the face interface: the contract between a query (data source), a face type (renderer), and slot bindings (column-to-slot mapping).
  - Face types declare named **slots** with preferred column types. Columns bind to slots via the resolution chain: explicit manual binding > name match > type+position > fallback. See [Plugins - Face slot model](./Plugins.md#face-slot-model).
  - **Overflow columns** (not bound to any slot) render in a face-type-specific secondary area.
  - Face configuration as serializable data: named query, face type, slot bindings, settings.
  - Face rendering dispatch: given a face config, resolve slot bindings and render the appropriate component.
  - **Face configuration UI**: when applying a face to a matrix, show the face's slots alongside the matrix's columns with auto-mapped bindings and override dropdowns.

- **Table face type.**

  - A general-purpose spreadsheet-like face for viewing and editing matrix data.
  - No slots (every column is a table column). The universal face and the default identity face for all matrixes.
  - Column headers with name and type. Click to rename, drag to reorder.
  - Inline cell editing: click a cell to edit, type to confirm.
  - Column type system: text, number, date, boolean, select (enum with options), reference (`ref`-kind or `own`-kind join to a row in another matrix). Each type has an appropriate editor and display renderer.
  - Add column (with type picker), delete column, add row, delete row.
  - Basic sort and filter controls.

- **Inline references plugin.**

  - Shared infrastructure for cross-matrix references in rich text and table cells, providing both `@` (reference, `ref`-kind join) and `#` (tag, `own`-kind join) modes. See [Architecture - Inline references](./Architecture.md#inline-references) and [Plugins - Inline references plugin](./Plugins.md#inline-references-plugin).
  - **ProseMirror inline node**: `{ type: 'inlineref', attrs: { targetMatrixId, targetRowId, kind, cachedTitle } }`. Renders as a linked title badge (`@`) or colored tag badge (`#`).
  - **Reference states**: live (target exists, shows current title via reactive query), empty (target doesn't exist yet, shows cached intended title), ghost (target deleted, shows cached last-known title with deletion indicator).
  - **Join table sync**: on doc save, diff inline `inlineref` nodes against join table entries. Insert new joins, remove stale joins. Removed `own`-kind joins trigger cascade deletion of the target row. Refresh `cachedTitle` attrs from current target state.
  - **Table cell reference type**: a column type holding a join to a row in another matrix. Shares UX and iconography with inline text references. `ref`-kind cells are independent foreign keys; `own`-kind cells are cascade-delete foreign keys.
  - **`@` autocomplete**: typing `@` (or `[[`) searches existing rows across matrixes. Selecting inserts a `ref`-kind inline node. Typing a nonexistent name creates an empty-state reference.
  - **Backlinks**: reverse join lookup showing all rows that reference the current row.

- **Notes plugin.**

  - Note matrix with `title` (text) and `body` (rich text, ProseMirror JSON) columns.
  - Rank trait for user-defined ordering in the note list. No closure (notes are flat).
  - **Note face** with slots: `title` (prefers text), `body` (prefers rich text). Overflow columns render in a Notion-style property panel.
  - Note list face (sidebar): scrollable list of notes with title and body preview.
  - Single-note face (main pane): title as editable heading, body as ProseMirror editor, backlinks panel below.
  - `@`-references between notes use the inline references plugin. Backlinks are reverse join lookups.

- **Cross-face data sharing demo.**

  - Apply the outline face to the note matrix. The system auto-provisions rank and closure traits.
  - `title` binds to the outline's `primary_content` slot. `body` becomes an overflow side-column.
  - Edits in either face write to the same matrix rows. This proves the face slot model and trait auto-provisioning end-to-end.

- **Admin / debug matrix browser.**

  - A built-in view (not a plugin face -- an admin surface) that lists all matrixes in the registry as simple tables.
  - Filter by plugin (which plugin created the matrix), by matrix name, or other metadata.
  - Shows raw data, trait state (rank, closure), and join state for each matrix.
  - Evolves from the existing `MatrixDebug.tsx` into a proper system-level tool.

- **Formula columns** (read-only computed columns).
  - A column whose value is a SQL expression evaluated per-row.
  - Rendered with a visual distinction (e.g. gray background) to indicate non-editability.
  - Provides the foundation for auto-fill and computed fields.

**Testing:** Vitest for plugin registration, trait provisioning (idempotent, shared, face-triggered), face config serialization, slot binding resolution, inline reference → join table sync (both `ref` and `own` kinds), cascade deletion through owned joins, reference state transitions (live/empty/ghost), formula column evaluation. Playwright for table face interactions (including reference-type cells), note face (create note, edit title/body, insert `@`-reference via autocomplete, backlinks panel), face configuration UI (slot binding), cross-face data sharing (edit in note face, verify in outline face).

**Proves:** The plugin model works for multiple real consumers (outline + notes + inline references). The face slot system cleanly separates data from presentation. The same matrix can be viewed through different face types with different slot bindings. Trait auto-provisioning works when a face is applied. Inline references use the join table with `ref`/`own` lifecycle semantics. The table face provides spreadsheet-like editing with reference-type cells. Formula columns enable computed data.

---

### Phase 5 -- Tags plugin (aspects via owned joins)

> Detailed task list: [Phase-5.md](Phase-5.md)

The tags plugin, proving cross-plugin composition through SQL and the join table's `own`-kind lifecycle semantics. Tags build on the inline references plugin from Phase 4.

**Work:**

- **Tag type creation.**

  - Each tag type is a regular matrix with a user-defined schema (columns/types).
  - Tag type registry: a plugin-managed table indicating which matrixes are tag types (used to populate `#` autocomplete).
  - Creating a new tag type (e.g. `#task`) creates a new matrix with default columns. Typing a nonexistent tag type name in `#` autocomplete offers to create it inline.

- **`#` tag mode in inline references.**

  - Extends the inline references plugin with `#` trigger and tag-specific autocomplete (searches registered tag types).
  - Typing `#task` creates a new row in the task matrix via `createDependentRow` (atomic: insert row + `own`-kind join in one transaction). The inline `inlineref` node is inserted with `kind: 'own'`.
  - Tags can appear in both outline text and note body text.
  - Rendered inline as a colored badge with the tag type name and optionally key properties (e.g. "Buy groceries `#task` ⏰ Friday").

- **Lifecycle through owned joins.**

  - Removing a `#`-tag from text (or deleting the source row) cascade-deletes the aspect row via the core's owned join lifecycle rules. No plugin-level lifecycle management needed.
  - Deleting an aspect row from the tag matrix's identity face removes the inline `#` node from the source row's text (reverse cleanup).
  - Forward lookup (row → its tags) and reverse lookup (tag type → all tagged rows) via prepared queries over the join table filtered by `kind = 'own'`.

- **Tag property panel.**

  - Clicking an inline `#`-tag opens a property editor (popover or sidebar).
  - Shows the aspect row's columns as editable fields (hydrated columns from the tag matrix).
  - Edits write back to the tag matrix; changes propagate to all faces showing the same data.

- **Tag browser face.**

  - A face listing all tag types and their instances.
  - Each tag type links to its matrix's identity face for spreadsheet-style viewing of all instances.
  - Reverse lookup: select a tag row to see all source rows that have this tag.

- **Solidify plugin API.** With multiple real consumers (outline + notes + inline references + tags), extract and formalize the plugin registration, lifecycle, and cross-plugin patterns.

**Testing:** Vitest for tag type creation, `createDependentRow` integration, cascade deletion (remove tag from text → aspect row deleted, delete source row → aspect row deleted, delete aspect row from identity face → inline node removed), forward/reverse lookup queries. Playwright for inline tag insertion (typing `#`, autocomplete interaction), tag property panel editing, tag browser navigation, lifecycle scenarios (delete row with tags, verify aspect rows are cleaned up).

**Proves:** Cross-plugin interaction through SQL and the join table with lifecycle semantics. Owned joins as a core primitive work end-to-end. Tags as aspects (not independent entities) with automatic lifecycle management. Plugin-to-plugin rendering delegation (outline/notes delegate tag rendering to inline references + tags plugin).

---

### Phase 6 -- Tasks and movie reviews (tag aspects in practice)

Concrete use of the tag system for two different real-world patterns. Each tag type is a matrix whose rows are created as owned aspects of source rows via `#`-tagging.

**Work:**

- **Task tag type.**

  - Predefined columns: `status` (select: todo/in-progress/done), `due_date` (date), `priority` (select: low/medium/high/urgent), `notes` (text).
  - Task-specific face: a filtered/sorted view of all tasks. Sort by due date, group by status, filter by priority.
  - Inline status toggling: click a checkbox-like control on the inline tag to toggle status.
  - Due date picker: click the date to open a date picker.

- **Movie review tag type.**

  - Predefined columns: `movie_name` (text), `star_rating` (number, 1-5), `entry_date` (date, auto-filled).
  - Auto-fill: `entry_date` defaults to the current date when a new review row is created. This is the first use of default/computed values on row creation.
  - Star rating widget: a custom cell renderer showing clickable stars.

- **Default values on row creation.**

  - Core support for column-level defaults (literal values or expressions like `date('now')`).
  - Applied automatically when a new row is created in any matrix that defines defaults.

- **Custom cell renderers.**
  - Column types can have custom display/edit components (star rating, status toggle, date picker).
  - Renderer registry: given a column type and optional configuration, return the appropriate component.

**Testing:** Vitest for default value application on row creation, formula/expression evaluation. Playwright for custom cell renderers (star rating click interaction, status toggle, date picker), inline task status toggling from the outline.

**Proves:** Tag aspects handle diverse structured data through owned joins. Spreadsheet-like editing works for real use cases. Custom cell renderers extend the table face. Default values reduce friction for data entry.

---

### Phase 7 -- Scheduling infrastructure and notifications

Core capability layer for all time-based features.

**Work:**

- **Scheduler service.**

  - A core service that runs while the app is open.
  - Schedule table in SQLite: `(id, fire_at, plugin_id, payload, status, recurrence)`.
  - The scheduler queries for upcoming events and uses `setTimeout` to fire them.
  - **Native cron-like recurrence.** Use a mature cron expression library in the worker to support recurring schedules (e.g. "every 2 hours", "weekdays at 9am"). Recurrence is stored per schedule entry; after firing, the scheduler computes and writes the next `fire_at` from the cron expression.
  - Plugin API for scheduling: `schedule(fireAt, payload)`, `scheduleRecurring(cron, payload)`, `cancel(id)`, `reschedule(id, newFireAt)`.

- **Notification system.**

  - Notification queue and face.
  - Toast notifications for immediate alerts.
  - Notification tray face (lightweight, always-accessible) for history and pending items.
  - Each notification links back to its source (a specific matrix row).

- **Task reminders.**

  - When a task's `due_date` is set or changed, schedule a notification.
  - Configurable reminder timing (e.g. "remind me 1 hour before", "remind me the morning of").
  - First real consumer of both the scheduler and notification system.

- **Catch-up on missed events.** When the app opens, query for any scheduled events that fired while the app was closed. Surface them as notifications.

- **PWA + Service Worker.** Register the app as a PWA so that scheduled events can fire browser notifications even when the app tab is not in the foreground. The Service Worker checks the schedule table and dispatches notifications. Clicking a notification opens or focuses the app. This is essential for task reminders, SRS nudges, and journal prompts to be useful in practice.

**Testing:** Vitest for scheduler logic (fire-at ordering, cron expression → next fire time, catch-up on missed events, cancel/reschedule). Notification dispatch can be tested at the integration level. Playwright for toast rendering, notification tray interaction, task reminder flow (set due date → notification appears).

**Proves:** Time-based scheduling works within the browser constraint, including background notification via Service Worker. Cron-like recurrence handles repeating schedules natively. Notifications surface proactively. Plugins can schedule events via lifecycle hooks. Catch-up logic handles the "app was closed" case.

---

### Phase 8 -- Spaced-repetition system

A custom face type with a unique interaction model, proving that faces can be far more than tables and outlines.

**Work:**

- **SRS plugin.**

  - Card matrix with columns: `front` (rich text), `back` (rich text), `next_review` (datetime), `interval` (number, days), `ease_factor` (number), `repetitions` (number), `status` (select: new/learning/review/suspended).
  - Cards can be standalone or created from any matrix row via a join reference (e.g. "make a flashcard from this note"). The join links the card to its source material.

- **SM-2 scheduling algorithm.**

  - Implemented as named mutations that update `interval`, `ease_factor`, `repetitions`, and `next_review` based on the user's rating.
  - Ratings: again (0), hard (1), good (2), easy (3).
  - Could be implemented as a custom SQLite function for self-contained computation, or as TypeScript orchestration. Prefer SQLite function if the math maps cleanly.

- **Flashcard review face.**

  - Shows the front of the next due card.
  - Tap/click/keyboard to reveal the back.
  - Rate buttons that trigger the SM-2 mutation and advance to the next card.
  - Session management: query all cards where `next_review <= now`, order by priority, present sequentially.
  - Session summary at end (cards reviewed, accuracy).

- **Review dashboard face.**
  - Upcoming reviews by day (forecast).
  - Historical accuracy and streak.
  - Cards by status (new, learning, review, suspended).

**Testing:** Vitest for SM-2 algorithm (interval/ease factor computation given rating sequences), card queue ordering, session completion logic. Playwright for the flashcard review flow (show front → reveal back → rate → next card → session summary).

**Proves:** Custom faces can have interaction models completely unlike outlines or spreadsheets. The face system is general enough for card-flip UIs. Scheduling integrates with the SRS algorithm. Joins link cards to source material across matrixes.

---

### Phase 9 -- Micro-journaling

Form-based faces and timed prompts, completing the use case set.

**Work:**

- **Journal plugin.**

  - Journal entry matrix: `timestamp` (datetime, auto-filled), `mood` (select: great/good/okay/rough/bad), `energy` (number, 1-5 scale), `text` (rich text), `location` (text, optional).
  - Prompt template: configurable questions that appear in the quick-entry form. Stored as plugin configuration.

- **Timed prompt system.**

  - Uses the scheduler from Phase 7 to fire prompts at configured intervals.
  - Configurable schedule: every N hours, specific times of day, or N times per day evenly spaced.
  - On prompt fire: notification with "Journal now" action that opens the quick-entry face.

- **Quick-entry form face.**

  - A compact, focused form optimized for fast input.
  - Mood picker (emoji or icon grid), energy slider, free-text field, optional tag input.
  - Submit creates a new row in the journal matrix and dismisses the form.
  - Feels lightweight and non-disruptive -- the goal is to capture a moment, not write an essay.

- **Journal timeline face.**
  - Chronological view of all journal entries.
  - Filter by date range, mood, energy level, tags.
  - Simple aggregate statistics: mood distribution over time, entry frequency, streaks.

**Testing:** Vitest for prompt schedule computation, journal entry creation with auto-filled fields, aggregate queries (mood distribution, streaks). Playwright for the quick-entry form flow (notification → open form → fill fields → submit → appears in timeline), timeline filtering.

**Proves:** Form-based faces work for structured data entry. Timed prompts create proactive engagement. The scheduling system handles recurring events. Aggregate/timeline faces show computed views over time-series data.

---

### Phase 10 -- Live sync, files, and Dropbox

> Detailed task list: [Phase-10.md](Phase-10.md)
> Detailed specification: [Sync.md](Sync.md)

Builds on Phase 3's sync-readiness infrastructure to add live sync. Content-addressed file storage, file attachments on outline rows, the sync engine coordinator, the Dropbox provider, and sync UI. By the end, data flows continuously between devices.

**Work:**

- **File storage layer.** `files` and `file_attachments` tables, OPFS file read/write, content-addressed naming (SHA-256), worker protocol for file operations.

- **Attachment UI.** File drop/paste/select on outline rows, attachment display (thumbnails, file list), click-to-preview/download.

- **Provider interface + Dropbox.** Abstract `SyncProvider` type, Dropbox implementation (OAuth 2.0 PKCE, file ops, long-poll for continuous change detection).

- **Sync engine.** Main-thread coordinator, changeset upload/download via provider, debouncing, periodic snapshot export, lazy file sync, changelog compaction.

- **Sync UI.** Settings panel (connect/disconnect Dropbox), sync status indicator, "download all files" option, conflict indicators on rows (Tier 2, if time permits).

**Testing:** Vitest for: file hashing and OPFS operations, sync engine with mock provider (upload/download round-trip, debounce, snapshot, error handling), Dropbox API calls with mocked fetch. Playwright for: attachment UI (drop file, see attachment, click to preview), sync status indicator, OAuth flow (if testable).

**Proves:** The sync layer works end-to-end. Local changes propagate to Dropbox within seconds. A second device receives changes via long-poll. Conflicts are detected and the losing version is preserved. Files survive OPFS eviction via remote re-download. The provider interface is clean enough that adding S3 later is straightforward.

---

### Phase 11 -- Op system, batch ops, and MCP server

Formalize the op interface, build the batch executor, and expose the system to external agents via MCP. See [Architecture - Operations](./Architecture.md#operations) and [Architecture - External interfaces](./Architecture.md#external-interfaces) for the design.

This phase can proceed any time after Phase 4b. The op registry (`MatrixOperationMap`) already exists; this phase formalizes it, adds the batch executor, builds the Markdown I/O layer, and ships the MCP server. Earlier phases benefit from agent access (agents can help create content, manage tasks, build outlines), so earlier is better.

**Work:**

- **Formalize the op registry.**

  - The existing `MatrixOperationMap` in `matrix-types.ts` is already the op registry. Formalize it as the single source of truth: document each op's purpose, params, result, and which invariants it enforces. Ensure all mutation paths (including any ad-hoc `execMutation` calls) flow through registered ops.
  - Extract the dispatch logic from `matrix-handler.ts` into a standalone `dispatchOp(db, op, params)` function that both the single-message handler and the batch executor can call.

- **Batch executor.**

  - New worker message type: `executeBatch` with `{ ops: BatchOp[] }` params and `{ results: Record<string, unknown> }` result.
  - `BatchOp` type: `{ op: OpName, ref?: string, params: Params }` where params can contain `$ref` placeholders.
  - Executor: open a transaction, iterate ops, resolve `$ref` placeholders from a growing result map, call `dispatchOp` for each, commit or roll back.
  - Forward reference resolution: `$refName` resolves to the full result of the named op. `$refName.fieldName` resolves to a specific field (e.g. `$note.rowId`). Type validation at runtime: reject if a resolved value is used where a different type is expected.

- **Migrate plugin registration to batch ops.**

  - Compile the declarative portion of `PluginDefinition` (matrixes, traits, face bindings) into a batch. The `registerPlugin` function becomes: build batch from definition, execute batch, run `init` hook if provided.
  - The `PluginDefinition` type is retained as ergonomic sugar. Internally it produces a batch.

- **Markdown I/O layer.**

  - `pmJsonToMarkdown(doc)`: serialize ProseMirror JSON to Markdown with custom inline ref syntax (`@[Title](hexId)`, `#[Tag](hexId)`). Handles paragraphs, headings, bold/italic/code marks, links, hard breaks, and `inlineref` nodes.
  - `markdownToPmJson(text)`: parse Markdown with custom inline ref syntax back to ProseMirror JSON. Uses a Markdown parser (e.g. `markdown-it` with a custom plugin for inline refs).
  - Round-trip tests: `pmJsonToMarkdown(markdownToPmJson(md))` should produce identical Markdown for the supported subset. Test with each node/mark type, edge cases (nested marks, adjacent refs, empty paragraphs), and inline ref states.

- **MCP server.**

  - An MCP server (likely using the MCP TypeScript SDK) that runs alongside the app (or as a standalone process with access to the OPFS database).
  - **Read tools**: `query` (SQL sandbox over data tables), `get_row` (returns a row with rich text as Markdown), `get_columns` (matrix schema), `search` (text search across matrixes), `list_matrixes`.
  - **Write tools**: one tool per op category (or one tool per op, depending on ergonomics). Rich text params accept Markdown; the server translates to PM JSON before dispatching the op. Ops that would cascade-delete owned targets return a validation error unless `force: true` is passed.
  - **Batch tool**: `execute_batch` accepts an array of ops with forward references. Returns named results.
  - Tool schemas generated or derived from `MatrixOperationMap` type definitions.

- **Cascade safety on writes.**

  - When a Markdown write would remove an `own`-kind inline reference (detected by diffing the parsed PM doc against the current join table), the op returns an error describing the cascade that would occur. The caller must either restore the reference or use an explicit `deleteOwnedTarget` op.
  - This prevents accidental data loss when an agent reformats Markdown and drops a `#[tag](id)` syntax.

**Testing:** Vitest for: batch executor (atomicity -- partial batch rolls back, forward refs resolve correctly, type validation on refs, nested batches rejected), Markdown round-trips (each node type, each mark, inline refs, edge cases), op dispatch (every registered op callable via `dispatchOp`), cascade safety (Markdown write that removes own-ref returns error). Playwright for: MCP server integration (if testable -- mock MCP client sends ops, verifies state changes in the app).

**Proves:** The op interface is the single write path for all consumers. Batch ops provide atomicity and forward references. Plugin registration migrates cleanly to batches. The Markdown I/O layer round-trips faithfully for the current PM schema. The MCP server exposes the full system to agents. Cascade safety prevents accidental data loss from Markdown editing.

---

## Cross-cutting concerns

These are not phase-gated -- they should be addressed incrementally as they become relevant.

### Testing strategy

Two testing layers, chosen by what they're best at:

- **Vitest** for everything that can be tested against module interfaces or database state directly: trait operations (rank, closure), join table operations, SQL query correctness, plugin registration logic, slot binding resolution, scheduling algorithms, formula evaluation, data transformations. These tests are fast, deterministic, and cover the data layer thoroughly.
- **Playwright E2E** for nontrivial UI interactions that exercise the full stack: outline keyboard navigation (Enter/Tab/Backspace/arrow keys), drag-and-drop reordering, ProseMirror editing, inline tag insertion and autocomplete, cell editing in table faces, flashcard review flow, form submission. Introduced in **Phase 2** when the first real UI interactions land.

General guidelines:

- Prefer Vitest when a behavior can be verified by calling a function and checking the return value or database state. Don't test UI rendering when you can test the underlying operation.
- Use Playwright when the behavior is inherently about user interaction: keystroke sequences, focus management, drag-and-drop, visual state transitions.
- Each phase's testing notes indicate which layer covers what.

### Responsiveness

Basic responsiveness from the start. At a mobile-sized breakpoint (~600px), layouts should flow to a single column where appropriate. This is a baseline expectation, not a deep mobile optimization effort -- just ensure nothing breaks or becomes unusable at narrow widths. Deeper mobile/touch work is deferred.

### Performance

- **Virtualization.** The existing `ScrollVirtualizer` is a starting point. ProseMirror editors must be created/destroyed efficiently as rows scroll in/out of view. Editor state should persist in memory (or be serialized/restored from the PM JSON) across virtualization cycles.
- **Prepared statements.** All named queries and mutations should be prepared once and reused. The worker already supports this; ensure all new operations use it.
- **Minimal re-renders.** Solid.js fine-grained reactivity should prevent unnecessary DOM work. Be disciplined about signal granularity -- don't re-render an entire row when one cell changes.

### Keyboard shortcuts

Every operation should be keyboard-accessible. Build a shortcut system early (Phase 2) and extend it per phase:

- Phase 2: Outline navigation, editing, reorder, indent/outdent.
- Phase 4: Table navigation (arrow keys between cells), column operations, note face navigation, `@`-reference insertion (`[[` or `@` trigger), `#`-tag insertion (`#` trigger).
- Phase 5: Tag type autocomplete, tag property navigation.
- Phase 6+: Context-specific shortcuts for each face type.

### Undo / redo

This is a significant cross-cutting concern. ProseMirror has built-in undo for text edits, but structural operations (reorder, reparent, delete row) and data mutations (edit a cell in a spreadsheet) need their own undo mechanism.

Options:

- **Transaction log.** Record each operation's inverse in an undo stack. Undo replays inverses.
- **SQLite savepoints.** Use `SAVEPOINT` / `ROLLBACK TO` for within-session undo.
- **Per-face undo.** Each face maintains its own undo stack. Simpler but doesn't compose across faces.

Recommendation: Defer a general solution. Start with ProseMirror's built-in undo for text edits (Phase 2). Address structural undo when the need is acute (likely Phase 4-5). Note that the sync changelog (Phase 3) provides per-row version history that could inform an undo mechanism.

### Search

Full-text search across all matrix content. SQLite FTS5 is the natural choice:

- Maintain an FTS5 index over text content from all matrixes.
- Update the index on writes (trigger-based or explicit).
- Search face: a global search bar that queries FTS5 and presents results with context.

Introduce when there's enough content to make search useful (Phase 4 or 5).

---

## Dependency map

```
Phase 1 (Foundation) ✓
  │
  ▼
Phase 2 (Outline + Rich Text)
  │
  ▼
Phase 3 (Sync-readiness)
  │
  ├───────────────────────────┐
  ▼                           ▼
Phase 4 (Plugins, Faces,    Phase 7 (Scheduling
  Notes, Traits, Slots) ✓      + Notifications)
  │                           │
  ▼                           │
Phase 4b (Inline Refs,        │
  Owned Joins)                │
  │                           │
  ├─────────────────────┐     │
  ▼                     ▼     │
Phase 5 (Tags)    Phase 11    │
  │               (Ops, Batch,│
  ▼               MCP server) │
Phase 6 (Tasks +              │
  Movie Reviews)              │
  │                           │
  ├── Task reminders ◄────────┘
  │
  ├──────────────────┐
  ▼                  ▼
Phase 8 (SRS)     Phase 9 (Journaling)

Phase 10 (Live sync, files, Dropbox) ◄── Phase 3
  (can proceed any time after Phase 3;
   independent of Phases 4-9)
```

Phase 3 (sync-readiness) is a prerequisite for everything that follows -- all data changes should be sync-tracked from the start. It establishes unique IDs, change tracking, and the changeset/conflict layer but does not include live sync or file storage. Phase 10 (live sync, files, Dropbox) can proceed any time after Phase 3 and is independent of phases 4-9; it is placed last because the feature work benefits from having more content and use cases before investing in live sync. Phases 4 and 7 can proceed in parallel after Phase 3. Phase 4 (complete) formalized the plugin system, built the face slot model, introduced trait auto-provisioning, and delivered the notes plugin with wiki-links alongside the refactored outline. Phase 4b retrofits the wiki-link implementation with the generalized inline reference system, adds `ref`/`own` join kinds with cascade deletion to the core, and adds reference-type cells to the table face. Phase 5 (tags) builds on the inline references plugin's `#` mode to provide tag type management and the tag-specific UX. Phase 6 (tasks and movie reviews as tag aspect types) requires Phase 5. Tasks ship initially without reminders; task reminders are added once Phase 7 lands. Phases 8 and 9 both require the scheduling infrastructure from Phase 7 and can proceed in parallel after it. Phase 11 (op system, batch ops, MCP server) can proceed any time after Phase 4b -- it formalizes the op registry that already exists, adds the batch executor and Markdown I/O layer, and ships the MCP server. Earlier is better: agent access benefits all subsequent phases.

---

## Existing code inventory

What we have and its status relative to this plan:

| Module                                           | Status                     | Plan disposition                                                                                                                                                                                                      |
| ------------------------------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lexorank.ts` + tests                            | Complete, tested           | **Keep.** Rename variables per Phase 1.                                                                                                                                                                               |
| `matrix.ts` + tests                              | Working, needs rename      | **Evolve.** Rename element→row, extend with column schema management.                                                                                                                                                 |
| Worker (`worker.ts`, `worker-db.ts`, handlers)   | Working, fragile startup   | **Evolve.** Add message queuing (Phase 1), extend with new operations per phase.                                                                                                                                      |
| Client layer (`worker-client.ts`, `*-client.ts`) | Working                    | **Evolve.** Extend with new message types per phase.                                                                                                                                                                  |
| SQL query system (`sql/`)                        | Working, no params         | **Evolve.** Add parameterized queries (Phase 1).                                                                                                                                                                      |
| `ScrollVirtualizer`                              | Working                    | **Evolve.** Integrate with ProseMirror editors (Phase 2).                                                                                                                                                             |
| `App.tsx`, `MatrixDebug.tsx`, `SqlRunner.tsx`    | Debug UI                   | **Evolve.** `MatrixDebug` evolves into the admin matrix browser (Phase 4). `SqlRunner` stays as a dev tool. `App.tsx` will be restructured as the real UI takes shape (Phase 2).                                      |
| `node-sql-parser` dependency                     | Used for table extraction  | **Evaluate.** May keep for query analysis or replace with SQLite-native approach.                                                                                                                                     |
| `rxjs` dependency                                | Used for query observables | **Remove in Phase 1.** Replace with Solid reactive primitives (`createSignal`, `createEffect`, `onCleanup`). The underlying worker subscribe/unsubscribe protocol stays; only the client-side reactive layer changes. |

### From coastline (ProseMirror reference)

| Module                                             | Disposition                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| ProseMirror setup (`createEditorView.ts`)          | **Port and adapt.** Core editor creation, keymap, node view factories.                |
| Custom node views (`Paragraph.tsx`, `Heading.tsx`) | **Port and adapt.** Solid component-based node views.                                 |
| `@prosemirror-adapter/solid` integration           | **Adopt.** The bridge between ProseMirror and Solid.js.                               |
| Widget views (`Hashes.tsx`)                        | **Reference.** Pattern for ProseMirror decorations; adapt for inline reference rendering. |
| Custom commands (`commands.ts`)                    | **Port selectively.** Enter handling, heading cycling. Extend for outline operations. |

---

## Design system

The design system provides design tokens, structural primitives, interactive components, and a responsive grid. It is documented in [Design.md](Design.md) and demonstrated in Storybook (`pnpm storybook`).

The initial build covers elemental components (buttons, inputs, tabs, badges, context menus, structural containers) and the token system (colors, spacing, typography). Complex face themes (outline face variants, table face variants) are planned separately — see [Design-Faces.md](Design-Faces.md).

The existing `src/global.css` application styles have not been migrated to the token system yet. This migration will happen incrementally as face components are rebuilt.

---

## Open design questions

These don't need answers now but should be resolved as their phases approach.

1. **Undo scope.** ProseMirror handles text undo. Structural and data undo is harder. Per-face undo stacks? Global transaction log? Defer until the pain is real?

2. **Full-text search timing.** FTS5 index over all matrix content. Deferred for now -- the ProseMirror JSON supports simple text extraction, so the index can be added later without schema changes. Revisit when there's enough content to warrant it (likely Phase 5+).

3. **Singleton tags and shared aspects.** The current design treats `#`-tags as always creating a new owned aspect row (instance tags). Singleton tags -- where `#project-alpha` references an existing, independently-living row -- are deferred. The `@`-reference mechanism covers the "link to an existing entity" use case. If singleton tags prove necessary (e.g. for a more tag-like UX around selecting from a curated list), they could be added as a `#` autocomplete option that creates a `ref`-kind join instead of `own`-kind. Revisit when real usage patterns emerge.

4. **Labeled/typed joins.** The join table currently carries `kind` (`ref`/`own`) but no role or label (e.g. "author", "assignee"). Tana-style instance fields (a field that references nodes of a specific supertag type) would benefit from labeled joins for richer reverse lookups ("appears as Author in...", "appears as Assignee in..."). Deferred until structured field references are needed (likely Phase 5-6).
