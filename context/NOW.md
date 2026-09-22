---
title: Current state
kind: status
state: ready
updated: 2026-09-05
phase: 12
session: shared-overlay-and-selectable-list
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

Phase 12 Sessions 1–3 are complete. The main thread has authoritative command and shortcut
registries. The query-spec dialect has matched compilation and recognition, bounded execution,
durable round trips, paging, rename healing, and read-only user query edges.

Global discovery now scans current label/content roles through one bounded worker request, merges
main-thread commands, classifies every place family, and ranks deterministically. Typed family
filters back `@`, `#`, `>`, and `[`. External navigation carries cross-matrix identity and optional
appearance provenance, then resolves through provenance, ownership home, or deterministic
membership context without choosing an arbitrary portal. No schema change occurred.

## Read next

1. [Phase 12 front door](phases/Phase-12.md).
2. [Session 4 — shared overlay and selectable list](phases/Phase-12/Session-4-shared-overlay-and-selectable-list.md).
3. [Design](Design.md), [Design Faces](Design-Faces.md), and [Testing](Testing.md).

## Boundary

Do not build launcher search state, chips, or deep preview in Session 4. Preserve slash trigger,
query, deletion, and command behavior while replacing only its presentation and shared interaction
physics.

## Next action

Specify the shared controlled-selection and focus contract, then implement the centered and
cursor-anchored variants over one selectable-list model.
