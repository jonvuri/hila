# Phase 10 · Session 4b — Theme variants in Storybook (closed)

> **Closed after stage 2f.** The staged Storybook work is retained as an exploration archive. The
> review decision is to carry only **Wipeout · Sticky headers** forward as the workspace structure,
> separate that structure from visual chrome as a new **Ghost** base, and rebuild **Null** and
> **Wipeout** as extensions of Ghost. No session-4/4b prototype is a production candidate as-is.
> Follow-on work is split into small sessions in
> [Phase-10-Session-4c-plan.md](Phase-10-Session-4c-plan.md).

Continuation of the session-4 visual fan-out ([index](Phase-10-Session-4-themes.html)), moving from
throwaway HTML prototypes into **real, organized code in Storybook**. The prototypes got the ideas on
the table; they're now fraying under iteration. This session rebuilds the strongest candidates as
`OverlaidCards` variants over shared stub data, iterates them interactively with the user, and ends
with **theming-direction decisions** that unblock the rest of [Phase 10 §4](Phase-10.md#4-cohesive-design-token-and-theming-system).

> The instruction to read this whole document applied to the original 4b build. Follow-on sessions
> start at [NOW.md](NOW.md) and load only the closeout, Stage 2f, and archived details their active
> checklist cites.

---

## Archived inputs from session 4

The HTML prototypes remain useful visual evidence, but all are **retired and archived**. They are not
sources of current layout truth and must not be incrementally promoted into production code.

| Artifact | Archived value |
|---|---|
| [Phase-10-Session-4-themes.html](Phase-10-Session-4-themes.html) | Retired comparison index for the original three-way fan-out |
| [Phase-10-Session-4-theme-wipeout.html](Phase-10-Session-4-theme-wipeout.html) | Retired Wipeout catalog; may supply isolated chrome references only |
| [Phase-10-Session-4-theme-null.html](Phase-10-Session-4-theme-null.html) | Retired Null catalog; intent survives, implementation does not |
| [Phase-10-Session-4-theme-ultramodern.html](Phase-10-Session-4-theme-ultramodern.html) | Retired Ultramodern direction |
| [Phase-10-Session-4-wipeout-overlaid-cards.html](Phase-10-Session-4-wipeout-overlaid-cards.html) | Retired deep dive into six overlaid-card concepts |

The deep dive's concepts: **OC-A1** (column-locked tab strip, full card edges), **OC-A2** (top-lines
only), **OC-A3** (disconnected notches), **OC-B** (depth gauge rail), OC-C (edge-on sheets), OC-D
(spines), OC-E (chevron flow), OC-F1/F2/F3 (terrace family). This session builds **A1+A3 (combined),
A2, and B** for Wipeout, plus one variant each for Null and Ultramodern.

## Original objectives (completed through stage 2f)

1. **Combine the OverlaidCards story and Outline story** — render a dense outline inside the panels
   for a better gestalt demo (the current `StubPanelBody` renders em-dash placeholder lines).
2. **Create `OverlaidCards` variants per theme**, based on the HTML prototypes:
   - **Null** (per §N5b)
   - **Ultramodern** (per §U5b)
   - **Wipeout · Notches** = OC-A1 + OC-A3 combined — *parameterize every change made during
     prototyping so this variant is very flexible to configure* (highest-priority variant)
   - **Wipeout · Top lines** = OC-A2
   - **Wipeout · Depth gauge** = OC-B
   - All rendered with the **same dense + nested stub data**.
3. **Interactive review** — the user reviews the variants in Storybook and refines further in-session.
4. **Close with decisions**: final theming-direction call(s), then prepare to proceed with the rest of
   Phase 10 stage 4 (token reconciliation, theming model, `global.css` migration plan).

## Non-goals / ground rules

- **Do not wire anything into the live app.** `StreamView` stays on the default
  `expanded-staircase` theme (same policy as Phase 7b stage 5).
- **Do not touch `src/design/tokens.css` yet.** Variants keep their values in variant-local custom
  properties (the existing `--card-*` pattern in `OverlaidCards.css`); token reconciliation is the
  §4 pass *after* the direction decisions.
- Don't commit unless the user asks. Run the standard checks (below) after each meaningful step.

