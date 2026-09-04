---
title: Current state
kind: status
state: ready
updated: 2026-09-03
phase: 12
session: shared-command-and-shortcut-registries
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

Phase 12 is planned as nine focused sessions. It owns the shared command and shortcut registries,
query-spec compiler/recognizer and bound runtime, global place discovery, shared overlays, quick and
deep launcher tempos, saved-view authoring, session memory, and temporary tab retirement.

Durable gesture-authored views require a concrete matrix/type in v1. Cross-matrix `everything` and
`containers` remain transient launcher lenses until a dynamic global-search substrate exists.
Phase 13 still owns the embedded legacy face/runtime and remaining style migration.

## Read next

1. [Phase 12 front door](phases/Phase-12.md).
2. [Session 1 — shared command and shortcut registries](phases/Phase-12/Session-1-command-and-shortcut-registries.md).
3. [Plugins — Commands](Plugins.md#commands) for the canonical contribution contract.

## Boundary

Keep Phase 12 behind the shipped view-place and replication contracts. Retire only the top-level
Table/Tags roots after launcher parity; do not complete the embedded face/design migration assigned
to Phase 13.

## Next action

Execute Session 1's registry contract and preserve current `/table` and `/attach` behavior.
