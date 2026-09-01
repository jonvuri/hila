---
title: Current state
kind: status
state: ready
updated: 2026-08-30
phase: 11
session: stage-4-two-replica-round-trip
---

# Now

Phase 11 Stage 3 is complete. A reusable audit compares live tables, columns, and tracking triggers
with the durability manifest. Failure controls cover unclassified schema, stale trigger columns,
derived-table tracking, and dynamic schema mutations. Dynamic trigger reinstalls exclude formula
columns because they have no physical storage.

Phase 11 must repair schema-complete replication coverage before the launcher adds durable saved
views. It then completes the saved-view place contract and begins the required subject/recipe/host
runtime migration. Phase 13 owns removal of the legacy face contract and blocks Phase 14 until it
is complete.

## Read next

1. [Phase 11](phases/Phase-11.md), starting with Stage 4.
2. [Sync.md](Sync.md) for the guarded durability boundary and round-trip contract.
3. [Stage 1 durability inventory](phases/Phase-11-Stage-1-Inventory.md) for the reviewed policy.
4. [Documentation.md](Documentation.md) for session closeout rules.

## Boundary

Execute Phase 11 stages in order. Do not build the launcher, retire tabs, or complete the global
design migration early.

## Next action

Begin Stage 4: build the complete two-replica fixture and compare source-of-truth and rebuilt state
by logical identity.
