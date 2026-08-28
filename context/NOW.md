---
title: Current state
kind: status
state: active
updated: 2026-08-27
phase: phase-10
session: phase-10-session-4p-live-review
---

# Now

Phase 10 Session 4p Stage 4 is complete. `StreamView` now renders the production workspace shell
directly from the typed stream controller. No live workspace module imports `OverlaidCards` or
`OverlaidAncestor`. Stable shell wrappers preserve mounted navigation and focus panels when
ancestry or active state changes.

The simple breadcrumb appears only when the first visible panel is a focus panel. It starts with
the workspace title and then uses the existing controller ancestry. The title returns to root.
Each ancestry item keeps the existing click-navigation path.

The production navigation panel now owns one explicit scrollport and one bounded sticky widget.
`usePagedWorkspaceData` subscribes to expanded ancestry, subtree boundaries, one post-window row,
and a resolved or unresolved drill target. A separate bounded gather hydrates cross-matrix labels.
The metadata plane does not change the rendered range, the 100-row page size, or editor hydration.

Production rows publish numeric source geometry from model estimates and resize observation. The
controller selects an active heading from content coordinates. It keeps equal sticky DOM and
changes only the final row transform during push-off. Sticky disclosure, scroll-to-source, drill,
and source-focus restoration use the production controller. The secondary dock covers flow, top,
bottom, primary, pushed-primary, and unresolved states.

The app now reads `navigationOutline` from the persisted workspace face settings and resolves it
through the typed component-variant registry. Root navigation, nested navigation, source rows, and
sticky rows receive the same resolved adapter key. The default is Guides. The explicit component
value stays independent of visual theme and polarity. The navigation host exposes the resolved
value for live inspection.

Production modules outside the retired renderer no longer consume `--card-*`. The shell loading
state uses canonical roles. The existing navigation and focus components still own loading,
empty, error, unresolved-position, narrow-width, and long-label behavior. Paging, retained
metadata, virtual windows, sticky geometry, and transition calculations did not change.

Session 4o-c found four integration defects. Ancestry replacements no longer flash an empty chain.
Numeric source jumps now reconcile retained virtual windows. Focused navigation now owns a bounded
scrollport. Bounded virtualizers now end at their measured or estimated final window instead of a
synthetic safety tail. The new production E2E proof covers 465 rows, five pages, root and focused
navigation, unmounted ancestry, push-off in both directions, source reveal, and drill.

## Verification

- Stage 4 static types pass.
- The focused `StreamView` controller, configuration, and cutover contract has nine passing tests.
- The production workspace-shell contract has two passing tests.
- The Stage 3 baseline has 916 passing tests. Formatting, lint, the production build, and the
  Storybook build pass at that baseline. Stage 5 must rerun them after the cutover.
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

The widget is mounted in root and focused production navigation. `StreamView` renders the
production workspace shell. The executable overlaid-card presentation has no live consumer. Its
archived stories remain, and the forward workspace fixture still imports archived Reading queue
data. Session 4q owns that fixture move and archive removal after Stage 5 approval.

The Session 4o change set is staged and reviewed. The current visual and content mismatch between
source rows and sticky rows is not a blocker while row design remains unsettled. The future
continuity requirement is recorded in the [Sessions 4p–4q plan](Phase-10-Sessions-4p-4q-plan.md).

## Read for Session 4p Stage 5

1. The [Sessions 4p–4q plan](Phase-10-Sessions-4p-4q-plan.md), especially the fixed decisions and
   Session 4p Stage 5.
2. The Session 4o [closeout](Phase-10-Session-4o-plan.md#closeout-gate).
3. The approved workspace rules in [Design.md](Design.md).
4. The browser and E2E [testing guide](Testing.md).
5. `src/workspace/StreamView.tsx`, `WorkspaceShell.tsx`, `NavigationPanel.tsx`, and
   `ProductionStickyNavigation.tsx`.

## Next action

Execute Session 4p Stage 5 in order. Run the full automated checks, focused production E2E proof,
live state and theme review, and scroll trace. Get user approval before Session 4q. Do not remove
the archived implementation or start Session 4q early.

## Documentation boundary

Until Phase 10 settles, limit cleanup to routing, current-state accuracy, and clear historical
markers. The broader documentation audit remains deferred until after Phase 10.

## Handoff rule

At the end of each session, check off the detailed session items. Then update this file with the
completed outcome, verification, next session, and minimum reading set.
