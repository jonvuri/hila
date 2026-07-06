# Phase 10 -- App structure and cohesive design system (planning placeholder)

> Renumbered from Phase 7d (originally Phase 7c). The row<->table continuum exploration ([Phase 7c](Phase-7c.md)) was promoted into its own implementation phases -- the data-layer ownership-spine work ([Phase 8](Phase-8.md)) and the view-layer surfaces ([Phase 9](Phase-9.md)) -- pushing this design-system pass to Phase 10. It follows the continuum work because the views and surfaces that the token/theming system must span (embedded tables, property surfaces, query views, cross-matrix navigation) are designed and built in Phases 8-9.

A comprehensive design pass, still to be fully determined. This phase is intentionally a **planning placeholder**: it requires a deliberate deep dive before any code is written. The goal is to step back from the feature-by-feature build, examine everything assembled so far, and decide -- precisely -- how the app's views fit together and how a single cohesive design-token and theming system spans all of it.

Most of this phase's early output is documentation and resolved decisions, not implementation. Break ground only after the structure and the token model are settled.

This builds on the existing design system ([Design.md](Design.md), [Design-Faces.md](Design-Faces.md), `src/design/`) and the overlaid-cards work ([Phase 7](Phase-7.md), [Phase 7b](Phase-7b.md)). It also relates to the unmigrated `src/global.css` application styles noted in [Plan.md - Design system](Plan.md).

---

## 1. Inventory and audit

Survey what exists before deciding what it should become.

- [x] **Catalog every view and surface** currently in the app: workspace stream view (navigation + focus panels, overlaid cards), table face, tag browser, matrix browser, SQL runner, sidebar/dev tools, face config, app shell tabs. For each: what it is, who opens it, what it contains, and how it is currently styled (tokens vs ad-hoc `global.css` vs inline).
- [x] **Catalog the styling reality.** Where the canonical design tokens (`src/design/tokens.css`) are used vs where the app uses ad-hoc values (the dark-mode `global.css`, the overlaid-cards `--card-*` properties, inline colors). Identify conflicts with the stated design language (sharp geometry, monochrome + violet) introduced by recent exploration.
- [x] **Output:** a short written inventory (this doc or a companion) that the rest of the phase plans against. See [Phase-10-Inventory.md](Phase-10-Inventory.md).

## 2. View hierarchy and navigation model

Decide the overall structure, hierarchy, and interactions of the app's views.

