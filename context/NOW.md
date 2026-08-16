---
title: Current state
kind: status
state: active
updated: 2026-08-16
phase: phase-10
session: phase-10-session-4c-archive-fan-out
---

# Now

Phase 10 Session 4b is closed. Its theme fan-out produced one forward structural
direction, but none of its HTML or Storybook variants is a production candidate as-is.
The next implementation session is **4c: archive the fan-out**.

## Read for Session 4c

1. [Sessions 4c–4i](Phase-10-Session-4c-plan.md): read the fixed decisions, shared
   boundaries, Session 4c checklist, and verification section.
2. [Session 4b closeout decisions](Phase-10-Session-4b-plan.md#closeout-decisions) and
   [workspace story group](Phase-10-Session-4b-plan.md#stage-2f--workspace-story-group-session-extension--complete).
3. Read archived variant details or [Phase 10 §4](Phase-10.md#4-cohesive-design-token-and-theming-system)
   only when the task needs their rationale.

The closed 4b brief's instruction to read the whole document applied to the original 4b
build. It does not apply to the follow-on sessions.

## Settled direction

- The forward workspace structure comes from **Wipeout · Sticky headers**.
- **Ghost** owns that shared structure, behavior, and minimum affordances without
  Wipeout decoration.
- **Null** and **Wipeout** extend Ghost through shared semantic inputs and optional
  decoration, not markup or behavior forks. Ultramodern is retired.
- A simple ancestry breadcrumb appears only on the leftmost visible focus panel when
  the global-root navigation panel has shifted outside the four-column window.
- Canonical tokens and shipping-theme choices wait for the Ghost → Null → Wipeout
  comparison page and explicit approval in Session 4i.

## Next session: 4c

Make the archive boundary explicit in Storybook and the Session 4 HTML pages, preserve
Sticky Headers as the source reference, and create only the placeholder for the new
forward Ghost workspace group.

Do not extract Ghost, modify canonical tokens, wire the live app, delete prototype
material, or rename experimental renderers merely to clean up the archive.

## Following sequence

- **4d:** extract the theme-neutral Ghost workspace skeleton.
- **4e:** build the shared design-card grammar.
- **4f:** complete the Ghost card.
- **4g:** rebuild Null as a Ghost extension.
- **4h:** rebuild Wipeout as a Ghost extension.
- **4i:** compare, tune, approve, and derive token requirements.

The detailed outcomes and acceptance criteria remain in
[the 4c–4i plan](Phase-10-Session-4c-plan.md); do not duplicate them here.

## Documentation boundary

The architecture corpus is deep and parts of the design model remain in flight. Until
Phase 10 settles, limit cleanup to routing, current-state accuracy, and clearly marking
historical material. A comprehensive audit, archive split, and possible decomposition of
large canonical documents is planned after Phase 10.

## Handoff rule

At the end of each session, check off the detailed session items, then update this file
with the completed outcome, relevant verification, the next session, its minimum reading
set, the frontmatter date/session, and one brief context-management finding if useful.
