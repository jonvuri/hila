---
title: Current state
kind: status
state: active
updated: 2026-08-16
phase: phase-10
session: phase-10-session-4i-theme-approval
---

# Now

Phase 10 Session 4h is closed. `Design/Theme comparison` now renders Ghost, Null, and Wipeout
consecutively through the same `ThemeCard`. Wipeout spreads Ghost's complete local role set, then
adds hard brightness steps, instrument type, disciplined violet signals, one-cut geometry, ticks,
brackets, and unlit VFD segments through scoped decoration.

Long-form copy keeps the Ghost body face and size. The Wipeout layer does not add overlaid cards,
ancestry tabs, a depth gauge, an alternate layout, elevation shadow, glow, or ambient motion. The
detailed outcome is in the [session plan](Phase-10-Session-4c-plan.md#session-4h-closeout).

## Session 4h verification

- Format, lint, typecheck, nine ThemeCard tests, and the Storybook build passed.
- The default-worker full suite passed all 844 tests in 13.09 seconds.
- A live visual review was unavailable because no browser was connected. Session 4i retains the
  explicit visual approval pass.
- No live-app, production-face, canonical-token, or archived Wipeout file changed.

## Read for Session 4i

1. [Sessions 4c–4i](Phase-10-Session-4c-plan.md): read the fixed decisions, shared boundaries,
   Session 4i checklist, and verification section.
2. The shared [ThemeCard](../src/design/theme-card/ThemeCard.tsx), its
   [input contract](../src/design/theme-card/types.ts), the complete [Ghost
   input](../src/design/theme-card/ghost.ts), the [Null extension](../src/design/theme-card/null.ts),
   the [Wipeout extension](../src/design/theme-card/wipeout.ts), and local [exploration
   styles](../src/design/theme-card/theme-card.css).
3. The forward [comparison story](../src/design/theme-card/ThemeCard.stories.tsx).
4. Before the visual review, read [Testing](Testing.md). Read [Design](Design.md) and
   [Design Faces](Design-Faces.md) only when approved rules are ready to promote.

Consult archived Wipeout work only for isolated visual moves. Do not revive its overlaid-card
structure, ancestry tabs, depth gauge, or alternate layout.

## Settled direction

- Ghost owns shared workspace structure, behavior, and minimum affordances.
- Null and Wipeout extend Ghost through shared semantic inputs and optional decoration.
- The simple ancestry breadcrumb appears only when the first visible panel is focus.
- Canonical tokens and shipping-theme choices wait for the Ghost → Null → Wipeout
  comparison page and explicit approval in Session 4i.

## Next session: 4i

Review the single Ghost → Null → Wipeout page at desktop and narrow widths in dark and light
polarity. Check keyboard focus, reduced motion, contrast, and long-form density. Tune only shared
dials or named theme deltas. Record explicit approvals, shipping intent, and token requirements.

Do not implement canonical tokens, wire the live app, modify production faces, or clean up archived
renderers.

## Following sequence

- Plan the small token implementation and behavior-preserving migration sessions after approval.

The detailed outcomes and acceptance criteria remain in
[the 4c–4i plan](Phase-10-Session-4c-plan.md); do not duplicate them here.

## Documentation boundary

Until Phase 10 settles, limit cleanup to routing, current-state accuracy, and clear
historical markers. The broader documentation audit remains deferred until after Phase 10.

## Handoff rule

At the end of each session, check off the detailed session items. Then update this file
with the completed outcome, verification, next session, and minimum reading set.
