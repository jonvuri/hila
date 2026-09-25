---
title: Phase 13 Session 7 — Source/sticky continuity review
kind: phase-session
state: planned
updated: 2026-09-25
---

# Phase 13 Session 7 — Source/sticky continuity review

## Goal

Review and approve the compact sticky projection of the completed source-row surface before changing
production behavior.

## Depends on

Session 6 must stabilize workspace line content, host actions, editor ownership, and canonical row
styles.

## Requirements

- Treat a sticky row as the compact state of the same host-owned identity seam, not as a second face
  composition.
- Compare which identity content and named actions remain in the fixed line and which previews,
  properties, gestures, menus, and expanded regions remain source-only.
- Preserve text axis, Guides alignment, disclosure placement, typography, color, spacing, selection
  meaning, disabled meaning, and drill identity across the source-to-sticky handoff.
- Review entry, same-threshold replacement, final-row push-off, reverse scrolling, source reveal,
  deep ancestry, long labels, and bounded sticky stacks.
- Stress every visual theme and polarity, narrow and wide presentation, reduced motion, keyboard
  focus, pointer use, coarse targets, and virtual-window boundaries.
- Record one implementation-ready visual and interaction contract plus any explicit non-goals for
  Session 7A.

## Boundaries

- Do not change the production sticky widget, virtualizer, metadata plane, or row renderer in this
  review session.
- The source outline remains the only tree. Sticky copies never own editors, drag state, selection
  state, or expanded content.
- Do not add animated continuity that obscures scroll-linked position or carries unique meaning.
- Do not revisit the approved Guides outline or sticky capacity limits.

## Acceptance

- The reviewed treatment reads as one row collapsing into and expanding from a compact pinned line.
- Every visible or interactive difference between source and sticky representations has an explicit
  host-owned reason.
- Keyboard, pointer, focus, accessibility, reduced-motion, and narrow-width expectations are clear.
- The review records an approval and a bounded implementation handoff; unresolved visual direction
  blocks Session 7A.

## Verification

- Build focused Storybook evidence from the production row model and representative live states.
- Inspect transition thresholds one pixel at a time in both directions and compare every theme and
  polarity.
- Review accessibility semantics, target sizes, focus handoff, long labels, and virtualized ancestry.
- Run the focused Storybook build and `git diff --check`.

## Handoff

Session 7A implements only the approved projection. Any broader row redesign returns to this review
boundary rather than expanding the implementation session.
