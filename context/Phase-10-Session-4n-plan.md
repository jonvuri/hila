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

- [x] Read the current VS Code controller, widget, and CSS source. Record the mechanisms that map
      to Hila and the assumptions that depend on Monaco infrastructure.
- [x] Capture the current scrollbar overlap, macOS rubber-band reveal, sticky thresholds, mounted
      preview count, and scroll performance trace as the comparison baseline.
- [x] Add focused tests for a typed sticky-widget state: active node identities, source ranges,
      stack positions, final-row push-off, widget height, and source-row visibility.
- [x] Cover title-only, one-level, multi-level, same-threshold, reverse-scroll, collapse, drill, and
      virtual-window-boundary cases.
- [x] Define equality rules that distinguish no change, final-position-only change, content change,
      and structural chain change.
- [x] Define sticky-copy accessibility and interaction rules. Keep the source tree as the only tree
      structure while preserving required sticky actions and focus behavior.
- [x] Prove that leaf bullets default off and that toggling them does not change row indentation.

## Stage 2 — Build the integrated sticky widget

- [x] Add a controller that observes scroll, viewport, tree-model, collapse, and relevant content
      changes. Coalesce updates and do not read row layout in the scroll handler.
- [x] Derive the first visible tree node, its active ancestor chain, subtree boundaries, and
      push-off position from stable tree and virtual-list data.
- [x] Put one sticky-widget root inside the navigation scroll component. Size it to the content
      viewport so it does not cover or intercept the native scrollbar.
- [x] Render only the bounded active chain through the shared navigation-row content and decoration
      paths. Do not render the current preview for every expanded parent.
- [x] Reuse sticky DOM when state is equal. For final-row push-off, update only that row's position.
      Rebuild rows only for structural or relevant content changes.
- [x] Preserve guide continuity, terminal endpoints, control gutters, text axes, selection, hover,
      focus, long-label truncation, and all sticky interactions.
- [x] Remove the full-panel sibling sticky layer and obsolete preview state after the new widget
      passes focused tests. Remove superseded layout logic if it has no remaining consumer.

## Stage 3 — Disable boundary rubber-band in this view

- [x] Apply `overscroll-behavior: none` to the actual navigation scrolling element in the focused
      Storybook treatment.
- [x] Verify top and bottom trackpad gestures on macOS. Confirm that the view has no rubber-band,
      scroll chaining, source-row reveal, or stuck wheel input.
- [x] Compare `none` with `contain` only if browser behavior requires it. Prefer `none` because the
      goal includes removal of the boundary affordance, not only scroll chaining.
- [x] Verify the target Chromium environment and Safari if it is part of the supported browser
      boundary. Record any browser limitation instead of adding script-based scroll suppression.
- [x] Confirm that keyboard scrolling, wheel scrolling, touchpad momentum, nested controls, and
      outer workspace scrolling still behave as intended.

## Stage 4 — Verify the Storybook proof

- [x] Run focused sticky-state, navigation, outline, interaction, and accessibility tests.
- [x] Run `npm run format`, `npm run lint`, `npm run typecheck`, and `npm run test:run`.
- [x] Run `pnpm build-storybook`.
- [x] Use Chrome DevTools to inspect every sticky threshold in both scroll directions. Confirm that
      chain changes are stable and no stale or duplicate row flashes.
- [x] Check overlay and classic native scrollbar configurations where available. Confirm that the
      widget stops at the content viewport and does not intercept the scrollbar.
- [x] Check narrow width, long labels, keyboard focus, editing, disclosure, drill docking, reduced
      motion, all three visual themes, and both polarities.
- [x] Record a performance trace. Confirm that normal scroll frames avoid forced layout, long
      tasks, full widget rebuilds, and unnecessary reactive component updates.
- [x] Compare the trace, mounted row count, and threshold behavior with the Stage 1 baseline.
- [x] Get user approval of the integrated-widget treatment.

### Review evidence

The VS Code reference maps to Hila in these ways:

- A model controller supplies active ancestry and subtree limits.
- One widget is inside the native scroll viewport.
- Sticky copies use the normal row geometry and decoration paths.
- Full state comparison separates structural rebuilds from final-row position writes.

Monaco-specific list APIs, renderer life cycles, dynamic height measurement, custom scrollbars,
and its separate focus model do not map to this Storybook proof. Hila uses its flat tree model,
fixed 32-pixel rows, native scrolling, Solid rendering, and one source tree. The widget limit is
seven rows and 40% of the viewport. The fixture limits a 240-pixel viewport to three rows.

The stack model has two parts:

1. The primary stack starts with the last expanded heading that has reached its depth slot. It then
   follows parent indices to form that heading's expanded ancestor chain.
2. Each primary row has a canonical 32-pixel stack slot and a subtree end. The subtree end pushes
   the row towards the title. A fully masked row leaves the widget.
3. One drill dock is a secondary pinned item. It is not a second ancestry stack. It stays in normal
   flow while its source is visible and clamps to the viewport bottom or top when the source is
   below or above the view.
4. If the drill target is also in the primary stack, the dock stays mounted but hidden because the
   primary row represents the same item. On the first push pixel, the dock takes that row's
   canonical slot and paints above the outgoing primary copy. If the drill target is separate, its
   top slot follows the height of the primary stack.

The old dense fixture mounted 22 parent previews and two drill previews. Its sibling layer covered
an 11-pixel classic scrollbar gutter. It also stayed fixed while macOS moved the scroll content at
a boundary. The baseline trace had zero layout shift and no reported long-task insight, but it
updated the full preview layer during scroll.

