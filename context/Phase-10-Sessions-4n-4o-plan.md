# Phase 10 · Sessions 4n–4o — Live workspace migration and overlaid-card removal

This sequence starts after Sessions 4j–4m close. Session 4n moves the approved workspace structure,
sticky behavior, outline configuration, and canonical tokens into the live app. Session 4o removes
the retired overlaid-card implementation after the cutover proves that it has no remaining
consumer.

Use [NOW.md](NOW.md) to identify the active session. Execute one session at a time. Session 4n must
pass its user review and live-app verification before Session 4o deletes any source.

## Fixed decisions

- The approved forward workspace replaces the live overlaid-card renderer.
- Preserve workspace data, focus, navigation, keyboard, and cross-matrix behavior. The approved
  shell structure and theme treatments are the intended visual change.
- Keep the live app on one shared structure for Ghost, Null, and Wipeout.
- Navigation outline remains an independent component setting. It does not change with visual
  theme or polarity.
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

Session 4n removes live dependencies. Session 4o removes the executable archive and all remaining
legacy names.

## Session 4n — Migrate the live workspace

**Outcome:** the live app uses the approved workspace shell, sticky navigation, outline variant,
and canonical theme roles without changing workspace data or gestures.

### Stage 1 — Lock the behavior contract

- [ ] Add focused tests for the stream controller before changing its renderer. Cover initial root,
      append, replace, close, four-column eviction, and `Meta+ArrowLeft`.
- [ ] Cover external row navigation, inline-reference navigation, folded-row focus, unresolved
      positions, and cross-matrix boundary hops.
- [ ] Cover the breadcrumb predicate: show simple ancestry only when the first visible panel is
      focus. The title and sticky stack remain the ancestry signal while root navigation is visible.
- [ ] Record the current live fixture and database setup needed for deterministic component and E2E
      tests.

### Stage 2 — Separate controller from presentation

- [ ] Move panel state, queries, ancestry resolution, and navigation handlers behind a typed stream
      controller or equivalent local model. Remove `OverlaidAncestor` from this boundary.
- [ ] Define a production workspace-shell contract that accepts panel kind, stable identity,
      active state, title, ancestry, and a panel-content slot. Do not make production data conform
      to Storybook fixture types.
- [ ] Promote the approved four-column geometry and active-column treatment into the production
      shell through canonical tokens.
- [ ] Apply the Session 4j visual-theme mechanism at the live root. Keep its value independent of
      the existing polarity attribute.
- [ ] Keep one DOM order and interaction structure across Ghost, Null, and Wipeout.

### Stage 3 — Promote navigation behavior and configuration

- [ ] Adapt the production navigation panel to the approved sticky-header model. Keep virtualized
      row loading, editing, drag behavior, selection, disclosure, drill, and property previews.
- [ ] Apply the approved navigation-outline adapter through the independent
      `navigationOutline` configuration key.
- [ ] Read the outline value through the Session 4j component-configuration contract. Use the
      approved default when no explicit value exists, and keep an explicit value stable across
      visual-theme and polarity changes.
- [ ] Supply the boundary context required by the selected outline variant without expanding the
      rendered virtual window.
- [ ] Preserve the Session 4l transition invariants at real virtual-window and ancestry boundaries.
- [ ] Replace live `--card-*` consumers with canonical surface, width, and state roles.

### Stage 4 — Cut over `StreamView`

- [ ] Render the production workspace shell directly from the stream controller. Remove the live
      `OverlaidCards` and `OverlaidAncestor` imports.
- [ ] Replace ancestor-gap tabs with the approved simple breadcrumb rule. Preserve click navigation
      through the existing ancestry data.
- [ ] Preserve loading, empty, error, active-panel, narrow-width, and long-label states.
- [ ] Confirm that `StreamView` has no layout-theme switch or retired ancestor-card concept.

### Stage 5 — Live review and verification

- [ ] Run `npm run format`, `npm run lint`, `npm run typecheck`, and `npm run test:run`.
- [ ] Run `pnpm build-storybook`.
- [ ] Run focused E2E tests with the repository-required system browser permissions.
- [ ] Use Chrome DevTools to inspect root visible, root shifted, four columns, narrow width,
      cross-matrix focus, long labels, sticky thresholds, and outline switching.
- [ ] Check Ghost, Null, and Wipeout in both polarities. Check keyboard focus and reduced motion.
- [ ] Record a scroll trace with live virtualized data. Confirm that sticky updates do not cause
      repeated forced layout or long tasks.
- [ ] Get user approval before starting Session 4o.