---

## Closeout decisions

1. **One forward layout: Sticky headers.** The `Design/Workspace` story **Wipeout · Sticky headers**
   supplies the selected overall layout and hierarchy behavior. The entire overlaid-cards family —
   expanded staircase, collapsed breadcrumb, Null/Ultramodern card skins, Wipeout notches/top-lines/
   gauge, and every HTML OC concept — is retired as a candidate. Keep it intact as an archive.
2. **Ghost owns the skeleton.** Extract the structure and indispensable UX affordances from the
   selected story into a theme-neutral base named **Ghost**. Ghost owns column composition, sticky
   navigation headers, drill-path legibility, focus-panel anatomy, interaction states, and the
   minimum visible affordances needed to understand and operate them. It does not inherit Wipeout
   decoration by default.
3. **One deep-stream breadcrumb exception.** When the four-column window has shifted the global-root
   navigation panel offscreen, the first visible panel is a focus panel. Put one simple ancestry
   breadcrumb at the top of that leftmost focus panel. Do not render it on later focus panels or while
   the root navigation panel remains visible.
4. **Null and Wipeout extend Ghost.** Both themes reuse Ghost's structure and behavior without markup
   forks. Null is rebuilt from scratch as the most unsurprising affordance layer. Wipeout adds its
   characteristic instrument chrome and quirks. Ultramodern does not continue.
5. **Design from atoms upward.** Decompose visual decisions into orthogonal atoms and small molecules
   before fixing the canonical token vocabulary. Avoid component-sized theme forks where a semantic
   state, primitive, or custom-property override expresses the distinction.
6. **Comparison is the approval gate.** Before final theme or token decisions, render complete design
   cards for Ghost, Null, and Wipeout together in one scrollable Storybook page, over identical
   content and states, with useful temporary dials. Token finalization and live-app migration wait
   for explicit review of that page.

## Progress record

- [x] Stage 1 — dense shared fixture and gestalt story.
- [x] Stages 2a–2e — five theme/card variants and common comparison stories.
- [x] Stage 2f — workspace-scale FocusPanel, Sticky Headers, and Depth Gauge stories.
- [x] Stages 3–4 — direction review closed by the decisions above; focused follow-on sessions
  planned.

---

## Stage 1 — Dense-outline gestalt story — complete

- Replace/augment `StubPanelBody` in [OverlaidCards.stories.tsx](../src/design/overlaid-cards/OverlaidCards.stories.tsx)
  with the real presentational `Outline` ([src/design/outline/Outline.tsx](../src/design/outline/Outline.tsx))
  fed via `renderPanel` — the contracts already compose: `OverlaidCardsProps.renderPanel(panel, i)`
  can return `<Outline items={...} theme={...} />`.
- **Shared dense fixture** (one module, reused by every story/variant): the session-4 "Reading queue"
  world, expanded to real density — ~20–25 `OutlineNode`s, 3–4 levels deep, mixed containers/leaves,
  at least one long label that must truncate (e.g. "Designing Data-Intensive Applications — reading
  notes and quotes"). Suggested shape: root panel = the hila outline (Research ▸ Reading queue ▸
  Papers/Web clips, Trips, Field notes, Archive…); focus panels = "Reading queue" (children = the four
  books + live-view stub rows) and "Designing Data-Intensive Applications" (children = chapter notes).
- Panel stack for the gestalt story (mirrors the deep-chain scene used in every prototype):
  `title: 'hila'`, panels `[nav(root outline), focus('Reading queue'), focus('DDIA')]`,
  gaps `[[], [Research], []]` — plus keep the existing four scenarios working.
- Outline theme inside panels: start with `workflowy-geometric` or `corner-notches` (whichever reads
  best against each card variant; can be a story control).

## Stage 2 — The variants — complete, archived

Extend the existing **swappable-renderer pattern**: `OverlaidCards` is already a thin `<Switch>` over
renderers sharing layout helpers (`positionTabs`, `PanelColumns`, extent/color helpers — see
[OverlaidCards.tsx](../src/design/overlaid-cards/OverlaidCards.tsx)). Add the new renderers alongside
`ExpandedStaircase` / `CollapsedBreadcrumb`.

