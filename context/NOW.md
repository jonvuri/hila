---
title: Current state
kind: status
state: active
updated: 2026-08-29
phase: phase-10
session: phase-boundary-reconciliation-planning
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

1. The [phase-boundary reconciliation brief](Phase-Boundary-Reconciliation-plan.md).
2. The original Phase 10 charter and current completion state in [Phase-10.md](Phase-10.md).
3. The current roadmap boundary in [Plan.md](Plan.md#phase-10----app-structure-and-cohesive-design-system).
4. The context roles and current reading routes in [README.md](README.md).

## Next action

Run the fresh planning session in the reconciliation brief. Close Phase 10 at its original
design-hardening boundary, audit the active context and implementation, restructure the context
corpus, and rebuild the roadmap. Use focused subagents for independent, context-heavy reviews.
Do not implement the launcher or other product features.

## Documentation boundary

The next session owns the previously deferred broad documentation audit. Review authority and
dependencies before moving files. Preserve history, but remove inactive material from the active
reading path. Add durable documentation-hygiene instructions and link them from this file.

## Handoff rule

At the end of each session, check off the detailed session items. Then update this file with the
completed outcome, verification, next session, and minimum reading set.
