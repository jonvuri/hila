# Phase 7b -- Overlaid cards follow-ups

Follow-up work on the overlaid-cards stream view delivered in [Phase 7](Phase-7.md) (stage 10). This phase polishes the interaction model, trims redundant chrome, and stands up a Storybook surface for design iteration -- including a second, more space-saving rendering of the same concept.

This is incremental, mostly-presentational work. No schema or core changes. After this phase:

- Ancestor tabs are interactive navigation affordances, not just labels.
- Every card -- ancestor strips and focus panels alike -- carries a clickable label tab, focus panels can be collapsed back to via their tab or a left-chevron control, and each title lives in exactly one place.
- The navigation panel header carries only what is still needed.
- The overlaid cards have a presentational component decoupled from SQLite data, exercised in Storybook with stub data.
- A swappable "collapsed breadcrumb" theme exists as a Storybook concept alongside the current "expanded staircase" theme.

Relevant existing code: [src/workspace/StreamView.tsx](../src/workspace/StreamView.tsx), [src/workspace/NavigationPanel.tsx](../src/workspace/NavigationPanel.tsx), [src/workspace/FocusPanel.tsx](../src/workspace/FocusPanel.tsx), [src/global.css](../src/global.css). Reference pattern for the presentational/Storybook split: [src/design/outline/Outline.stories.tsx](../src/design/outline/Outline.stories.tsx) and the `theme`-prop renderer in [src/design/outline/types.ts](../src/design/outline/types.ts).

---

## 1. Clickable ancestor tabs

Make the ancestor tabs (`data-testid="card-tab"`) navigate focus, mirroring the right-arrow focus button in navigation rows.

- [x] **Decide the navigation semantics** (settle in-session). A tab represents an ancestor row at a known depth in the visible ancestry chain. Clicking it should bring that row into focus while preserving the single-line ancestry constraint (see [Phase 7 - Ancestry constraint](Phase-7.md)). Recommended: truncate the panel stack to the point at/above that ancestor and open a focus panel for the ancestor row (analogous to `handleReplaceAt` / `handleAppendAfter` in `StreamView.tsx`), so the clicked ancestor becomes the rightmost focused card. The workspace-title tab navigates to the root navigation panel.
- [x] **Thread row identity through the layout.** The tab layout entries currently carry only a label; carry the ancestor's `row_id` (already available from the ancestry query) so a click handler can act on it.
- [x] **Wire the click handler** in `StreamView.tsx`. Reuse the existing focus-open path so behavior matches the right-arrow button (same panel-stack mutation, same `MAX_COLUMNS` enforcement).
- [x] **Affordance + a11y.** Tabs should read as buttons (cursor, hover state already exists), be keyboard-activatable, and have an accessible label. Keep the existing `card-tab` test id.
- [x] Tests (Playwright): clicking an ancestor tab focuses that ancestor row (a focus panel for it appears; deeper panels are replaced). Clicking the workspace-title tab returns to the root navigation panel.
- [x] Run `npm run format && npm run lint && npm run typecheck && npm run test:run`, then `pnpm test:e2e`.

## 2. Universal label tabs + focus-panel collapse control

Stage 1 made ancestor tabs clickable, but focus panels have no tab, so there is no quick way to "reset focus" to a focus panel (closing everything to its right) the way an ancestor tab resets to an ancestor. Extend the tab metaphor so **every** card carries a clickable label tab, and add an in-panel collapse affordance that mirrors the navigation rows' right-arrow.

The settled design (call it **Resolution B**): the tab is a card's title, so a focused panel should not *also* render a large duplicate header. Keep the big editable header only on the active (rightmost) panel; non-active focus panels collapse to `tab + content`; the active panel's tab is a non-text active-stop marker rather than a duplicate label. (The fully merged "tab is the only title, editing lives in the tab" approach -- Resolution A -- is noted as a possible future refinement but is out of scope here.)