**Type shape (suggestion, adjust in-session):** extend `OverlaidCardsTheme` with
`'null' | 'ultramodern' | 'wipeout-notches' | 'wipeout-toplines' | 'wipeout-gauge'`, plus an optional
per-variant options prop. For type safety a discriminated union is nicer:
`variant?: { kind: 'wipeout-notches', options?: NotchesOptions } | …` — pick whichever keeps the
existing `theme` prop backward-compatible. Prefer `type` over `interface`, arrow functions (repo
style).

Fonts: Wipeout variants need `Chakra Petch` (display) + `Share Tech Mono` (instrument mono); Orbitron
is the user-liked alternate (make the display stack a variant option). Import via the variant's own
CSS file, not `tokens.css`, so the app bundle is untouched.

### 2a · Wipeout — Notches (OC-A1 + OC-A3 combined) — **priority**

The instrument-strip layout with card chrome dialable from full edges down to bare ticks. Visual
rules from the prototypes (see §W5b + deep-dive OC-A1/OC-A3 for rendered reference):

- **Tab layer, column-locked**: per-column tab groups flush with their column's left edge; within a
  group, tab baselines staircase down toward focus. Tab species: *title* (inverted fill, one chamfered
  corner), *ancestor* (1px outline, mono uppercase, clickable), *panel* (outline, carries the
  non-active panel's title — 7b Resolution B), *marker* (small solid accent block, no text = the
  active panel; non-interactive).
- **Card chrome** (the A1↔A3 dial): vertical ancestor edges + panel edge/top-rule (A1 full lines) ⇄
  disconnected ticks (A3). A3 semantic rules, locked during prototyping:
  - Ancestor card = **single top tick** (no floor). Panels keep bottom ticks → "has a floor" = "is open".
  - **Every tab throws a short tick from its bottom-left corner**; the matching ancestor card's top
    tick starts on that **same invisible horizontal line** (tab ↔ card tied by alignment, not
    connectors). Where a tab sits directly on its own card's edge (title tab, first tab of a group),
    the two ticks meet into an open corner for free.
  - Panel corners are an H tick + V tick that **never meet** (open corners; CornerNotchBox exploded).
    Active panel = open corners in accent.
- **Parameterize everything we changed while prototyping** (`NotchesOptions`, all with defaults
  matching the latest prototype state):
  - `edgeMode: 'lines' | 'ticks'` (A1 vs A3) — possibly per-axis (`verticalEdges`, `topEdges`)
  - `tabStaggerStep` (px/level; proto: 3)
  - `ancestorLeftStep` / `ancestorTopStep` (card offsets; proto: 5 / 3)
  - `tickLength` (proto: V 12px / H 16px), `tabTickLength` (proto: 10), `cornerGap` (H/V inset before
    the corner point; proto: 5–6px)
  - `tabTicks: boolean` (bottom-left tab ticks) and `alignAncestorTicksToTabs: boolean`
  - `ancestorBottomTicks: boolean` (proto: **off**), `panelBottomTicks: boolean` (proto: on)
  - `activeCorners: 'top' | 'four' | 'brackets3'` (proto: four open corners; catalog language:
    3-corner brackets w/ TL reserved for header) + `activeEdge: boolean` (2px accent left edge)
  - `chamfer` (title-tab corner cut; proto: 5–8px), `markerSize`
  - depth **brightness ramp** (ordered token list, e.g. `[line-2, line, ink-4, ink-3]`)
  - `tabMaxWidth` / ellipsis policy
- **Implementation gotchas found in the prototypes** (avoid by construction): CSS `clip-path` on the
  chamfered title tab swallows pseudo-element ticks, and `overflow:hidden` ellipsis clips
  `::before/::after` lines — so render ticks/lines as **real positioned elements in the tab/field
  layers**, not pseudo-elements.

### 2b · Wipeout — Top lines (OC-A2)

- No vertical edges anywhere. Each tab extends its baseline **leftward** as a 1px line to the frame's
  left edge — the nested terraced card-tops are the only card suggestion. Needs a larger stagger to
  read (proto: ~5–6px/level after iteration; 3px smeared).
- The marker's full-width accent line **is** the active panel's rule (no rule inside the panel).
- Line brightness ramps by depth (same ramp option as 2a). Options: `staggerStep`, ramp,
  `lineThickness`.

