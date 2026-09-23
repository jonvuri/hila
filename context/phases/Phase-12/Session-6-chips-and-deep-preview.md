---
title: Phase 12 Session 6 — Chips and deep preview
kind: phase-session
state: complete
updated: 2026-09-23
---

# Phase 12 Session 6 — Chips and deep preview

## Goal

Add query-spec gesture editing and the bounded read-only deep preview. Tempo must remain a fact
about the spec, not parallel mode state.

## Dependencies

Sessions 2, 4, and 5 must be complete.

## Plan

- [x] Add a query-spec state/reducer that uses only Session 2 operations and normalized values.
- [x] Implement object-first Tab commit, operator menu, operator name/synonym typeahead, and typed
      glyph/ASCII operators.
- [x] Implement chip focus, edit, delete, backspace-pop, and left/right traversal without splitting
      one logical list into hidden focus regions.
- [x] Add typed values for text, number, closed literal date ranges, distinct-value text, and
      booleans. Disable formula fields with a reason.
- [x] Show relative-date freeze information before save; do not add runtime date parameters.
- [x] Enter deep tempo when the first chip commits and return to quick tempo when the last chip is
      removed. Preserve uncommitted text as the spec text dimension.
- [x] Execute the parameterized transient plan per input change through Session 2's reusable query
      runtime.
- [x] Preserve one Deep state and preview contract behind theme-selected presentation shells. Expand
      Ghost and Null to viewport-proportional centered floating frames. Expand Wipeout to the full
      viewport and play its measured Quick-to-Deep echoes after the completed state appears.
- [x] Show the normal line identity plus label and spec-touched predicate/order columns in chip
      order. Keep widths capped.
- [x] Keep preview host-owned: no face mount, cell edit, add row, drag, or ownership gesture.
- [x] Keep Enter as go on a preview row. Define stable loading, empty, invalid, and error states.

## Acceptance

- The same `QuerySpec` fully determines quick versus deep tempo.
- All themes expose identical Deep content, interaction, focus, and preview semantics. Ghost and
  Null remain centered and floating; Wipeout fills the viewport without adding mode state.
- Wipeout's expansion echoes fit the responsive Quick and viewport boxes, never delay interaction,
  and disappear under reduced motion.
- Menu, typeahead, typed operator, keyboard, and pointer paths converge on identical chips.
- Invalid values use the canonical invalid state and a stated reason.
- Per-keystroke values rebind without stale results or repeated prepare churn.
- Preview projection is presentation only; compiler SQL remains `d.*` plus identity.
- Preview DOM and query work stay bounded, and the view ownership firewall is intact.

## Verification

- Add reducer, parsing, keyboard, focus, invalid-state, tempo, projection, and window-bound tests.
- Add deep-launcher real-Chrome E2E across all themes and widths, including Wipeout expansion and
  reduced motion, plus a bounded multi-matrix performance fixture.
- Record prepared-statement reuse, mounted-row bound, and editor churn. Run standard checks and
  `git diff --check`.

## Result

The launcher now derives Quick or Deep solely from the transient `QuerySpec`. Tab commits types,
containers, roots, and any navigable node; column menus, typed operators, pointer choices, and
validated values converge on the same chips. Relative dates freeze to local-calendar boundaries
and state the exact stored interpretation. Kind changes clear matrix-bound predicates and order.

Deep uses one read-only preview across all themes. It compiles on each input change, preserves
prepared SQL shapes while values rebind, caps meaning at 1,000 rows, pages in 100-row windows, and
retains at most the virtualizer's six-window budget. Unloaded windows keep estimated height, and
fast observer races reconcile to the two-window latch. The preview mounts no faces or editors.

Verification on 2026-09-23:

- Focused and full unit coverage passed after review fixes: 92 files and 1,164 tests.
- `e2e/quick-launcher.spec.ts`: 13 tests passed in system Chrome, covering all themes at wide and
  narrow widths, Wipeout motion behavior, a 1,200-row target plus distractor matrix, the 1,000-row
  cap, at most 600 mounted preview rows, two reusable bound templates, and zero ProseMirror churn.
- The two canonical performance-contract E2Es passed, including the 20x-throttled backstop with
  zero long tasks, forced layouts, or editor churn.
- The repository-wide E2E run passed 168 of 171 tests. One pre-existing folded-row drill-in test
  failed because discovery commit `d5bfc71` removed its unresolved-position fallback; its two
  dependent performance tests did not run in that pass and passed separately with `--no-deps`.
- A post-review Wipeout rerun reached the rendered workspace but timed out waiting for the browser
  load event before test setup, so the strengthened computed-animation assertion did not execute.
- Formatter, linter, typecheck, the full unit suite, and `git diff --check` passed. Lint reported 14
  existing warnings and no errors. No schema change occurred.
