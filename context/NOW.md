---
title: Current state
kind: status
state: ready
updated: 2026-08-31
phase: 11
session: stage-5-view-place-contract
---

# Now

Phase 11 Stage 4 is complete. A full two-replica fixture reconstructs source truth by logical
identity and matches rebuilt position and ancestry results. It covers workspace content, hierarchy,
cross-matrix ownership, portals, promoted types, owned matrixes, inline refs/tags, face recipes, and
saved-view SQL. Concurrent promoted/view/owner changes retain conflicts, and composite deletes
round-trip without echoes.

Phase 11 must repair schema-complete replication coverage before the launcher adds durable saved
views. It then completes the saved-view place contract and begins the required subject/recipe/host
runtime migration. Phase 13 owns removal of the legacy face contract and blocks Phase 14 until it
is complete.

## Read next

1. [Phase 11](phases/Phase-11.md), starting with Stage 5.
2. [Data Model](Data-Model.md) for block-marker ownership and place identity.
3. [Architecture](Architecture.md) for focus and navigation boundaries.
4. [Documentation.md](Documentation.md) for session closeout rules.

## Boundary

Execute Phase 11 stages in order. Do not build the launcher, retire tabs, or complete the global
design migration early.

## Next action

Begin Stage 5: complete the named, focusable, navigable `view` place contract on the existing marker
identity and `block_sources` SQL.