### Session 4n closeout gate

- [ ] No production module imports `src/design/overlaid-cards`.
- [ ] No production style consumes `--card-*` or `.card-*` layout classes.
- [ ] The old directory is used only by its archived stories and any fixture dependency that
      Session 4o will remove.
- [ ] Update Phase 10 and `NOW.md` with the cutover result, verification, and exact remaining
      dependency list.

## Session 4o — Remove the retired implementation

**Outcome:** no executable overlaid-card implementation, story, style, fixture, token, or import
remains. Historical design evidence remains readable in documentation, archived HTML, and git
history.

### Stage 1 — Prove the deletion boundary

- [ ] Confirm that Session 4n is approved and its closeout gate is complete.
- [ ] Search tracked source, Storybook configuration, tests, and build inputs for
      `overlaid-cards`, `OverlaidCards`, `OverlaidAncestor`, `--card-*`, and retired renderer names.
- [ ] Classify every result as forward dependency, executable archive, stale style/comment, or
      historical documentation.
- [ ] Stop if any live consumer remains. Move that dependency through the canonical workspace
      contract before deleting source.

### Stage 2 — Own the surviving fixture data

- [ ] Move the neutral Reading queue fixture data used by the forward workspace into
      `src/design/workspace/fixtures.ts` or a local sibling.
- [ ] Remove all imports from forward stories or tests into `src/design/overlaid-cards`.
- [ ] Keep only fixture content that supports current workspace, theme, sticky, and outline tests.
      Do not preserve retired layout options in the new fixture.

### Stage 3 — Delete executable retirement artifacts

- [ ] Remove the complete `src/design/overlaid-cards/` directory, including the renderer, types,
      CSS, variants, fixtures, and Storybook stories.
- [ ] Remove obsolete `.card-*` rules, `--card-*` variables, fallbacks, imports, and comments from
      live source and `global.css`.
- [ ] Rename any surviving generic helpers whose names still claim overlaid-card ownership.
- [ ] Remove obsolete tests, test IDs, story parameters, and archive navigation entries that can
      execute the retired renderer.

### Stage 4 — Preserve history without dead code

- [ ] Keep Phase 7 and Phase 10 decision records and archived HTML artifacts. Mark deleted source
      paths as historical text instead of active file links where needed.
- [ ] Update the inventory and design documents to state that the executable implementation was
      removed in Session 4o.
- [ ] Keep the approved workspace stories as the only executable layout reference.
- [ ] Update `NOW.md` and the Phase 10 checklist with the removal result and next migration session.

### Stage 5 — Prove full removal

- [ ] Run a zero-reference search for `overlaid-cards`, `OverlaidCards`, `OverlaidAncestor`, and
      `--card-*` across runtime, tests, stories, and styles. Historical documents can retain the
      terms but must not link to deleted source as current code.
- [ ] Run `npm run format`, `npm run lint`, `npm run typecheck`, and `npm run test:run`.
- [ ] Run `pnpm build-storybook` and confirm that no retired story appears in the index.
- [ ] Run the focused workspace E2E suite with the repository-required system browser permissions.
- [ ] Use Chrome DevTools for a final live smoke test of root navigation, deep focus, back,
      cross-matrix focus, sticky transitions, and theme switching.
- [ ] Run `git diff --check` and inspect the staged deletion list before handoff.

## Follow-on order

After Session 4o closes:

1. Migrate the launcher and shared overlays onto canonical tokens.
2. Land the launcher before top-level tabs are removed.
3. Capture the retiring Table and Tags views as Storybook references, then remove their tabs.
4. Migrate faces and browsers one at a time. Apply composed, substrate, and x-ray fidelity as an
   orthogonal axis.

## Starter prompt for Session 4n

> Read `context/NOW.md`, the fixed decisions and Session 4n checklist in this plan, the Sessions
> 4j–4m closeout, the approved workspace rules in `Design.md`, and `context/Testing.md`. Execute
> Session 4n only. Preserve workspace data and gestures while replacing the live OverlaidCards
> renderer with the approved production workspace shell. Do not delete the archived implementation,
> start launcher or tab work, or commit.

## Starter prompt for Session 4o

> Read `context/NOW.md`, the Session 4n closeout and Session 4o checklist in this plan, Phase 10 §4,
> and `context/Testing.md`. Execute Session 4o only. Prove that no live dependency remains, move the
> surviving fixture data, delete the executable overlaid-card implementation and legacy styles,
> preserve historical documentation and HTML evidence, run the required verification, and do not
> commit.
