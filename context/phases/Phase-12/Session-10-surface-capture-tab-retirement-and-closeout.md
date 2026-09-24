---
title: Phase 12 Session 10 — Surface capture, tab retirement, and closeout
kind: phase-session
state: planned
updated: 2026-09-24
---

# Phase 12 Session 10 — Surface capture, tab retirement, and closeout

## Goal

Prove launcher/place navigation has replaced the temporary Table and Tags roots, preserve their
useful visual evidence in Storybook, remove the roots, and close Phase 12 canonically.

## Dependencies

Sessions 5–9 must be complete. Complete any focused shell implementation session required by
Session 9's decisions before tab retirement. Storybook capture must land before runtime removal.

## Navigation-role parity gate

- [ ] `[` browses and finds owned container/matrix subjects; selecting one focuses its real place
      and exposes membership through the existing host.
- [ ] Root workspace matrix behavior is deliberate and does not create a second root.
- [ ] `#` browses and finds every promoted type; selecting one focuses the type-node and reaches its
      owned matrix/instances.
- [ ] Ordinary rows, content matches, and view markers navigate through provenance/home rules.
- [ ] `/table`, launcher commands, inline type creation, rename, and existing row/type structural
      actions remain reachable.
- [ ] Deep lenses and save-as-view cover ad hoc matrix browsing. Container places retain edit/add;
      view preview remains read-only.
- [ ] Root schema and face administration has an explicit development system-edge route until its
      Phase 13 host migration. Removing the switcher must not silently remove the only access.

## Plan

- [ ] Build fixture-driven Storybook references for the retiring top-level Table and Tags
      experiences without booting the SQLite worker.
- [ ] Capture representative table schema/cell/sort/edit states and tag list/count/instance/create/
      context states across themes, polarities, and narrow widths.
- [ ] Complete live keyboard, pointer, empty, error, and accessibility review of the launcher parity
      routes. Resolve failures before removal.
- [ ] Simplify `App.tsx` to one stream root. Remove `ActiveView`, Table/Tags buttons, their production
      top-level mounts/callback switching, and obsolete switcher styles.
- [ ] Keep embedded `SubTableBand`/`TableFace`, tag inline/property flows, the temporary face adapter,
      and remaining host/style migration for Phase 13.
- [ ] Rewrite tests and helpers that click temporary tabs or `View as…` around the new place/system-
      edge routes.
- [ ] Confirm no dead hidden top-level root or secret launcher command can reopen the retired views.
- [ ] Update canonical shipped/designed/deferred status and remove Phase 13's stale direct
      TagBrowser/top-level Table removal items while retaining its embedded/runtime list.

## Phase closeout

- [ ] Update the Phase 12 front door with completion evidence and check every closeout item.
- [ ] Update `Plan.md`, `Architecture.md`, `Plugins.md`, `Query-Spec.md`, `Launcher.md`, `Design.md`,
      `Design-Faces.md`, `Data-Model.md`, and `Virtualization.md` where the implementation changed
      truth.
- [ ] Update durable Testing/Performance guidance only for reusable new contracts.
- [ ] Confirm the durability policy still covers the schema and add two-replica proof for any
      source-of-truth behavior changed during implementation.
- [ ] Route `NOW.md` to Phase 13 with a short accurate handoff.

## Verification

- Run focused unit/component suites after each removal slice.
- Build Storybook and visually review both preserved references.
- Run focused launcher, saved-view, editor, app-shell, navigation, accessibility, churn, and
  performance E2E in system Chrome; then run the full E2E suite.
- Run format, lint, typecheck, the full unit suite, `git diff --check`, and active-link validation.
