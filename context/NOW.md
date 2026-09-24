---
title: Current state
kind: status
state: active
updated: 2026-09-24
phase: 12
session: responsive-workspace-shell-implementation
---

# Now

Phase 12 Sessions 1–9 and 4A are complete. The main thread has authoritative command and shortcut
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

Concrete Deep specs now save through the existing marker/`block_sources` path. Save focuses the
returned marker and selects its chip-derived name. Reopened SQL recognizes into durable gesture
chips, chips plus byte-exact opaque leaves, or honest custom SQL. Raw SQL remains one gesture away,
reclassifies and validates live, and cannot apply an invalid draft.

Launcher invocation now retains an exact live editor selection. `Mod-Enter` inserts Quick discovery
or Deep preview rows through the canonical inline-reference transaction, then normal persistence
and relation sync run. Changed or unmounted editors are refused with a reason. No schema change
occurred.

One app-scoped, runtime-only session store now keeps at most six successful focus destinations, six
canceled Deep states, and bounded actual-viewport identities. Jump back excludes the visible focus
chain. Recent Deep restores committed chips plus ordinary text without running or navigating;
successful go, run, save, and insert exits do not enter it. Discovery adds conservative on-screen
and session-recency weights while preserving stronger match quality. Reload and plugin/database
reset clear every signal. No session state is persisted, replicated, or classified as user data.

The unreleased app remains at reset-only schema version 0. The durable dogfooding gate may follow
all currently planned phases.

## Read next

1. [Phase 12 front door](phases/Phase-12.md).
2. [Session 9A — responsive workspace shell implementation](phases/Phase-12/Session-9a-responsive-workspace-shell-implementation.md).
3. [Launcher](Launcher.md), [Architecture](Architecture.md), [Design](Design.md), and
   [Design Faces](Design-Faces.md).

## Boundary

Session 9 completed the design-only Storybook exploration. It selected one runtime-only shell
presentation axis: retain the current four-panel window at 720px or above and show only its active
existing panel at 719px or below. Every retained panel stays mounted. Narrow mode reuses ancestry,
root recovery, Back, Jump back, and the launcher without new chrome. No explicit wide focused mode
was selected. No schema change occurred.

## Next action

Implement Session 9A in production, including resize continuity, hidden-panel semantics, ancestry,
focus transfer, and real-browser coverage. Do not begin tab retirement.
