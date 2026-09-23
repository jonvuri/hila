---
title: Phase 12 Session 4 — Shared overlay and selectable list
kind: phase-session
state: in-progress
updated: 2026-09-23
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

## Interaction contract

- Callers own items and `selectedId`. Items use stable IDs; replacement keeps the selected ID when
  it still exists and otherwise selects the first item. Empty lists select nothing.
- Up and Down wrap through every row, including unavailable rows so their visible reasons remain
  discoverable. Enter activates only an available selected row. Pointer movement proposes the same
  controlled selection, and pointer activation uses the same availability guard.
- The centered variant is a native modal dialog. It moves focus to caller-selected content, keeps
  modal focus containment, and restores the connected invoker when it closes.
- The anchored variant is a nonmodal listbox. Its editor or input remains the DOM focus owner and
  receives `aria-controls`, `aria-expanded`, `aria-autocomplete`, and `aria-activedescendant` only
  while the list is mounted.
- Overlay layers form one stack. Escape or outside pointer-down dismisses only the top layer.
  Escape is intercepted before editor and panel handlers. Outside pointer-down does not prevent the
  clicked target from receiving focus.
- Pointer containment uses the composed event path. Anchored geometry prefers below, flips above,
  and clamps to an eight-pixel viewport margin. Resize, scroll, and visual-viewport changes
  recompute it.
- Focus, hover, selection, unavailable, invalid, and opaque presentation are independent semantic
  states. Unavailable reasons render as text and in a polite selection announcement.

## Plan

- [x] Specify controlled selection, disabled reasons, activation, pointer hover, focus ownership,
      outside click, focus restoration, and layered Escape behavior.
- [x] Implement centered modal-palette and cursor-anchored menu variants over one selectable-list
      interaction model.
- [x] Use dialog/listbox semantics, stable option identities, and real DOM focus. Announce selection
      and unavailable reasons without depending on color.
- [x] Use semantic tokens and CSS modules for scrim, surface, elevation, focus, hover, selected,
      disabled, invalid, and opaque treatments.
- [x] Extend existing design inputs only where the shared primitive proves a missing general role.
      Update token contracts and all current consumers if a token is added.
- [x] Adapt slash presentation to the shared anchored list without changing its trigger, query,
      selection, deletion, or command dispatch.
- [x] Add Storybook states for quick/deep geometry, long labels, empty/disabled/invalid lists,
      narrow viewports, all themes and polarities, and reduced motion.
- [ ] Get user visual/interaction review before live launcher adoption.

## Acceptance

- Slash and launcher can share one selection/focus physics without sharing product state.
- Keyboard and pointer paths agree; outside click and Escape restore the invoking focus correctly.
- Selected, focus, hover, disabled, and invalid states remain semantically distinct.
- The primitives have no hardcoded global overlay colors or component-specific global tokens.
- Slash behavior and its focused E2E flows remain unchanged.

## Verification

- [x] Add component tests for focus, selection, activation, dismissal, disabled reasons, and
      restoration.
- [x] Run slash unit and focused E2E regressions.
- [x] Build Storybook and spot-check geometry, semantics, themes, polarity, narrow layout, and
      keyboard behavior in real Chrome.
- [x] Run formatter, linter, static types, unit tests, production build, and `git diff --check`.
