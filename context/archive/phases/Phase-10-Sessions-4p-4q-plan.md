# Phase 10 · Sessions 4p–4q — Live workspace migration and overlaid-card removal

This sequence starts after the integrated sticky-widget treatment is approved and its production
path is resolved. Session 4p moves the approved workspace structure, sticky behavior, outline
configuration, and canonical tokens into the live app. Session 4q removes the retired overlaid-card
implementation after the cutover proves that it has no remaining consumer.

Use [NOW.md](../../NOW.md) to identify the active session. Execute one session at a time. Complete the
[Session 4o production sticky adoption](Phase-10-Session-4o-plan.md) first. Session 4p must pass its
user review and live-app verification before Session 4q deletes any source.

## Fixed decisions

- The approved forward workspace replaces the live overlaid-card renderer.
- Preserve workspace data, focus, navigation, keyboard, and cross-matrix behavior. The approved
  shell structure and theme treatments are the intended visual change.
- Keep the live app on one shared structure for Ghost, Null, and Wipeout.
- Navigation outline remains an independent component setting. It does not change with visual
  theme or polarity.
- The Session 4o sticky mechanics are approved. The current visual and content mismatch between
  source rows and sticky rows is not a final design decision. Preserve the deferred continuity
  requirement below.
- The retired overlaid-card implementation has no compatibility promise after the live cutover.
- Preserve historical rationale in Phase 7, Phase 10, and the archived HTML artifacts. Git history
  preserves the deleted executable prototypes.
- Do not start the launcher, tab-retirement, face, or browser migrations in these sessions.

## Current dependency boundary

The live `StreamView` imports `OverlaidCards` and its ancestor type. It owns the state and data that
must survive the renderer change:

- One root navigation panel and up to four visible columns.
- Append, replace, close, and back operations.
- External row navigation and inline-reference navigation.
- Cross-matrix focus and boundary hops.
- Folded-row focus, including the unresolved-position state.
- Focus highlighting, active-panel state, ancestry queries, and workspace title.

The retired source also has dependencies outside its directory:

- The forward workspace fixture imports Reading queue data from
  `src/design/overlaid-cards/fixtures.tsx`.
- `FocusPanel`, row gestures, `global.css`, and a virtualizer comment still refer to `--card-*`,
  `.card-*`, or OverlaidCards concepts.
- Two archived Storybook groups execute the old renderer and its variant modules.

Session 4p removes live dependencies. Session 4q removes the executable archive and all remaining
legacy names.

## Session 4p — Migrate the live workspace

**Outcome:** the live app uses the approved workspace shell, sticky navigation, outline variant,
and canonical theme roles without changing workspace data or gestures.

### Stage 1 — Lock the behavior contract

- [x] Add focused tests for the stream controller before changing its renderer. Cover initial root,
      append, replace, close, four-column eviction, and `Meta+ArrowLeft`.
- [x] Cover external row navigation, inline-reference navigation, folded-row focus, unresolved
      positions, and cross-matrix boundary hops.
- [x] Cover the breadcrumb predicate: show simple ancestry only when the first visible panel is
      focus. The title and sticky stack remain the ancestry signal while root navigation is visible.
- [x] Record the current live fixture and database setup needed for deterministic component and E2E
      tests.

#### Stage 1 test setup

The focused component contract runs in Vitest with jsdom. It mocks the SQL position resolver, the
folded-position resolver, reactive query results, and the three presentation components. It keeps
the real `StreamView` signals, handlers, effects, and document listeners. Fixed matrix IDs, row
IDs, and byte keys make each panel transition deterministic without a database.

Live E2E tests start from the two-step **Reset DB** action. Reset rebuilds the schema. The app then
registers its plugins again and creates the `Workspace` matrix with one `Welcome to Hila` row.
Tests must wait for the row and each reactive result. Tests can use client data APIs through
`page.evaluate` to seed exact cross-matrix, folded, and ownership states. They must use retrying
assertions instead of fixed delays. E2E runs use the system browser outside the sandbox.

Stage 1 evidence:

- `src/workspace/StreamView.test.tsx` covers the controller contract through the current component
  boundary.
- `src/design/workspace/Workspace.test.tsx` covers the approved first-visible-focus breadcrumb
  predicate.
- Existing live proofs remain in `e2e/stream-view.spec.ts`, `e2e/focus-panel.spec.ts`,
  `e2e/folded-row-drill-in.spec.ts`, and `e2e/tags.spec.ts`.

### Stage 2 — Separate controller from presentation

- [x] Move panel state, queries, ancestry resolution, and navigation handlers behind a typed stream
      controller or equivalent local model. Remove `OverlaidAncestor` from this boundary.
