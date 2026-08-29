---
title: Current state
kind: status
state: ready
updated: 2026-08-29
phase: 11
session: stage-1-durability-inventory
---

# Now

Phase 10 is complete. The post-phase reconciliation is approved and archived. Phase 11 is ready
to begin from the repaired roadmap and canonical contracts.

Phase 11 must repair schema-complete replication coverage before the launcher adds durable saved
views. It then completes the saved-view place contract and begins the required subject/recipe/host
runtime migration. Phase 13 owns removal of the legacy face contract and blocks Phase 14 until it
is complete.

## Read next

1. [Phase 11](phases/Phase-11.md), starting with Stage 1.
2. [Sync.md](Sync.md) and [Data-Model.md](Data-Model.md) for the durability boundary.
3. [Plugins.md](Plugins.md) for the face-runtime boundary.
4. [Performance.md](Performance.md) before Stage 8.

## Boundary

Execute Phase 11 stages in order. Do not build the launcher, retire tabs, or complete the global
design migration early.

## Next action

Begin Stage 1: inventory and classify every current SQLite table and column, including dynamic
matrix data tables.
