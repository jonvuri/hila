---
title: Phase 13 Session 4 — Inline tags and property-line surfaces
kind: phase-session
state: planned
updated: 2026-09-25
---

# Phase 13 Session 4 — Inline tags and property-line surfaces

## Goal

Move structured inline references, tag properties, shared fields, and aspect-row interiors onto
canonical design roles and host-consumable line behavior without changing their data lifecycle.

## Depends on

Sessions 1 and 2 must provide renderer lifecycle and design-axis inputs. Session 3 must have removed
the whole-component compatibility runtime.

## Requirements

- Provide the line interiors and substrate fallbacks needed for owned aspect and property rows to
  participate in host regions.
- Keep fields editable according to source-cell hydration. Formula and otherwise dry values remain
  read-only wherever they appear.
- Unify the style boundary for inline references, autocomplete, tag property controls, shared field
  editors, property rows, and aspect preview state around canonical semantic roles.
- Preserve live, empty, and ghost inline-reference states, promoted-type discovery, owned-aspect
  lifecycle, source reconciliation, and hover tethering.
- Keep accessible names, focus visibility, keyboard behavior, pointer behavior, invalid state, and
  target sizing consistent across themes and polarities.
- Leave host-owned labels, block grouping, coalesced headers, relations, and row gestures outside
  the line interior.

## Boundaries

- Do not restore a Tag Browser product root.
- Do not add Phase 14 task or review faces, field renderers, defaults, or product semantics.
- Do not move core `own`/`ref` cascade rules into plugin or presentation code.
- Do not turn property popovers into collection faces; they remain host scaffold.

## Acceptance

- Inline tag insertion, removal, editing, ghosting, autocomplete, and source reconciliation retain
  current behavior.
- Property rows can render through a host line slot or the substrate fallback without duplicating
  field ownership.
- No migrated inline/property surface depends on legacy palette aliases or global tag-panel styles.
- The same semantic states remain distinguishable in every approved theme and polarity.

## Verification

- Run focused inline-reference, tags, property-surface, field-editor, lifecycle, and face-runtime
  suites.
- Inspect live and Storybook states for keyboard focus, invalid input, empty values, ghosts,
  formulas, narrow widths, and both fidelities.
- Run relevant system-browser tag/property/editor coverage plus formatter, linter, static types, the
  full unit suite, and `git diff --check`.

## Handoff

Session 5 composes these line interiors and fields into the host-owned panel scaffold. Session 6
uses the same participation boundary in workspace rows.
