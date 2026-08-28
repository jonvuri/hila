---
title: Current state
kind: status
state: active
updated: 2026-08-27
phase: phase-10
session: phase-10-session-4p-live-workspace-migration
---

# Now

Phase 10 Session 4p Stage 1 is complete. The focused `StreamView` contract now locks initial root,
panel transitions, four-column eviction, back navigation, external and inline navigation, folded
positions, unresolved positions, and cross-matrix hops. The approved workspace test locks the
first-visible-focus breadcrumb predicate. Stage 2 can now separate the controller from the live
presentation without changing this behavior.

The production navigation panel now owns one explicit scrollport and one bounded sticky widget.
`usePagedWorkspaceData` subscribes to expanded ancestry, subtree boundaries, one post-window row,
and a resolved or unresolved drill target. A separate bounded gather hydrates cross-matrix labels.
The metadata plane does not change the rendered range, the 100-row page size, or editor hydration.

Production rows publish numeric source geometry from model estimates and resize observation. The
controller selects an active heading from content coordinates. It keeps equal sticky DOM and
changes only the final row transform during push-off. Sticky disclosure, scroll-to-source, drill,
and source-focus restoration use the production controller. The secondary dock covers flow, top,
bottom, primary, pushed-primary, and unresolved states.

Session 4o-c found four integration defects. Ancestry replacements no longer flash an empty chain.
Numeric source jumps now reconcile retained virtual windows. Focused navigation now owns a bounded
scrollport. Bounded virtualizers now end at their measured or estimated final window instead of a
synthetic safety tail. The new production E2E proof covers 465 rows, five pages, root and focused
navigation, unmounted ancestry, push-off in both directions, source reveal, and drill.

## Verification

- `npm run format` passes.
- `npm run lint` passes with 14 existing warnings and no errors.
- `npm run typecheck` passes.
- The focused `StreamView` controller contract has seven passing tests.
- The full suite has 913 passing tests.
- The Storybook build passes.
- The focused production E2E proof passes in system Chromium.
- The six reset-based paging, editing, keyboard, collapse, and drag E2E scenarios pass.
- Focused E2E proves that non-navigation content still scrolls and that navigation boundary input
  does not move the outer scroller.
- A 180-frame production trace has zero rebuilds for an unchanged chain, 180 final-row position
  writes, CLS 0.00, and no reported performance insight or long-task finding.
- Live inspection confirms all active thresholds in both directions, 265 retained metadata rows,
  265 mounted source rows, two bounded ancestors, correct title masking, and correct classic and
  hidden scrollbar widths. At a 390-pixel viewport, the widget fits the 369-pixel content width
  and the long label keeps one line with ellipsis.
- Final user review confirms that macOS trackpad scrolling and sticky-header behavior match the
  approved Storybook treatment.

## Production boundary

The widget is mounted in root and focused production navigation. `StreamView`, the workspace shell,
and the executable overlaid-card renderer remain unchanged. Session 4p Stage 2 owns the controller
and shell-contract separation. Session 4q remains blocked until the cutover passes review.

The Session 4o change set is staged and reviewed. The current visual and content mismatch between
source rows and sticky rows is not a blocker while row design remains unsettled. The future
continuity requirement is recorded in the [Sessions 4p–4q plan](Phase-10-Sessions-4p-4q-plan.md).

## Read for Session 4p

1. The [Sessions 4p–4q plan](Phase-10-Sessions-4p-4q-plan.md), especially the fixed decisions and
   Session 4p Stage 1.
2. The Session 4o [closeout](Phase-10-Session-4o-plan.md#closeout-gate).
3. The approved workspace rules in [Design.md](Design.md).
4. The browser and E2E [testing guide](Testing.md).
5. `src/workspace/StreamView.tsx` and the current overlaid-card renderer boundary.

## Next action

Execute Session 4p Stage 2 in order. Keep the Stage 1 behavior contract green while separating the
controller from presentation. Do not start Session 4q early.

## Documentation boundary

Until Phase 10 settles, limit cleanup to routing, current-state accuracy, and clear historical
markers. The broader documentation audit remains deferred until after Phase 10.

## Handoff rule

At the end of each session, check off the detailed session items. Then update this file with the
completed outcome, verification, next session, and minimum reading set.
