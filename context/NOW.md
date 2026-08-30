---
title: Current state
kind: status
state: ready
updated: 2026-08-29
phase: 11
session: stage-3-coverage-guards
---

# Now

Phase 11 Stage 2 is complete. Fixed-table tracking is generated from the durability manifest.
Remote apply and conflicts use stable logical identity, source-sequence ordering, and no-echo
derived rebuilds. Fresh replicas materialize dynamic matrix tables before their rows. Normalized
face state, plugin metadata, matrix ownership, promoted nodes, and saved-view SQL are tracked.

Phase 11 must repair schema-complete replication coverage before the launcher adds durable saved
views. It then completes the saved-view place contract and begins the required subject/recipe/host
runtime migration. Phase 13 owns removal of the legacy face contract and blocks Phase 14 until it
is complete.

## Read next

1. [Phase 11](phases/Phase-11.md), starting with Stage 3.
2. [Sync.md](Sync.md) for the repaired durability boundary and remaining guardrails.
3. [Stage 1 durability inventory](phases/Phase-11-Stage-1-Inventory.md) for the reviewed policy.
4. [Documentation.md](Documentation.md) for session closeout rules.

## Boundary

Execute Phase 11 stages in order. Do not build the launcher, retire tabs, or complete the global
design migration early.

## Next action

Begin Stage 3: compare installed triggers with the durability policy, add failure controls for
unclassified schema and stale tracking, and lock dynamic schema-mutation coverage.
