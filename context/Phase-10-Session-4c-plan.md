# Phase 10 · Sessions 4c–4i — Ghost convergence and theme-card approval

This sequence turns session 4b's selected **Sticky headers** workspace into a shared structural base,
then evaluates Ghost, Null, and Wipeout without committing to final tokens. Each session has one
focused outcome and ends with the normal static checks plus a Storybook build/spot-check. Nothing is
wired into the live app and `src/design/tokens.css` is not changed until after session 4i approval.

Use [NOW.md](NOW.md) to identify the active session. For execution, load the fixed decisions, shared
boundaries, that session's checklist, and the verification section. Read later-session detail only
when it constrains the active work; `NOW.md` carries the short handoff between sessions.

## Fixed decisions

- **Ghost** is the common workspace skeleton and minimum affordance layer.
- **Null** and **Wipeout** extend Ghost without alternate markup or behavior.
- The forward layout is the session-4b **Sticky headers** story.
- A simple ancestry breadcrumb appears only on the leftmost visible focus panel when the global-root
  navigation panel has shifted out of the four-column window.
- Ultramodern, all overlaid-card layouts, and all session-4/4b alternatives remain available only as
  an archive.
- Canonical tokens and shipping-theme choices wait for one-page comparison and explicit approval.

## Shared boundaries

- Reuse the session-4b fixture so comparisons hold content, density, and interaction state constant.
- Temporary exploration variables may live beside the stories, but do not add them to the canonical
  token files or treat their names as settled API.
- Separate **atoms** (color roles, type roles, space, geometry, lines, icons, motion, state signals)
  from **molecules** (control, chip, row, sticky header, focus header, property pair, table cell,
  overlay item). Workspace and launcher specimens compose those parts; they are not new theme forks.
- Keep structure/behavior testable without a theme. Themes may change values and optional decorative
  layers, never DOM order, interaction targets, visibility rules, or accessible semantics.
- “Retired” is a design-status marker, not an instruction to delete the current live renderer. The
  live overlaid-card implementation remains transitional until the approved post-4i migration slice.
- Do not migrate `global.css`, the live `StreamView`, or production faces in these sessions.

## Session 4c — Archive the fan-out

**Outcome:** Storybook and the HTML index make the exploration boundary unmistakable, with no loss of
reference material.

- [x] Move the session-4b alternative stories under an `Archive/Phase 10/Session 4b` Storybook namespace
      (or equivalent archive grouping) and add a short retirement notice to their docs/descriptions.
- [x] Archive the original `Design/Workspace` FocusPanel and Depth Gauge stories too. Preserve the Sticky
      Headers story as the named source reference, while making clear that its Wipeout styling is not the
      forward base.
- [x] Add an archive notice to the HTML comparison/index and linked catalogs. Do not delete or rewrite
      the prototype bodies.
- [x] Add a new forward `Design/Workspace` story group placeholder for Ghost work; do not duplicate or
      rename the underlying experimental renderers solely to make the archive look cleaner.
- [x] Verify no live-app imports or defaults changed.

### Session 4c closeout

- Storybook now groups the Session 4b fan-out under `Archive/Phase 10/Session 4b`. The archived Sticky
  Headers story identifies the structural source and rejects its Wipeout styling as the forward base.
- The Session 4 HTML index, three theme catalogs, and Wipeout overlaid-cards deep dive have visible
  archive notices. Their prototype bodies remain unchanged.
- `Design/Workspace` contains only the Ghost placeholder for Session 4d. No live-app, renderer, default,
  or canonical-token file changed.
- Format, lint, typecheck, focused performance tests, and the Storybook build passed. The full unit suite
  passed 832 tests. Two unchanged performance tests exceeded their 5-second limits, and each timed-out
  file passed when run alone.

## Session 4d — Extract the Ghost workspace skeleton

**Outcome:** one minimally styled structural story demonstrates the approved layout and ancestry
behavior independently of Wipeout chrome.

- [x] Extract theme-neutral workspace, column, focus-panel, and sticky-navigation composition from the
      selected story. Keep state/structure shared; remove `wo-*` assumptions from the forward path.
