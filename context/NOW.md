---
title: Current state
kind: status
state: active
updated: 2026-08-16
phase: phase-10
session: phase-10-session-4e-design-card-grammar
---

# Now

Phase 10 Session 4d is closed. The forward `Design/Workspace` stories now use one
theme-neutral Ghost skeleton. It owns the shared column, focus-panel, sticky-navigation,
drill-path, and minimum-affordance structure without `wo-*` assumptions.

## Session 4d verification

- Format, lint, typecheck, the conditional-breadcrumb component test, and the Storybook
  build passed.
- The full unit suite passed 833 tests. Two unchanged performance tests exceeded their
  five-second limits, and both files passed when run alone.
- No live-app, production-face, or canonical-token file changed.

## Read for Session 4e

1. [Sessions 4c–4i](Phase-10-Session-4c-plan.md): read the fixed decisions, shared
   boundaries, Session 4e checklist, and verification section.
2. The forward [workspace stories](../src/design/workspace/Workspace.stories.tsx) and
   shared [workspace types](../src/design/workspace/types.ts).
3. The current component stories under `src/design/` only when they supply a required
   ThemeCard specimen.

Do not reload the full Session 4b brief. Its surviving structure is now implemented in
the Ghost workspace files.

## Settled direction

- Ghost owns shared workspace structure, behavior, and minimum affordances.
- Null and Wipeout extend Ghost through shared semantic inputs and optional decoration.
- The simple ancestry breadcrumb appears only when the first visible panel is focus.
- Canonical tokens and shipping-theme choices wait for the Ghost → Null → Wipeout
  comparison page and explicit approval in Session 4i.

## Next session: 4e

Build the reusable ThemeCard grammar with the fixed section order, dense identical
specimens, temporary local semantic roles, and controls only for open decisions.

Do not set Ghost, Null, or Wipeout values yet. Do not define canonical tokens, wire the
live app, modify production faces, or clean up archived renderers.

## Following sequence

- **4f:** complete the Ghost card.
- **4g:** rebuild Null as a Ghost extension.
- **4h:** rebuild Wipeout as a Ghost extension.
- **4i:** compare, tune, approve, and derive token requirements.

The detailed outcomes and acceptance criteria remain in
[the 4c–4i plan](Phase-10-Session-4c-plan.md); do not duplicate them here.

## Documentation boundary

Until Phase 10 settles, limit cleanup to routing, current-state accuracy, and clear
historical markers. The broader documentation audit remains deferred until after Phase 10.

## Handoff rule

At the end of each session, check off the detailed session items. Then update this file
with the completed outcome, verification, next session, and minimum reading set.
