---
title: Current state
kind: status
state: ready
updated: 2026-08-31
phase: 11
session: stage-6-subject-recipe-host-runtime
---

# Now

Phase 11 Stage 5 is complete. A saved view is one named marker row plus its existing
`block_sources` SQL. It participates in role-aware reference discovery and home-first identity
navigation without appearing as a duplicate loose row. Inline and focused presentations share the
marker identity; the focus panel renders all result fields at substrate fidelity and keeps empty or
invalid views navigable.

View deletion now cleans SQL through generic node lifecycles and follows normal portal-ghost
semantics. Folded results cannot act as structural keyboard or drag targets, and invalid inline SQL
cannot interrupt surrounding content.

Phase 11 must repair schema-complete replication coverage before the launcher adds durable saved
views. It then completes the saved-view place contract and begins the required subject/recipe/host
runtime migration. Phase 13 owns removal of the legacy face contract and blocks Phase 14 until it
is complete.

## Read next

1. [Phase 11](phases/Phase-11.md), starting with Stage 6.
2. [Architecture](Architecture.md) for the subject/recipe/host boundary.
3. [Plugins](Plugins.md) for the forward `line`/`collection` contract and migration boundary.
4. [Data Model](Data-Model.md) for view-subject ownership and stored SQL.
5. [Documentation.md](Documentation.md) for session closeout rules.

## Boundary

Execute Phase 11 stages in order. Do not build the launcher, retire tabs, or complete the global
design migration early.

## Next action

Begin Stage 6: move query ownership out of the forward recipe and make the focused view request a
minimal host-owned collection rendering.
