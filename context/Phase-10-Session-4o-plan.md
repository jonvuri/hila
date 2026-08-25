# Phase 10 · Session 4o — Adopt integrated sticky navigation in production

This session moves the approved Session 4n sticky widget into the production navigation panel.
It adapts the widget to paged tree data and the production virtualizer before the live workspace
shell changes. It does not widen the normal rendered range or start the live shell cutover.

Use [NOW.md](NOW.md) to confirm that Session 4n is closed. Execute this session before the
[Sessions 4p–4q live migration and removal sequence](Phase-10-Sessions-4p-4q-plan.md).

## Outcome

`NavigationPanel` uses one bounded sticky widget inside its actual navigation scrollport. The
widget derives active ancestry, subtree boundaries, positions, and drill state from a bounded
metadata plane. It remains correct when source rows or ancestors are outside the rendered window.
Source and sticky rows share one production header renderer, but the source row remains the only
tree item and editor owner.

The production virtualizer exposes an explicit scroll and geometry contract. Normal scroll frames
do not read row layout, expand the rendered range, or rebuild an unchanged sticky chain.

## Production model

The production tree has three related identities:

- `pk` is the hex `global_lexkey`. It identifies one ordered appearance. Use it for sticky
  ancestry, subtree boundaries, virtual position, and source-row lookup.
- `ck` is `(matrix_id, row_id)`. It identifies logical row data and actions across matrixes. It is
  not unique when a row has a home and one or more portals.
- `rk` is the source renderer key. It preserves editor state for one appearance when possible and
  disambiguates duplicate loaded appearances. Do not use it as the tree-position contract.

The sticky model is one primary ancestry stack and one secondary drill dock:

1. The primary stack is the expanded ancestor chain for the first visible tree position. Each row
   has one canonical 32-pixel slot and a visible-subtree end that controls push-off.
2. The drill dock represents the focused target when flow or the primary stack does not represent
   it. It is not a second ancestry stack. It yields to the same `pk` in the primary stack and takes
   that row's canonical slot on the first push pixel.
3. An unresolved drill position keeps its logical `ck` and label, but has no fabricated `pk` or
   source position. It can identify the target without claiming a false scroll destination.

## Fixed decisions

- Keep `ROWS_PER_WINDOW = 100` and the current virtualizer buffer policy. Sticky metadata must not
  increase `neededWindows`, hydrate editors, or retain complete tree data.
- Add a bounded sticky-context query or gather result. It supplies the first visible position's
  expanded ancestors, each ancestor's next visible subtree boundary, one post-window row, and the
  drill target's resolved position and label when available.
- Keep metadata proportional to the loaded range plus at most seven active ancestors, one
  post-window row, and one drill target. Do not cache ancestry for the full tree.
- Make scroll ownership explicit. `NavigationPanel` and `ScrollVirtualizer` must share the same
  scrollport reference and content-coordinate model. Remove sticky dependence on
  `findScrollRoot` discovery.
- Keep scroll-time inputs numeric: scroll top, viewport height, retained row starts and heights,
  window positions, and sticky metadata. Populate geometry through virtualizer state and resize
  observation outside the scroll handler. Do not call row layout APIs during scroll.
- Extract one fixed-height navigation header seam from the production row. Source rows can still
  own editors, previews, coalesced headers, drag handles, and menus below or beside that seam.
- Render sticky copies as a presentation group with named buttons. Do not give them `treeitem`,
  editor, drag, menu, or selection ownership. Route actions through `pk` and `ck` to the source
  controller.
- Use the approved Guides adapter for source and sticky decorations. Supply pre-window ancestry,
  post-window continuation, and one-row look-ahead without treating a page edge as a tree edge.
- Mount the widget inside the native navigation scrollport. Size it to the content viewport. The
  title masks outgoing rows above it. The scrollbar paints and receives input above the widget.
- Apply `overscroll-behavior: none` only to the production navigation scrollport.
- Keep the limits approved in Session 4n: seven sticky rows and 40% of the viewport. The smaller
  limit wins.
- Do not change `StreamView`, the workspace shell, overlaid-card ownership, panel-stack behavior,
  or database schema unless a bounded read contract cannot be expressed with the existing index.

## Stage 1 — Lock paged sticky data contracts

- [ ] Add tests for appearance identity across home rows, portals, moves, collapse, and focus
      roots. Prove that `pk`, `ck`, and `rk` keep their separate roles.
- [ ] Add query or gather tests for the expanded ancestry of a position and the next visible row
      after each ancestor subtree. Cover root, nested, collapsed, focus-scoped, and final-subtree
      cases.
- [ ] Cover a first visible row at the first and last row of a page. Include one post-window row
      and prove that page boundaries do not create false guide or subtree endings.
- [ ] Cover folded block rows. Keep synthetic block positions out of normal tree ancestry and
      resolve a drill target through the existing folded-position path.
- [ ] Define a typed `ProductionStickyContext` or equivalent value. Include appearance identity,
      logical identity, depth, content key, expansion, ancestry, subtree end, continuation, and
      resolved or unresolved drill state.
- [ ] Port the Session 4n sticky-state tests to this contract. Cover same-threshold replacement,
      reverse scroll, collapse, mutation, virtual-window boundaries, and drill handoff.

## Stage 2 — Expose virtual scroll and geometry state

- [ ] Give `ScrollVirtualizer` an explicit scrollport contract. Expose or accept the scroll element,
      viewport size, scroll top, virtual window starts, measured window heights, and visible range.
- [ ] Remove implicit scroll-root discovery for the production navigation path. Preserve
      standalone virtualizer behavior through an explicit default.