### 2c · Wipeout — Depth gauge (OC-B)

- Fixed left rail: the whole chain as a vertical ladder — one row per level: 2-digit mono index +
  cell + mono uppercase name. Cell states: narrow dim = collapsed ancestor, wide = open panel, wide
  accent = active panel, ghost (unlit, no name) = depth not yet opened (VFD move; proto shows 2 ghost
  rows). Gauge rows are click targets (ancestor-tab semantics).
- Columns carry **no ancestry chrome** — only a mono level index in the panel header (`03 ·`, `05 ·`)
  pointing back at the gauge; active header gets accent index + flag.
- Options: `railWidth` (proto: ~208px), `ghostRows`, `showNames: boolean` (names vs indices-only),
  cell sizes. (A "micro-gauge in the shell status strip" placement is a noted future idea — don't
  build, mention in the story description.)

### 2d · Null (per §N5b)

- Tab layer = **per-column breadcrumb runs**: each column's ancestry segments sit flush above that
  column's left edge; segments plain text (11.5px), gray; hover = dotted underline (the click
  affordance); the column's own title is the **bold terminal segment**; accent dot marks the active
  column. Deliberate Resolution-B break: titles appear in both crumb and panel.
- Cards: surface fill, hairline border, radius (5/8px), ancestor edge cards as bare hairline slivers
  at 5px left-steps, card tops staircase ~5px; active card = one-shade-stronger border + **margin
  tick** (the accent quirk). No shadows in-flow.

### 2e · Ultramodern (per §U5b)

- Cards = **glass panes at altitudes**: `backdrop-filter` blur + translucent fill + edge highlight;
  ancestors peek from behind as slivers (10px steps), dimmer/lower by depth; panes overlap ~10px and
  the overlap shows *through* the glass; active pane = brighter edge + accent glow.
- Tab layer = **column-locked pill groups** (glass pills; panel pill = raised glass; active = gradient
  pill). Needs an ambient wash background in the story frame or the glass reads as nothing — give the
  story a wash-decorated container.
- Note for the story description: blur cost is a real open question for dozens of panels (candidate
  "glass rationed to overlays only" fallback).

### Stories

- Extend the `theme`/variant argType so **all variants render the identical fixtures** (the existing
  four scenarios + the new dense-gestalt scenario), matching the current inline-radio pattern.
