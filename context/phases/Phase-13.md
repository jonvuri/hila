---
title: Phase 13 — Live design-system and face-runtime completion
kind: phase-plan
state: active
updated: 2026-09-27
---

# Phase 13 — Live design-system and face-runtime completion

Phase 13 completes the host and design-system migration after Phase 12 established one stream root.
It removes the compatibility face runtime and remaining live legacy-style boundaries before new
product faces begin in Phase 14.

## Outcomes

- Table, inline tag, property, face-configuration, matrix-browser, editor, and system-edge surfaces
  consume canonical design roles.
- Hosts own `line` and `collection` dispatch, recursion, panel scaffold, affinity, fidelity,
  navigation, and insertion policy.
- One intentional recipe is stored for a matrix. The universal substrate floor is implicit rather
  than represented by an unused table recipe.
- The embedded table is a registered collection interior, and `TemporaryLegacyFaceAdapter` plus the
  direct `TableFace` mount retire.
- Composed, substrate, and x-ray fidelity resolve recursively through the face-host tree.
- Source rows and sticky rows share one reviewed visual and interaction seam while the source row
  remains the only tree item and editor owner.

## Fixed decisions

- The production shell keeps one stream root. Top-level Table and Tags surfaces do not return.
- A matrix stores at most one intentional recipe in this phase. Multiple saved recipes and
  appearance-level overrides remain deferred until a real consumer requires them.
- Generic substrate rendering is a host fallback. It does not require an automatically provisioned
  `hila.table` config. Actual table subjects and explicit table choices keep table recipes.
- Normalized table sort and filter state remains durable collection presentation state associated
  with the recipe. It does not become subject SQL or untyped settings.
- `VITE_HILA_VISUAL_THEME` may select `ghost`, `null`, or `wipeout` at build or development-server
  startup. Missing or invalid input resolves to Ghost. Polarity and fidelity remain independent.
- Phase 13 adds no runtime theme chooser or persisted theme preference.
- Fidelity applies recursively to face hosts. Non-face editor, browser, and system-edge controls use
  canonical design roles without acquiring alternate face renderings.
- X-ray is transient development inspection state. It is not stored in a recipe or user data.
- The source/sticky visual result passes a focused review before production adoption. Sticky copies
  retain named actions but never own editing, drag, selection, or tree semantics.

## Fixed inputs

- [Architecture](../Architecture.md) owns the subject → recipe → face → host contract.
- [Plugins](../Plugins.md) owns the compatibility-removal list.
- [Design](../Design.md) and [Design Faces](../Design-Faces.md) own theme, fidelity, sticky, and
  component-variant behavior.
- Phase 12's single stream root, launcher parity, responsive retained panels, and retired-surface
  references are shipped inputs.
- The unreleased database remains reset-only at schema version 0. A schema adjustment still requires
  durability-policy coverage and a two-replica case.

## Sessions

| Session                                                                                                                  | Outcome                                                                                       | Depends on | State    |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ---------- | -------- |
| [1 — Face recipe and host-runtime foundation](Phase-13/Session-1-face-recipe-and-host-runtime-foundation.md)             | One deterministic recipe boundary, implicit substrate floor, and lifecycle-owned host runtime | Phase 12   | Complete |
| [2 — Theme and fidelity inputs](Phase-13/Session-2-theme-and-fidelity-inputs.md)                                         | Environment-selected visual theme and recursive transient fidelity inputs                     | 1          | Complete |
| [3 — Table collection cutover](Phase-13/Session-3-table-collection-cutover.md)                                           | Registered table collection, canonical treatments, and compatibility-adapter retirement       | 1–2        | Complete |
| [4 — Inline tags and property-line surfaces](Phase-13/Session-4-inline-tags-and-property-line-surfaces.md)               | Canonical inline/property editing and host-consumable line interiors                          | 1–3        | Complete |
| [5 — Focus-panel scaffold and collection recursion](Phase-13/Session-5-focus-panel-scaffold-and-collection-recursion.md) | Host-owned panel regions, recursion, affinity, and fidelity                                   | 1–4        | Planned  |
| [6 — Workspace line host and editor migration](Phase-13/Session-6-workspace-line-host-and-editor-migration.md)           | Workspace rows participate in the runtime without losing editor or navigation continuity      | 1–5        | Planned  |
| [7 — Source/sticky continuity review](Phase-13/Session-7-source-sticky-continuity-review.md)                             | Reviewed compact-row projection and explicit production handoff                               | 6          | Planned  |
| [7A — Source/sticky continuity implementation](Phase-13/Session-7a-source-sticky-continuity-implementation.md)           | Approved row continuity ships without duplicating tree or editor ownership                    | 7          | Planned  |
| [8 — System edge and face administration](Phase-13/Session-8-system-edge-and-face-administration.md)                     | Canonical administrative surfaces and recipe-aware face configuration                         | 1–7A       | Planned  |
| [9 — Legacy-style retirement and closeout](Phase-13/Session-9-legacy-style-retirement-and-closeout.md)                   | No live compatibility runtime or legacy surface styles remain                                 | 1–8        | Planned  |

The sequence is incremental even where dependencies would permit parallel work. Each live surface
must pass its preservation and visual gates before its compatibility path or legacy styles retire.

## Phase acceptance

- Embedded tables, inline tags, property editing, rooted navigation, responsive retained panels,
  and the development system edge preserve their behavior throughout the migration.
- Every face host resolves the intentional matrix recipe or the implicit substrate floor without
  relying on registration order or an unused identity-table recipe.
- Faces provide interiors only. They do not own panel chrome, recursively mount faces, infer
  ownership, or acquire shell navigation policy.
- Table sort, filter, edit, insert, drill, formula, and reference behavior survives the registered
  collection cutover.
- Ghost, Null, and Wipeout preserve one interface and state contract. Environment-selected theme
  input never changes polarity, density, component variants, shell presentation, or fidelity.
- X-ray forces substrate through every descendant face host and remains transient.
- Source/sticky handoff preserves visual identity, named actions, accessibility, and scroll
  continuity while maintaining one source tree item and editor.
- Matrix browsing and face administration remain system-edge tools rather than product roots.
- `TemporaryLegacyFaceAdapter`, its application registration, the direct embedded `TableFace`
  mount, obsolete recipe bypasses, legacy aliases, and dead surface styles are absent.
- Phase 14 remains blocked until focused and full verification pass and canonical documents record
  the shipped boundary.

## Closeout

Phase completion requires every session to be complete in order, all affected canonical topics to
match shipped behavior, and schema/durability documentation to match any reset-era schema rewrite.
Run formatter, linter, static types, the full unit suite, Storybook build, focused system-browser
coverage, the full E2E suite, link verification, and `git diff --check`. Record the final shipped
boundary here and route `NOW.md` to Phase 14 only after the compatibility-removal gate passes.

## Next action

Execute [Session 5](Phase-13/Session-5-focus-panel-scaffold-and-collection-recursion.md).
