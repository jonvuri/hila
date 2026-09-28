---
title: Phase 13 Session 5 — Focus-panel scaffold and collection recursion
kind: phase-session
state: complete
updated: 2026-09-27
---

# Phase 13 Session 5 — Focus-panel scaffold and collection recursion

## Goal

Complete the focus panel as a host-owned identity, fields, collection, and relations scaffold. Make
subject mode, affinity, recursion, and fidelity determine interiors without giving faces shell
ownership.

## Depends on

Sessions 1–4 must provide recipe resolution, design inputs, the registered table collection, and
host-consumable property lines.

## Requirements

- [x] Keep panel identity, intrinsic fields, overflow fields, collection region, relations, insertion
      policy, breadcrumbs, sizing, and navigation in the host.
- [x] Resolve loose, container, and view subjects through one host path. Missing renderings use the
      substrate floor without creating a recipe.
- [x] Let nested subjects return to host slots rather than allowing one face to mount another face.
- [x] Apply composed/substrate fidelity locally and inherit it recursively. Active x-ray must force the
      entire descendant host tree to substrate.
- [x] Preserve view SQL on the marker subject, recognized source-cell write-back, and the prohibition on
      structural insertion, drag, or inferred ownership from query results.
- [x] Replace the panel's remaining legacy and inline visual roles as part of the complete local surface
      boundary.

## Boundaries

- Do not change rooted navigation, panel retention, saved-view identity, query semantics, or URL
  behavior.
- Do not add a general region-layout plugin API.
- Do not store fidelity in recipes or persist x-ray.
- Do not redesign source/sticky row continuity before Session 7.

## Acceptance

- [x] Every focus panel region has one clear host or face owner.
- [x] Loose aspects, dedicated tables, saved views, intrinsic fields, and relations preserve their
      current behavior through one scaffold.
- [x] Nested rendering terminates through host slots and the substrate fallback without face-owned
      recursion.
- [x] Composed, substrate, and x-ray behavior is correct across mixed nested subject modes.
- [x] Focus-panel styles consume canonical roles without leaving a parallel legacy boundary.

## Verification

- [x] Run focused focus-panel, view-place, query-band, substrate-region, embedded-table, relations, and
      face-runtime suites.
- [x] Exercise mixed loose/container/view nesting, absent renderings, invalid views, write-back, and
      insertion-firewall cases.
- [x] Inspect themes, polarities, fidelities, narrow presentation, and accessibility in Storybook and
      the system browser.
- [x] Run formatter, linter, static types, the full unit suite, focused E2E, and `git diff --check`.

## Shipped outcome

- One focus-panel collection host now resolves loose, container, and view subjects. It uses the
  intentional matrix or extent recipe when present and otherwise renders the substrate floor
  without creating recipe state.
- The panel host retains identity, fields, relations, navigation, sizing, and insertion policy.
  Loose subjects render the substrate region, containers use a registered collection or bounded
  substrate rows, and saved views render their marker-owned SQL.
- Nested subjects yield back through `FaceHostSlot` to the same recursive host. Resolved fidelity
  stays inherited through the returned subtree, and x-ray still forces substrate at every level.
- View results retain recognized source-cell write-back while structural insertion, drag, and
  inferred ownership remain unavailable. Container fallback insertion creates owned rows without
  provisioning a face recipe.
- Focus-panel, query-band, substrate-region, and row-gesture styles now use local CSS modules and
  canonical semantic roles. The retired global panel boundary is absent.

Formatter, linter, static types, 1,310 unit tests, production and Storybook builds, and 41 focused
system-browser tests pass. The full 169-test E2E suite passes. Live narrow and wide inspection
covered Ghost, light Null, and dark Wipeout presentation; Lighthouse scored accessibility and best
practices at 100.

## Handoff

Session 6 applies the same runtime contract to the workspace's row and expanded-block hosts.
