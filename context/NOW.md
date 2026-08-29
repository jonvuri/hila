---
title: Current state
kind: status
state: active
updated: 2026-08-29
phase: phase-10
session: phase-10-launcher-migration-planning
---

# Now

Phase 10 Sessions 4p and 4q are complete. The live app uses the production workspace shell, and
the retired overlaid-card implementation is removed.

`StreamView` uses the typed stream controller and the approved four-column shell. It preserves
workspace data, focus and back operations, cross-matrix navigation, folded-row behavior, and the
simple deep-ancestry breadcrumb. Root and nested navigation use the production sticky widget and
the independent `navigationOutline` component setting.

`src/design/workspace/reading-queue-fixture.ts` owns the neutral Reading queue story data. The 20
files under the former `src/design/overlaid-cards/` directory are deleted. Runtime, tests, stories,
styles, Storybook configuration, and build inputs have no retired-name, `--card-*`, or `.card-*`
reference. Historical Phase 7 and Phase 10 documents, archived HTML, and git history preserve the
design evidence.

## Verification

- Formatting, static types, all 917 unit tests, and the Storybook build pass.
- Lint passes with the existing 14 warnings and no errors.
- The focused system-Chromium suite has 39 passing tests.
- The Storybook index contains only the six current `Design/Workspace` layout stories.
- The final Chrome DevTools smoke passes for root navigation, deep focus, back, cross-matrix focus,
  sticky transitions in both directions, and all six visual-theme and polarity pairs.
- `git diff --check` passes.

## Deferred continuity requirement

The visual and content mismatch between source rows and sticky rows remains deferred while the row
surface design is unsettled. The future requirement is in the
[Sessions 4p–4q plan](Phase-10-Sessions-4p-4q-plan.md#deferred-navigation-row-and-sticky-continuity).

## Read for the next session

1. Phase 10 §3b and §4 in [Phase-10.md](Phase-10.md).
2. The launcher contract in [Launcher.md](Launcher.md).
3. The migration rules in [Design.md](Design.md).
4. The follow-on order in the [Sessions 4p–4q plan](Phase-10-Sessions-4p-4q-plan.md#follow-on-order).

## Next action

Create a dedicated plan for the launcher and shared-overlay migration onto canonical tokens. Land
the launcher before removing the Table and Tags tabs. Do not start the tab, face, or browser
migrations early.

## Documentation boundary

Until Phase 10 settles, limit cleanup to routing, current-state accuracy, and clear historical
markers. Keep the broader documentation audit deferred until after Phase 10.

## Handoff rule

At the end of each session, check off the detailed session items. Then update this file with the
completed outcome, verification, next session, and minimum reading set.