The new dense fixture mounts only the active chain. The multi-level fixture mounts two rows. Its
nested row pushes from 132 to 196 pixels and then leaves the active chain. The top-level row pushes
from 196 to 228 pixels. The next top-level row then takes the same slot without a jump. Normal
push frames keep the same DOM and update only the final row position. Reverse scrolling gives the
same states. The widget width is 268 pixels in a 279-pixel classic-scrollbar box. With the
scrollbar hidden, both the widget and content viewport are 279 pixels wide.

The expanded navigation-outline fixture is a regression case for the review finding. `Selected
branch` moves from 32 pixels to 1 pixel over scroll positions 196 through 227. `Collapsed branch`
takes the 32-pixel slot at position 228. The workspace title paints above all outgoing sticky
rows. Fully masked nested rows leave the widget, so no sticky or source text paints above the
title.

The drill regression fixture hands the row from `chain` to `top` at the first push pixel. The dock
stays at 32 pixels while the primary copy moves from 31 pixels until it leaves the widget. The same
dock DOM persists in both scroll directions.

The 180-frame trace has zero layout shift and no reported long-task insight. The one-level and
multi-level panels rebuild only at chain boundaries. They use direct final-row position writes
between those boundaries. Lighthouse scores accessibility, best practices, and agentic browsing
at 100. The full suite has 877 passing tests. Lint has the existing 14 warnings and no errors.

Chrome 151 on macOS reports `overscroll-behavior-y: none` on the navigation scroller. Keyboard
scrolling, editing, disclosure, click-to-scroll, drill docking, narrow labels, classic and overlay
scrollbar geometry, all themes, and both polarities pass. Chrome DevTools cannot generate a real
trackpad boundary gesture. Safari is not in the current supported browser boundary. The user
verified macOS trackpad boundary behavior and confirmed that the view does not rubber-band. The
existing browser checks cover expected keyboard, wheel, nested-control, and outer-workspace
scrolling. The user approved the push-off, alignment, and visual treatment.

### Production adoption findings

Production uses a bounded, contiguous range of 100-row windows. `usePagedWorkspaceData` supplies
loaded `WorkspaceRowData`, depth, and three separate identities: `pk` for one ordered appearance,
`ck` for logical row data, and `rk` for source-renderer reconciliation. It does not supply ancestry
or visible-subtree boundaries when those positions are outside the loaded range.

`ScrollVirtualizer` keeps window positions, measured heights, scroll-root discovery, and the
visible range inside the component. Its windows are absolute translated blocks. The current
navigation consumer therefore cannot calculate sticky source coordinates from the public
virtualizer contract. Reading mounted row layout during scroll would fail when ancestors unmount
and would violate the approved controller model.

The production row also combines its header, ProseMirror editor, property previews, coalesced
headers, drag controls, menus, and focus registration. A sticky copy cannot reuse this component
without creating duplicate editors and tree behavior. Production adoption must first extract one
fixed 32-pixel header renderer. Source rows keep all editor and tree ownership.

Session 4o will add a bounded sticky metadata plane and an explicit virtual scroll and geometry
contract. Metadata stays proportional to the loaded range plus seven ancestors, one post-window
row, and one drill target. It does not widen the rendered range. The primary ancestry stack and
secondary drill dock keep the approved Session 4n interaction and stacking rules.

## Stage 5 — Plan production adoption

Complete this stage if the Storybook treatment succeeds. Assume success unless review finds a
blocking interaction or browser defect.

- [x] Inspect `NavigationPanel`, `usePagedWorkspaceData`, `ScrollVirtualizer`, and the scroll-index
      window contract against the approved widget state and controller.
- [x] Define how the production virtual tree supplies active ancestry, stable global identity,
      subtree boundaries, post-window continuation, and unresolved drill state without expanding
      the normal rendered range.
- [x] Define the shared production row-rendering seam for source and sticky representations. Keep
      behavior consistent without duplicating tree semantics or editor ownership.
- [x] Define native scrollbar geometry, widget stacking, source-row masking, and scoped
      `overscroll-behavior` ownership for the live navigation view.
- [x] Add performance limits for sticky row count, state writes, DOM rebuilds, layout reads, and
      retained model data.
- [x] Write a new production implementation plan with ordered tests, implementation stages, E2E
      coverage, browser checks, and a closeout gate.
- [x] Place that plan in the Phase 10 roadmap before the live workspace cutover if it is a
      prerequisite. Renumber later sessions and repair all routing links if needed.
- [x] Update `Design.md`, `Design-Faces.md`, the Phase 10 roadmap, and `NOW.md` with the approved
      topology and the next session.

## Closeout gate

- [x] The focused workspace uses one bounded sticky widget inside its navigation scroll component.
- [x] Normal scroll frames do not rebuild unchanged sticky rows. Final-row push-off changes only
      that row's position.
- [x] Sticky copies use deliberate interaction and accessibility semantics. They do not create a
      second tree structure.
- [x] Sticky content does not paint above or intercept the native scrollbar.
- [x] The scoped treatment disables macOS rubber-band behavior without breaking expected scrolling.
- [x] The visual treatment has user approval.
- [x] A production-ready follow-on plan exists and has an explicit roadmap position.
- [x] The live app and production virtualizer remain unchanged.
- [x] `NOW.md` records verification, the approved result, and the exact next plan.

## Read for Session 4n

1. [NOW.md](NOW.md).
2. This plan's [reference architecture](#reference-architecture) and the linked VS Code sources.
3. The Session 4l and 4m outcomes in
   [Sessions 4j–4m](Phase-10-Sessions-4j-4m-plan.md#session-4l--make-sticky-transitions-seamless).
4. The [approved navigation outline](Design-Faces.md#navigation-outline).
5. [Testing.md](Testing.md) before browser work.
6. `src/design/workspace/StickyNavigation.tsx`, `sticky-widget.ts`, their focused tests, and
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
