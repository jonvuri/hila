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
- [x] **What other views and sub-views will exist** (search, settings, a home/landing surface, per-matrix views, agent/op surfaces), and how does the user move between them? — *Everything is a place, a gesture, or the system edge. Search = the `⌘K` launcher (transient; escalates to persisted `view` nodes via save-search-as-node, [§3b](#3b-launcher-deep-dive--the-query-spec)); no home/landing surface (the root nav panel is it); per-matrix views = focus states on container nodes; settings + dev tools = the system edge (kept tight to what lives above the database); agent/op surfaces = future system-layer faces (Phase 12 notification tray). Movement: focus gestures locally, launcher globally, overlays for the system edge.*
- [x] **How do plugins contribute and arrange views together?** — *Plugins contribute **face types** (renderable in the two host contexts: row and panel, substrate floor in both) and **commands** (`/` entries + `⌘K` actions). The shell — stream + launcher + system edge — is fixed core infrastructure (like the table face type); there are no plugin top-level views. The detailed host-context contract is [§3](#3-plugin-view-composition-model).*
- [x] **Navigation primitives.** — *Panels/focus for local navigation, the launcher for global; no routes. Tabs retired as top-level navigation (candidate to return only as saved stream states). The ancestry ladder (provenance → home → membership) governs breadcrumbs; deep-linking/URLs deferred, with stream state kept as a plain serializable value so history/saved-states/URLs stay cheap.*
- [x] **Output:** a decided view-hierarchy and navigation model, captured as an architecture note (extend [Architecture.md](Architecture.md)) and reflected as updates/cross-links in [Plan.md](Plan.md). — *Landed: [Architecture.md — View hierarchy and navigation](Architecture.md#view-hierarchy-and-navigation); [Plan.md decision #8](Plan.md#resolved-design-decisions) + Phase 10 summary cross-link.*

## 3. Plugin view composition model

Formalize how plugins share and arrange views, building on the existing face/slot system.

> **Session 3 complete.** The composition contract is captured in [Plugins.md — Plugin view composition model](Plugins.md#plugin-view-composition-model) and a tightened [Architecture.md — What plugins contribute](Architecture.md#what-plugins-contribute), with the visual companion + round-by-round reasoning at [Phase-10-Session-3-visuals.html](Phase-10-Session-3-visuals.html). Six determinations (D1–D6); the interior-ownership question (D4) got its own round-2 deep dive and resolved to **option F** (faces supply *line* + *collection* renderings; the panel scaffold stays shell-owned, outside the plugin contract).

Open questions, resolved:

- [x] Define how a plugin registers top-level views vs faces embedded within other views. — *No plugin top-level views (session 2). Plugins register **face types** (D2/D4) and **commands** (D6); the shell is fixed infrastructure. A face type declares up to two renderings — **line** (a row as a participant) and **collection** (a row-set) — and nothing else about panel layout.*
- [x] Define how composed views (e.g. a face inside a focus panel, a child-matrix reference rendering a table face) resolve their host context, sizing, and chrome. — *The **subject → ladder → host** contract (D1/D2/D3/D5): the subject supplies rows (its child-sourcing mode — the config sheds its query, D1); a fixed **affinity ladder** (appearance override [deferred] → subject/matrix preferred recipe → substrate floor, D3) resolves the rendering recipe; the **host** owns all chrome, sizing (width + a computed **density** tier, never pixels), **fidelity** cascade (D5), drill-in, and **recursion** (faces never mount faces — a nested subject yields a slot back to the host). Faces draw interiors only.*
- [x] Relate to open questions already tracked in Plan.md (face affinity for matrixes, preferred faces). — *Resolves [Plan.md open question #5](Plan.md#resolved-design-decisions): the **preferred face is a subject-level (matrix-level) recipe** on rung 2 of the ladder; the substrate remains the universal fallback (rung 3). Affinity rides the membership plane (follows the container everywhere it appears); per-appearance overrides (rung 1) are modeled but **unstored in v1**.*
- [x] **Output:** a composition model documented alongside the face system docs ([Plugins.md](Plugins.md), [Architecture.md](Architecture.md)). — *Landed: [Plugins.md — Plugin view composition model](Plugins.md#plugin-view-composition-model); refined [Architecture.md — What plugins contribute](Architecture.md#what-plugins-contribute); [Plan.md decision #8](Plan.md#resolved-design-decisions) cross-link + open question #5 marked resolved.*

## 3b. Launcher deep dive → the query spec

> Scheduled out of session 2: the `⌘K` launcher is the shell's universal **"go"** gesture — the transient sibling of the [§9.6](Phase-9.md#96-the-unified-creation-gesture) `/` **"make"** surface — and it absorbs the find/browse functions of the retiring Table/Tags tabs. It therefore needs its own dedicated design session, sequenced **after stage 3** (it consumes the place/gesture taxonomy from §2 and the command-contribution model from §3) and **gating the tab-removal step of stage 4** (the launcher lands before tabs are removed).

> **Session 3b-i pivot + completion.** The *shared authoring gestures* item proved to be the foundation the rest stands on, so the session pivoted to settle **the query spec and its SQL-analog gestures** first. The decided model — SQL-canonical + dialect recognizer, the six-dimension spec, escalation tiers, the leaf taxonomy (incl. the CTE source chip), the chip interaction grammar, and the v1 glyph vocabulary — is captured in [Query-Spec.md](Query-Spec.md) (determinations D1–D19), with the visual companion + round-by-round reasoning at [Phase-10-Session-3b-visuals.html](Phase-10-Session-3b-visuals.html). The launcher *surface* proper is **session 3b-ii**, consuming that model. Chip palette + the opacity/invalid frame treatments are recorded as placeholders whose final form is the [§4](#4-cohesive-design-token-and-theming-system) token pass's.

> **Session 3b-ii complete.** The launcher surface model — one flat relevance-ranked list, sigil filter tokens for family narrowing, tempo as a fact about the spec (with the read-only preview ceiling), the empty state (jump-back · recent deep searches · `?` guide), the full keyboard map (`⌘K` everywhere; `⌘⏎` insert-ref absorbing the editors' old insert-link), token value editors, and the always-live save flow — is captured in [Launcher.md](Launcher.md) (determinations D20–D32 + inputs I1–I3, continuing Query-Spec.md's numbering), with the visual companion + round-by-round reasoning at [Phase-10-Session-3b-ii-visuals.html](Phase-10-Session-3b-ii-visuals.html). Stage-4 build items (incl. the tab-retirement gate) are enumerated there. Overlay/scrim, filter-token, save-bar, and expansion treatments join the §4 placeholder list; live-relative date tokens are recorded as designed growth in Query-Spec.md.

- [x] **Shared authoring gestures with view blocks.** — *Resolved (3b-i), and promoted to the session's foundation: one **query spec** (kind · scope · text · where · order · limit) edited by gestures, compiled to canonical SQL (the only stored/executed form — §9.3's `executed == stored` unbroken), lifted back by a recognizer sound on the compiler's dialect. Transient launcher search and persisted `view` blocks are the same object at two lifetimes. See [Query-Spec.md](Query-Spec.md).*
- [x] **Filter application UX.** — *Resolved (3b-i): chips are the state; a chip is object-as-rendered-app-wide + op glyph + value (no dimension labels); name-only input with object-first op discovery; sigils only as family narrowers (`#` types, `@` nodes); the "Types lens" is `kind: containers`. Menu → typeahead → typed-operator mastery ladder.*
- [x] **Save-search-as-node.** — *Resolved (3b-i): compile the spec → store the SQL as a `view` node via the existing block path → home by provenance → focus it. Compiler-emitted SQL recognizes back into chips by construction. Cross-matrix union saves allowed but read-only, with a pick-a-kind nudge.*
- [x] **v1 scope.** — *Confirmed (3b-i), with an insulation bonus: the spec's `text` dimension compiles to `LIKE` now and FTS later — no surface, saved node, or gesture changes at the migration.*
- [x] **One surface, two tempos.** — *Resolved (3b-ii): tempo is a fact about the spec — text-only = quick switcher, any committed chip = deep tempo (chip row + read-only preview of spec-touched columns + save affordance), deleting the last chip is the way back; no mode state. Centered overlay (quick ~640px; deep expands viewport-proportionally, still floating). One flat relevance-ranked list, no sections: names/labels outweigh content by default (a tuning weight, not a band). Empty state = jump-back (≤6) · recent deep searches (≤6, restore-not-run — the recovery that makes instant Esc safe) · help footer with `?` guide. Full keyboard map incl. `⌘K` everywhere (I1) and `⌘⏎` insert-ref-at-cursor. See [Launcher.md](Launcher.md).*
- [x] **Action registry.** — *Resolved (3b-ii): commands rank on merit in the one list; sigil filter tokens narrow families (`@` named · `#` types · `>` commands · `[` containers — sigil alone browses the family; families also findable by name, teaching their sigils); subject = the provenance node, shown inline, disabled-with-reason when absent.*
- [x] **Output:** a launcher design doc (companion to this phase) + build items folded into the stage-4 migration sequence. — *Landed: [Query-Spec.md](Query-Spec.md) (the shared model, 3b-i) + [Launcher.md](Launcher.md) (the surface, 3b-ii, incl. the ordered stage-4 build items ending at the tab-retirement gate). A block-chrome follow-up (replacing the [§9.3](Phase-9.md#93-embedded-collections--live-views) dev textarea with the chip chrome) remains queued, with panel/density details riding §4.*

## 4. Cohesive design token and theming system

Unify the visual language across every surface into one token + theming system. Mostly a placeholder pending stages 1-3, but the intended shape:

> **Sessions 4/4b closed — exploration fan-out and convergence.** The HTML catalogs and Storybook variants explored Wipeout, Null, Ultramodern, and the overlaid-cards family over common fixtures. They are now retained as a **retired exploration archive**; none is a production candidate as-is. The one surviving structural concept is **Wipeout · Sticky headers**, stripped of Wipeout styling to become the **Ghost** base. Null and Wipeout will be rebuilt as visual extensions of Ghost; Ultramodern and every overlaid-cards layout are retired. See the [4b closeout](Phase-10-Session-4b-plan.md#closeout-decisions) and the [4c–4i plan](Phase-10-Session-4c-plan.md).

**Direction fixed before token work:**

- **Skeleton:** Ghost owns the workspace structure, sticky-header navigation, drill-path behavior,
  focus-panel anatomy, and only the affordances necessary for comprehension and operation.
- **Deep ancestry:** when the root navigation panel has shifted outside the four-column window, a
  simple breadcrumb appears only atop the leftmost visible focus panel. Otherwise ancestry remains
  spatially legible through the sticky headers and drill path.
- **Theme family:** Ghost is the base; Null adds the most unsurprising conventional affordances;
  Wipeout adds its distinct chrome and quirk budget. Theme layers must not fork structure.
- **Approval gate:** first split the design into semantic atoms and orthogonal molecules, then show
  complete Ghost, Null, and Wipeout cards together on one scrollable page. Do not finalize canonical
  tokens or start the live-app migration until that page is reviewed.

- [ ] **Reconcile the visual language:** use the Ghost skeleton plus Null/Wipeout extension model to resolve which current Design.md rules remain universal and which become theme values. The overlaid-cards depth language is retired rather than reconciled into the new structure. Complete this item only after the three-card comparison is approved.
- [ ] **Extend the token set** as needed (elevation/surface scale, depth/fade ramps, motion, focus rings) in `src/design/tokens.css` / `tokens.ts`, keeping the semantic, theme-aware structure. **Incoming from §3b-i ([Query-Spec.md](Query-Spec.md) D17–D19):** the chip frame palette (dimension/plane tints vs object identity colors) · the **opacity texture** ("opaque SQL inside"; dashed frame is the placeholder) · the **invalid treatment** (red = "this term cannot run", and nothing else) · the `ƒ` formula mark's rendering on matrix formula columns in the table face. **Incoming from §3b-ii ([Launcher.md](Launcher.md)):** the launcher overlay treatment (scrim, elevation, the shared overlay language with `/` and the system edge) · the **filter-token treatment** (hollow/dotted placeholder — visibly a different species from spec chips) · deep-tempo expansion proportions + preview density · save-bar and help-footer chrome. Semantic intents are settled; visual treatments are decided here.
- [ ] **Theming model.** Confirm `data-theme` scoping covers all surfaces and formalize Ghost as the base contract with Null/Wipeout overrides. Decide after the comparison review which themes ship and how dark/light polarity, face variants, and the orthogonal composed/substrate/x-ray fidelity axis layer without multiplying theme forks.
- [ ] **Migration plan for `global.css`.** Sequence the incremental migration of app shell, stream view, faces, and browsers onto the token system (the migration deferred in Plan.md). Keep it incremental and behavior-preserving. **Sequencing constraint from session 2:** the launcher ([§3b](#3b-launcher-deep-dive--the-query-spec)) lands before the tab-removal step; the retiring tab views (Table, Tags) are captured as Storybook components at removal.
- [ ] **Output:** updated [Design.md](Design.md) (and Design-Faces.md if face themes are touched), an updated token system, and a staged migration checklist that subsequent sessions execute.

**Incoming deferral — substrate / x-ray fidelity (from [Phase 9.2](Phase-9.2.md#composed-vs-substrate-fidelity-and-x-ray), re-confirmed by [§9.5](Phase-9.md)).** The **composed vs. substrate** fidelity axis (and its global **x-ray** toggle) is a rendering-convention that spans *every* surface at every granularity — the same scope this token/theming pass unifies. It was deliberately deferred from 9.2/9.5 (which only lean on substrate as a *concept*: §9.5's boundary-hop far side reuses the role-adaptive `FocusPanel`, not a built substrate face). **Point of no return:** the elevation/surface/fade token model decided here is what a substrate face would render against; building substrate before this pass would mint tokens this phase then has to reconcile. So settle the fidelity axis as part of the token model (how composed vs. substrate read; whether x-ray is a theme or an orthogonal overlay) and add it to the migration checklist. The **identity face** ([Architecture.md](Architecture.md#identity-face)) is its conformance test — "does every surface x-ray cleanly?"

---

## Design decisions

- **Plan before building.** This phase deliberately front-loads decisions. The deliverables of stages 1-3 are documents and resolved decisions; implementation (stage 4 migration) only begins once the structure and token model are agreed.
- **One structural language, layered visual themes.** Ghost is the shared skeleton and interaction grammar; Null and Wipeout may add chrome only through the common semantic contract. Retired explorations remain references, not parallel styling regimes.
- **Build on what exists.** The face/slot system, design tokens, and Storybook infrastructure are the substrate; this phase organizes and unifies rather than replaces them.

## Open questions (to resolve during the phase)

These are the crux of the phase and are expected to be answered by its planning stages, not assumed up front:

1. ~~Is the workspace the root/parent of all views, or a peer?~~ **Resolved (session 2):** one literal root; focus, not zoom. See [Architecture.md — View hierarchy and navigation](Architecture.md#view-hierarchy-and-navigation).
2. ~~What is the full set of top-level views and sub-views, and the navigation between them?~~ **Resolved (session 2):** places / gestures / system edge; no top-level tabs. See §2 above.
3. ~~How do plugins contribute and compose views into the shell and into each other?~~ **Resolved (session 3):** plugins contribute **face types** (each declaring up to two renderings — *line* and *collection*; the panel scaffold stays shell-owned) + **commands** (one registry, `/` and `⌘K` surfaces); the shell is fixed infrastructure. Composition follows the **subject → affinity ladder → host** contract, with the host owning chrome, sizing, fidelity, and recursion. See §3 above and [Plugins.md — Plugin view composition model](Plugins.md#plugin-view-composition-model).
4. Which current Design.md rules belong to Ghost, which are Null/Wipeout choices, and which semantic atoms/molecules express them without structural forks? *(The overlaid-cards layout and its depth staircase are retired. Carry-ins remain: root-matrix schema authority under substrate fidelity, the x-ray toggle's home, and face-config-as-panel-chrome.)*
5. After the three-card approval gate, which members of the Ghost/Null/Wipeout family ship, how do dark/light polarity and per-face variants layer beneath them, and what is the migration order off `global.css`?

## Dependency notes

Follows [Phase 7b](Phase-7b.md), the row<->table continuum exploration ([Phase 7c](Phase-7c.md)), and its implementation phases ([Phase 8](Phase-8.md) data layer, [Phase 9](Phase-9.md) view layer). Stages 1-3 (inventory, view hierarchy, composition model) plus the [§3b](#3b-launcher-deep-dive--the-query-spec) launcher session gate stage 4 (token/theming unification and migration); §3b specifically gates the tab-removal step. This phase should settle before large new view work or a full `global.css` migration is undertaken. Because Phases 8-9 introduce new surfaces (embedded tables, property surfaces, query views, cross-matrix navigation), this design pass is best done once those surfaces are settled, so the token system spans the final set of surfaces.

## Post-Phase 10 documentation consolidation (planned and deferred)

Do not perform this consolidation during Sessions 4c–4i. Those sessions need stable references while
the architecture and design system are still moving. Until Phase 10 closes, limit documentation
cleanup to routing, current-state accuracy, and explicit historical markers.

After Phase 10 settles:

- [ ] Audit every context document as canonical truth, active plan, supporting evidence, or history.
- [ ] Create a clear archive boundary for completed phase plans and visual explorations without
      discarding their rationale.
- [ ] Reconcile duplicated or superseded architecture and design statements across `Architecture.md`,
      `Plan.md`, `Design*.md`, and the phase records.
- [ ] Decide whether the largest canonical documents should split by concern, based on actual reading
      routes rather than file size alone.
- [ ] Revisit `AGENTS.md`, `README.md`, and `NOW.md` after the new structure exists; remove temporary
      routing and keep the always-loaded instructions small.
