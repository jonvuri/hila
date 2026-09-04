---
title: Phase 12 Session 4 — Shared overlay and selectable list
kind: phase-session
state: planned
updated: 2026-09-03
---

# Phase 12 Session 4 — Shared overlay and selectable list

## Goal

Create the canonical overlay and selectable-list primitives used by the launcher and slash menu,
then prove their behavior and visual language in Storybook.

## Boundaries

- Own overlay/list structure, focus, selection, positioning, and canonical-token presentation.
- Do not implement launcher search, commands, chips, or deep preview.
- Preserve ProseMirror slash state and command behavior while replacing its raw dropdown chrome.
- Do not migrate unrelated face, browser, or system-edge styles.

## Current seams

- `src/editor/slash-plugin.ts` creates a body-level raw DOM dropdown using global inline-ref classes.
- `src/design/ContextMenu.tsx` and `TextInput.tsx` are useful but lack the full focus, positioning,
  and ARIA contract.
- `src/design/tokens.css`, Storybook decorators, and `context/Design.md` own visual roles.

## Plan

- [ ] Specify controlled selection, disabled reasons, activation, pointer hover, focus ownership,
      outside click, focus restoration, and layered Escape behavior.
- [ ] Implement centered modal-palette and cursor-anchored menu variants over one selectable-list
      interaction model.
- [ ] Use dialog/listbox semantics, stable option identities, and real DOM focus. Announce selection
      and unavailable reasons without depending on color.
- [ ] Use semantic tokens and CSS modules for scrim, surface, elevation, focus, hover, selected,
      disabled, invalid, and opaque treatments.
- [ ] Extend existing design inputs only where the shared primitive proves a missing general role.
      Update token contracts and all current consumers if a token is added.
- [ ] Adapt slash presentation to the shared anchored list without changing its trigger, query,
      selection, deletion, or command dispatch.
- [ ] Add Storybook states for quick/deep geometry, long labels, empty/disabled/invalid lists,
      narrow viewports, all themes and polarities, and reduced motion.
- [ ] Get user visual/interaction review before live launcher adoption.

## Acceptance

- Slash and launcher can share one selection/focus physics without sharing product state.
- Keyboard and pointer paths agree; outside click and Escape restore the invoking focus correctly.
- Selected, focus, hover, disabled, and invalid states remain semantically distinct.
- The primitives have no hardcoded global overlay colors or component-specific global tokens.
- Slash behavior and its focused E2E flows remain unchanged.

## Verification

- Add component tests for focus, selection, activation, dismissal, disabled reasons, and restoration.
- Run slash unit/E2E regressions, Storybook build and spot-check, standard checks, and
  `git diff --check`.