- [x] Define a production workspace-shell contract that accepts panel kind, stable identity,
      active state, title, ancestry, and a panel-content slot. Do not make production data conform
      to Storybook fixture types.
- [x] Promote the approved four-column geometry and active-column treatment into the production
      shell through canonical tokens.
- [x] Apply the Session 4j visual-theme mechanism at the live root. Keep its value independent of
      the existing polarity attribute.
- [x] Keep one DOM order and interaction structure across Ghost, Null, and Wipeout.

Stage 2 evidence:

- `src/workspace/stream-controller.ts` owns the bounded panel state, queries, ancestry, keyboard
  and inline-reference listeners, and navigation handlers. Its public types do not depend on the
  retired renderer.
- `src/workspace/WorkspaceShell.tsx` defines the production-only shell contract. Its focused test
  locks stable panel identity, active state, first-focus ancestry, content slots, and one structure
  across all visual themes.
- The live root resolves `data-visual-theme` separately from the existing `data-theme` polarity.
- `StreamView` still adapts the controller to `OverlaidCards` during this stage. Stage 4 owns the
  renderer cutover.

### Stage 3 — Promote navigation behavior and configuration

- [x] Preserve the approved production sticky widget from Session 4o while the surrounding shell
      changes. Keep its scrollport, paging, geometry, row-rendering, and performance contracts.
- [x] Apply the approved navigation-outline adapter through the independent
      `navigationOutline` configuration key.
- [x] Read the outline value through the Session 4j component-configuration contract. Use the
      approved default when no explicit value exists, and keep an explicit value stable across
      visual-theme and polarity changes.
- [x] Preserve the boundary context supplied by Session 4o. Do not expand the rendered virtual
      window.
- [x] Preserve the Session 4n transition invariants at real virtual-window and ancestry boundaries.
- [x] Replace live `--card-*` consumers with canonical surface, width, and state roles.

Stage 3 evidence:

- The app reads `navigationOutline` from the persisted workspace face settings. `StreamView`
  resolves it through the component-variant registry and supplies one value to root and nested
  navigation.
- Source and sticky rows calculate and paint through the same resolved adapter. The navigation
  host exposes `data-navigation-outline` for live inspection. Visual-theme and polarity changes do
  not modify the component value.
- No paging, metadata, virtualizer, scrollport, geometry, or transition calculation changed. The
  focused outline, virtual-window, sticky, virtualizer, and controller suites have 41 passing
  tests.
- Production modules outside the retired renderer no longer consume `--card-*`. The app canvas,
  focus surface, hover state, and gesture overlay use canonical roles.
- Formatting, lint with 14 existing warnings, static types, all 916 tests, and the production build
  pass. The build keeps its existing chunk-size warnings.

### Stage 4 — Cut over `StreamView`

- [x] Render the production workspace shell directly from the stream controller. Remove the live
      `OverlaidCards` and `OverlaidAncestor` imports.
- [x] Replace ancestor-gap tabs with the approved simple breadcrumb rule. Preserve click navigation
      through the existing ancestry data.
- [x] Preserve loading, empty, error, active-panel, narrow-width, and long-label states.
- [x] Confirm that `StreamView` has no layout-theme switch or retired ancestor-card concept.

Stage 4 evidence:

- `StreamView` renders `WorkspaceShell` with stable panel wrappers keyed by controller panel
  identity. Ancestry updates do not remount existing panel content.
- The breadcrumb appears only when a focus panel is the first visible column. It starts with the
  workspace title. The title returns to root, and each retained ancestry item uses the existing
  controller navigation path.
- Loading uses a canonical workspace-shell state. Navigation and focus panels still own their
  loading, empty, error, unresolved-position, narrow-width, and long-label behavior.
- The focused controller and shell tests have 11 passing tests. Static types pass.
- Outside the archived implementation, the only remaining `overlaid-cards` source dependency is
  the known forward Storybook fixture import. Session 4q owns that fixture move.

### Stage 5 — Live review and verification

- [x] Run `npm run format`, `npm run lint`, `npm run typecheck`, and `npm run test:run`.
- [x] Run `pnpm build-storybook`.
- [x] Run focused E2E tests with the repository-required system browser permissions.
- [x] Use Chrome DevTools to inspect root visible, root shifted, four columns, narrow width,
      cross-matrix focus, long labels, sticky thresholds, and outline switching.
- [x] Check Ghost, Null, and Wipeout in both polarities. Check keyboard focus and reduced motion.
- [x] Record a scroll trace with live virtualized data. Confirm that sticky updates do not cause
      repeated forced layout or long tasks.
