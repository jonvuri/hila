# Phase 10 · Session 4n — Rebuild sticky navigation as an integrated widget

This session replaces the current full-panel sticky-preview layer in the forward Storybook
workspace. The new treatment follows the proven structure and update strategy of VS Code tree
sticky scroll. It uses separate rendered sticky rows, but integrates their widget with the tree
scroll viewport and virtualized hierarchy.

Use [NOW.md](NOW.md) to confirm that Session 4m is closed. Execute this session before the live
workspace migration. Do not change the live app or production virtualizer in this session.

## Outcome

One bounded sticky widget renders only the active ancestor chain. It derives state from tree and
virtual-list data, rebuilds its DOM only when the chain changes, and changes only the final row
position during normal push-off. It does not cover the scrollbar. The navigation view disables
scroll-boundary rubber-band behavior on macOS if the scoped browser treatment proves reliable.

The result is a visual and interaction proof in Storybook. It takes the structure and mechanisms
from VS Code in spirit. It does not copy VS Code source or CSS.

If the Storybook treatment succeeds, finish the session with a production-ready implementation
plan. Put that work at the correct point in the Phase 10 roadmap before live migration starts. The
expected position is immediately before the live workspace cutover, but the visual proof and
virtualizer findings must determine the exact boundary.

## Reference architecture

VS Code tree sticky scroll is public and closely matches this problem. Its implementation uses a
controller and a dedicated widget inside the tree scrollable element. The widget renders separate
sticky rows through the normal tree renderer. It does not move the original row elements.

Transfer these mechanisms:

- Derive the active ancestor chain and subtree boundaries from the virtual tree model.
- Keep the widget inside the tree scroll component and align it to the content viewport.
- Render only the active chain. Bound its count and total viewport share.
- Use the normal row renderer and interaction data for consistent geometry and behavior.
- Compare complete sticky state before a DOM update.
- Rebuild sticky rows only when their identity or rendered content changes.
- During normal boundary push-off, change only the final sticky row position.
- Recalculate on scroll, viewport height, model, collapse, and relevant row-content changes.

Do not copy these assumptions without proof:

- VS Code uses Monaco list virtualization and custom scrollbars. Hila currently uses a different
  virtualizer and native browser scrolling.
- VS Code renderer, focus, and accessibility contracts do not define Hila's duplicate-row
  semantics.
- Widget placement inside a scrollable element does not by itself prove correct native scrollbar
  stacking or macOS boundary behavior.

Primary references:

