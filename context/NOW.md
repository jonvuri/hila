---
title: Current state
kind: status
state: active
updated: 2026-09-23
phase: 12
session: shared-overlay-and-selectable-list
---

# Now

Phase 12 Sessions 1–3 are complete. The main thread has authoritative command and shortcut
registries. The query-spec dialect has matched compilation and recognition, bounded execution,
durable round trips, paging, rename healing, and read-only user query edges.

Global discovery now scans current label/content roles through one bounded worker request, merges
main-thread commands, classifies every place family, and ranks deterministically. Typed family
filters back `@`, `#`, `>`, and `[`. External navigation carries cross-matrix identity and optional
appearance provenance, then resolves through provenance, ownership home, or deterministic
membership context without choosing an arbitrary portal. No schema change occurred.

Session 4 is implemented and verified, pending user visual and interaction review. A controlled
selectable list now backs centered modal and cursor-anchored overlays with shared keyboard,
pointer, focus, dismissal, and accessibility behavior. The first-level slash menu uses the
anchored primitive without changing its command semantics. Storybook covers geometry, semantic
states, themes, polarity, narrow layouts, and reduced motion. Nested theme scopes now re-resolve
semantic color roles, including the new scrim role. No schema change occurred.

The unreleased app remains at reset-only schema version 0. The durable dogfooding gate may follow
all currently planned phases.

## Read next

1. [Phase 12 front door](phases/Phase-12.md).
2. [Session 4 — shared overlay and selectable list](phases/Phase-12/Session-4-shared-overlay-and-selectable-list.md).
3. [Design](Design.md), [Design Faces](Design-Faces.md), and [Testing](Testing.md).

## Boundary

Do not build launcher search state, chips, or deep preview before Session 4 review closes. Preserve
the verified slash behavior and shared overlay contract.

## Next action

Review `Design/Selectable overlay` in Storybook. Address findings, close Session 4, then route the
next handoff to Session 5.
