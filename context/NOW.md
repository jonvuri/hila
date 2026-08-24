---
title: Current state
kind: status
state: active
updated: 2026-08-23
phase: phase-10
session: phase-10-session-4m-navigation-outlines
---

# Now

Phase 10 Session 4l is closed. The forward workspace specimen now uses a pure sticky-layout model
with stable slot identity, active ancestry, boundary data, and bounded transition progress. Flow
rows and sticky previews share one row geometry and decoration seam. Header and drill handoffs use
scroll-linked transforms, and scroll state updates at most once per animation frame.

The new dense Storybook fixture covers title-only, one-level, multi-level, drill-at-top, and
drill-at-bottom transitions. Pure and component tests cover threshold edges, both directions,
stable slot elements, row state, collapse, reduced motion, and drill handoffs.

A follow-up corrected leaf-tail boundaries. Only expanded rows with children can advance the
sticky chain or push an existing header. Leaf siblings now scroll under the current headers until
the next eligible headers arrive.

The live app, production faces, and executable overlaid-card archive remain unchanged. Their
migration stays in the later planned slices.

## Current verification

- `npm run format` passes.
- `npm run lint` passes with 14 existing warnings and no errors.
- `npm run typecheck` passes.
- All 865 unit tests pass.
- `pnpm build-storybook` passes.
- `git diff --check` passes.
- Chrome DevTools one-pixel scans report at most one pixel of slot movement per scroll step in both
  directions. Incoming previews match their flow rows with zero vertical error.
- Desktop and narrow inspection passes in all three visual themes and both polarities. Reduced
  motion uses instant click-to-scroll and no CSS animation.
- The scroll performance trace reports CLS 0.00, no performance insights, and no long task. The
  scroll handler performs no layout read. Chrome DevTools reports no console messages or issues.

## Read for Session 4m

1. The [outline-affordance preflight](Phase-10-Sessions-4j-4m-plan.md#outline-affordances).
2. The [Session 4m checklist](Phase-10-Sessions-4j-4m-plan.md#session-4m--integrate-configurable-navigation-outlines).
3. The [navigation outline contract](Design-Faces.md#navigation-outline-variants).
4. The [browser testing guide](Testing.md#agent-driven-live-browser-testing).

## Next action

Replace the ambiguous outline theme boundary with the navigation-outline variant registry. Then
separate decoration calculation and paint from navigation-row behavior. Preserve the stable sticky
geometry and do not migrate production configuration early.

## Documentation boundary

Until Phase 10 settles, limit cleanup to routing, current-state accuracy, and clear historical
markers. The broader documentation audit remains deferred until after Phase 10.

## Handoff rule

At the end of each session, check off the detailed session items. Then update this file with the
completed outcome, verification, next session, and minimum reading set.