- [x] **Emit tabs for panel cards** in the `layout` memo of [src/workspace/StreamView.tsx](../src/workspace/StreamView.tsx). Today only `LayoutAncestor` cards drive the tab layer; add tabs for `panel` cards too, carrying `panelIndex` and the panel's own label. The nav/root panel's tab is the workspace title (reusing stage 1's title-tab path), so the title tab now appears whenever the root is not the rightmost card -- generalizing stage 1's column-shift-only behavior.
- [x] **Fetch focus-panel row labels.** `buildAncestryForRowsQuery` returns each focus row's *ancestors*, not the row's own label. Add a small batched label query keyed by `focusRowIds` (or extend the existing query) so panel tabs can show their title. The active panel needs no label (its tab is a marker).
- [x] **Wire panel-tab click semantics.** Clicking a focus-panel tab at index `i` collapses everything to its right: reuse `handleClose(i + 1)` (keep `panels.slice(0, i + 1)`). Ancestor-tab (`handleReplaceAt`) and title-tab (root nav) behavior from stage 1 is unchanged. The active panel's tab is non-interactive (already focused).
- [x] **Resolve title duplication (Resolution B).** Pass an `active`/`showHeader` signal to [src/workspace/FocusPanel.tsx](../src/workspace/FocusPanel.tsx) so the large `focus-panel-label` header (the `FocusLabelEditor`) renders only on the active panel. Non-active focus panels show content beneath their tab; their title lives in the tab only. Confirm label editing still works on the active panel and that collapsing to a non-active panel (making it active) restores its header.
- [x] **Add the left-chevron collapse control.** On each non-last focus panel (`stream-focus-column`), add a hover-revealed left-facing chevron at the top-right, positioned in the same control column as the navigation rows' right-arrow (`nav-row-open-focus`) and mirroring its hover-reveal styling. Clicking it collapses to that panel (`handleClose(i + 1)`) -- the shallower-direction analog of the right-arrow's deeper-direction open. Give it a test id (e.g. `focus-collapse-btn`) and an accessible label.
- [x] **Affordance + a11y + visual.** Focus-panel tabs read as buttons and are keyboard-activatable (as ancestor tabs already are); style them more prominently than the recessive ancestor tabs, with the active-stop marker in the violet accent. Capture the new surfaces/markers as named tokens/props rather than scattered literals. Keep the existing `card-tab` test id; distinguish focus tabs if tests need it.
- [x] Tests (Playwright): clicking a focus-panel tab (and the chevron) collapses deeper panels; the active panel shows its header while non-active focus panels do not (no duplicated title); the active panel's tab is the marker, not a text label.
- [x] Run `npm run format && npm run lint && npm run typecheck && npm run test:run`, then `pnpm test:e2e`.

## 3. Slim navigation panel header

The breadcrumb bar is now redundant with the ancestor tab bar, and the focus panel above a navigation panel already shows the same title. Remove the duplicated chrome.

**Design change (settled this session):** intra-panel zoom was removed entirely. Nested navigation panels are now locked to representing the children of their associated focus panel (`focusRoot` is immutable -- `null` for the root panel, `props.rootKey` for embedded panels). All outline navigation goes through top-level focus drilling (`Mod+L` / right-arrow) and ancestry interactions (ancestor tabs, collapse chevron, title tab); back-out is `Mod+ArrowLeft` (panel pop). This removed the need to keep the breadcrumb query, and made the `outline-focus-title` fully redundant (the root never zooms, so it always shows the workspace-title header; the embedded case duplicates the `FocusPanel` header).

- [x] **Remove the breadcrumb bar** from `NavigationPanel.tsx` (the `breadcrumb-bar` block and associated `breadcrumbs()` rendering). ~~Evaluate whether the breadcrumb query is still needed for `onZoomOut`; keep only what the zoom logic requires.~~ With zoom removed there is no `onZoomOut` consumer, so the breadcrumb query (`buildBreadcrumbQuery`, the `breadcrumbs()` memo, `BreadcrumbData`, and the unit test) was deleted outright.
- [x] **Remove the redundant focus title.** The `outline-focus-title` heading was removed entirely (root never zooms; embedded duplicates the `FocusPanel` header). The root workspace-title editor is kept.
- [x] **Remove the "Children" label header** in the focus panel's children section (`FocusPanel.tsx`, `focus-panel-children`), keeping the embedded navigation panel itself.
- [x] **Reconcile remaining empty-state and spacing.** The empty state ("Press Enter to create your first row.") is unchanged; with the header gone, embedded panels render straight into the outline under the children section's padding, and the root panel keeps its `workspace-title-header`.
- [x] **Update affected tests.** Removed the obsolete zoom/breadcrumb tests (`e2e/navigation-panel.spec.ts` "Breadcrumbs display in subtree mode", `e2e/workspace-title.spec.ts` "breadcrumb shows workspace title…"); focus-panel-header coverage remains via the existing "Focus panel shows row label in header" test. Dropped the `Mod-ArrowDown`/`Mod-ArrowUp` zoom keybindings and the `onZoomIn`/`onZoomOut` `OutlineCallbacks` members.
- [x] Run static checks and tests as above.

## 4. Storybook story + visual iteration

Stand up the overlaid cards in Storybook with stubbed data so the design can be iterated independently of the live app and the worker/SQLite stack.

- [ ] **Extract a presentational component.** Factor the card-stack rendering out of `StreamView.tsx` into a pure component (e.g. `OverlaidCards`) that takes a stub-friendly data contract -- an ordered set of panels (focused content columns) and the ancestor chains/gaps between them -- and emits the cards + tab layer. `StreamView` composes it with live data; Storybook renders it with static fixtures. Mirror the split between `Outline` (presentational) and `NavigationPanel` (wired).
- [ ] **Define the stub data contract.** Panels carry placeholder title/content; ancestors carry label + depth/color index. Include fixtures covering: root-level ancestors only, inter-panel gaps, deep multi-gap chains, and the `MAX_COLUMNS` case.
- [ ] **Write `OverlaidCards.stories.tsx`** under the `Design/` title prefix, following [Outline.stories.tsx](../src/design/outline/Outline.stories.tsx): per-scenario stories plus an "all scenarios" overview.
- [ ] **Iterate the visual design** toward more pleasing, minimal, bold, and futuristic. Tune surfaces, borders, fades, tab shape, and depth cues. Note the tension with the established design language ([Design.md](Design.md): sharp geometry, monochrome + violet accent) -- exploration may diverge here; reconciliation into the token system is [Phase 7c](Phase-7c.md) scope. Capture chosen parameters as named tokens/props rather than scattered literals.
- [ ] **Port the refined parameters back to the live app** once settled, keeping the live behavior unchanged.
- [ ] Run static checks and tests; verify Storybook builds (`pnpm storybook`).

## 5. Collapsed breadcrumb theme (Storybook concept)

A more space-saving rendering of the same concept: instead of a staircase of one card per ancestor, a single unfocused card at each level shows multiple ancestors as a traditional inline breadcrumb (`a / b / c`).

- [ ] **Introduce a theme/variant prop** on `OverlaidCards` (e.g. `'expanded-staircase' | 'collapsed-breadcrumb'`), following the `OutlineTheme` renderer pattern. Same data contract and outward interface, swappable in place.
- [ ] **Implement the collapsed renderer.** Each gap (and the root-level ancestry) collapses to a single card whose tab/strip renders the ancestors as a breadcrumb trail; breadcrumb segments remain individually clickable (reusing stage 1's navigation).
- [ ] **Add it to Storybook** as a swappable argType on the existing stories, so both themes can be compared on identical fixtures.
- [ ] **Do not wire it into the live app.** This remains a concept for now; the live `StreamView` keeps the staircase theme. Note the swap path for a future decision.
- [ ] Run static checks; verify Storybook builds.

---

## Design decisions

- **Presentational/wired split.** The overlaid cards become a presentational component fed by a stub-friendly contract, matching the `Outline` vs `NavigationPanel` separation. This is what makes both Storybook iteration and the theme swap tractable, and keeps `StreamView` focused on data + panel-stack state.
- **Themes are swappable renderers over one contract.** The collapsed breadcrumb is a second renderer over the same panel/ancestry data, not a fork. This mirrors the outline face theme model ([Design-Faces.md](Design-Faces.md)).
- **Exploration may diverge from the token system.** 7b prioritizes a compelling visual direction in Storybook; aligning it with the canonical design tokens/theming is deferred to 7c.

## Dependency notes

- Stage 2 builds on stage 1 (it extends the tab layer and the tab-click navigation). Stage 3 (slim navigation panel header) is independent and can land anytime. Stages 1-2 should land before stage 5 (the collapsed breadcrumb reuses tab/segment navigation). Stage 4 (presentational extraction) should precede stage 5 (the theme prop lives on the extracted component) and must carry stage 2's universal tabs + collapse chevron into the extracted `OverlaidCards`. Visual iteration in stage 4 informs, but does not block, the 7c design pass.
