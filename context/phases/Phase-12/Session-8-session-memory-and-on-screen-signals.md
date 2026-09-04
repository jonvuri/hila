---
title: Phase 12 Session 8 — Session memory and on-screen signals
kind: phase-session
state: planned
updated: 2026-09-03
---

# Phase 12 Session 8 — Session memory and on-screen signals

## Goal

Add bounded, in-memory recovery and ranking signals without creating a preference, bookmark, or
durable navigation system.

## Dependencies

Sessions 3, 5, and 6 must be complete. This session may overlap Session 7.

## Plan

- [ ] Add one isolated session store for focus history, recent deep specs, and on-screen identities.
- [ ] Record at most six jump-back entries from stream append/replace/global-go transitions. Exclude
      the current visible focus-panel chain.
- [ ] Record at most six dismissed specs only when at least one chip was committed. Normalize and
      deduplicate them.
- [ ] Restore a recent spec's chips, text, and deep tempo without running a command or navigating.
- [ ] Feed on-screen identities from actual viewport intersections, not the virtualizer's retained
      multi-window buffer. Include visible focus-panel subjects.
- [ ] Use existing virtualizer geometry and bounded upward reporting. Do not add an observer per row.
- [ ] Add on-screen and session-recency weights to Session 3's scorer while preserving deterministic
      order for identical input/state.
- [ ] Reset all state on reload and plugin/database reset. Do not persist it or classify it as user
      data.
- [ ] Populate the quick launcher's jump-back and recent-search empty-state sections.

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
