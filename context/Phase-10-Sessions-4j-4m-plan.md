# Phase 10 · Sessions 4j–4m — Tokens and navigation polish

This sequence promotes the approved Ghost, Null, and Wipeout inputs into the canonical token
system. It then resolves two navigation details before the live shell migration starts: sticky
header transitions and configurable outline affordances.

Use [NOW.md](NOW.md) to identify the active session. Execute one session at a time. Each session
ends with its review and verification before the next session starts.

## Fixed decisions

- Ghost, Null, and Wipeout all ship. They share one structure and semantic state contract.
- Visual theme, dark/light polarity, component variant, and rendering fidelity are separate axes.
- A navigation outline is a component variant. It is not a visual theme and does not select one.
- The selected sticky-header workspace remains the forward navigation structure.
- These sessions change the forward design system and Storybook specimens only. The live shell,
  production workspace, launcher, faces, and browsers remain on their current styles until the
  later migration slices.
- The overlaid-card layout family remains retired.

## Why this order

1. Session 4j defines the semantic roles, theme override mechanism, component-variant contract,
   and migration boundaries.
2. Session 4k implements that contract and removes the temporary theme-card role layer.
3. Session 4l fixes sticky motion on the canonical geometry and leaves a stable decoration seam.
4. Session 4m plugs outline affordances into that seam and verifies that each variant preserves
   the sticky behavior.

This order prevents the outline work from inventing local tokens. It also prevents outline
decoration from changing sticky row geometry after the motion work closes.

## Preflight findings

### Sticky transition

Chrome DevTools measured the first `Design/Workspace` navigation panel at 1440 × 936. The sticky
layer changes height by one full 32-pixel row at scroll positions 4, 196, 228, 260, and 356. At each
threshold, a flow row and its sticky copy meet at the same edge while the overlay stack mounts or
unmounts a row. This creates the visible jump.

The current component also updates reactive scroll state for every scroll event. Its flow row and
sticky preview use different markup and horizontal geometry. The transition session must resolve
the topology and geometry. A time-based CSS transition alone will not fix the threshold seam.

### Outline affordances

The existing `Design/Outline` stories contain five variants:

- Workflowy clone
- Workflowy geometric
- Vector field
- Corner notches
- Whitespace only

The current `OutlineRow` owns disclosure controls, bullets, content placement, and decoration. The
forward navigation row separately owns selection, disabled state, editing, drill actions, and tree
semantics. Reusing `OutlineRow` directly would create two interaction contracts.

The production navigation panel already imports the old renderer and fixes it to Workflowy clone.
It computes decoration from the loaded row range. This input is not sufficient at virtual-window
boundaries: guide variants need ancestry and continuation context, corner notches need look-ahead,
and vector field can need up to 100 forward rows.

Session 4m must separate decoration from interaction and define a bounded window-context contract.
Decorative marks must be hidden from assistive technology. The shared navigation row must continue
to own disclosure, editing, selection, disabled state, drill actions, drag behavior, and focus.

### External references

Use these as pattern references, not as targets to copy:

