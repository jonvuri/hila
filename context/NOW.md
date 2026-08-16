---
title: Current state
kind: status
state: active
updated: 2026-08-16
phase: phase-10
session: phase-10-session-4g-null-design-card
---

# Now

Phase 10 Session 4f is closed. `Design/Theme comparison` now has a complete Ghost baseline.
It assigns every temporary local role, labels treatments by ownership, and shows both
conditional-breadcrumb workspace states without optional theme chrome.

## Session 4f verification

- Format, lint, typecheck, five ThemeCard tests, and the Storybook build passed.
- The full run passed 838 tests. Two unchanged performance tests exceeded their
  five-second limits. Both files passed when run alone.
- Dark and light polarity, 360-pixel width, keyboard focus, reduced motion, and long-form
  density were spot-checked in Storybook.
- No live-app, production-face, or canonical-token file changed.

## Read for Session 4g

1. [Sessions 4c–4i](Phase-10-Session-4c-plan.md): read the fixed decisions, shared
   boundaries, Session 4g checklist, and verification section.
2. The shared [ThemeCard](../src/design/theme-card/ThemeCard.tsx), its
   [input contract](../src/design/theme-card/types.ts), the complete
   [Ghost input](../src/design/theme-card/ghost.ts), and local
   [exploration styles](../src/design/theme-card/theme-card.css).
3. The forward [comparison story](../src/design/theme-card/ThemeCard.stories.tsx).

Do not start from archived `NullCards.tsx` or old Null CSS. Build Null as local role
overrides and optional decoration on the shared Ghost markup.

## Settled direction

- Ghost owns shared workspace structure, behavior, and minimum affordances.
- Null and Wipeout extend Ghost through shared semantic inputs and optional decoration.
- The simple ancestry breadcrumb appears only when the first visible panel is focus.
- Canonical tokens and shipping-theme choices wait for the Ghost → Null → Wipeout
  comparison page and explicit approval in Session 4i.

## Next session: 4g

Rebuild Null as a Ghost extension. Add only conventional signals that resolve a named Ghost
ambiguity. Keep a concise delta ledger and render Ghost and Null consecutively with identical
content and controls.

Do not set Wipeout values. Do not define canonical tokens, wire the live app, modify
production faces, or clean up archived renderers.

## Following sequence

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
