# Phase 10 -- App structure and cohesive design system (planning placeholder)

> Renumbered from Phase 7d (originally Phase 7c). The row<->table continuum exploration ([Phase 7c](Phase-7c.md)) was promoted into its own implementation phases -- the data-layer ownership-spine work ([Phase 8](Phase-8.md)) and the view-layer surfaces ([Phase 9](Phase-9.md)) -- pushing this design-system pass to Phase 10. It follows the continuum work because the views and surfaces that the token/theming system must span (embedded tables, property surfaces, query views, cross-matrix navigation) are designed and built in Phases 8-9.

A comprehensive design pass, still to be fully determined. This phase is intentionally a **planning placeholder**: it requires a deliberate deep dive before any code is written. The goal is to step back from the feature-by-feature build, examine everything assembled so far, and decide -- precisely -- how the app's views fit together and how a single cohesive design-token and theming system spans all of it.

Most of this phase's early output is documentation and resolved decisions, not implementation. Break ground only after the structure and the token model are settled.

This builds on the existing design system ([Design.md](Design.md), [Design-Faces.md](Design-Faces.md), `src/design/`) and the overlaid-cards work ([Phase 7](Phase-7.md), [Phase 7b](Phase-7b.md)). It also relates to the unmigrated `src/global.css` application styles noted in [Plan.md - Design system](Plan.md).

---

## 1. Inventory and audit

Survey what exists before deciding what it should become.

- [ ] **Catalog every view and surface** currently in the app: workspace stream view (navigation + focus panels, overlaid cards), table face, tag browser, matrix browser, SQL runner, sidebar/dev tools, face config, app shell tabs. For each: what it is, who opens it, what it contains, and how it is currently styled (tokens vs ad-hoc `global.css` vs inline).
- [ ] **Catalog the styling reality.** Where the canonical design tokens (`src/design/tokens.css`) are used vs where the app uses ad-hoc values (the dark-mode `global.css`, the overlaid-cards `--card-*` properties, inline colors). Identify conflicts with the stated design language (sharp geometry, monochrome + violet) introduced by recent exploration.
- [ ] **Output:** a short written inventory (this doc or a companion) that the rest of the phase plans against.

## 2. View hierarchy and navigation model

Decide the overall structure, hierarchy, and interactions of the app's views. Open questions to resolve (not yet answered):

- [ ] **Is the workspace the root/parent of everything,** or one peer view among several? How do matrixes that are not the workspace (tags, user-created matrixes, plugin housekeeping matrixes) surface relative to it?
- [ ] **What other views and sub-views will exist** (search, settings, a home/landing surface, per-matrix views, agent/op surfaces), and how does the user move between them?
- [ ] **How do plugins contribute and arrange views together?** Faces already declare slots; this asks the higher-level question of how plugin-provided views compose into the app shell and into each other (e.g. a face rendered inside a focus panel, a plugin owning a top-level view).
- [ ] **Navigation primitives.** Tabs vs panels vs routes; how the overlaid-cards left-to-right model relates to any global navigation; deep-linking / addressability of a view state.
- [ ] **Output:** a decided view-hierarchy and navigation model, captured as an architecture note (extend [Architecture.md](Architecture.md)) and reflected as updates/cross-links in [Plan.md](Plan.md).

## 3. Plugin view composition model

Formalize how plugins share and arrange views, building on the existing face/slot system.

- [ ] Define how a plugin registers top-level views vs faces embedded within other views.
- [ ] Define how composed views (e.g. a face inside a focus panel, a child-matrix reference rendering a table face) resolve their host context, sizing, and chrome.
- [ ] Relate to open questions already tracked in Plan.md (face affinity for matrixes, preferred faces).
- [ ] **Output:** a composition model documented alongside the face system docs ([Plugins.md](Plugins.md), [Architecture.md](Architecture.md)).

## 4. Cohesive design token and theming system

Unify the visual language across every surface into one token + theming system. Mostly a placeholder pending stages 1-3, but the intended shape:

- [ ] **Reconcile the two visual directions:** the canonical design system (Design.md: sharp geometry, monochrome + violet, powers-of-two spacing) and the overlaid-cards exploration (7b: layered surfaces, depth fades, tab shapes). Decide the single intended language and which tokens express depth/elevation, surface layering, and accent.
- [ ] **Extend the token set** as needed (elevation/surface scale, depth/fade ramps, motion, focus rings) in `src/design/tokens.css` / `tokens.ts`, keeping the semantic, theme-aware structure.
- [ ] **Theming model.** Confirm `data-theme` scoping covers all surfaces; decide how many themes ship (dark/light + any concept themes) and how face/view themes (e.g. overlaid-cards staircase vs breadcrumb) relate to the global theme.
- [ ] **Migration plan for `global.css`.** Sequence the incremental migration of app shell, stream view, faces, and browsers onto the token system (the migration deferred in Plan.md). Keep it incremental and behavior-preserving.
- [ ] **Output:** updated [Design.md](Design.md) (and Design-Faces.md if face themes are touched), an updated token system, and a staged migration checklist that subsequent sessions execute.

---

## Design decisions

- **Plan before building.** This phase deliberately front-loads decisions. The deliverables of stages 1-3 are documents and resolved decisions; implementation (stage 4 migration) only begins once the structure and token model are agreed.
- **One design language.** The recent overlaid-cards exploration and the established design system must converge into a single token + theming system rather than coexisting as parallel styling regimes.
- **Build on what exists.** The face/slot system, design tokens, and Storybook infrastructure are the substrate; this phase organizes and unifies rather than replaces them.

## Open questions (to resolve during the phase)

These are the crux of the phase and are expected to be answered by its planning stages, not assumed up front:

1. Is the workspace the root/parent of all views, or a peer?
2. What is the full set of top-level views and sub-views, and the navigation between them?
3. How do plugins contribute and compose views into the shell and into each other?
4. What single design language reconciles the design system and the overlaid-cards exploration, and how is depth/elevation tokenized?
5. How are global themes vs per-view/face themes layered, and what is the migration order off `global.css`?

## Dependency notes

Follows [Phase 7b](Phase-7b.md), the row<->table continuum exploration ([Phase 7c](Phase-7c.md)), and its implementation phases ([Phase 8](Phase-8.md) data layer, [Phase 9](Phase-9.md) view layer). Stages 1-3 (inventory, view hierarchy, composition model) gate stage 4 (token/theming unification and migration). This phase should settle before large new view work or a full `global.css` migration is undertaken. Because Phases 8-9 introduce new surfaces (embedded tables, property surfaces, query views, cross-matrix navigation), this design pass is best done once those surfaces are settled, so the token system spans the final set of surfaces.
