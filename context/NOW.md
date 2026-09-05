---
title: Current state
kind: status
state: ready
updated: 2026-09-05
phase: 12
session: place-discovery-navigation-and-ranking
---

# Now

Phase 11 is complete. Saved views are durable named places with one replicated SQL source and a
host-owned collection region.

The unreleased app remains at reset-only schema version 0. The first
dogfood build whose data should survive upgrades activates the durable dogfooding gate and
establishes version 1; the gate may follow all currently planned phases.

The dormant migration runner already proves ordered schema/data evolution and full rollback. The
gate requires explicit reset or reviewed adoption of version-0 databases, removal of reset-era
compatibility migrations, and a backup path before the first `1 → 2` migration.

Phase 12 Sessions 1 and 2 are complete. The main thread has authoritative command and shortcut
registries. The executable query-spec dialect now has a matched compiler and recognizer, transient
bound plans, persistent self-contained SQL, exact subscription identities, stale-result guards, and
read-only user query edges. Concrete-matrix output remains updatable and ownership-safe.

Saved views page deterministically through semantic limits. Structured views survive create,
reload, edit, and column rename. Rename healing recompiles recognized terms in the rename
transaction, preserves opaque fragments, reports stranded opaque references, and converges across
two replicas. No schema change occurred.

Durable gesture-authored views require a concrete matrix/type in v1. Cross-matrix `everything` and
`containers` remain transient launcher lenses until a dynamic global-search substrate exists.
Phase 13 still owns the embedded legacy face/runtime and remaining style migration.

## Read next

1. [Phase 12 front door](phases/Phase-12.md).
2. [Session 3 — place discovery, navigation, and ranking](phases/Phase-12/Session-3-place-discovery-navigation-and-ranking.md).
3. [Architecture](Architecture.md) and [Launcher](Launcher.md).

## Boundary

Do not build launcher presentation, session-memory signals, FTS, fuzzy matching, or a durable global
index in Session 3. Preserve appearance provenance; identity-only navigation uses ownership home,
then deterministic membership fallback, never an arbitrary portal.

## Next action

Define Session 3's discovery catalog and result types, then build the bounded worker-backed catalog
query before changing launcher presentation.
