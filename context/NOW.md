---
title: Current state
kind: status
state: ready
updated: 2026-09-05
phase: 12
session: query-spec-and-query-runtime
---

# Now

Phase 11 is complete. Current durable state is schema-classified, tracked, and covered by a full
two-replica fixture. Saved views are named places with one replicated SQL source and a host-owned
collection region. Deterministic performance guards, exact churn checks, and the bounded
20×-throttled Chromium backstop pass.

The unreleased app remains at reset-only schema version 0. The first
dogfood build whose data should survive upgrades activates the durable dogfooding gate and
establishes version 1; the gate may follow all currently planned phases.

The dormant migration runner already proves ordered schema/data evolution and full rollback. The
gate requires explicit reset or reviewed adoption of version-0 databases, removal of reset-era
compatibility migrations, and a backup path before the first `1 → 2` migration.

Phase 12 Session 1 is complete. One ordered main-thread command registry now owns discovery,
availability, matching, invocation, plugin replacement, and teardown. The workspace contributes the
existing `hila.table` and `hila.attach` commands; the slash adapter preserves both follow-up flows.
Callable contributions stay out of the worker payload. Immutable snapshots, pre-effect command
reservations, and generation checks keep replacement and teardown atomic.

Global shortcuts are self-describing and enumerable. Editor-local ProseMirror handlers remain in
their keymap with parallel metadata for the future help projection. Key normalization and platform
display are independently tested.

Session 2 now owns the query-spec compiler/recognizer, safe bound runtime, deterministic paging, and
durable round trip. It must freeze the executable grammar in `Query-Spec.md` before implementation.

Durable gesture-authored views require a concrete matrix/type in v1. Cross-matrix `everything` and
`containers` remain transient launcher lenses until a dynamic global-search substrate exists.
Phase 13 still owns the embedded legacy face/runtime and remaining style migration.

## Read next

1. [Phase 12 front door](phases/Phase-12.md).
2. [Session 2 — query spec and query runtime](phases/Phase-12/Session-2-query-spec-and-query-runtime.md).
3. [Query Spec](Query-Spec.md), then [Sync](Sync.md) for the rename-healing durability boundary.

## Boundary

Keep Session 2 behind the shipped view-place and replication contracts. Stored SQL remains the only
query truth, gesture-authored durable views require a concrete matrix, and every schema change must
update the durability policy and two-replica coverage.

## Next action

Freeze Session 2's executable v1 grammar in `Query-Spec.md`, then implement its compiler and
recognizer before changing the runtime.
