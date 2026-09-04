---
title: Roadmap
kind: roadmap
state: active
updated: 2026-09-03
---

# Roadmap

Phases 1–10 are complete historical work. Their plans live under `archive/phases/`. This roadmap
starts at the current shipped boundary and owns future order and dependencies. Canonical topic
documents own detailed architecture and design.

## Current shipped boundary

The app currently provides:

- local SQLite-WASM persistence in a worker;
- typed matrixes, stable column identity, constraints, formulas, and face configuration;
- one ownership forest spanning matrixes through `own`, `ref`, and `portal` relations;
- global closure and plural-position scroll-index caches;
- rich-text workspace editing, hierarchy, drag/drop, collapse, focus, and back navigation;
- bounded paged virtualization, folded query results, dedicated sub-tables, and boundary hops;
- inline references, promoted type-nodes, tag aspects, property editing, and table/browser surfaces;
- the production four-column workspace, bounded sticky navigation, Guides outline treatment, and
  Ghost/Null/Wipeout runtime theme contracts;
- a trigger-based sync-readiness layer whose current-schema coverage requires repair.

Temporary Workspace, Table, and Tags tabs remain. The launcher, shared command registry, app-wide
face-host contract, remaining style migration, live sync transport, attachments, scheduling, and
later product systems do not ship.

## Phase 11 — Durable data and place contracts

> Detailed plan: [phases/Phase-11.md](phases/Phase-11.md)

Repair the current durability boundary before new saved data lands. Establish the canonical data,
sync, virtualization, performance, and face-host contracts. Make the existing view marker a named,
focusable place without adding a second SQL store.

**Proves:** every current source-of-truth field has an explicit replication policy; two replicas
round-trip the current schema; future schema additions cannot bypass classification; a saved view
has one durable identity, SQL source, and host-rendered place contract.

## Phase 12 — Launcher and shell convergence

Depends on Phase 11.

- Extract one command registry for `/` and `⌘K`.
- Implement the query-spec compiler, recognizer, and conformance suite.
- Build quick navigation, chip/deep tempo, save-as-view, insert-ref handoff, and session memory.
- Establish the shared launcher/slash overlay primitive.
- Capture and retire the temporary Table and Tags tabs after launcher parity.

**Proves:** global navigation and creation use the approved place/gesture model; durable saved views
round-trip through SQL and gesture chrome.

## Phase 13 — Live design-system and face-runtime completion

Depends on Phase 12.

- Migrate table, tags, face configuration, browser, editor, and system-edge surfaces from legacy
  global styles.
- Complete host-owned `line`/`collection` dispatch, recursion, panel scaffold, and affinity.
- Remove whole-component dispatch and the enumerated temporary compatibility adapter uses left by
  Phase 11.
- Implement or explicitly narrow composed/substrate/x-ray behavior.
- Decide whether theme selection needs user-facing choice and persistence.
- Resolve source-row/sticky-row visual and interaction continuity.

Phase 14 cannot begin until the legacy face runtime is removed.

## Phase 14 — Structured aspects vertical slice

Depends on Phase 13.

Rewrite the former task/movie plan against promoted type-nodes. Add defaults and a renderer
registry. Ship tasks as the primary proof. Keep movie reviews only if they still provide a useful
second proof.

## Phase 15 — Operations and agent access

Formalize typed dispatch, batch execution, Markdown round trips, and cascade safety. Decide how an
external process reaches browser-owned data before committing to an MCP implementation.

## Phase 16 — Scheduling and notifications

Depends on the task data model. Begin with browser-capability validation. Ship in-app scheduling
and catch-up semantics. Treat closed-app delivery as provider-dependent unless an external delivery
boundary is accepted.

## Phase 17 — Spaced repetition

Depends on scheduling and the renderer/face registry. Add card definitions, review scheduling,
review interaction, and progress views.

## Phase 18 — Micro-journaling

Depends on scheduling and form/aggregate surfaces. It can proceed independently of Phase 17 after
those prerequisites.

## Phase 19 — Structural ergonomics and in-place upgrades

Review the complete structural interaction system after the main product surfaces exist. Evaluate
discoverability, preview, reversibility, cascade safety, keyboard operation, and undo expectations.

Investigate:

- label to type/container;
- referenced member to owned aspect;
- shared collection to dedicated table;
- subtree to matrix-backed table;
- hostless row to contextualized home;
- any additional friction revealed by real task, review, scheduling, SRS, and journal workflows.

Implement only upgrades that improve real workflows. The goal is ergonomic evolution, not exposing
every model transformation merely because it is possible.

## Phase 20 — Live row-data sync

Depends on Phase 11's repaired replication contract. Build a transport-neutral replica engine,
snapshot/bootstrap flow, conflict UX, and one remote provider. Dropbox is a provider, not part of
the engine contract.

## Phase 21 — Attachments and file sync

Separate local content-addressed attachment storage and UI from remote file mirroring. Local
attachments may move earlier if product priority changes; only remote mirroring depends on Phase 20.

## Durable dogfooding gate

Reset-only development ends with the first dogfood build whose data is expected to survive
upgrades. This gate is event-based and may occur after all currently planned phases. Until then,
databases remain at schema version 0, may be reset, and may use rewritten bootstrap migrations.

Before declaring that build ready:

1. Freeze its coherent schema as version 1 and activate versioned initialization.
2. Reset remaining version-0 databases or adopt them through an explicit reviewed path. Never stamp
   an arbitrary version-0 database as durable.
3. Remove obsolete reset-era compatibility migrations.
4. Run the schema-policy, fresh-initialization, reset, and migration-runner verification.
5. Establish the backup and recovery path required before the first `1 → 2` migration.

After activation, every incompatible schema change requires a forward migration. See
[Sync.md](Sync.md#migration-policy) for ordering, rollback, and backup requirements.

## Dependency spine

```text
11 durability + places
  → 12 launcher + shell
    → 13 face runtime + live design
      → 14 structured aspects
        → 16 scheduling → 17 SRS
                       └→ 18 journaling
      → 15 operations

11 durability → 20 live sync → 21 remote file sync
14–18 product evidence → 19 structural ergonomics
```

Phase 15 can move relative to 16–18 after its external-data topology is decided. Local attachments
can move earlier independently of remote sync.

## Cross-cutting contracts

- [Architecture.md](Architecture.md) — system and product topology.
- [Data-Model.md](Data-Model.md) — matrixes, ownership, relations, caches, and views.
- [Plugins.md](Plugins.md) — plugin registration and face/command composition.
- [Query-Spec.md](Query-Spec.md) and [Launcher.md](Launcher.md) — query gestures and launcher.
- [Design.md](Design.md) and [Design-Faces.md](Design-Faces.md) — visual contracts.
- [Sync.md](Sync.md) — replication boundary and future transport.
- [Virtualization.md](Virtualization.md) — bounded data/rendering residency.
- [Performance.md](Performance.md) — deterministic and throttled-browser performance guards.
- [Testing.md](Testing.md) — browser/E2E rules.

## Resolved decisions

1. Stable column IDs carry durable references; names are mutable labels.
2. User-meaningful data belongs in matrixes. Invariant-bearing relationships and caches belong in
   system tables.
3. The workspace is one matrix with `label` and `content` roles.
4. `own` carries structure and lifecycle; `ref` carries association; `portal` carries additional
   position.
5. Ownership is single and position is plural.
6. Matrix membership and forest position are independent.
7. The stream is the primary rooted surface. Local focus navigates nearby; the launcher finds
   globally; the system edge contains only above-database concerns.
8. Plugins contribute faces and commands. Hosts own chrome and recursion; subjects own data;
   rendering recipes own presentation.
9. Query gestures compile to canonical SQL. SQL remains the only stored/executed query form.
10. Ghost, Null, and Wipeout share one structure. Visual theme, polarity, component variant,
    density, and fidelity are independent axes.
11. Every source-of-truth schema field must declare replicated, derived, or device-local status.
12. Performance uses deterministic complexity/fan-out guards plus bounded browser stress tests at a
    target-equivalent Chrome CPU slowdown.
13. Schema version 0 remains reset-only until the durable dogfooding gate explicitly establishes
    version 1.

## Deferred decisions

- Structural/data undo semantics.
- Full-text-search timing and tokenizer policy.
- Labels on `ref` relations.
- Saved stream states and URL/deep-link behavior.
- MCP access topology for browser-owned OPFS data.
- External delivery boundary for reliable closed-app notifications.
- User-facing theme chooser and persistence.