- [VS Code tree sticky-scroll controller and widget](https://github.com/microsoft/vscode/blob/main/src/vs/base/browser/ui/tree/abstractTree.ts)
- [VS Code tree sticky-scroll CSS](https://github.com/microsoft/vscode/blob/main/src/vs/base/browser/ui/tree/media/tree.css)
- [VS Code 1.85 tree sticky-scroll release](https://code.visualstudio.com/updates/v1_85#_sticky-scroll-in-trees)

## Current evidence

`StickyNavigation` renders every row in `.ws-navigation-scroll`. It also renders a
`StickyPreview` for each expanded parent in the sibling `.ws-sticky-layer`. The absolute layer
covers the complete panel and stays outside the scroll container's boundary motion. This topology
causes two visible defects:

- Sticky previews can paint above the native scrollbar.
- macOS rubber-band scrolling moves the flow content while the sibling sticky layer stays fixed.
  This can expose the source row below its preview.

The current implementation mounts more preview rows than the visible sticky chain and writes
reactive state on each animation frame while scrolling. Session 4l's pure layout model solved
transition continuity, but it was designed around the present preview topology. Session 4n can
replace or reduce that model if the new controller has a clearer state contract.

The live `ScrollVirtualizer` later adds a separate constraint. It renders visible windows as
absolute, transformed blocks. The production widget must derive sticky ancestry even when source
rows are outside the rendered window. Session 4n must inspect and document this constraint during
production planning, but must not change production code.

## Fixed decisions

- Use a dedicated sticky widget with separately rendered rows. Do not promote original row DOM
  elements into sticky positions.
- Integrate the widget with the navigation scroll component. Do not use a full-panel sibling layer.
- Derive sticky identity, ancestry, boundaries, and positions from tree and virtual-list state.
  Do not read row layout in the scroll handler.
- Preserve one 32-pixel row geometry, current guide alignment, depth indentation, and
  canvas-colored occlusion treatment.
- Preserve disclosure, click-to-scroll, drill, selection, disabled, editing, keyboard, and focus
  behavior. Define deliberate accessibility semantics for sticky copies. Do not expose duplicate
  tree items.
- Keep leaf bullets optional and off by default. Visible and hidden bullets use identical gutter
  geometry.
- Bound the active widget. Start with VS Code's limits of seven rows and 40% of viewport height as
  reference values, then use the fixture evidence to select Hila's values.
- Use scroll position for sticky motion. Do not add time-based animation.
- Test `overscroll-behavior: none` on the navigation scroll container as the primary way to disable
  rubber-band and scroll chaining. Keep the rule scoped to this view. Do not change page-wide
  scrolling without separate evidence.
- Preserve Ghost, Null, and Wipeout structure. Keep visual theme and polarity independent.

## Out of scope

- Production `NavigationPanel`, `StreamView`, page loading, or database changes.
- Changes to `ScrollVirtualizer` or its window-retention policy.
- Live workspace cutover or executable overlaid-card removal.
- Launcher, tab, face, browser, fidelity, or x-ray migration.
- Literal translation of VS Code source, styles, settings, or custom scrollbar infrastructure.

## Stage 1 — Lock the widget and scroll contracts

- [ ] Read the current VS Code controller, widget, and CSS source. Record the mechanisms that map
      to Hila and the assumptions that depend on Monaco infrastructure.
- [ ] Capture the current scrollbar overlap, macOS rubber-band reveal, sticky thresholds, mounted
      preview count, and scroll performance trace as the comparison baseline.
- [ ] Add focused tests for a typed sticky-widget state: active node identities, source ranges,
      stack positions, final-row push-off, widget height, and source-row visibility.
- [ ] Cover title-only, one-level, multi-level, same-threshold, reverse-scroll, collapse, drill, and
      virtual-window-boundary cases.
- [ ] Define equality rules that distinguish no change, final-position-only change, content change,
      and structural chain change.
- [ ] Define sticky-copy accessibility and interaction rules. Keep the source tree as the only tree
      structure while preserving required sticky actions and focus behavior.
- [ ] Prove that leaf bullets default off and that toggling them does not change row indentation.

## Stage 2 — Build the integrated sticky widget

- [ ] Add a controller that observes scroll, viewport, tree-model, collapse, and relevant content
      changes. Coalesce updates and do not read row layout in the scroll handler.
- [ ] Derive the first visible tree node, its active ancestor chain, subtree boundaries, and
      push-off position from stable tree and virtual-list data.
- [ ] Put one sticky-widget root inside the navigation scroll component. Size it to the content
      viewport so it does not cover or intercept the native scrollbar.
- [ ] Render only the bounded active chain through the shared navigation-row content and decoration
      paths. Do not render the current preview for every expanded parent.
- [ ] Reuse sticky DOM when state is equal. For final-row push-off, update only that row's position.
      Rebuild rows only for structural or relevant content changes.
- [ ] Preserve guide continuity, terminal endpoints, control gutters, text axes, selection, hover,
      focus, long-label truncation, and all sticky interactions.
- [ ] Remove the full-panel sibling sticky layer and obsolete preview state after the new widget
      passes focused tests. Remove superseded layout logic if it has no remaining consumer.

## Stage 3 — Disable boundary rubber-band in this view

- [ ] Apply `overscroll-behavior: none` to the actual navigation scrolling element in the focused
      Storybook treatment.
- [ ] Verify top and bottom trackpad gestures on macOS. Confirm that the view has no rubber-band,
      scroll chaining, source-row reveal, or stuck wheel input.
- [ ] Compare `none` with `contain` only if browser behavior requires it. Prefer `none` because the
      goal includes removal of the boundary affordance, not only scroll chaining.
- [ ] Verify the target Chromium environment and Safari if it is part of the supported browser
      boundary. Record any browser limitation instead of adding script-based scroll suppression.
- [ ] Confirm that keyboard scrolling, wheel scrolling, touchpad momentum, nested controls, and
      outer workspace scrolling still behave as intended.

## Stage 4 — Verify the Storybook proof

- [ ] Run focused sticky-state, navigation, outline, interaction, and accessibility tests.
- [ ] Run `npm run format`, `npm run lint`, `npm run typecheck`, and `npm run test:run`.
- [ ] Run `pnpm build-storybook`.
- [ ] Use Chrome DevTools to inspect every sticky threshold in both scroll directions. Confirm that
      chain changes are stable and no stale or duplicate row flashes.
- [ ] Check overlay and classic native scrollbar configurations where available. Confirm that the
      widget stops at the content viewport and does not intercept the scrollbar.
- [ ] Check narrow width, long labels, keyboard focus, editing, disclosure, drill docking, reduced
      motion, all three visual themes, and both polarities.
- [ ] Record a performance trace. Confirm that normal scroll frames avoid forced layout, long
      tasks, full widget rebuilds, and unnecessary reactive component updates.
- [ ] Compare the trace, mounted row count, and threshold behavior with the Stage 1 baseline.
- [ ] Get user approval of the integrated-widget treatment.

## Stage 5 — Plan production adoption

Complete this stage if the Storybook treatment succeeds. Assume success unless review finds a
blocking interaction or browser defect.

- [ ] Inspect `NavigationPanel`, `usePagedWorkspaceData`, `ScrollVirtualizer`, and the scroll-index
      window contract against the approved widget state and controller.
- [ ] Define how the production virtual tree supplies active ancestry, stable global identity,
      subtree boundaries, post-window continuation, and unresolved drill state without expanding
      the normal rendered range.
- [ ] Define the shared production row-rendering seam for source and sticky representations. Keep
      behavior consistent without duplicating tree semantics or editor ownership.
- [ ] Define native scrollbar geometry, widget stacking, source-row masking, and scoped
      `overscroll-behavior` ownership for the live navigation view.
- [ ] Add performance limits for sticky row count, state writes, DOM rebuilds, layout reads, and
      retained model data.
- [ ] Write a new production implementation plan with ordered tests, implementation stages, E2E
      coverage, browser checks, and a closeout gate.
- [ ] Place that plan in the Phase 10 roadmap before the live workspace cutover if it is a
      prerequisite. Renumber later sessions and repair all routing links if needed.
- [ ] Update `Design.md`, `Design-Faces.md`, the Phase 10 roadmap, and `NOW.md` with the approved
      topology and the next session.

## Closeout gate

- [ ] The focused workspace uses one bounded sticky widget inside its navigation scroll component.
- [ ] Normal scroll frames do not rebuild unchanged sticky rows. Final-row push-off changes only
      that row's position.
- [ ] Sticky copies use deliberate interaction and accessibility semantics. They do not create a
      second tree structure.
- [ ] Sticky content does not paint above or intercept the native scrollbar.
- [ ] The scoped treatment disables macOS rubber-band behavior without breaking expected scrolling.
- [ ] The visual treatment has user approval.
- [ ] A production-ready follow-on plan exists and has an explicit roadmap position.
- [ ] The live app and production virtualizer remain unchanged.
- [ ] `NOW.md` records verification, the approved result, and the exact next plan.

## Read for Session 4n

1. [NOW.md](NOW.md).
2. This plan's [reference architecture](#reference-architecture) and the linked VS Code sources.
3. The Session 4l and 4m outcomes in
   [Sessions 4j–4m](Phase-10-Sessions-4j-4m-plan.md#session-4l--make-sticky-transitions-seamless).
4. The [approved navigation outline](Design-Faces.md#navigation-outline).
5. [Testing.md](Testing.md) before browser work.
6. `src/design/workspace/StickyNavigation.tsx`, `sticky-layout.ts`, their focused tests, and
   `workspace.css`.
7. During Stage 5 only, the production navigation, paged-data, and virtualizer modules named in the
   checklist.

## Starter prompt

> Read `context/NOW.md` and `context/Phase-10-Session-4n-plan.md`. Execute Session 4n only. Rebuild
> the forward Storybook sticky navigation as a bounded widget integrated with its scroll component.
> Use the public VS Code tree sticky-scroll structure and update strategy as the primary reference,
> but implement Hila's own state, renderer, accessibility, and native-scrollbar contracts. Disable
> macOS boundary rubber-band for this view if the scoped CSS treatment passes browser verification.
> Do not change production navigation or virtualization. If the visual treatment succeeds, finish
> by writing and routing a production-ready implementation plan before live migration. Run the
> required verification, stage changes for review, and do not commit.
