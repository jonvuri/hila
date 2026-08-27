# Phase 10 · Session 4o — Adopt integrated sticky navigation in production

This session moves the approved Session 4n sticky widget into the production navigation panel.
It adapts the widget to paged tree data and the production virtualizer before the live workspace
shell changes. It does not widen the normal rendered range or start the live shell cutover.

Use [NOW.md](NOW.md) to confirm that Session 4n is closed. Execute this session before the
[Sessions 4p–4q live migration and removal sequence](Phase-10-Sessions-4p-4q-plan.md).

## Execution split

Session 4o is one production milestone, but it is too large for one reliable working session. Use
these gates:

1. **Session 4o-a — foundation contracts.** Execute the contract-level work in Stages 1–3. The
   sticky data, virtualizer, and row-header tracks can proceed in parallel because they own separate
   modules. Leave controller-dependent checklist items open for Session 4o-b. Finish with focused
   tests and static types. Do not mount the production widget yet.
2. **Session 4o-b — production integration.** Execute Stage 4 after all three foundation contracts
   are stable. Reconcile their APIs in `usePagedWorkspaceData` and `NavigationPanel`. Keep
   `StreamView` unchanged.
3. **Session 4o-c — verification and approval.** Execute Stage 5 and the closeout gate after the
   integrated behavior passes focused tests. Browser profiling, macOS trackpad review, and user
   approval are serial gates and must not be reported from implementation evidence alone.

Keep this file as the detailed progress record for all three working sessions. `NOW.md` identifies
the active gate. Do not create duplicate stage checklists.

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

- [x] Add tests for appearance identity across home rows, portals, moves, collapse, and focus
      roots. Prove that `pk`, `ck`, and `rk` keep their separate roles.
- [x] Add query or gather tests for the expanded ancestry of a position and the next visible row
      after each ancestor subtree. Cover root, nested, collapsed, focus-scoped, and final-subtree
      cases.
- [x] Cover a first visible row at the first and last row of a page. Include one post-window row
      and prove that page boundaries do not create false guide or subtree endings.
- [x] Cover folded block rows. Keep synthetic block positions out of normal tree ancestry and
      resolve a drill target through the existing folded-position path.
- [x] Define a typed `ProductionStickyContext` or equivalent value. Include appearance identity,
      logical identity, depth, content key, expansion, ancestry, subtree end, continuation, and
      resolved or unresolved drill state.
- [x] Port the Session 4n sticky-state tests to this contract. Cover same-threshold replacement,
      reverse scroll, collapse, mutation, virtual-window boundaries, and drill handoff.

## Stage 2 — Expose virtual scroll and geometry state

- [x] Give `ScrollVirtualizer` an explicit scrollport contract. Expose or accept the scroll element,
      viewport size, scroll top, virtual window starts, measured window heights, and visible range.
- [x] Remove implicit scroll-root discovery for the production navigation path. Preserve
      standalone virtualizer behavior through an explicit default.
- [x] Add a retained row-geometry index for loaded windows. Update it from model values and resize
      observation outside scroll events. Clear entries when their window leaves the retained
      range.
- [x] Resolve the first visible position and source coordinates from the geometry index. Use
      virtual window estimates only until measured data is available, then preserve scroll
      compensation when measurements change.
- [x] Prove with tests that variable source content, window repositioning, resize, and count
      changes do not move the sticky threshold discontinuously.
- [x] Keep the existing rendered-window range and hydration queries unchanged in size.

## Stage 3 — Extract the production row seam

- [x] Define a production navigation-header view model from `WorkspaceRowData`, outline
      decoration, selection, disabled state, and drill state.
- [x] Extract the shared 32-pixel header content and Guides decoration path from the current
      `NavigationPanel` row. Use it for source and sticky representations.
- [x] Keep ProseMirror, expanded content, property previews, coalesced field headers, row gestures,
      drag state, and editor focus registration on source rows only.
- [x] Route sticky disclosure, scroll-to-source, drill, selection, and focus handoff through the
      production controller. Restore focus to the source control when it is mounted.
- [x] Add accessibility tests. Confirm one tree, no duplicate tree items, clear sticky button
      names, correct disabled state, and stable keyboard focus.

### Session 4o-a progress

The three foundation tracks are implemented and pass focused tests. Full Stage 1 and Stage 2
closeout still depends on the integrated controller. It must select the active heading from real
row geometry, prove pixel-level threshold continuity, and port the first-push drill handoff. The
metadata plane is not yet subscribed through `usePagedWorkspaceData`. Cross-matrix ancestor labels
still need a bounded hydration gather. The production caller must also publish retained `pk` row
geometry to the virtualizer contract.

The row-header seam is live for production source rows. Sticky actions remain callbacks until the
Session 4o-b controller supplies scroll-to-source and focus handoff.

## Stage 4 — Integrate the widget

- [x] Add the bounded metadata plane to `usePagedWorkspaceData`. Reconcile it separately from row
      hydration and expose one complete sticky input to `NavigationPanel`.
- [x] Put the widget inside the production navigation scrollport. Include the root title offset,
      content-viewport width, source masking, and native scrollbar stacking.
- [x] Reuse sticky DOM when complete state is equal. During normal push-off, write only the final
      row transform. Rebuild only for structure or relevant content changes.
- [x] Add the secondary drill dock. Cover a target in flow, above the view, below the view, in the
      primary stack, pushed from the primary stack, and unresolved.
- [x] Apply scoped `overscroll-behavior: none`. Confirm that the outer workspace keeps its intended
      horizontal and non-navigation scrolling.
