---
title: Current state
kind: status
state: active
updated: 2026-08-16
phase: phase-10
session: phase-10-session-4h-wipeout-design-card
---

# Now

Phase 10 Session 4g and its timeout detour are closed. `Design/Theme comparison` now renders Ghost
and Null consecutively through the same `ThemeCard`. Null adds only conventional local role
overrides and scoped decoration that resolves named Ghost ambiguities.

The two flaky windowing scale guards now use synthetic segment sizes and recorded slice requests.
They prove the 100-row bound without generating 22,000-row fixtures. The modest integration gathers
and representative query-plan guards remain. The default 14-worker suite passed all 842 tests. No
global timeout or production behavior changed. The measurements and closeout are in the
[session plan](Phase-10-Session-4c-plan.md#session-4h-preflight-timeout-detour).

## Session 4g and timeout-detour verification

- Format, lint, typecheck, seven ThemeCard tests, and the Storybook build passed.
- Both focused windowing files and the default-worker full suite passed. The full suite passed all
  842 tests.
- No live-app, production-face, canonical-token, archived Null, or Wipeout file changed.

## Read for Session 4h

1. [Sessions 4c–4i](Phase-10-Session-4c-plan.md): read the fixed decisions, shared
   boundaries, Session 4h checklist, and verification section.
2. The shared [ThemeCard](../src/design/theme-card/ThemeCard.tsx), its
   [input contract](../src/design/theme-card/types.ts), the complete
   [Ghost input](../src/design/theme-card/ghost.ts), the
   [Null extension](../src/design/theme-card/null.ts), and local
   [exploration styles](../src/design/theme-card/theme-card.css).
3. The forward [comparison story](../src/design/theme-card/ThemeCard.stories.tsx).

Consult archived Wipeout work only for isolated visual moves. Do not revive its overlaid-card
structure, ancestry tabs, depth gauge, or alternate layout.

## Settled direction

- Ghost owns shared workspace structure, behavior, and minimum affordances.
- Null and Wipeout extend Ghost through shared semantic inputs and optional decoration.
- The simple ancestry breadcrumb appears only when the first visible panel is focus.
- Canonical tokens and shipping-theme choices wait for the Ghost → Null → Wipeout
  comparison page and explicit approval in Session 4i.

## Next session: 4h

Rebuild Wipeout as a Ghost extension. Apply instrument typography, disciplined accent, hard
brightness steps, chamfers or notches, and VFD texture as local values or bounded decoration.
Preserve Ghost structure, behavior, affordances, and legibility under dense content.

Do not define canonical tokens, wire the live app, modify production faces, or clean up
archived renderers.

## Following sequence

- **4i:** compare, tune, approve, and derive token requirements.

The detailed outcomes and acceptance criteria remain in
[the 4c–4i plan](Phase-10-Session-4c-plan.md); do not duplicate them here.

## Documentation boundary

Until Phase 10 settles, limit cleanup to routing, current-state accuracy, and clear
historical markers. The broader documentation audit remains deferred until after Phase 10.

## Handoff rule

At the end of each session, check off the detailed session items. Then update this file
with the completed outcome, verification, next session, and minimum reading set.
