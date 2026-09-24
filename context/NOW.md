---
title: Current state
kind: status
state: active
updated: 2026-09-24
phase: 12
session: surface-capture-tab-retirement-closeout
---

# Now

Phase 12 Sessions 1–9A and 4A are complete. The production launcher now owns bounded discovery,
commands, rooted cross-matrix navigation, Quick and Deep gesture authoring, saved-view round trips,
editor insert-ref exits, and runtime-only session memory. Its themes share behavior, keyboard,
pointer, focus, and accessibility semantics.

The production workspace now retains its existing four-panel window at a 720px-or-wider host and
projects only the active mounted panel at 719px or below. Hidden panels are absent from layout,
interaction, and the accessibility tree without losing editor, selection, pending-save, scroll,
virtualizer, or disclosure state. Narrow focus panels expose rooted ancestry; hidden focus transfers
to the active landmark with a polite announcement. No wide focused mode or new navigation chrome
ships. The unreleased app remains at reset-only schema version 0; no Session 9A state is persisted,
replicated, or classified as user data.

## Read next

1. [Phase 12 front door](phases/Phase-12.md).
2. [Session 10 — surface capture, tab retirement, and closeout](phases/Phase-12/Session-10-surface-capture-tab-retirement-and-closeout.md).
3. [Launcher](Launcher.md), [Architecture](Architecture.md), [Design](Design.md), and
   [Design Faces](Design-Faces.md).

## Boundary

Session 9A shipped the responsive workspace contract and repaired the folded-row no-position
fallback exposed by its empty-state browser coverage. All 177 real-browser tests pass. Session 10
must preserve Table and Tags evidence before retiring their temporary roots. Embedded table, inline
tag, property, and face-adapter work remains for Phase 13. No schema change occurred.

## Next action

Execute Session 10's navigation-role parity gate, Storybook capture, tab retirement, and Phase 12
closeout in order.
