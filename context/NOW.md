---
title: Current state
kind: status
state: ready
updated: 2026-09-03
phase: 12
session: launcher-and-shell-convergence
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

Phase 12 owns the launcher, shared command registry, query-spec compiler/recognizer, saved-view
authoring, and temporary tab retirement. Phase 13 still owns removal of the enumerated legacy face
adapter uses and blocks Phase 14 until that work is complete.

## Read next

1. [Roadmap — Phase 12](Plan.md#phase-12--launcher-and-shell-convergence).
2. [Query spec](Query-Spec.md) for the compiler, recognizer, and gesture contract.
3. [Launcher](Launcher.md) for the shell, command, save, and tab-retirement sequence.

## Boundary

Keep Phase 12 behind the shipped view-place and replication contracts. Do not complete the global
face/design migration assigned to Phase 13.

## Next action

Begin Phase 12 with command-registry extraction, then follow the launcher build order.