> **Session 2 complete.** The decided model is captured in [Architecture.md — View hierarchy and navigation](Architecture.md#view-hierarchy-and-navigation) and [Plan.md resolved design decision #8](Plan.md#resolved-design-decisions), with the visual companion at [Phase-10-Session-2-visuals.html](Phase-10-Session-2-visuals.html) (which also records the settled-vs-open ledger and the round-by-round reasoning).

Open questions, resolved:

- [x] **Is the workspace the root/parent of everything,** or one peer view among several? How do matrixes that are not the workspace (tags, user-created matrixes, plugin housekeeping matrixes) surface relative to it? — *One literal root: the stream over the one forest, ancestry never hidden, re-rooting = the existing focus mechanic (no "zoom" primitive). Non-workspace matrixes surface as places (type-nodes, sub-table containers — all owned, per the no-ownerless-matrix rule) and through lenses (`view` nodes + launcher filters over the membership plane); the flat "all matrixes" browse is a launcher lens, never a second root.*
- [x] **What other views and sub-views will exist** (search, settings, a home/landing surface, per-matrix views, agent/op surfaces), and how does the user move between them? — *Everything is a place, a gesture, or the system edge. Search = the `⌘K` launcher (transient; escalates to persisted `view` nodes via save-search-as-node, [§3b](#3b-launcher-deep-dive-scheduled-session)); no home/landing surface (the root nav panel is it); per-matrix views = focus states on container nodes; settings + dev tools = the system edge (kept tight to what lives above the database); agent/op surfaces = future system-layer faces (Phase 12 notification tray). Movement: focus gestures locally, launcher globally, overlays for the system edge.*
- [x] **How do plugins contribute and arrange views together?** — *Plugins contribute **face types** (renderable in the two host contexts: row and panel, substrate floor in both) and **commands** (`/` entries + `⌘K` actions). The shell — stream + launcher + system edge — is fixed core infrastructure (like the table face type); there are no plugin top-level views. The detailed host-context contract is [§3](#3-plugin-view-composition-model).*
- [x] **Navigation primitives.** — *Panels/focus for local navigation, the launcher for global; no routes. Tabs retired as top-level navigation (candidate to return only as saved stream states). The ancestry ladder (provenance → home → membership) governs breadcrumbs; deep-linking/URLs deferred, with stream state kept as a plain serializable value so history/saved-states/URLs stay cheap.*
- [x] **Output:** a decided view-hierarchy and navigation model, captured as an architecture note (extend [Architecture.md](Architecture.md)) and reflected as updates/cross-links in [Plan.md](Plan.md). — *Landed: [Architecture.md — View hierarchy and navigation](Architecture.md#view-hierarchy-and-navigation); [Plan.md decision #8](Plan.md#resolved-design-decisions) + Phase 10 summary cross-link.*

## 3. Plugin view composition model

Formalize how plugins share and arrange views, building on the existing face/slot system.

- [ ] Define how a plugin registers top-level views vs faces embedded within other views.
- [ ] Define how composed views (e.g. a face inside a focus panel, a child-matrix reference rendering a table face) resolve their host context, sizing, and chrome.
- [ ] Relate to open questions already tracked in Plan.md (face affinity for matrixes, preferred faces).
- [ ] **Output:** a composition model documented alongside the face system docs ([Plugins.md](Plugins.md), [Architecture.md](Architecture.md)).

## 3b. Launcher deep dive (scheduled session)

> Scheduled out of session 2: the `⌘K` launcher is the shell's universal **"go"** gesture — the transient sibling of the [§9.6](Phase-9.md#96-the-unified-creation-gesture) `/` **"make"** surface — and it absorbs the find/browse functions of the retiring Table/Tags tabs. It therefore needs its own dedicated design session, sequenced **after stage 3** (it consumes the place/gesture taxonomy from §2 and the command-contribution model from §3) and **gating the tab-removal step of stage 4** (the launcher lands before tabs are removed).

- [ ] **One surface, two tempos.** Design the quick↔deep continuum: instant fuzzy jump (labels, matrix titles) and deep, filtered, ordered search in one seamless surface — not two modes.
- [ ] **Filter application UX.** How dimension filters are applied, surfaced, and composed (e.g. restrict to promoted types/containers — the "Types lens" is launcher-only per session 2, no seeded view node).
- [ ] **Save-search-as-node.** The escalation from transient search to a persisted `view` node. Homing follows **provenance** (the node/panel focused when the launcher was invoked) — the placeless-creation rule settled in session 2.
- [ ] **Shared authoring gestures with view blocks.** The launcher's transient search and persisted `view` blocks are one authoring continuum (transient ↔ persisted SQL); design the higher-level SQL-analog gestures (filtering, ordering, dimension picking) **once, shared by both surfaces**. Mostly unbuilt on the block side too — [§9.3](Phase-9.md#93-embedded-collections--live-views) shipped raw SQL + snippets; this pass designs the user-facing authoring layer above that.
- [ ] **Action registry.** Plugin-contributed launcher actions — the `⌘K` half of the command contribution surface (sibling to the `/` registry), per the stage-3 composition model.
- [ ] **v1 scope.** Pre-FTS: `LIKE` over label-role columns + matrix titles + a containers/types filter is sufficient to retire the tabs (session 2 decision). Full field-value search follows the deferred FTS work ([Plan.md — Search](Plan.md#search), Phase 11+).
- [ ] **Output:** a launcher design doc (companion to this phase) + build items folded into the stage-4 migration sequence.

## 4. Cohesive design token and theming system

Unify the visual language across every surface into one token + theming system. Mostly a placeholder pending stages 1-3, but the intended shape:

- [ ] **Reconcile the two visual directions:** the canonical design system (Design.md: sharp geometry, monochrome + violet, powers-of-two spacing) and the overlaid-cards exploration (7b: layered surfaces, depth fades, tab shapes). Decide the single intended language and which tokens express depth/elevation, surface layering, and accent.
- [ ] **Extend the token set** as needed (elevation/surface scale, depth/fade ramps, motion, focus rings) in `src/design/tokens.css` / `tokens.ts`, keeping the semantic, theme-aware structure.
- [ ] **Theming model.** Confirm `data-theme` scoping covers all surfaces; decide how many themes ship (dark/light + any concept themes) and how face/view themes (e.g. overlaid-cards staircase vs breadcrumb) relate to the global theme.
- [ ] **Migration plan for `global.css`.** Sequence the incremental migration of app shell, stream view, faces, and browsers onto the token system (the migration deferred in Plan.md). Keep it incremental and behavior-preserving. **Sequencing constraint from session 2:** the launcher ([§3b](#3b-launcher-deep-dive-scheduled-session)) lands before the tab-removal step; the retiring tab views (Table, Tags) are captured as Storybook components at removal.
- [ ] **Output:** updated [Design.md](Design.md) (and Design-Faces.md if face themes are touched), an updated token system, and a staged migration checklist that subsequent sessions execute.

**Incoming deferral — substrate / x-ray fidelity (from [Phase 9.2](Phase-9.2.md#composed-vs-substrate-fidelity-and-x-ray), re-confirmed by [§9.5](Phase-9.md)).** The **composed vs. substrate** fidelity axis (and its global **x-ray** toggle) is a rendering-convention that spans *every* surface at every granularity — the same scope this token/theming pass unifies. It was deliberately deferred from 9.2/9.5 (which only lean on substrate as a *concept*: §9.5's boundary-hop far side reuses the role-adaptive `FocusPanel`, not a built substrate face). **Point of no return:** the elevation/surface/fade token model decided here is what a substrate face would render against; building substrate before this pass would mint tokens this phase then has to reconcile. So settle the fidelity axis as part of the token model (how composed vs. substrate read; whether x-ray is a theme or an orthogonal overlay) and add it to the migration checklist. The **identity face** ([Architecture.md](Architecture.md#identity-face)) is its conformance test — "does every surface x-ray cleanly?"

---

## Design decisions

- **Plan before building.** This phase deliberately front-loads decisions. The deliverables of stages 1-3 are documents and resolved decisions; implementation (stage 4 migration) only begins once the structure and token model are agreed.
- **One design language.** The recent overlaid-cards exploration and the established design system must converge into a single token + theming system rather than coexisting as parallel styling regimes.
- **Build on what exists.** The face/slot system, design tokens, and Storybook infrastructure are the substrate; this phase organizes and unifies rather than replaces them.

## Open questions (to resolve during the phase)

These are the crux of the phase and are expected to be answered by its planning stages, not assumed up front:

1. ~~Is the workspace the root/parent of all views, or a peer?~~ **Resolved (session 2):** one literal root; focus, not zoom. See [Architecture.md — View hierarchy and navigation](Architecture.md#view-hierarchy-and-navigation).
2. ~~What is the full set of top-level views and sub-views, and the navigation between them?~~ **Resolved (session 2):** places / gestures / system edge; no top-level tabs. See §2 above.
3. How do plugins contribute and compose views into the shell and into each other? **Direction set (session 2):** face types (row/panel host contexts) + commands; shell is fixed infrastructure. The host-context contract remains for §3.
4. What single design language reconciles the design system and the overlaid-cards exploration, and how is depth/elevation tokenized? *(Carry-ins from session 2: deep-ancestry tab overflow; root-matrix schema authority under substrate fidelity; the x-ray toggle's home; face-config-as-panel-chrome.)*
5. How are global themes vs per-view/face themes layered, and what is the migration order off `global.css`?

## Dependency notes

Follows [Phase 7b](Phase-7b.md), the row<->table continuum exploration ([Phase 7c](Phase-7c.md)), and its implementation phases ([Phase 8](Phase-8.md) data layer, [Phase 9](Phase-9.md) view layer). Stages 1-3 (inventory, view hierarchy, composition model) plus the [§3b](#3b-launcher-deep-dive-scheduled-session) launcher session gate stage 4 (token/theming unification and migration); §3b specifically gates the tab-removal step. This phase should settle before large new view work or a full `global.css` migration is undertaken. Because Phases 8-9 introduce new surfaces (embedded tables, property surfaces, query views, cross-matrix navigation), this design pass is best done once those surfaces are settled, so the token system spans the final set of surfaces.