- [x] Get user approval before starting Session 4q.

Stage 5 evidence:

- Formatting made no changes. Lint passes with the existing 14 warnings and no errors. Static
  types, all 917 unit tests, and the Storybook build pass. The build keeps its existing chunk-size
  warnings.
- Verification found stale E2E selectors for the retired stream and card DOM. The tests now use
  the production workspace-shell contract. The retired gap-card scenarios now cover the simple
  breadcrumb predicate, four-column eviction, ancestor selection, and return to root. The updated
  stream and boundary-hop set has 13 passing tests. The production sticky, folded-row, app-shell,
  and affected tag set has 11 passing tests. A new reduced-motion proof also passes.
- Live DevTools review used more than 200 virtualized rows. Root-visible, root-shifted, four-column, nested,
  and cross-matrix focus states keep the production shell. The first shifted focus panel shows the
  correct workspace and hidden-ancestor breadcrumb. All live navigation panels report `guides`.
- Ghost, Null, and Wipeout keep one shell and widget DOM in both polarities. At 390 pixels, the
  widget stops at the content width and leaves the 15-pixel scrollbar gutter clear. The long
  sticky label uses one line with ellipsis: 239 visible pixels for 667 pixels of content. A real
  Tab event shows a distinct focus outline. Reduced motion resolves feedback duration to zero.
- A 180-frame bidirectional trace has CLS 0.00 and no DevTools performance insight or long-task
  finding. The live widget keeps bounded ancestry and numeric retained geometry. The DevTools
  console has no errors. It reports the existing Solid disposal warnings and form-field naming
  issue.

### Session 4p closeout gate

- [x] No production module imports `src/design/overlaid-cards`.
- [x] No production style consumes `--card-*` or `.card-*` layout classes.
- [x] The old directory is used only by its archived stories and any fixture dependency that
      Session 4q will remove.
- [x] Update Phase 10 and `NOW.md` with the cutover result, verification, and exact remaining
      dependency list.

### Deferred navigation-row and sticky continuity

Do not block the Session 4p shell cutover on this visual refinement. Navigation-row content and
styling remain in the prototype phase. Address this requirement with the next deliberate
navigation-row surface pass:

- Treat the sticky header as the compact state of the same source-row seam, not as a separate
  composition that only shares data.
- Consider putting the guide, disclosure, and title in one fixed top line. Keep previews,
  properties, gestures, menus, and expanded content below that line when they do not belong in a
  sticky header.
- Make source-to-sticky and sticky-to-source transitions preserve text, guide alignment, type,
  color, spacing, and interaction identity. The row should appear to collapse to one line and
  expand from it without a jarring replacement.
- Keep one tree item and one editor owner. Reuse the shared row model and renderer seam instead of
  duplicating source-only controls in the sticky representation.
- Add Storybook and live checks for visual correspondence at entry, push-off, reverse scroll, and
  source reveal after the row surface stabilizes.

## Session 4q — Remove the retired implementation

**Outcome:** no executable overlaid-card implementation, story, style, fixture, token, or import
remains. Historical design evidence remains readable in documentation, archived HTML, and git
history.

### Stage 1 — Prove the deletion boundary

- [x] Confirm that Session 4p is approved and its closeout gate is complete.
- [x] Search tracked source, Storybook configuration, tests, and build inputs for
      `overlaid-cards`, `OverlaidCards`, `OverlaidAncestor`, `--card-*`, and retired renderer names.
- [x] Classify every result as forward dependency, executable archive, stale style/comment, or
      historical documentation.
- [x] Stop if any live consumer remains. Move that dependency through the canonical workspace
      contract before deleting source.

Stage 1 evidence:

- The Session 4p closeout is complete and has user approval.
- The only forward dependency was `src/design/workspace/fixtures.ts`. It imported two neutral
  fixture values from the retired fixture module.
- All other executable results were inside `src/design/overlaid-cards/`. No runtime, test,
  Storybook configuration, or build consumer existed outside that directory.
- Phase 7 and Phase 10 results are historical documentation. Archived HTML files remain evidence.

### Stage 2 — Own the surviving fixture data

- [x] Move the neutral Reading queue fixture data used by the forward workspace into
      `src/design/workspace/fixtures.ts` or a local sibling.
- [x] Remove all imports from forward stories or tests into `src/design/overlaid-cards`.
- [x] Keep only fixture content that supports current workspace, theme, sticky, and outline tests.
      Do not preserve retired layout options in the new fixture.

Stage 2 evidence:

- `src/design/workspace/reading-queue-fixture.ts` now owns the neutral title, tree, focus content,
  properties, and backlinks used by the current workspace stories.
