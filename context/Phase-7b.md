# Phase 7b -- Overlaid cards follow-ups

Follow-up work on the overlaid-cards stream view delivered in [Phase 7](Phase-7.md) (stage 10). This phase polishes the interaction model, trims redundant chrome, and stands up a Storybook surface for design iteration -- including a second, more space-saving rendering of the same concept.

This is incremental, mostly-presentational work. No schema or core changes. After this phase:

- Ancestor tabs are interactive navigation affordances, not just labels.
- The navigation panel header carries only what is still needed.
- The overlaid cards have a presentational component decoupled from SQLite data, exercised in Storybook with stub data.
- A swappable "collapsed breadcrumb" theme exists as a Storybook concept alongside the current "expanded staircase" theme.

Relevant existing code: [src/workspace/StreamView.tsx](../src/workspace/StreamView.tsx), [src/workspace/NavigationPanel.tsx](../src/workspace/NavigationPanel.tsx), [src/workspace/FocusPanel.tsx](../src/workspace/FocusPanel.tsx), [src/global.css](../src/global.css). Reference pattern for the presentational/Storybook split: [src/design/outline/Outline.stories.tsx](../src/design/outline/Outline.stories.tsx) and the `theme`-prop renderer in [src/design/outline/types.ts](../src/design/outline/types.ts).

---

## 1. Clickable ancestor tabs

Make the ancestor tabs (`data-testid="card-tab"`) navigate focus, mirroring the right-arrow focus button in navigation rows.

- [ ] **Decide the navigation semantics** (settle in-session). A tab represents an ancestor row at a known depth in the visible ancestry chain. Clicking it should bring that row into focus while preserving the single-line ancestry constraint (see [Phase 7 - Ancestry constraint](Phase-7.md)). Recommended: truncate the panel stack to the point at/above that ancestor and open a focus panel for the ancestor row (analogous to `handleReplaceAt` / `handleAppendAfter` in `StreamView.tsx`), so the clicked ancestor becomes the rightmost focused card. The workspace-title tab navigates to the root navigation panel.
- [ ] **Thread row identity through the layout.** The tab layout entries currently carry only a label; carry the ancestor's `row_id` (already available from the ancestry query) so a click handler can act on it.
- [ ] **Wire the click handler** in `StreamView.tsx`. Reuse the existing focus-open path so behavior matches the right-arrow button (same panel-stack mutation, same `MAX_COLUMNS` enforcement).
- [ ] **Affordance + a11y.** Tabs should read as buttons (cursor, hover state already exists), be keyboard-activatable, and have an accessible label. Keep the existing `card-tab` test id.
- [ ] Tests (Playwright): clicking an ancestor tab focuses that ancestor row (a focus panel for it appears; deeper panels are replaced). Clicking the workspace-title tab returns to the root navigation panel.
- [ ] Run `npm run format && npm run lint && npm run typecheck && npm run test:run`, then `pnpm test:e2e`.

## 2. Slim navigation panel header

The breadcrumb bar is now redundant with the ancestor tab bar, and the focus panel above a navigation panel already shows the same title. Remove the duplicated chrome.

- [ ] **Remove the breadcrumb bar** from `NavigationPanel.tsx` (the `breadcrumb-bar` block and associated `breadcrumbs()` rendering). Evaluate whether the breadcrumb query is still needed for `onZoomOut`; keep only what the zoom logic requires.
- [ ] **Remove the redundant focus title.** The `outline-focus-title` heading duplicates the focus panel header; remove it where a focus panel already shows the title. Keep the root workspace-title editor (it has no card above it).
- [ ] **Remove the "Children" label header** in the focus panel's children section (`FocusPanel.tsx`, `focus-panel-children`), keeping the embedded navigation panel itself.
- [ ] **Reconcile remaining empty-state and spacing.** Ensure the slimmed header still handles the empty state ("Press Enter to create your first row.") and that vertical spacing reads cleanly without the removed elements.
- [ ] **Update affected tests.** Remove/adjust assertions tied to the deleted elements (e.g. breadcrumb tests in `e2e/navigation-panel.spec.ts`), preserving coverage for the behaviors that remain.
- [ ] Run static checks and tests as above.

## 3. Storybook story + visual iteration

Stand up the overlaid cards in Storybook with stubbed data so the design can be iterated independently of the live app and the worker/SQLite stack.

- [ ] **Extract a presentational component.** Factor the card-stack rendering out of `StreamView.tsx` into a pure component (e.g. `OverlaidCards`) that takes a stub-friendly data contract -- an ordered set of panels (focused content columns) and the ancestor chains/gaps between them -- and emits the cards + tab layer. `StreamView` composes it with live data; Storybook renders it with static fixtures. Mirror the split between `Outline` (presentational) and `NavigationPanel` (wired).
- [ ] **Define the stub data contract.** Panels carry placeholder title/content; ancestors carry label + depth/color index. Include fixtures covering: root-level ancestors only, inter-panel gaps, deep multi-gap chains, and the `MAX_COLUMNS` case.
- [ ] **Write `OverlaidCards.stories.tsx`** under the `Design/` title prefix, following [Outline.stories.tsx](../src/design/outline/Outline.stories.tsx): per-scenario stories plus an "all scenarios" overview.
- [ ] **Iterate the visual design** toward more pleasing, minimal, bold, and futuristic. Tune surfaces, borders, fades, tab shape, and depth cues. Note the tension with the established design language ([Design.md](Design.md): sharp geometry, monochrome + violet accent) -- exploration may diverge here; reconciliation into the token system is [Phase 7c](Phase-7c.md) scope. Capture chosen parameters as named tokens/props rather than scattered literals.
- [ ] **Port the refined parameters back to the live app** once settled, keeping the live behavior unchanged.
- [ ] Run static checks and tests; verify Storybook builds (`pnpm storybook`).

## 4. Collapsed breadcrumb theme (Storybook concept)

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

- Stage 2 is independent and can land first. Stage 1 should land before stage 4 (the collapsed breadcrumb reuses tab/segment navigation). Stage 3 (presentational extraction) should precede stage 4 (the theme prop lives on the extracted component). Visual iteration in stage 3 informs, but does not block, the 7c design pass.
