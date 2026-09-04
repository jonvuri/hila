---
title: Phase 12 Session 7 — Saved-view authoring and editor exits
kind: phase-session
state: planned
updated: 2026-09-03
---

# Phase 12 Session 7 — Saved-view authoring and editor exits

## Goal

Complete the launcher's two exits—save/focus and insert ref—and replace development-only saved-view
authoring with recognition-backed gesture chrome.

## Dependencies

Sessions 2, 3, 5, and 6 must be complete.

## Boundaries

- This session intentionally supersedes Phase 10's older block-chip-chrome deferral because the
  current Phase 12 handoff owns saved-view authoring.
- Keep raw SQL available as x-ray/custom mode. Never rewrite hand-authored SQL until the user makes
  a structured gesture edit.
- Do not widen into CTE source/computed leaves or Phase 13 face/panel migration.

## Plan

- [ ] Make save available for a non-empty, concrete-matrix spec with valid provenance. For transient
      heterogeneous lenses or absent provenance, show a nudge/reason and a path to commit a kind.
- [ ] Materialize self-contained SQL, call the existing `createViewBlock`, navigate to its returned
      marker, and preserve Phase 11's marker/`block_sources` identity.
- [ ] Derive the default name from chip prose, then preselect the focused marker label through a
      marker-keyed pending handoff. Guard against a stale or wrong editor consuming it.
- [ ] On saved-view mount, recognize stored SQL into chips, chips plus opaque WHERE leaves, or custom
      SQL. Show invalid/custom SQL honestly while keeping the named place usable.
- [ ] Recompile and update the sole stored SQL only after a structured edit. Preserve opaque leaves
      byte-for-byte and keep raw SQL one gesture away.
- [ ] Remove the development name/SQL/snippet authoring controls after the gesture path has parity.
- [ ] Add an active-editor invocation bridge for launcher opens. Retain a live editor reference,
      selection bookmark, and source node while focus moves to the overlay.
- [ ] Extract direct inline-ref insertion from trigger-local plugin code. On `Mod-Enter`, insert the
      selected cross-matrix target at the invoking selection and let normal persistence/ref-sync run.
- [ ] Disable insert-ref with a reason outside a live editor, ignore it on command rows, and refuse
      to mutate an unmounted or changed editor.

## Acceptance

- Save creates exactly one named view place under invocation provenance, focuses it, and selects the
  generated name.
- Saved dialect SQL survives save/reload/edit/reload as equivalent gesture state and exact stored
  executable SQL.
- Custom and invalid SQL remain valid places; structured edits never silently discard opaque text.
- `Mod-Enter` preserves the invoking cursor/selection and creates the normal inline reference and
  relation, including cross-matrix targets.
- No second query store, marker identity, or insertion path appears.

## Verification

- Add save/home/focus/name-handoff, recognize/edit, opaque preservation, and active-editor lifecycle
  tests.
- Add real-Chrome save/reopen/rename/custom-SQL and insert-ref cursor E2E.
- Run saved-view, inline-ref, sync, standard checks, and `git diff --check`.
