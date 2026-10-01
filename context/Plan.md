---
title: Roadmap
kind: roadmap
state: active
updated: 2026-10-01
---

# Roadmap

Phases 1–10 are complete historical work. Their plans live under `archive/phases/`. This roadmap
starts at the current shipped boundary and owns future order and dependencies. Canonical topic
documents own detailed architecture and design.

## Current shipped boundary

The app currently provides:

- local SQLite-WASM persistence in a worker;
- typed matrixes, stable column identity, constraints, formulas, and face choices;
- one ownership forest spanning matrixes through `own`, `ref`, and `portal` edges;
- global closure and plural-position scroll-index caches;
- rich-text workspace editing, hierarchy, drag/drop, collapse, focus, and back navigation;
- bounded paged virtualization, inline view results, dedicated container nodes, and boundary hops;
- inline references, type nodes, aspects, field editing, embedded tables, and admin surfaces;
- the production four-column workspace, bounded sticky navigation, the Guides outline variant, and
  Ghost/Null/Wipeout runtime theme contracts;
- schema-complete change tracking, logical remote apply, conflict retention, and two-replica
  reconstruction tests;
- named, focusable views that own one durable SQL source and whose focus host requests a
  collection rendering;
- deterministic performance guards plus a bounded 20×-throttled Chromium backstop;
- one stream root with responsive retained panels, plus the Quick/Deep launcher, shared command
  registry, view authoring, editor handoff, bounded session memory, and rooted global
  navigation.

The temporary Workspace, Table, and Tags roots are retired. App-wide face-host completion,
remaining style migration, live sync transport, attachments, scheduling, and later product systems
do not ship.

## Phase 11 — Durable data and place contracts (complete)

> Detailed plan: [phases/Phase-11.md](phases/Phase-11.md)

Phase 11 repaired the current durability boundary before new saved data lands. It established the
canonical data, sync, virtualization, performance, and host contracts, and made the existing view
a named, focusable place without adding a second SQL store.

**Proves:** every current source-of-truth field has an explicit replication policy; two replicas
round-trip the current schema; future schema additions cannot bypass classification; a view has
one durable identity, SQL source, and host-rendered place contract.

## Phase 12 — Launcher and shell convergence (complete)

Depends on Phase 11.

> Detailed plan: [phases/Phase-12.md](phases/Phase-12.md)

- Extract one command registry for `/` and `⌘K`.
- Implement the query-spec compiler, recognizer, and conformance suite.
- Build quick navigation, chip/deep tempo, save-as-view, insert-ref handoff, and session memory.
- Establish the shared launcher/slash overlay primitive.
- Capture and retire the temporary Table and Tags tabs after launcher parity.

**Proves:** global navigation and creation use the approved place/gesture model; durable views
round-trip through SQL and gesture chrome.

## Phase 13 — Live design-system and face-runtime completion

Depends on Phase 12. Detailed plan: [phases/Phase-13.md](phases/Phase-13.md).

- Migrate table, tags, face choice administration, browser, editor, and admin surfaces from legacy
  global styles.
- Complete host-owned `line`/`collection` dispatch, nesting, panel regions, and face resolution.
- Remove `TemporaryLegacyFaceAdapter`, the direct embedded `TableFace` mount, and workspace face
  choice and configuration panel bypasses.
- Keep one face choice per matrix and an implicit fallback rendering. Stop provisioning unused table
  face choices merely to guarantee a generic fallback.
- Implement recursive composed/substrate/x-ray behavior through fidelity scopes.
- Allow build/development-startup theme selection through `VITE_HILA_VISUAL_THEME`, defaulting to
  Ghost. Defer a runtime chooser and persisted preference.
- Resolve stream item and sticky item visual and interaction continuity.

Phase 14 cannot begin until the legacy face runtime is removed.

## Phase 14 — Structured aspects vertical slice

Depends on Phase 13.

Rewrite the former task/movie plan against type nodes. Add defaults and a rendering registry. Ship
tasks as the primary proof. Keep movie reviews only if they still provide a useful second proof.

## Phase 15 — Operations and agent access

Formalize typed dispatch, batch execution, Markdown round trips, and cascade safety. Decide how an
external process reaches browser-owned data before committing to an MCP implementation.

Read access can use sandboxed SQL. Write access must use typed operations so ownership, cascades,
schema dependencies, and replication invariants hold. The phase adds:

- a registry-backed typed dispatcher;
- atomic batches with result references, which compose typed operations in one transaction without
  bypassing their validation;
- Markdown import and export;
- cascade previews and safety gates;
- an agent interface after the access topology is decided.

An external process cannot assume direct access to browser OPFS. The phase must choose an in-app
bridge, an exported database, or a different persistence host before implementing MCP.

## Phase 16 — Scheduling and notifications

Depends on the task data model. Begin with browser-capability validation. Ship in-app scheduling
and catch-up semantics. Treat closed-app delivery as provider-dependent unless an external delivery
boundary is accepted.

## Phase 17 — Spaced repetition

Depends on scheduling and the renderer/face registry. Add card definitions, review scheduling,
review interaction, and progress surfaces.

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

- [Concepts.md](Concepts.md) and [Decisions.md](Decisions.md) — concept ledger and decision log.
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

The [decision log](Decisions.md) owns each decision's rationale, consequences, and constrained
concepts. This index lists the entries seeded from this roadmap.

1. [Stable column IDs](Decisions.md#decision-1)
2. [User data in matrixes, invariants in system tables](Decisions.md#decision-2)
3. [The workspace matrix is the single root, with only label and content](Decisions.md#decision-3)
4. [`own`, `ref`, and `portal` roles](Decisions.md#decision-4)
5. [Single ownership, plural position](Decisions.md#decision-5)
6. [Membership independent of position](Decisions.md#decision-6)
7. [One rooted stream, global launcher, admin surfaces](Decisions.md#decision-7)
8. [Plugins contribute faces and commands; hosts own chrome](Decisions.md#decision-8)
9. [SQL is the only stored query form](Decisions.md#decision-9)
10. [One theme contract with independent axes](Decisions.md#decision-10)
11. [Every schema field declares durability](Decisions.md#decision-11)
12. [Deterministic guards plus throttled browser tests](Decisions.md#decision-12)
13. [Reset-only schema version 0](Decisions.md#decision-13)
14. [One face choice per matrix and an implicit fallback](Decisions.md#decision-14)
15. [Startup-selected visual theme](Decisions.md#decision-15)

Decisions 16 onward were recorded from canonical topics in Phase 13 Session 5A.

## Deferred decisions

- Structural/data undo semantics.
- Full-text-search timing and tokenizer policy.
- Labels on `ref` relations.
- Saved stream states and URL/deep-link behavior.
- MCP access topology for browser-owned OPFS data.
- External delivery boundary for reliable closed-app notifications.
- User-facing theme chooser and persistence.
