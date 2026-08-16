---
title: Current state
kind: status
state: active
updated: 2026-08-16
phase: phase-10
session: phase-10-session-4f-ghost-design-card
---

# Now

Phase 10 Session 4e is closed. `Design/Theme comparison` now has one reusable, vertically
complete ThemeCard grammar. It fixes section order, dense Reading queue content, forced
semantic states, temporary local roles, and one shared dial schema without assigning theme
values.

## Session 4e verification

- Format, lint, typecheck, three ThemeCard grammar tests, and the Storybook build passed.
- The full run passed 836 tests. Two unchanged performance tests exceeded their
  five-second limits. Both files passed when run alone.
- No live-app, production-face, or canonical-token file changed.

## Read for Session 4f

1. [Sessions 4c–4i](Phase-10-Session-4c-plan.md): read the fixed decisions, shared
   boundaries, Session 4f checklist, and verification section.
2. The shared [ThemeCard](../src/design/theme-card/ThemeCard.tsx), its
   [input contract](../src/design/theme-card/types.ts), and local
   [exploration styles](../src/design/theme-card/theme-card.css).
3. The forward [workspace stories](../src/design/workspace/Workspace.stories.tsx) and
   shared [workspace types](../src/design/workspace/types.ts).

Do not reload the full Session 4b brief or old theme catalogs. The shared grammar and
surviving structure are implemented in the forward ThemeCard and workspace files.

## Settled direction

- Ghost owns shared workspace structure, behavior, and minimum affordances.
- Null and Wipeout extend Ghost through shared semantic inputs and optional decoration.
- The simple ancestry breadcrumb appears only when the first visible panel is focus.
- Canonical tokens and shipping-theme choices wait for the Ghost → Null → Wipeout
  comparison page and explicit approval in Session 4i.

## Next session: 4f

Complete the Ghost card with minimum visible affordances. Mark each visible treatment as
structural, semantic state, or optional decoration. Check both polarities, narrow width,
keyboard focus, reduced motion, and long-form density.

Do not set Null or Wipeout values. Do not define canonical tokens, wire the live app,
modify production faces, or clean up archived renderers.

## Following sequence

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
