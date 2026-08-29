---
title: Current state
kind: status
state: active
updated: 2026-08-28
phase: phase-10
session: phase-10-session-4p-approval
---

# Now

Phase 10 Session 4p implementation and verification are complete. User approval remains open.
Do not start Session 4q or remove the archived implementation before that approval.

`StreamView` renders the production workspace shell directly from the typed stream controller. No
live workspace module imports `OverlaidCards` or `OverlaidAncestor`. Stable shell wrappers preserve
mounted navigation and focus panels when ancestry or active state changes.

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

Stage 5 found stale E2E selectors for the retired stream and card DOM. The tests now use the
production shell contract. Retired gap-card scenarios now prove the simple breadcrumb predicate,
four-column eviction, ancestor selection, and return to root. A new system-browser test proves the
reduced-motion token override.

## Verification

- Formatting makes no changes. Lint passes with the existing 14 warnings and no errors. Static
  types, all 917 unit tests, and the Storybook build pass.
- The updated stream and cross-matrix boundary-hop E2E set has 13 passing tests in system Chromium.
  The production sticky, folded-row, app-shell, and affected tag set has 11 passing tests. The new
  reduced-motion proof passes.
- The production sticky proof covers 465 rows, five pages, root and focused navigation, unmounted
  ancestry, push-off in both directions, source reveal, drill, bounded metadata, and outer-scroll
  isolation.
- Live DevTools review covers root visible, root shifted, four columns, cross-matrix focus, narrow
  width, long labels, keyboard focus, and all six visual-theme and polarity pairs. All navigation
  panels keep `guides`.
- At 390 pixels, each widget stops at its content width and leaves the 15-pixel scrollbar gutter
  clear. A 667-pixel long label uses one 239-pixel line with ellipsis.
- A 180-frame bidirectional trace has CLS 0.00 and no reported performance insight or long-task
  finding. The console has no errors. It has the existing Solid disposal warnings and form-field
  naming issue.

## Production boundary

The widget is mounted in root and focused production navigation. `StreamView` renders the
production workspace shell. The executable overlaid-card presentation has no live consumer. The
remaining source dependency is exact: `src/design/workspace/fixtures.ts` imports `workspacePanels`
and `workspaceTitle` from `src/design/overlaid-cards/fixtures.tsx`. The archived stories and their
internal renderer, type, variant, style, and fixture imports remain inside
`src/design/overlaid-cards/`. Session 4q owns the fixture move and complete archive removal after
user approval.

The Session 4o change set is staged and reviewed. The current visual and content mismatch between
source rows and sticky rows is not a blocker while row design remains unsettled. The future
continuity requirement is recorded in the [Sessions 4p–4q plan](Phase-10-Sessions-4p-4q-plan.md).

## Read for approval and Session 4q

1. The Session 4p Stage 5 evidence and Session 4p closeout in the
   [Sessions 4p–4q plan](Phase-10-Sessions-4p-4q-plan.md).
2. Session 4q in the same plan, but only after user approval.
3. Phase 10 [section 4](Phase-10.md#4-cohesive-design-token-and-theming-system).
4. `src/design/workspace/fixtures.ts` and the archived `src/design/overlaid-cards/` directory.

## Next action

Get user approval for Session 4p. If approved, check the final Stage 5 item, mark Session 4p complete
in Phase 10, and execute Session 4q in order. Do not remove the archived implementation or start
Session 4q before approval.

## Documentation boundary

Until Phase 10 settles, limit cleanup to routing, current-state accuracy, and clear historical
markers. The broader documentation audit remains deferred until after Phase 10.

## Handoff rule

At the end of each session, check off the detailed session items. Then update this file with the
completed outcome, verification, next session, and minimum reading set.