- [x] Define the minimum affordance contract: column boundary, focus/editability, clickable collapse,
      sticky state, drill target/path, keyboard focus, disabled state, and active selection. Ghost should
      expose these clearly but add no decorative flourish.
- [x] Add the breadcrumb rule with an explicit predicate: `first visible panel is focus`. It resolves via
      the existing ancestry ladder and appears above that panel's title; root-visible, middle, and
      rightmost focus panels have no breadcrumb.
- [x] Add focused stories for root visible, exactly four columns, root shifted offscreen, long labels,
      and cross-matrix ancestry. Cover the visibility predicate with a small component test.
- [x] Keep the implementation presentational and fixture-driven; do not wire it into `StreamView`.

### Session 4d closeout

- The forward `Design/Workspace` group now uses one theme-neutral Ghost skeleton. It composes shared
  columns, focus panels, and sticky navigation without `wo-*` classes or Wipeout imports.
- The skeleton exposes the minimum affordances through semantic markup and local exploration styles.
  The five required fixture states reuse the Session 4b reading-queue content.
- `shouldShowWorkspaceBreadcrumb` states the deep-window predicate. The rendered breadcrumb uses the
  fixture's resolved ancestry source and appears only on the first visible focus panel.
- Format, lint, typecheck, the component test, and the Storybook build passed. The full unit suite passed
  833 tests. Two unchanged performance tests exceeded their five-second limits, and both files passed
  when run alone.

## Session 4e — Build the design-card grammar

**Outcome:** the comparison framework and shared specimen inventory exist without theme conclusions.

- [x] Build one vertically complete, reusable `ThemeCard` specimen with a fixed section order:
      intent/delta; palette and type; spacing/geometry/lines/motion; semantic states; atomic controls;
      row/sticky-header/focus/property/table/launcher molecules; workspace gestalt; dials and notes.
- [x] Render dense, identical content in every specimen and include default, hover, keyboard-focus,
      selected, disabled, invalid, and armed-danger states without relying on manual interaction alone.
- [x] Define a theme input contract using temporary local semantic roles; do not encode Ghost, Null,
      or Wipeout values yet.
- [x] Add top-level dials only for decisions still genuinely open; keep one control schema that later
      cards can share.

### Session 4e closeout

- `Design/Theme comparison` now contains one reusable, vertically complete `ThemeCard`. Its fixed
  section order covers the shared foundations, seven forced states, atoms, required molecules, the
  approved workspace gestalt, and dials and notes.
- The card uses one dense Reading queue specimen. The deep-window workspace reuses the Session 4d
  fixture and preserves its conditional breadcrumb.
- The exported input contract has temporary local roles for color, type, space, geometry, lines,
  icons, motion, and state signals. No Ghost, Null, Wipeout, or canonical token value was added.
- The shared dial schema is ready for later cards. The grammar card has no dials because Session 4e
  does not name an open theme decision.
- Format, lint, typecheck, focused component tests, and the Storybook build passed. The full run
  passed 836 tests. Two unchanged performance tests exceeded their five-second limits, and both
  files passed when run alone.

## Session 4f — Complete the Ghost design card

**Outcome:** the full baseline card distinguishes necessary UX signals from optional chrome.

- [x] Fill every shared specimen section with Ghost values and the minimum visible affordances.
- [x] Include the approved sticky-header workspace and conditional-breadcrumb states as the gestalt.
- [x] Record beside each mark whether it is structural, semantic state, or optional decoration.
- [x] Spot-check both polarities, narrow width, keyboard focus, reduced motion, and long-form density.

### Session 4f closeout

- The Ghost card assigns every temporary local role. It uses square geometry, one-pixel lines,
  neutral brightness steps, and explicit state signals without adding a decorative theme layer.
- Each section has a treatment ledger that identifies structural marks, semantic state signals, and
  optional decoration or its intentional absence.
- The gestalt shows root-visible and root-shifted workspaces. The ancestry breadcrumb appears only
  in the first visible focus panel of the shifted state. The molecule set includes a dense long-form
  reading specimen.
