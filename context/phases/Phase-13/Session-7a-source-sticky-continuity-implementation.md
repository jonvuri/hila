---
title: Phase 13 Session 7A — Source/sticky continuity implementation
kind: phase-session
state: planned
updated: 2026-09-25
---

# Phase 13 Session 7A — Source/sticky continuity implementation

## Goal

Apply Session 7's approved compact-row projection to production without duplicating source tree,
editor, or interaction ownership.

## Depends on

Session 7 must record an approved visual and interaction contract.

## Requirements

- Render source and sticky identity lines through the approved shared host seam while keeping their
  distinct accessible roles.
- Keep the source row as the only tree item, editor owner, drag owner, selection owner, and expanded-
  content owner.
- Preserve sticky disclosure, scroll-to-source, drill, disabled state, and focus restoration as
  named host actions.
- Preserve source/sticky geometry, Guides continuity, text and control axes, content identity, and
  state meaning at entry, push-off, replacement, reverse scroll, and source reveal.
- Keep sticky state bounded and retain the existing no-layout-read, minimal-write scroll contract.
- Remove superseded row-specific style or rendering paths after the approved implementation passes.

## Boundaries

- Do not change sticky ancestry queries, virtual window size, ownership identity, row data, or panel
  navigation semantics.
- Do not mount ProseMirror or a full line face inside a sticky copy.
- Do not add ambient time-based motion. Reduced motion keeps positional continuity.
- Do not make theme, polarity, density, or fidelity select a different interaction model.

## Acceptance

- Source-to-sticky and sticky-to-source transitions have no jarring content, alignment, or state
  replacement.
- Only one tree item and editor exist for each source appearance.
- Sticky actions remain operable and restore focus correctly when the source control is mounted.
- Normal scroll frames retain bounded DOM work with no forced layout or long-task regression.
- Storybook and live production match the approved Session 7 treatment.

## Verification

- Run focused navigation-header, sticky-state, sticky-component, virtualizer, and accessibility
  suites.
- Inspect entry, push-off, replacement, reverse scroll, window boundaries, and source reveal in the
  system browser across themes, polarities, widths, and reduced motion.
- Record a focused scroll trace and run the existing performance guards.
- Run formatter, linter, static types, the full unit suite, focused E2E, and `git diff --check`.

## Handoff

Session 8 may migrate the system edge without carrying unresolved production navigation design.
