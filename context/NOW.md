---
title: Current state
kind: status
state: active
updated: 2026-08-16
phase: phase-10
session: phase-10-session-4d-ghost-workspace-skeleton
---

# Now

Phase 10 Session 4c is closed. Storybook and the Session 4 HTML pages now mark the
theme fan-out as an archive. The archived **Wipeout · Sticky headers** story remains the
named structural source. The forward `Design/Workspace` group contains only a Ghost
placeholder.

## Session 4c verification

- Format, lint, typecheck, focused performance tests, and the Storybook build passed.
- The full unit suite passed 832 tests. Two unchanged performance tests exceeded their
  5-second limits, and both files passed when run alone.
- `git diff --check` passed. No live-app or canonical-token file changed.

## Read for Session 4d

1. [Sessions 4c–4i](Phase-10-Session-4c-plan.md): read the fixed decisions, shared
   boundaries, Session 4d checklist, and verification section.
2. [Testing](Testing.md) before writing the required component test.
3. The archived [workspace stories](../src/design/overlaid-cards/Workspace.stories.tsx),
   then their directly used fixtures and workspace variant components as needed.

Do not reload the full Session 4b brief. Its surviving decision and source route are
recorded above.

## Settled direction

- Ghost owns the shared workspace structure, behavior, and minimum affordances.
- Null and Wipeout extend Ghost through shared semantic inputs and optional decoration.
- Add one simple ancestry breadcrumb only when the leftmost visible panel is a focus
  panel because the global-root navigation panel shifted outside the four-column window.
- Canonical tokens and shipping-theme choices wait for the Ghost → Null → Wipeout
  comparison page and explicit approval in Session 4i.

## Next session: 4d

Extract the theme-neutral Ghost workspace skeleton from Sticky Headers. Add the required
fixture-driven states and the conditional-breadcrumb component test.

Do not build the design-card grammar, define canonical tokens, wire `StreamView`, modify
production faces, or clean up the archived renderers.

## Following sequence

- **4e:** build the shared design-card grammar.
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
