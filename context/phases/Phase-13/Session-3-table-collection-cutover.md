---
title: Phase 13 Session 3 — Table collection cutover
kind: phase-session
state: complete
updated: 2026-09-25
---

# Phase 13 Session 3 — Table collection cutover

## Goal

Make the embedded table the first complete live proof of the forward runtime. Register it as a
collection interior, move presentation structure to the host, and retire the whole-component
compatibility path.

## Depends on

Sessions 1 and 2 must provide deterministic recipe resolution, renderer lifecycle, theme input, and
fidelity propagation.

## Requirements

- Register the table as a `collection` rendering over a container or view subject without giving
  it panel ownership.
- Keep title, insertion parent, drill navigation, nested subject handoff, sizing, and fidelity in
  host-owned structure.
- Preserve table editing, add-row, sort, filter, formula, reference, reorder, paging, and boundary-
  hop behavior.
- Resolve `tableTreatment` from the intentional recipe and use `thin-line` when it is missing or
  invalid. Keep treatment independent from visual theme and polarity.
- Replace the direct embedded table mount with host dispatch. Remove the temporary adapter and its
  application registration after no live consumer remains.
- Replace the complete live table style boundary with canonical semantic roles. Retain the three
  approved treatments without copying Storybook-only markup into production.

## Boundaries

- Do not restore a top-level Table root or add a launcher result that opens one.
- Do not move container extent, insertion ownership, or view SQL into the table recipe.
- Do not widen the face API around table-specific shell callbacks when the host can express the
  same responsibility.
- Retired top-level Table stories remain historical visual evidence.

## Acceptance

- Embedded tables render only through registered collection dispatch.
- The direct `TableFace` mount, temporary adapter, and adapter registration are absent.
- Every current embedded-table interaction remains reachable and rooted under its owning node.
- Theme, treatment, fidelity, narrow width, and large-data behavior preserve one interaction and
  accessibility contract.
- The table collection can fall back or fail visibly without corrupting recipe or subject state.

## Verification

- Run focused table, formula, reference, face-runtime, embedded-table, and focus-panel suites.
- Exercise all treatments across themes and polarities in Storybook and the live embedded route.
- Run the relevant system-browser table and focus-panel coverage, including paging and insertion.
- Run formatter, linter, static types, the full unit suite, and `git diff --check`.

## Shipped outcome

- `hila.table` now contributes one plugin-owned `collection` interior. The embedded container host
  resolves its existing recipe and supplies generic insertion and navigation services.
- Rendering no longer provisions a table recipe. Missing recipes and unavailable interiors show a
  host-owned fallback without changing subject or recipe state.
- The table keeps native semantics and all editing behavior while bounding live data to 100-row
  pages with a one-row lookahead and stable global row positions.
- `tableTreatment` validates through the component registry. Thin line, corner notch, and cell dots
  share the live interaction boundary and remain independent from theme, polarity, and fidelity.
- The live table, formula input, and embedded host use canonical semantic roles. The temporary
  whole-component adapter, application registration, and direct embedded mount are removed.

Focused table, formula, face-runtime, embedded-table, focus-panel, treatment, narrow-width,
insertion, boundary-hop, and paging coverage passes. Formatter, linter, types, the full unit suite,
Storybook build, production build, and `git diff --check` pass.

## Handoff

Session 4 can build line participation without retaining a second face-dispatch model. Session 5
may treat the table collection as the reference host/face boundary.
