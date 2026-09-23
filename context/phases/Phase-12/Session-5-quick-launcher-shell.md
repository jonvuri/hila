---
title: Phase 12 Session 5 — Quick launcher shell
kind: phase-session
state: in-progress
updated: 2026-09-23
---

# Phase 12 Session 5 — Quick launcher shell

## Goal

Ship a useful global `⌘K` switcher over places and commands before any chip/deep behavior lands.

## Dependencies

Sessions 1, 3, 4, and 4A are complete. Session 4A's approved presentation direction is the visual
input to this session.

## Plan

- [ ] Give the application shell ownership of launcher open state and invocation provenance so the
      gesture works while any temporary root or system-edge surface is active.
- [ ] Register `Mod-k` globally and remove the ProseMirror-local binding that currently swallows it.
      Prove navigation and focus-panel editors both yield to the launcher.
- [ ] Keep one launcher state, content, list, focus, dismissal, keyboard, pointer, and accessibility
      contract behind a theme-selected presentation shell. Do not fork search or command behavior by
      theme.
- [ ] Open Ghost and Null Quick as fixed-width centered modal palettes over the unchanged stream.
      Open Wipeout Quick at the top-left on wide screens and across the top half on narrow screens.
      Toggle with `Mod-k`; dismiss with Escape or outside click; restore exact invoking focus.
- [ ] In Wipeout, align the resting workspace mark with the empty block cursor and play the measured
      decoration-grey border echoes after the usable Quick state appears. Disable motion, not state,
      under reduced motion.
- [ ] Adopt the reviewed black, border-defined Ghost and Wipeout launcher surfaces through canonical
      semantic roles. Remove the Ghost and Null input underline while retaining the colored caret,
      selected-row signal, and distinct keyboard focus semantics.
- [ ] Render one flat selectable sequence of at most 12 ranked place and command results with
      app-wide identity marks and right-aligned ancestry.
- [ ] Run commands with the provenance subject captured at open time. Keep missing-subject commands
      visible and disabled with a stated reason.
- [ ] Implement `@`, `#`, `>`, and `[` filter tokens at input start, browse-on-sigil, family
      suggestion rows, pointer activation through family glyphs, and backspace removal.
- [ ] Keep filter tokens outside `QuerySpec` and saved state.
- [ ] Add the empty-state structure: help footer and generated `?` guide now, with reserved sections
      for jump-back and recent deep searches that Session 8 will populate.
- [ ] Make Enter go/run and dismiss. Identity results must call the Session 3 navigation path.
- [ ] Guard async searches so results, selection, and announced counts always match the latest input.

## Acceptance

- `Mod-k` opens, toggles, and dismisses from the stream, every editor, and temporary roots.
- Opening and dismissing do not remount stream/focus panels or change editor documents/selections.
- All themes expose identical launcher content and interaction semantics. Ghost and Null render the
  centered shell; Wipeout renders the approved anchored shell without duplicating launcher logic.
- Wipeout's workspace mark, empty cursor, and post-facto echo geometry remain aligned at wide and
  narrow widths. Echoes never delay input or focus.
- Named rows, content matches, types, containers, views, and commands share one deterministic list.
- Sigils narrow families but never alter query text or future saved specs.
- Disabled commands explain why; help content is registry-derived.
- Keyboard and pointer go/run paths dismiss and restore/navigate correctly.

## Verification

- Add launcher shell, shortcut conflict, command context, filter-token, help, race, and focus tests.
- Add real-Chrome quick-launcher E2E across all themes, including wide/narrow Wipeout geometry,
  reduced motion, open from ProseMirror, and cross-matrix navigation.
- Assert exact editor churn on open/dismiss. Run standard checks and `git diff --check`.
