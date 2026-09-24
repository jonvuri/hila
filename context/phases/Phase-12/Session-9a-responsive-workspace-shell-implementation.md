---
title: Phase 12 Session 9A — Responsive workspace shell implementation
kind: phase-session
state: planned
updated: 2026-09-24
---

# Phase 12 Session 9A — Responsive workspace shell implementation

## Goal

Implement Session 9's selected narrow workspace projection in the production stream. Keep the
current bounded rail at 720px or above and show only the active existing panel at 719px or below.

## Dependencies

Session 9 must be complete. Use its Storybook comparison, continuity fixture, ancestry-source
coverage, and explicit rejection of a user-selected wide focused workflow.

## Fixed boundaries

- Preserve one controller, rooted stack, active panel, and ancestry resolver. Do not add routes,
  tabs, history, saved workspaces, or another navigation model.
- Add a host-computed shell-presentation axis separate from density, theme, polarity, fidelity, and
  durable state. Environmental width is its only selector in this session.
- Keep every panel in the controller's existing four-panel retained window mounted. Presentation
  may hide panels but cannot recreate live editors or reset pending saves, scroll, selection,
  virtualizer position, outline disclosure, or focus-panel state.
- Reuse existing Back, ancestry/root recovery, Jump back, and launcher paths. Add no persistent
  narrow toolbar, edge, rail, or switcher.
- Preserve shared behavior and semantics across Ghost, Null, and Wipeout. Theme CSS may express the
  same geometry without selecting presentation.
- Do not change the database, schema, sync, durability, navigation identity, or panel-retention
  limit. Existing durability coverage is sufficient because this session changes runtime rendering
  only and writes no source-of-truth state.

## Plan

### 1. Define the production presentation contract

- [ ] Add the typed host-computed shell presentation and one authoritative 719/720 boundary.
- [ ] Derive it from the workspace host width, not visual density or a global window assumption.
- [ ] Expose the resolved presentation for CSS, accessibility, and deterministic tests without
      persisting it.

### 2. Project the retained stack without remounting

- [ ] Keep the controller's bounded panel array and keyed panel instances unchanged during resize.
- [ ] In single-panel mode, hide every non-active panel from layout, hit testing, tab order, and the
      accessibility tree while leaving its component state mounted.
- [ ] In rail mode, restore all retained panels in their existing order and preserve the active
      panel identity.
- [ ] Render the active focused panel's existing ancestry breadcrumb in single-panel mode. Root
      focus renders the existing navigation panel.

### 3. Preserve focus and interaction continuity

- [ ] Preserve editor DOM identity, document selection, pending-save state, focus-region and outline
      scroll, virtualizer position, disclosure state, and active panel identity across both resize
      directions.
- [ ] If focus belongs to a panel that becomes hidden, move it to the active panel landmark and
      announce the presentation change. Do not steal focus when the active panel already owns it.
- [ ] Keep ancestry actions, `Meta-Left`, Jump back, and `Mod-k` unchanged and reachable.
- [ ] Make deep ancestry horizontally reachable at narrow width. Use coarse-pointer target sizing
      without coupling touch behavior to density or viewport width.

### 4. Verify and document the shipped boundary

- [ ] Add component coverage for the 719/720 boundary, root and focus panels, all ancestry sources,
      resize continuity, hidden-panel semantics, and theme independence.
- [ ] Add real-browser coverage for editor selection, focus transfer, scroll and virtualizer
      continuity, keyboard order, coarse-pointer targets, long/dense content, reduced motion, and
      loading/empty/error states.
- [ ] Inspect Ghost, Null, and Wipeout in both polarities at 390, 500, 719, 720, and 1180 widths.
- [ ] Update the canonical architecture/design/testing contracts from designed to shipped.
- [ ] Confirm no schema or durability-policy change occurred.

## Acceptance

- A 719px host shows one full-width active panel; a 720px host shows the existing bounded rail.
- Resize changes presentation only. The retained stack, active identity, editor node and selection,
  scroll, virtualizer, pending saves, and outline state survive.
- Hidden panels cannot receive pointer, keyboard, or assistive-technology navigation.
- Root, provenance, home, membership fallback, and cross-matrix states retain correct ancestry and
  root recovery.
- Density and every theme/polarity combination keep the same presentation meaning and structure.
- No explicit wide focused mode or new persistent navigation chrome ships.
- No database, schema, sync, durability, or user-data classification changes occur.

## Verification

- Run focused workspace-shell, stream-controller, navigation, editor, and virtualizer unit suites.
- Run format, lint, typecheck, and the full unit suite.
- Build Storybook and compare the production shell with Session 9's maintained fixtures.
- Run focused real-Chrome workspace, launcher, editor-churn, accessibility, and resize E2E, then the
  full E2E suite.
- Run `git diff --check` and verify active context links.