- [ ] Add a retained row-geometry index for loaded windows. Update it from model values and resize
      observation outside scroll events. Clear entries when their window leaves the retained
      range.
- [ ] Resolve the first visible position and source coordinates from the geometry index. Use
      virtual window estimates only until measured data is available, then preserve scroll
      compensation when measurements change.
- [ ] Prove with tests that variable source content, window repositioning, resize, and count
      changes do not move the sticky threshold discontinuously.
- [ ] Keep the existing rendered-window range and hydration queries unchanged in size.

## Stage 3 — Extract the production row seam

- [ ] Define a production navigation-header view model from `WorkspaceRowData`, outline
      decoration, selection, disabled state, and drill state.
- [ ] Extract the shared 32-pixel header content and Guides decoration path from the current
      `NavigationPanel` row. Use it for source and sticky representations.
- [ ] Keep ProseMirror, expanded content, property previews, coalesced field headers, row gestures,
      drag state, and editor focus registration on source rows only.
- [ ] Route sticky disclosure, scroll-to-source, drill, selection, and focus handoff through the
      production controller. Restore focus to the source control when it is mounted.
- [ ] Add accessibility tests. Confirm one tree, no duplicate tree items, clear sticky button
      names, correct disabled state, and stable keyboard focus.

## Stage 4 — Integrate the widget

- [ ] Add the bounded metadata plane to `usePagedWorkspaceData`. Reconcile it separately from row
      hydration and expose one complete sticky input to `NavigationPanel`.
- [ ] Put the widget inside the production navigation scrollport. Include the root title offset,
      content-viewport width, source masking, and native scrollbar stacking.
- [ ] Reuse sticky DOM when complete state is equal. During normal push-off, write only the final
      row transform. Rebuild only for structure or relevant content changes.
- [ ] Add the secondary drill dock. Cover a target in flow, above the view, below the view, in the
      primary stack, pushed from the primary stack, and unresolved.
- [ ] Apply scoped `overscroll-behavior: none`. Confirm that the outer workspace keeps its intended
      horizontal and non-navigation scrolling.
- [ ] Remove production-only legacy sticky or outline paths that the integrated widget supersedes.
      Do not remove the overlaid-card renderer in this session.

## Stage 5 — Verify production behavior

- [ ] Run focused query, paging, virtualizer, sticky-state, navigation, interaction, and
      accessibility tests.
- [ ] Run `npm run format`, `npm run lint`, `npm run typecheck`, and `npm run test:run`.
- [ ] Run `pnpm build-storybook`.
- [ ] Run focused E2E tests with the repository-required system browser permissions. Cover root
      and focused navigation, more than 100 rows, page crossings, collapse, drill, editing, drag,
      keyboard navigation, and outer workspace scroll.
- [ ] Use Chrome DevTools to inspect all sticky thresholds in both directions with live paged
      data. Check classic and overlay scrollbars, narrow width, long labels, title masking, and
      variable source content.
- [ ] Test top and bottom trackpad gestures on macOS. Confirm no rubber-band, scroll chaining,
      source-row reveal, or stuck wheel input.
- [ ] Record a scroll trace. Confirm no scroll-time layout reads, forced layout, long tasks,
      unchanged-chain rebuilds, or reactive writes beyond one coalesced state update and the final
      row transform.
- [ ] Record retained metadata and mounted-row counts. Confirm the metadata limit and unchanged
      rendered-window range.
- [ ] Get user approval before Session 4p starts the live workspace cutover.

## Closeout gate

- [ ] Production navigation uses one bounded widget in its explicit scrollport.
- [ ] Paged ancestry and subtree boundaries remain correct when source ancestors are unmounted.
- [ ] The normal rendered range, page size, and editor hydration boundary do not expand.
- [ ] Source and sticky rows share one header renderer without duplicate tree or editor ownership.
- [ ] Normal scroll does not read layout or rebuild an unchanged chain.
- [ ] Scrollbar, title masking, drill handoff, and macOS boundary behavior pass.
- [ ] The production treatment has user approval.
- [ ] `StreamView` and the executable overlaid-card implementation remain unchanged.
- [ ] Phase 10 and `NOW.md` record verification and route the next work to Session 4p.

## Read for Session 4o

1. [NOW.md](NOW.md).
2. The Session 4n [review evidence](Phase-10-Session-4n-plan.md#review-evidence) and
   [production findings](Phase-10-Session-4n-plan.md#production-adoption-findings).
3. [Virtualization.md](Virtualization.md).
4. The [approved navigation outline](Design-Faces.md#navigation-outline).
5. `src/workspace/NavigationPanel.tsx`, `usePagedWorkspaceData.ts`,
   `workspace-plugin.ts`, and `window-flatten.ts`.
6. `src/virtualizer/ScrollVirtualizer.tsx` and `src/core/scroll-index.ts`.
7. `src/design/workspace/StickyNavigation.tsx`, `sticky-widget.ts`,
   `navigation-outline.tsx`, and their focused tests.
8. [Testing.md](Testing.md) before E2E or browser work.

## Starter prompt

> Read `context/NOW.md` and `context/Phase-10-Session-4o-plan.md`. Execute Session 4o only. Adapt
> the approved integrated sticky widget to the production paged navigation and virtualizer. Use a
> bounded metadata plane for ancestry, subtree boundaries, continuation, and drill state. Do not
> widen the rendered window or infer state from mounted row DOM. Extract one shared production row
> header seam, preserve source-only editor and tree ownership, run the required verification, get
> user approval, stage changes for review, and do not commit.
