---
title: Phase 12 Session 6 — Chips and deep preview
kind: phase-session
state: in-progress
updated: 2026-09-23
---

# Phase 12 Session 6 — Chips and deep preview

## Goal

Add query-spec gesture editing and the bounded read-only deep preview. Tempo must remain a fact
about the spec, not parallel mode state.

## Dependencies

Sessions 2, 4, and 5 must be complete.

## Plan

- [ ] Add a query-spec state/reducer that uses only Session 2 operations and normalized values.
- [ ] Implement object-first Tab commit, operator menu, operator name/synonym typeahead, and typed
      glyph/ASCII operators.
- [ ] Implement chip focus, edit, delete, backspace-pop, and left/right traversal without splitting
      one logical list into hidden focus regions.
- [ ] Add typed values for text, number, closed literal date ranges, distinct-value text, and
      booleans. Disable formula fields with a reason.
- [ ] Show relative-date freeze information before save; do not add runtime date parameters.
- [ ] Enter deep tempo when the first chip commits and return to quick tempo when the last chip is
      removed. Preserve uncommitted text as the spec text dimension.
- [ ] Execute the parameterized transient plan per input change through Session 2's reusable query
      runtime.
- [ ] Preserve one Deep state and preview contract behind theme-selected presentation shells. Expand
      Ghost and Null to viewport-proportional centered floating frames. Expand Wipeout to the full
      viewport and play its measured Quick-to-Deep echoes after the completed state appears.
- [ ] Show the normal line identity plus label and spec-touched predicate/order columns in chip
      order. Keep widths capped.
- [ ] Keep preview host-owned: no face mount, cell edit, add row, drag, or ownership gesture.
- [ ] Keep Enter as go on a preview row. Define stable loading, empty, invalid, and error states.

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
