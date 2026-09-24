---
title: Phase 12 Session 8 — Session memory and on-screen signals
kind: phase-session
state: complete
updated: 2026-09-24
---

# Phase 12 Session 8 — Session memory and on-screen signals

## Goal

Add bounded, in-memory recovery and ranking signals without creating a preference, bookmark, or
durable navigation system.

## Dependencies

Sessions 3, 5, and 6 must be complete. This session may overlap Session 7.

## Plan

- [x] Add one isolated session store for focus history, recent deep specs, and on-screen identities.
- [x] Record at most six jump-back entries from stream append/replace/global-go transitions. Exclude
      the current visible focus-panel chain.
- [x] Record at most six dismissed specs only when at least one chip was committed. Normalize and
      deduplicate them.
- [x] Restore a recent spec's chips, text, and deep tempo without running a command or navigating.
- [x] Feed on-screen identities from actual viewport intersections, not the virtualizer's retained
      multi-window buffer. Include visible focus-panel subjects.
- [x] Use existing virtualizer geometry and bounded upward reporting. Do not add an observer per row.
- [x] Add on-screen and session-recency weights to Session 3's scorer while preserving deterministic
      order for identical input/state.
- [x] Reset all state on reload and plugin/database reset. Do not persist it or classify it as user
      data.
- [x] Populate the quick launcher's jump-back and recent-search empty-state sections.

## Decision note

Recent Deep entries are cancellation recovery, not a history of successful searches. Escape,
`Mod-k`, outside dismissal, and equivalent cancellation paths record the last committed chips plus
ordinary text. Successful go, run, save, and insert exits do not. Successful navigation already
appears in Jump back, while durable keepers belong in saved views. Mid-draft cancellation restores
the last committed state and deliberately drops transient chip, filter, help, and notice layers.

## Acceptance

- Jump-back and recent lists are capped, deduplicated, correctly ordered, and reset on reload.
- Restore means restore, not run or go.
- Current panels are absent from jump-back; only truly visible rows get the on-screen boost.
- Scroll and focus changes update signals without unbounded subscriptions or editor churn.
- No schema, durability policy, or sync change occurs.

## Verification

- Add store cap/dedupe/reset, focus-history, restore, viewport intersection, and ranking tests.
- Add real-Chrome jump-back, dismiss/restore, and on-screen reorder E2E.
- Run performance/editor-churn checks, standard checks, and `git diff --check`.

Completed with focused store, controller, launcher, selectable-list, discovery, and ranking coverage.
The full unit suite passed 1,207 tests. The 16-case Quick Launcher system-Chrome spec passed,
including editor-yielding, cancellation recovery, and actual-viewport ranking. The two-case
performance contract passed with zero editor churn, forced layouts, or long tasks. Format, lint,
typecheck, and `git diff --check` passed. No schema, durability, or sync change occurred.
