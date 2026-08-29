---
title: Replication and sync
kind: canonical
state: repair-planned
updated: 2026-08-29
---

# Replication and sync

The app ships a local change-tracking and remote-apply foundation. It does not ship remote
transport, files, provider integration, or a sync UI. Later schema evolution weakened Phase 3's
original coverage guarantee; Phase 11 repairs and locks that boundary before saved views land.

## Durability policy

Every table and column must be explicitly classified:

1. **Replicated source of truth** — user-authored or user-visible durable state.
2. **Derived/rebuildable** — state reproducible from replicated truth.
3. **Device-local** — intentionally local state with a documented user-visible consequence.

The default for user-authored or user-visible data is replicated. Device-local is an exception that
requires a reason and test.

Phase 11 adds a schema-policy manifest and contract test that fail when:

- a fresh-schema table or column is unclassified;
- a replicated column is absent from installed tracking;
- a derived table is accidentally tracked;
- a dynamic matrix data-table mutation leaves its trigger schema stale.

## Shipped readiness layer

### Identity

Matrix, row, and stable column IDs can be created independently on different devices. Each local
installation has a device UUID in `_sync_state`.

### Changelog

SQLite triggers append full-row insert/update snapshots and delete records to `_sync_changelog`.
Dynamic matrix data tables reinstall tracking after schema changes. Core tables use declared column
lists. Remote apply suppresses local triggers through `_sync_applying`.

Full-row changes simplify row-level last-write-wins and conflict retention. They do not imply that
all current schema is covered.

### Changesets

The current abstraction supports:

- `getLocalChanges(sinceSeq)`;
- `getLastSeq()`;
- `applyRemoteChanges(changeset)`;
- per-device high-water marks;
- changelog compaction after acknowledgement.

Changesets are transport-neutral JSON. No provider currently sends them between devices.

### Conflict retention

Remote apply detects concurrent local modification and uses row-level last-write-wins. Losing data
is retained in `_sync_conflicts` for future recovery UI. Remote writes must not echo into the local
changelog.

### Structural apply

`joins` carries logical composite identity and the ownership forest. Remote upsert/delete must use
source/target identity rather than replica-local `rowid`. Structural apply rebuilds closure and the
scroll index from relation truth.

Derived cache rows do not replicate.

## Known coverage gap

The hardcoded core tracking list predates later schema additions. It currently omits or incompletely
covers:

- `matrix.owner_matrix_id` and `matrix.owner_row_id`;
- `promoted_nodes`;
- `block_sources`.

`block_sources` was deliberately local-only in Phase 9.7 to keep that rendering phase scoped. Its
marker position syncs through `joins`, while its SQL does not. That exception is no longer suitable
for named saved views.

The matrix owner and promoted-node omissions have no matching durable rationale and are treated as
coverage regressions.

Until Phase 11 completes, the code must not claim that all user-visible state reconstructs on a
second replica.

## Phase 11 repair contract

Phase 11 must:

1. Introspect and classify the entire current schema.
2. Track all current replicated source-of-truth columns.
3. Give composite-key tables logical apply/delete rules.
4. Replicate saved-view SQL with marker identity and position.
5. Prove a two-replica fixture containing content, ownership, portals, promoted types, owned
   matrixes, face recipes, and saved views.
6. Install schema-policy tests that protect future changes.
7. Define the reset-to-versioned-migration durability milestone.

The detailed work is in [Phase 11](phases/Phase-11.md).

## Ongoing schema rule

Every schema-changing phase must:

- update the durability classification;
- show whether each new field is replicated, derived, or device-local;
- update trigger/apply logic when replicated;
- add a two-replica case or explain why an existing case covers it;
- verify fresh initialization and the active migration policy;
- keep derived-cache rebuilds deterministic.

A new unclassified field is a test failure, not documentation debt.

## Retention and history

The changelog keeps a time window plus a per-row version cap, subject to device acknowledgements.
Compaction must never remove an entry still needed by a known device. The changelog can support a
future version-history surface, but no such UI currently ships.

## Future live sync

Phase 20 builds the transport and user-facing system on the repaired readiness layer.

### Engine responsibilities

- debounce and upload local changesets;
- discover and apply remote changesets;
- bootstrap a new device from a snapshot plus later changes;
- expose progress, errors, offline state, and conflicts;
- retain provider independence.

### Provider boundary

```ts
type SyncProvider = {
  list: (prefix: string) => Promise<RemoteEntry[]>
  get: (key: string) => Promise<Uint8Array | null>
  put: (key: string, data: Uint8Array) => Promise<void>
  delete: (key: string) => Promise<void>
  watchChanges: (prefix: string, cursor: string | null) => Promise<WatchResult>
}
```

Dropbox is the first intended provider, not part of the engine's semantics. Authentication,
provider cursors, snapshots, retry/backoff, and conflict UX belong to Phase 20.

## Files and attachments

Local content-addressed file storage and attachment UI are Phase 21 scope and may move earlier if
product priority changes. File bytes sync separately from structured attachment metadata. Remote
file mirroring depends on the Phase 20 provider engine.

## Migration policy

The project is pre-alpha and may reset databases through Phase 11. Phase 11 defines and proves the
versioned migration runner, then records the durability milestone after which schema changes must
migrate existing data or demonstrate compatibility.

The obsolete `wikilink` migration is waived only because it predates that milestone.

## Non-goals of the readiness layer

- Guaranteed background execution while the browser is closed.
- Silent field-level merge of rich text or schema edits.
- Replicating derived closure or scroll-index rows.
- Coupling the changeset format to Dropbox.
- Treating remote storage as the primary database.
