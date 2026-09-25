---
title: Phase 13 Session 6 — Workspace line host and editor migration
kind: phase-session
state: planned
updated: 2026-09-25
---

# Phase 13 Session 6 — Workspace line host and editor migration

## Goal

Move workspace row and expanded-block participation onto the forward host runtime while preserving
the shipped editor, virtualizer, rooted navigation, and responsive-shell behavior.

## Depends on

Sessions 1–5 must provide the recipe boundary, design inputs, line interiors, registered
collections, and completed panel scaffold.

## Requirements

- Make row slots request `line` and expanded blocks request the applicable line and collection
  interiors through host-owned dispatch.
- Keep bullets, handles, guides, disclosure, drag/drop, focus actions, previews, insert affordances,
  recursion, density, and row budgets in the workspace host.
- Resolve workspace component settings through the intentional recipe rather than an application-
  level lookup and special-case signal.
- Preserve ProseMirror ownership, selection, pending saves, inline commands, content expansion,
  disclosure state, and keyed row identity across rendering changes.
- Preserve paged virtualization, folded results, portals, ghosts, cross-matrix rows, rooted ancestry,
  launcher provenance, and responsive retained-panel behavior.
- Replace the remaining workspace and editor style boundary with canonical semantic roles while
  keeping Guides and component variants independent from theme and fidelity.

## Boundaries

- Do not change the ownership forest, query runtime, navigation model, panel-retention limit, or
  responsive 719/720 presentation boundary.
- Do not let a face own drag/drop, editor registration, tree semantics, or nested face mounting.
- Preserve the existing sticky mechanics. Session 7 reviews the final source/sticky visual
  projection after this row surface is stable.
- Do not add Phase 14 product faces or appearance-level recipes.

## Acceptance

- Workspace line and expanded collection participation use host dispatch and deterministic affinity.
- Row and editor DOM identity remain stable across ordinary edits, paging, focus changes, resize,
  and fidelity changes.
- Rooted navigation, drag/drop, insertion, folding, portals, ghosts, and launcher entry preserve
  current semantics.
- Workspace and editor surfaces remain structurally identical across themes, polarities, and
  component variants.
- The application no longer manually selects workspace recipe settings outside the host resolver.

## Verification

- Run focused workspace, editor, stream-controller, virtualizer, folding, portal, drag/drop,
  launcher-provenance, and face-runtime suites.
- Exercise editor mount stability, selection, pending saves, paging, cross-matrix rows, narrow/wide
  resize, and fidelity changes in the system browser.
- Inspect every theme/polarity pair with Guides, long content, empty/loading/error states, and
  reduced motion.
- Run formatter, linter, static types, the full unit suite, focused E2E, and `git diff --check`.

## Handoff

Session 7 reviews source/sticky continuity against this final row structure. Later sessions must not
reopen workspace row ownership.