- [VS Code tree indent guides](https://code.visualstudio.com/updates/v1_36) support an `onHover`
  mode. This suggests a quiet **hover guides** candidate that reveals ancestry rails on row hover
  or keyboard focus.
- [Notion toggle lists](https://www.notion.com/help/keyboard-shortcuts) use a compact expandable
  block. This suggests a minimal **toggle gutter** candidate with one stable disclosure column and
  no resting guide lines.

## Session 4j — Define the canonical token and configuration contract

**Outcome:** one reviewed contract names the canonical roles, their dependencies, the visual-theme
override mechanism, the independent component-variant mechanism, and the migration slices.

- [x] Convert the Session 4i requirements table into canonical atom groups for color, type, space,
      geometry, lines, motion, elevation, semantic states, and optional decoration.
- [x] Define which values depend on polarity, density, interaction state, or reduced-motion
      preference. Do not encode component names in general-purpose atom names.
- [x] Select the visual-theme attribute and inheritance mechanism. Keep polarity independent of
      Ghost, Null, and Wipeout.
- [x] Define a typed component-variant registry. Include `navigationOutline` as an independent key.
      Its explicit component value must not change when the visual theme changes.
- [x] Define composed, substrate, and x-ray fidelity inputs against the surface and elevation roles.
- [x] Map the open ThemeCard accessibility findings to token or component work. Do not treat
      low-contrast labels or invalid accessible names as theme character.
- [x] Write the ordered migration checklist: approved specimens; live shell and stream;
      overlaid-card removal; launcher and overlays; tab retirement; faces and browsers.
- [ ] Review the contract before any canonical token source changes.

### Session 4j verification

- [x] Format the touched documents.
- [x] Run `git diff --check`.
- [x] Confirm that no runtime or canonical token source changed.

## Session 4k — Implement tokens and migrate the approved specimens

**Outcome:** canonical tokens render the approved Ghost, Null, and Wipeout previews without the
temporary theme-card role layer.

- [ ] Add the reviewed token groups to `tokens.css` and `tokens.ts`. Implement the visual-theme
      override mechanism for Ghost, Null, and Wipeout.
- [ ] Replace the old token names and temporary ThemeCard roles while moving all current
      design-system and approved specimen consumers onto canonical roles. Do not add compatibility
      aliases.
- [ ] Add the visual-theme control through the shared Storybook decorator. Keep the focused
      preview control if it remains useful for instant local comparison.
- [ ] Add contract tests for theme inheritance, polarity independence, required roles, and unknown
      component-variant fallbacks.
- [ ] Resolve the ThemeCard label contrast, repeated accessible-name, and input-identifier findings
      recorded in Session 4i.
- [ ] Compare the canonical result with the approved preview in all three themes and both
      polarities. Fix token mapping errors only; do not reopen the approved design direction.
- [ ] Confirm that no live-app or production-face style changed.

### Session 4k verification

- [ ] Run `npm run format`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run test:run`.
- [ ] Run `pnpm build-storybook` and inspect the theme preview at desktop and narrow widths.

## Session 4l — Make sticky transitions seamless

**Outcome:** headers enter, stack, push, and leave without a visible row-height jump in either
scroll direction.

- [ ] Add a dense threshold fixture that covers title-only, one-level, multi-level, drill-at-top,
      and drill-at-bottom transitions.
- [ ] Extract the sticky layout calculation into a pure, tested model. Return stable slot identity,
      the active ancestor chain, the next boundary, and bounded transition progress.
- [ ] Give flow rows and sticky previews one row-height, inset, baseline, and decoration-slot
      contract. Keep their interaction semantics distinct where necessary.
- [ ] Keep sticky slots mounted across a threshold. Use scroll-linked transforms for the handoff and
      push-off. Do not animate layout properties or add ambient motion.
- [ ] Coalesce scroll updates to at most one reactive write per animation frame. Avoid layout reads
      in the scroll handler.
- [ ] Preserve click-to-scroll, collapse, drill path, selection, disabled state, keyboard focus,
      bottom dock, and long-label truncation.
- [ ] Under reduced motion, keep position continuity but remove nonessential easing or fades.
- [ ] Use Chrome DevTools to inspect one-pixel steps around every threshold in both directions.
      The visible stack coverage must not change by 32 pixels in one step, and no duplicate row may
      flash at the seam.
- [ ] Record a scroll performance trace. Confirm that the scroll handler does not cause repeated
      forced layout or long tasks.

### Session 4l verification

- [ ] Run focused pure-layout and component tests, including threshold minus one, threshold, and
      threshold plus one for both scroll directions.
- [ ] Run `npm run format`, `npm run lint`, `npm run typecheck`, and `npm run test:run`.
- [ ] Run `pnpm build-storybook`.
- [ ] Inspect desktop and narrow widths, all three visual themes, both polarities, and reduced
      motion in Chrome DevTools.

## Session 4m — Integrate configurable navigation outlines

**Outcome:** the forward navigation panel can switch outline affordances independently of visual
theme, and the old plus new candidates are ready for user review.

- [ ] Replace the ambiguous `OutlineTheme` boundary with a navigation-outline variant registry.
      Keep visual-theme values out of the registry key.
- [ ] Split the old renderer into decoration calculation and decoration paint. The shared
      navigation row continues to own all behavior and accessible semantics.
- [ ] Define the virtual-window input contract. It must provide stable global row identity,
      ancestry before the window, continuation state after the window, one-row look-ahead, and the
      bounded 100-row forward context needed by vector field.
- [ ] Adapt all five existing outline variants to the shared navigation row and canonical tokens.
      Preserve the old renderer-only stories as reference cases until the adapters pass.
- [ ] Add **hover guides**, inspired by VS Code. Reveal guide rails on row hover and
      `:focus-within`; keep the selected branch visible.
- [ ] Add **toggle gutter**, inspired by Notion. Use one stable disclosure column, quiet leaf
      spacing, and no resting guide line.
- [ ] Add a focused `Design/Navigation outline` story that uses the real forward navigation panel.
      Provide independent `visualTheme` and `navigationOutline` controls. Do not render a Cartesian
      comparison grid.
- [ ] Verify every variant with expanded, collapsed, selected, disabled, editable, drill-path,
      sticky, long-label, deep-tree, and virtual-window-boundary states.
- [ ] Review the old and new candidates with the user. Record the approved default and the variants
      that remain available. Archive rejected candidates without deleting their reference stories.
- [ ] Keep production configuration and persistence for the later live workspace migration.

### Session 4m verification

- [ ] Run focused decoration, registry, accessibility, and virtual-window-boundary tests.
- [ ] Run `npm run format`, `npm run lint`, `npm run typecheck`, and `npm run test:run`.
- [ ] Run `pnpm build-storybook`.
- [ ] Use Chrome DevTools to switch outline and visual theme independently. Check pointer, keyboard,
      sticky transition, narrow width, both polarities, and reduced motion.

## Follow-on migration order

Sessions 4n–4o are detailed in the
[live workspace migration and overlaid-card removal plan](Phase-10-Sessions-4n-4o-plan.md).

1. Migrate the live shell and stream as one behavior-preserving slice. Promote the approved sticky
   model and navigation-outline configuration without changing navigation behavior.
2. Remove the executable overlaid-card renderer, variants, styles, stories, and fixture coupling
   after the live cutover passes review.
3. Migrate the launcher and shared overlays. Land the launcher before top-level tabs are removed.
4. Capture the retiring Table and Tags views as Storybook references, then remove their tabs.
5. Migrate faces and browsers one at a time. Apply composed, substrate, and x-ray fidelity as an
   orthogonal axis.

## Starter prompt for Session 4j

> Read `context/NOW.md`, Session 4j and the fixed decisions in this plan, Phase 10 §4, the Session
> 4i semantic token requirements, and the approved theme rules in `Design.md`. Execute Session 4j
> only. Define the canonical token, visual-theme, component-variant, fidelity, and migration
> contracts. Do not edit canonical token or runtime source, migrate the live app, or commit.
