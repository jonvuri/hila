---
title: Replication and sync
kind: canonical
state: repair-in-progress
updated: 2026-08-30
---

# Replication and sync

The app ships a local change-tracking and remote-apply foundation. It does not ship remote
transport, files, provider integration, or a sync UI. Phase 11 Stages 2 and 3 repaired
current-schema tracking and locked its guardrails. Stage 4 proves a full two-replica round trip.

## Durability policy

Every table and column must be explicitly classified:

1. **Replicated source of truth** — user-authored or user-visible durable state.
2. **Derived/rebuildable** — state reproducible from replicated truth.
3. **Device-local** — intentionally local state with a documented user-visible consequence.

The default for user-authored or user-visible data is replicated. Device-local is an exception that
requires a reason and test.

The schema-policy manifest classifies the full current schema. Its contract audit fails when:

- a fresh-schema table or column is unclassified;
- a replicated column is absent from installed tracking;
- a derived table is accidentally tracked;
- a dynamic matrix data-table mutation leaves its trigger schema stale.

## Shipped readiness layer

### Identity

Matrix, row, and stable column IDs can be created independently on different devices. Each local
installation has a device UUID in `_sync_state`.

### Changelog

SQLite triggers append full-row insert/update snapshots and full old-row delete records to
`_sync_changelog`. Dynamic matrix data tables reinstall tracking after schema changes. Fixed-table
columns are generated from the durability manifest. Remote apply suppresses local triggers through
`_sync_applying`.

Full-row changes simplify row-level last-write-wins and conflict retention.

### Changesets

The current abstraction supports:

- `getLocalChanges(sinceSeq)`;
- `getLastSeq()`;
- `applyRemoteChanges(changeset)`;
- per-device high-water marks;
- changelog compaction after acknowledgement.

Changesets are transport-neutral JSON. No provider currently sends them between devices.

### Conflict retention

Remote apply detects concurrent local modification by manifest-defined logical identity and uses
row-level last-write-wins. Losing data is retained in `_sync_conflicts` for future recovery UI.
Remote writes must not echo into the local changelog.

### Structural apply

Remote upsert/delete uses stable integer, text, or composite identity from the manifest rather than
replica-local `rowid`. Changesets retain their source sequence, which is dependency-valid because
each source operation committed in that order. Remote matrix metadata materializes and evolves
physical data tables as its entries arrive. Structural apply rebuilds closure and the scroll index;
formula metadata apply rebuilds formula dependencies.

Derived cache rows do not replicate.

## Repaired current coverage

Stage 2 added matrix ownership, promoted nodes, saved-view SQL, normalized face state, and all
plugin metadata to manifest-driven tracking. `face_configs.slot_bindings` remains an untracked
derived compatibility copy; normalized slot bindings are authoritative. Face filters use stable
UUID identity and explicit order.

Remote apply now materializes new matrix data tables, evolves columns, installs complete triggers,
and rebuilds derived state inside the no-echo apply transaction. Stage 4 still owns the complete
two-replica user-visible reconstruction proof.

The schema-policy audit introspects live tables, columns, and installed trigger SQL. It compares
all three with the manifest. Failure controls cover unclassified schema, stale trigger columns,
tracking on derived state, and dynamic create/add/remove/rename operations.

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

### Device-local exception review

Propose a device-local field before implementation. The active phase or session plan must name its
owner, explain why replication is wrong, and state the user-visible consequence when another
device does not receive it. Review that exception against the default that user-authored and
user-visible state replicates.

After approval, add the field to the durability manifest with that responsibility. Add a contract
test proving no tracking trigger includes it and a two-replica test proving the intended local
behavior. If an existing case is sufficient, record why in the active plan. No device-local user
preference is currently approved.

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
