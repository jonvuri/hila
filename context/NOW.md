---
title: Current state
kind: status
state: active
updated: 2026-09-23
phase: 12
session: quick-launcher-shell
---

# Now

Phase 12 Sessions 1–4 are complete. The main thread has authoritative command and shortcut
registries. The query-spec dialect has matched compilation and recognition, bounded execution,
durable round trips, paging, rename healing, and read-only user query edges.

Global discovery now scans current label/content roles through one bounded worker request, merges
main-thread commands, classifies every place family, and ranks deterministically. Typed family
filters back `@`, `#`, `>`, and `[`. External navigation carries cross-matrix identity and optional
appearance provenance, then resolves through provenance, ownership home, or deterministic
membership context without choosing an arbitrary portal. No schema change occurred.

Session 4 is implemented, verified, and user-approved. A controlled selectable list now backs
centered modal and cursor-anchored overlays with shared keyboard, pointer, focus, dismissal, and
accessibility behavior. The first-level slash menu uses the anchored primitive without changing
its command semantics. Nested theme scopes re-resolve semantic color roles, including the scrim
role. No schema change occurred.

Session 4A is complete and approved as the provisional launcher presentation direction. Ghost and
Null use centered Quick and Deep modals. Wipeout uses a top-left Quick surface, full-viewport Deep,
an aligned workspace mark and block cursor, black border-defined surfaces, and measured post-facto
echoes. The shared launcher contract remains theme-independent; the distinct presentations are a
deliberate modularity proof and remain open to dogfood-driven revision.

The unreleased app remains at reset-only schema version 0. The durable dogfooding gate may follow
all currently planned phases.

## Read next

1. [Phase 12 front door](phases/Phase-12.md).
2. [Session 5 — quick launcher shell](phases/Phase-12/Session-5-quick-launcher-shell.md).
3. [Launcher](Launcher.md), [Design](Design.md), and the completed
   [Session 4A prototype record](phases/Phase-12/Session-4a-quick-deep-overlay-prototypes.md).

## Boundary

Session 5 owns the production Quick launcher only. Keep search state, results, focus, dismissal,
keyboard, pointer, and accessibility behavior shared across themes while the shell selects the
approved presentation. Do not build chips, Deep preview, saving, or session memory early.

## Next action

Implement Session 5 in order, promoting the accepted Quick presentation without importing the
Storybook prototype as a production component.