- [x] Remove production-only legacy sticky or outline paths that the integrated widget supersedes.
      Do not remove the overlaid-card renderer in this session.

### Session 4o-b progress

Production integration is complete and the static and unit checks are green. The data hook now
subscribes to one bounded ancestry query, one post-window row, and one drill target. A separate,
bounded hydration map supplies labels for ancestors from other matrixes. These reads do not change
`neededWindows` or editor hydration.

`NavigationPanel` owns one explicit scrollport. It publishes row starts and heights from model
estimates and resize observation. The widget uses numeric geometry, retains equal DOM, and changes
only the final row transform during push-off. Sticky actions use the production controller and
restore focus when the source control mounts. The drill dock covers flow, top, bottom, primary,
pushed-primary, and unresolved states. No production legacy sticky path existed to remove.

The focused production suite has 25 passing tests. The full suite has 902 passing tests. Formatter,
lint, and static types pass. Lint reports the same 14 existing warnings and no errors. Session 4o-c
must run browser, Storybook, performance, trackpad, and user approval gates before closeout.

## Stage 5 — Verify production behavior

- [x] Run focused query, paging, virtualizer, sticky-state, navigation, interaction, and
      accessibility tests.
- [x] Run `npm run format`, `npm run lint`, `npm run typecheck`, and `npm run test:run`.
- [x] Run `pnpm build-storybook`.
- [x] Run focused E2E tests with the repository-required system browser permissions. Cover root
      and focused navigation, more than 100 rows, page crossings, collapse, drill, editing, drag,
      keyboard navigation, and outer workspace scroll.
- [x] Use Chrome DevTools to inspect all sticky thresholds in both directions with live paged
      data. Check classic and overlay scrollbars, narrow width, long labels, title masking, and
      variable source content.
- [x] Test top and bottom trackpad gestures on macOS. Confirm no rubber-band, scroll chaining,
      source-row reveal, or stuck wheel input.
- [x] Record a scroll trace. Confirm no scroll-time layout reads, forced layout, long tasks,
      unchanged-chain rebuilds, or reactive writes beyond one coalesced state update and the final
      row transform.
- [x] Record retained metadata and mounted-row counts. Confirm the metadata limit and unchanged
      rendered-window range.
- [x] Get user approval before Session 4p starts the live workspace cutover.

### Session 4o-c progress

The automated production proof is green. A new disposable-browser E2E fixture uses 465 visible
rows across five pages. It covers root and focused navigation, an unmounted source ancestor,
forward and reverse push-off, source reveal and focus, drill, variable row content, long labels,
title masking, and classic-scrollbar geometry. The proof passes in system Chromium.

The existing six-scenario reset-based set also passes. It covers row distribution, full-range
paging, editor persistence, keyboard navigation, collapse and expand, and cross-window drag. Its
collapse selector now uses the specific accessible names from the shared production header. The
production fixture also proves that ordinary focus content scrolls while navigation boundary
wheel input does not move the outer scroller.

Verification found and fixed four production defects:

- An ancestry subscription replacement cleared the current chain before the new result arrived.
  The hook now keeps the previous bounded chain until the replacement result is ready.
- A numeric scroll-to-source jump did not update retained virtual windows. The virtualizer now
  reconciles its visible range from cached numeric geometry at a window boundary. It does not read
  layout in the scroll handler.
- Focused navigation expanded to its full row height and did not own scroll. The focus panel now
  gives its children navigation one bounded remaining-height region and explicit scroll ownership.
- Bounded navigation inherited the virtualizer's open-ended safety tail. Bounded content now ends
  at its estimated or measured final window. Open-ended virtualizers keep the safety tail.

Chrome DevTools used separate browser profiles with live paged data. It inspected stack entry,
final-row push, section release, parent release, and the reverse transitions. At the paged push
threshold, 265 metadata rows and 265 source rows were retained. The bounded ancestry had two rows,
the source ancestor was unmounted, and the widget used no extra post-window or drill row. The
widget width was 479 pixels in a 479-pixel content viewport with a 15-pixel classic scrollbar
gutter. With the scrollbar hidden, both widths were 494 pixels. At a 390-pixel viewport, the
widget fit the 369-pixel content width. The long label used one line with ellipsis, and the first
sticky row started below the title mask.

The 180-frame bidirectional trace kept the same two node ids and kept rebuilds at seven. It made
180 final-row position writes. CLS was 0.00. DevTools reported no performance insight or long-task
finding. The full unit suite has 906 passing tests. Lint has the existing 14 warnings and no
errors. Static types and the Storybook build pass.

Final user review confirmed that macOS trackpad scrolling and sticky-header behavior match the
approved Storybook treatment. Session 4o is approved and complete. The source and sticky rows do
not yet match in visual style or content, but row design is still unsettled. The future continuity
requirement is recorded in the [Sessions 4p–4q plan](Phase-10-Sessions-4p-4q-plan.md).

## Closeout gate

- [x] Production navigation uses one bounded widget in its explicit scrollport.
- [x] Paged ancestry and subtree boundaries remain correct when source ancestors are unmounted.
- [x] The normal rendered range, page size, and editor hydration boundary do not expand.
- [x] Source and sticky rows share one header renderer without duplicate tree or editor ownership.
- [x] Normal scroll does not read layout or rebuild an unchanged chain.
- [x] Scrollbar, title masking, drill handoff, and macOS boundary behavior pass.
- [x] The production treatment has user approval.
- [x] `StreamView` and the executable overlaid-card implementation remain unchanged.
- [x] Phase 10 and `NOW.md` record verification and route the next work to Session 4p.

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
