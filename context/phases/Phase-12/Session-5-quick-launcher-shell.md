---
title: Phase 12 Session 5 — Quick launcher shell
kind: phase-session
state: planned
updated: 2026-09-03
---

# Phase 12 Session 5 — Quick launcher shell

## Goal

Ship a useful global `⌘K` switcher over places and commands before any chip/deep behavior lands.

## Dependencies

Sessions 1, 3, and 4 must be complete.

## Plan

- [ ] Give the application shell ownership of launcher open state and invocation provenance so the
      gesture works while any temporary root or system-edge surface is active.
- [ ] Register `Mod-k` globally and remove the ProseMirror-local binding that currently swallows it.
      Prove navigation and focus-panel editors both yield to the launcher.
- [ ] Open a fixed-width centered palette over the unchanged stream. Toggle with `Mod-k`; dismiss
      with Escape or outside click; restore exact invoking focus.
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
- Named rows, content matches, types, containers, views, and commands share one deterministic list.
- Sigils narrow families but never alter query text or future saved specs.
- Disabled commands explain why; help content is registry-derived.
- Keyboard and pointer go/run paths dismiss and restore/navigate correctly.

## Verification

- Add launcher shell, shortcut conflict, command context, filter-token, help, race, and focus tests.
- Add real-Chrome quick-launcher E2E, including open from ProseMirror and cross-matrix navigation.
- Assert exact editor churn on open/dismiss. Run standard checks and `git diff --check`.
