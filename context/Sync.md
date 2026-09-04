---
title: Replication and sync
kind: canonical
state: active
updated: 2026-09-03
---

# Replication and sync

The app ships a local change-tracking and remote-apply foundation. It does not ship remote
transport, files, provider integration, or a sync UI. Phase 11 Stages 2 through 4 repaired
current-schema tracking, locked its guardrails, and proved a full two-replica round trip.

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
row-level last-write-wins. Each remote device has an independent receiver-local changelog boundary;
the remote source sequence is not compared with unrelated local sequence numbers. Losing data is
retained in `_sync_conflicts` for future recovery UI. Remote writes must not echo into the local
changelog.

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
and rebuilds derived state inside the no-echo apply transaction. Reference joins restore their
serialized empty BLOB representation to SQL `NULL` during apply.

Stage 4's complete fixture reconstructs workspace content, hierarchy, cross-matrix ownership,
portals, promoted types, owned matrixes, inline references and tags, face recipes, and saved-view
SQL on a fresh replica. It compares source truth by logical identity, rebuilds and compares rendered
position and ancestry state, retains concurrent promoted/view/owner conflicts, and proves remote
delete lifecycles for every composite fixture entity.

The schema-policy audit introspects live tables, columns, and installed trigger SQL. It compares
all three with the manifest. Failure controls cover unclassified schema, stale trigger columns,
tracking on derived state, and dynamic create/add/remove/rename operations.

## Shipped repair guarantees

Phase 11 completed the current-schema boundary:

1. The durability manifest classifies the entire current schema.
2. Tracking covers all current replicated source-of-truth columns.
3. Composite-key tables have logical apply/delete rules.
4. Saved-view SQL replicates with marker identity and position.
5. A two-replica fixture covers content, ownership, portals, promoted types, owned
   matrixes, face recipes, and saved views.
6. Schema-policy tests protect future changes.
7. The durable dogfooding gate defines the reset-to-versioned-migration milestone.

The completed implementation record is [Phase 11](phases/Phase-11.md).

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

The unreleased app remains at schema version 0 and makes no promise to preserve databases across
upgrades. Bootstrap migrations may be rewritten, and reset is the supported response to an
incompatible development database. SQLite's `user_version` will hold the version after activation;
it is local schema metadata, not replicated application state.

The [durable dogfooding gate](Plan.md#durable-dogfooding-gate) activates with the first dogfood
build whose data is expected to survive upgrades. The gate is event-based and may occur after the
currently planned phases. It freezes that build's coherent schema as version 1. Existing version-0
databases must be reset or pass an explicit reviewed adoption path; initialization must not stamp
an arbitrary version-0 database as durable.

The obsolete stored-ProseMirror `wikilink` to `inlineref` transform is waived because it predates
the gate. No post-milestone migration may use that waiver as precedent.

The dormant migration runner and representative fixtures ship without activating version 1. After
the gate, fresh initialization creates the current schema and records its version. The Reset DB
action clears the file and follows the same initialization path. A versioned database opens
through the migration runner:

1. Reject a database newer than the build.
2. Require one immutable migration for each integer version between the stored and current
   versions.
3. Apply migrations once in ascending order.
4. Run the complete pending batch and its `user_version` writes in one transaction. Any failure
   rolls back schema, data, and version metadata, then aborts initialization.
5. Reinstall schema-derived tracking after migration. A migration that removes or renames a
   tracked column must first remove any trigger that refers to it.

Before the first `1 → 2` migration can run against persistent OPFS, its open path must create a
restorable pre-migration database backup outside the active file. Keep the backup until the
migrated database reopens and passes its integrity and schema-policy checks. A destructive or lossy
migration also requires an explicit user export path and a reviewed recovery procedure.

Every schema change after version 1 must update fresh initialization, increment the current schema
version, and include either the corresponding migration or an explicit proof that the prior
physical schema is already compatible. It must also satisfy the durability-policy and two-replica
rules above. The representative runner fixture covers ordered data/DDL evolution and atomic
rollback; `user_version` adds no table or replicated column, so the existing two-replica coverage
is sufficient for the dormant runner itself.

## Non-goals of the readiness layer

- Guaranteed background execution while the browser is closed.
- Silent field-level merge of rich text or schema edits.
- Replicating derived closure or scroll-index rows.
- Coupling the changeset format to Dropbox.
- Treating remote storage as the primary database.
