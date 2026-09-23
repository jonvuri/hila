---
title: Phase 12 Session 5 — Quick launcher shell
kind: phase-session
state: complete
updated: 2026-09-23
---

# Phase 12 Session 5 — Quick launcher shell

## Goal

Ship a useful global `⌘K` switcher over places and commands before any chip/deep behavior lands.

## Dependencies

Sessions 1, 3, 4, and 4A are complete. Session 4A's approved presentation direction is the visual
input to this session.

## Plan

- [x] Give the application shell ownership of launcher open state and invocation provenance so the
      gesture works while any temporary root or system-edge surface is active.
- [x] Register `Mod-k` globally and remove the ProseMirror-local binding that currently swallows it.
      Prove navigation and focus-panel editors both yield to the launcher.
- [x] Keep one launcher state, content, list, focus, dismissal, keyboard, pointer, and accessibility
      contract behind a theme-selected presentation shell. Do not fork search or command behavior by
      theme.
- [x] Open Ghost and Null Quick as fixed-width centered modal palettes over the unchanged stream.
      Open Wipeout Quick at the top-left on wide screens and across the top half on narrow screens.
      Toggle with `Mod-k`; dismiss with Escape or outside click; restore exact invoking focus on
      cancellation, while go/run and command handoff transfer focus deliberately.
- [x] In Wipeout, align the resting workspace mark with the empty block cursor and play the measured
      decoration-grey border echoes after the usable Quick state appears. Disable motion, not state,
      under reduced motion.
- [x] Adopt the reviewed black, border-defined Ghost and Wipeout launcher surfaces through canonical
      semantic roles. Remove the Ghost and Null input underline while retaining the colored caret,
      selected-row signal, and distinct keyboard focus semantics.
- [x] Render one flat selectable sequence of at most 12 ranked place and command results with
      app-wide identity marks and right-aligned ancestry.
- [x] Run commands with the provenance subject captured at open time. Keep missing-subject commands
      visible and disabled with a stated reason.
- [x] Implement `@`, `#`, `>`, and `[` filter tokens at input start, browse-on-sigil, family
      suggestion rows, pointer activation through family glyphs, and backspace removal.
- [x] Keep filter tokens outside `QuerySpec` and saved state.
- [x] Add the empty-state structure: help footer and generated `?` guide now, with reserved sections
      for jump-back and recent deep searches that Session 8 will populate.
- [x] Make Enter go/run and dismiss. Identity results must call the Session 3 navigation path.
- [x] Guard async searches so results, selection, and announced counts always match the latest input.

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
- Keyboard and pointer paths dismiss and restore focus on cancellation, or navigate and transfer
  focus on go/run and command handoff.

## Verification

- Add launcher shell, shortcut conflict, command context, filter-token, help, race, and focus tests.
- Add real-Chrome quick-launcher E2E across all themes, including wide/narrow Wipeout geometry,
  reduced motion, open from ProseMirror, and cross-matrix navigation.
- Assert exact editor churn on open/dismiss. Run standard checks and `git diff --check`.

## Outcome

The application shell now owns one production Quick launcher. Global `Mod-k` works from stream,
navigation, focus, table, and system-edge surfaces. It captures node and appearance provenance at
open time, freezes command context, and restores the exact invoking element and editor selection on
cancellation or toggle/outside dismissal. Go/run and command handoff deliberately transfer focus;
navigation still uses the Session 3 place path.

Ghost and Null share the centered modal presentation. Wipeout shares the same state and behavior
through its approved wide, narrow, cursor, mark, echo, and reduced-motion presentation. Results,
family suggestions, filters, generated help, disabled command reasons, and latest-only search
publication all use one flat controlled list. `hila.table` is the first concrete launcher command.
No schema change occurred, so the existing durability policy remains sufficient.

## Verification results

- `npm run format`
- `npm run lint` — passes with 14 pre-existing Solid reactivity warnings
- `npm run typecheck`
- `npm run test:run` — 87 files and 1,119 tests passed
- `pnpm test:e2e e2e/quick-launcher.spec.ts` — six real-Chrome cases passed
- `git diff --check`