- Per-variant stories with Storybook controls bound to the variant options (especially
  `NotchesOptions` — that's the review surface for stage 3).
- Keep an "AllScenarios"-style overview per variant, and ideally an "AllVariants" comparison story on
  the dense fixture.

## Stage 2f — Workspace story group (session extension) — complete

Added during the stage-3 iteration sessions: a new **`Design/Workspace`** Storybook group for
full-screen, whole-workspace mockups (Wipeout only), distinct from the OverlaidCards chrome
re-skins. Composed from two child components over a workspace-shaped fixture
(`workspacePanels` in `fixtures.tsx` — extended trees + per-panel focus meta + drill-row ids):

- **`WorkspaceFocusPanel`** ([variants/WorkspaceFocusPanel.tsx](../src/design/overlaid-cards/variants/WorkspaceFocusPanel.tsx)) —
  Wipeout mockup of the wired `FocusPanel`: title header (accent flag when active), content
  prose, Properties strip, Backlinks toggle. Sits above the children navigation panel in every
  drill-down column, mirroring the live app's column composition. Has its own story.
- **`StickyNav`** ([variants/StickyNav.tsx](../src/design/overlaid-cards/variants/StickyNav.tsx)) —
  the **sticky-headers-as-breadcrumbs** concept (new, not an OverlaidCards re-skin): no tab
  layer; the sticky header stacks ARE the breadcrumb. **Every sticky header is unique in the
  whole view** (within nav panels; focus-panel titles don't count): drill columns render no
  gap-ancestor rows — those rows are already visible in a column to the left — and the
  continuous ancestry reads through accents instead.
  - *Pinned title row* — the workspace title (nav column only), permanently stuck.
  - *Stuck ancestor rows* — VS Code sticky-header semantics: a container sticks below the stack
    while the viewport is inside its subtree, replaced when it scrolls past. No other special
    behavior.
  - *Focus-drill row* — the row drilled into for the next column. Persistent accent (2px left
    bar + throughline off the column's right edge into the next panel) and always visible: pins
    under the top stack when scrolled past, docks to the panel's bottom edge when below the fold.
  - *Drill-path ancestors* — every ancestor of a drill row carries a lighter left-edge accent
    (dimmed 2px bar) wherever it sits, in flow or stuck, so each level of the cross-column
    ancestry chain shows some accent.
  - Implementation: fixed 28px row rhythm + an overlay stack recomputed from scroll offset
    (VS Code's own approach; the stuck set is arithmetic on the flat row list, anchored on the
    first line below the *permanent* stack — anchoring on the transient chain oscillates at
    subtree boundaries).

Stories in the group: **FocusPanel** (component in isolation over its children outline),
**Wipeout · Sticky headers** (`WorkspaceSticky` full-screen columns), and **Wipeout · Depth
gauge (OC-B)** — moved here from `Design/OverlaidCards` (story + `AllVariants` slot removed
there; the `wipeout-gauge` renderer/theme itself is unchanged) and recomposed with the
FocusPanel above each drill column's outline.

## Stage 3 — Interactive review — closed by direction decision

Review ended with the closeout decisions above. No more iteration belongs in the session-4b variants;
future exploration happens only on the shared Ghost/Null/Wipeout design-card system.

## Stage 4 — Decisions + stage-4 prep — complete

- Direction decisions are recorded above and in [Phase-10.md](Phase-10.md) §4.
- The focused follow-on sequence, including the theme-card approval gate and later token work, is in
  [Phase-10-Session-4c-plan.md](Phase-10-Session-4c-plan.md).

## Verification

After each stage: `npm run format && npm run lint && npm run typecheck && npm run test:run`, and
verify Storybook builds (`pnpm build-storybook` or a live spot-check). No e2e needed unless live-app
files are touched (they shouldn't be).

## Reference files

**Code (read before writing any):**
- [src/design/overlaid-cards/OverlaidCards.tsx](../src/design/overlaid-cards/OverlaidCards.tsx) — renderer `<Switch>`, `positionTabs`, `PanelColumns`, layout/color helpers
- [src/design/overlaid-cards/types.ts](../src/design/overlaid-cards/types.ts) — `OverlaidCardsProps<P>` / `OverlaidAncestor` / `OverlaidCardsTheme`
- [src/design/overlaid-cards/OverlaidCards.css](../src/design/overlaid-cards/OverlaidCards.css) — the `--card-*` custom-property set (variant-local token pattern to follow)
- [src/design/overlaid-cards/OverlaidCards.stories.tsx](../src/design/overlaid-cards/OverlaidCards.stories.tsx) — fixtures + `StubPanelBody` to replace
- [src/design/outline/Outline.tsx](../src/design/outline/Outline.tsx) + [types.ts](../src/design/outline/types.ts) + [Outline.stories.tsx](../src/design/outline/Outline.stories.tsx) — the presentational outline (`OutlineNode` tree wrapper) and its stub-data style
- [src/design/tokens.css](../src/design/tokens.css) — canonical tokens (do not modify this session)

**Design context:** [Design.md](Design.md) (canon: sharp geometry, monochrome+violet, notches,
powers-of-two), [Phase-7b.md](Phase-7b.md) (tab semantics, Resolution B, theme-prop pattern),
[Phase-10.md](Phase-10.md) §4, [Phase-10-Inventory.md](Phase-10-Inventory.md) (styling reality).

**Wipeout language cheat-sheet** (from the session-4 catalog): micro-labels = 9px mono, 0.2em
tracking, square flag bullet · display voice = Chakra Petch 600–700 uppercase (Orbitron alternate) ·
one chamfered corner per filled block · brackets/notches suggest bounds, never enclose · **accent =
focus/selection/live only** · depth = hard steps + brightness ramps, never fades/shadows · ghost
segments (unlit VFD cells) are the one texture.

---

## Superseded starter prompt

Do not restart this session. Continue with session 4c in
[Phase-10-Session-4c-plan.md](Phase-10-Session-4c-plan.md).
