---
title: Current state
kind: status
state: active
updated: 2026-09-23
phase: 12
session: saved-view-authoring-and-editor-exits
---

# Now

Phase 12 Sessions 1–6 and 4A are complete. The main thread has authoritative command and shortcut
registries. The query-spec dialect has matched compilation and recognition, bounded execution,
durable round trips, paging, rename healing, and read-only user query edges.

Global discovery now scans current label/content roles through one bounded worker request, merges
main-thread commands, classifies every place family, and ranks deterministically. Typed family
filters back `@`, `#`, `>`, and `[`. External navigation carries cross-matrix identity and optional
appearance provenance, then resolves through provenance, ownership home, or deterministic
membership context without choosing an arbitrary portal. No schema change occurred.

Quick now ships as one theme-independent production launcher. Global `Mod-k` captures invocation
provenance from stream, editor, table, or system-edge focus. One controlled list supplies bounded
places, commands, family filters and suggestions, disabled reasons, generated help, and latest-only
async publication. Go/run dismisses through the Session 3 navigation or command path and deliberately
transfers focus; cancel/toggle/outside dismissal restores the exact invoking element and editor
selection without editor churn.

Ghost and Null use the approved centered Quick modal. Wipeout uses the approved responsive
top-left shell with aligned workspace mark, block cursor, post-facto echoes, and reduced-motion
fallback. All variants share state, content, keyboard, pointer, focus, and accessibility behavior.
No schema change occurred.

The same production launcher now enters Deep when its first query chip commits. Tab commits concrete
kinds or node scopes; column menus, typed operators, pointer paths, and normalized values edit one
transient `QuerySpec`. Relative dates freeze to stated local-calendar boundaries. Formula fields
remain visible but disabled with a reason.

Deep compiles bound plans per input change and renders one host-owned, read-only preview in every
theme. It caps meaning at 1,000 rows, pages by 100, retains at most six virtual windows, ignores stale
results, and mounts no face or editor. Ghost and Null expand within centered viewport margins;
Wipeout fills the viewport and preserves its post-facto/reduced-motion behavior. No schema change
occurred.

The unreleased app remains at reset-only schema version 0. The durable dogfooding gate may follow
all currently planned phases.

## Read next

1. [Phase 12 front door](phases/Phase-12.md).
2. [Session 7 — saved-view authoring and editor exits](phases/Phase-12/Session-7-saved-view-authoring-and-editor-exits.md).
3. [Query Spec](Query-Spec.md), [Launcher](Launcher.md), [Design](Design.md), and the completed
   [Session 4A prototype record](phases/Phase-12/Session-4a-quick-deep-overlay-prototypes.md).

## Boundary

Session 7 owns save-as-view, recognition-backed durable chip editing, and the live-editor insert-ref
exit. Preserve SQL as the sole stored truth and keep custom or opaque SQL honest. Do not build
session memory or tab retirement early.

## Next action

Implement Session 7 in order, reusing the shipped query operations, compiler/recognizer, view-block
identity, place navigation, and editor persistence paths.