- Dark and light polarity, a 360-pixel viewport, real keyboard focus, and the reduced-motion rule
  were spot-checked in Storybook. The narrow page has no overflow outside the intentional workspace
  scroller.
- Format, lint, typecheck, five ThemeCard tests, and the Storybook build passed. The full run passed
  838 tests. Two unchanged performance tests exceeded their five-second limits, and both files
  passed when run alone.
- No live-app, production-face, canonical-token, Null, or Wipeout file changed.

## Session 4g — Rebuild Null as a Ghost extension

**Outcome:** a complete Null card adds conventional affordances without owning structure.

- [ ] Start from the Ghost card and shared specimens, not `NullCards.tsx` or the old Null CSS.
- [ ] Add the most unsurprising conventional signals for boundaries, hierarchy, controls,
      hover/focus, selection, validation, overlays, and elevation. Every change should be expressible as
      a variable override or optional decorative primitive on the shared markup.
- [ ] Keep a concise delta ledger: each Null addition names the Ghost ambiguity it resolves. Remove
      any flourish that does not improve predictability.
- [ ] Render Ghost and Null consecutively in the comparison page and preserve identical
      dials/content.

## Session 4h — Rebuild Wipeout as a Ghost extension

**Outcome:** a complete Wipeout card applies the theme's character to the approved structure.

- [ ] Start from Ghost and the same specimens. Consult the archived Wipeout work only for isolated
      moves worth reusing; do not revive overlaid cards, ancestry tabs, the gauge, or alternate layouts.
- [ ] Apply the established intent — instrument typography, disciplined accent, hard brightness
      steps, chamfers/notches, VFD texture — as orthogonal value/decorative layers with a bounded quirk
      budget.
- [ ] Demonstrate long-form text pressure, dense rows, table/launcher states, both polarities, and
      reduced motion. Typography or ornament may not obscure Ghost's affordances.
- [ ] Render Ghost, Null, and Wipeout consecutively in the comparison page with synchronized controls.

## Session 4i — Compare, tune, and approve

**Outcome:** one user-reviewed page fixes the visual inputs needed for token design.

- [ ] Review the single scrollable Ghost → Null → Wipeout page at common desktop and narrow widths,
      in dark and light polarity, with keyboard focus and reduced-motion/contrast checks.
- [ ] Tune only shared dials or named theme deltas; if a request requires structural divergence,
      resolve the Ghost contract instead of patching one theme.
- [ ] Record approvals and unresolved items directly in this doc. Decide which themes are intended
      to ship versus remain design-system reference themes.
- [ ] Produce a semantic token requirements table: base role, Null override, Wipeout override,
      component consumers, and whether the value is polarity-, density-, or state-dependent. Do not
      implement the canonical tokens in this session.
- [ ] Update `Design.md`/`Design-Faces.md` only with approved rules, then draft the small
      post-approval token implementation and migration sessions in Phase 10 §4.

## Post-approval order (plan after 4i)

1. Define the canonical semantic token contract and Ghost → Null/Wipeout override mechanics.
2. Implement tokens and refactor the approved Storybook specimens onto them.
3. Migrate the live shell/stream as one behavior-preserving slice.
4. Migrate launcher and shared overlays before retiring top-level tabs.
5. Migrate faces/browsers incrementally, with composed/substrate/x-ray as an orthogonal fidelity axis.

## Verification per session

- `npm run format`
- `npm run lint`
- `npm run typecheck`
- `npm run test:run`
- `pnpm build-storybook` or a live Storybook spot-check of the changed stories

No Playwright e2e run is required while the live app remains untouched. If a session crosses that
boundary, run the focused e2e coverage with the repository-required browser permissions.

## Starter prompt for session 4c

> Read `context/NOW.md`; the fixed decisions, shared boundaries, Session 4c checklist, and
> verification section in this plan; and the 4b closeout plus Stage 2f. Execute **session 4c only**:
> clearly archive every session-4/4b HTML and Storybook alternative without deleting it, preserve
> Sticky Headers as the source reference for the forward structure, and create only the placeholder
> for the new Ghost workspace group. Do not extract Ghost yet, modify canonical tokens, wire the live
> app, or commit.