- The new fixture does not contain gap cards, card themes, renderer options, or retired story
  scenarios. The 13 focused workspace, sticky, and outline tests pass.

### Stage 3 — Delete executable retirement artifacts

- [x] Remove the complete `src/design/overlaid-cards/` directory, including the renderer, types,
      CSS, variants, fixtures, and Storybook stories.
- [x] Remove obsolete `.card-*` rules, `--card-*` variables, fallbacks, imports, and comments from
      live source and `global.css`.
- [x] Rename any surviving generic helpers whose names still claim overlaid-card ownership.
- [x] Remove obsolete tests, test IDs, story parameters, and archive navigation entries that can
      execute the retired renderer.

Stage 3 evidence:

- All 20 files in the retired directory are deleted. The deletion includes two Storybook groups,
  the renderer, shared types, fixtures, CSS, and all variants.
- Runtime, tests, stories, styles, and Storybook inputs have zero retired-name, `--card-*`, or
  `.card-*` references. No helper or test ID still claims retired ownership.

### Stage 4 — Preserve history without dead code

- [x] Keep Phase 7 and Phase 10 decision records and archived HTML artifacts. Mark deleted source
      paths as historical text instead of active file links where needed.
- [x] Update the inventory and design documents to state that the executable implementation was
      removed in Session 4q.
- [x] Keep the approved workspace stories as the only executable layout reference.
- [x] Update `NOW.md` and the Phase 10 checklist with the removal result and next migration session.

Stage 4 evidence:

- Phase 7, Phase 10, and the archived HTML files retain the design history. References to deleted
  source are historical text, not current file links.
- The inventory and design documents record the Session 4q removal. `Design/Workspace` is the only
  executable Storybook layout reference.

### Stage 5 — Prove full removal

- [x] Run a zero-reference search for `overlaid-cards`, `OverlaidCards`, `OverlaidAncestor`, and
      `--card-*` across runtime, tests, stories, and styles. Historical documents can retain the
      terms but must not link to deleted source as current code.
- [x] Run `npm run format`, `npm run lint`, `npm run typecheck`, and `npm run test:run`.
- [x] Run `pnpm build-storybook` and confirm that no retired story appears in the index.
- [x] Run the focused workspace E2E suite with the repository-required system browser permissions.
- [x] Use Chrome DevTools for a final live smoke test of root navigation, deep focus, back,
      cross-matrix focus, sticky transitions, and theme switching.
- [x] Run `git diff --check` and inspect the deletion list before handoff.

Stage 5 evidence:

- Runtime, tests, stories, styles, Storybook configuration, and build inputs have zero retired-name,
  `--card-*`, or `.card-*` references. Historical documents do not link to deleted source as
  current code.
- Formatting, static types, all 917 unit tests, and the Storybook build pass. Lint passes with the
  existing 14 warnings and no errors. The Storybook index contains only the six current
  `Design/Workspace` layout stories.
- The focused system-Chromium suite has 39 passing tests. It covers the app shell, stream view,
  focus panel, folded-row drill-in, and production sticky navigation.
- The final DevTools smoke covers root navigation, forward and reverse sticky transitions,
  four-column deep focus, cross-matrix focus, and a real `Meta+ArrowLeft` back operation. Ghost,
  Null, and Wipeout keep the same panel and outline-guide structure in both polarities.
- `git diff --check` passes. The deletion list contains only the 20 retired executable files. The
  remaining changes move the neutral fixture and update current documentation.

## Follow-on order

After Session 4q closes:

1. Migrate the launcher and shared overlays onto canonical tokens.
2. Land the launcher before top-level tabs are removed.
3. Capture the retiring Table and Tags views as Storybook references, then remove their tabs.
4. Migrate faces and browsers one at a time. Apply composed, substrate, and x-ray fidelity as an
   orthogonal axis.

## Starter prompt for Session 4p

> Read `context/NOW.md`, the Session 4o closeout, the fixed decisions and Session 4p checklist in
> this plan, the approved workspace rules in `Design.md`, and `context/Testing.md`. Execute Session
> 4p only. Preserve workspace data, gestures, and the approved production sticky contracts while
> replacing the live OverlaidCards renderer with the approved production workspace shell. Do not
> delete the archived implementation, start launcher or tab work, or commit.

## Starter prompt for Session 4q

> Read `context/NOW.md`, the Session 4p closeout and Session 4q checklist in this plan, Phase 10 §4,
> and `context/Testing.md`. Execute Session 4q only. Prove that no live dependency remains, move the
> surviving fixture data, delete the executable overlaid-card implementation and legacy styles,
> preserve historical documentation and HTML evidence, run the required verification, and do not
> commit.
