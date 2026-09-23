---
title: Phase 12 Session 4A — Quick/deep overlay prototypes
kind: phase-session
state: complete
updated: 2026-09-23
---

# Phase 12 Session 4A — Quick/deep overlay prototypes

## Goal

Use Storybook to compare the default workspace, Quick, and Deep states in Ghost, Null, and Wipeout.
Keep the approved centered modal relationship in Ghost and Null. Test an anchored top-left Quick
surface and full-viewport Deep surface in Wipeout, joined to the workspace by accent chrome and
post-facto border echoes.

## Why now

Session 4's shared overlay, selectable-list, focus, and dismissal foundation is approved. Its Deep
story proves only large modal geometry; it is still a larger Quick specimen with an inline hint in
an otherwise empty frame. Before Session 5 adopts the primitives, a bounded visual spike can test a
theme-specific alternative without changing the production launcher contract.

The centered floating geometry in [Launcher](../../Launcher.md#anatomy-and-geometry-d20) was the
canonical baseline during the spike. The approved outcome below now supplies the planned production
contract for Sessions 5 and 6.

## Boundaries

- Work in Storybook-only stories, fixtures, and prototype-local styles. Do not wire prototypes into
  the application or export them as production components.
- Do not change the approved `CenteredOverlay`, `AnchoredOverlay`, or `SelectableList` production
  contracts during this spike.
- Do not implement launcher state, search, chips, query execution, preview data, saving, session
  history, or Session 5 behavior. Static or local mock data is sufficient.
- Do not add canonical tokens or revise `Launcher.md` or `Design.md` from an unreviewed prototype.
  Prototype-scoped semantic role overrides may test darker Ghost and Wipeout backgrounds.
- Preserve modal focus containment, inert background expectations, visible keyboard focus, and a
  reduced-motion interpretation. A visually integrated background must not become a second active
  focus context.
- A valid outcome is to keep the current floating-frame direction unchanged.

## Questions

- Does the Wipeout accent rule make the launcher feel latent in the workspace without looking like
  an active control?
- Does replacing that rule with a block cursor make the top-left Quick surface feel continuous and
  immediate?
- Does full-viewport Deep remain legibly temporary when it has no surrounding workspace margin?
- Do the post-facto border echoes explain opening and expansion without delaying interaction?
- Do black Ghost and Wipeout surfaces improve hierarchy when borders, rather than gray fills,
  separate regions?

## Plan

- [x] Review the Session 4 handoff and replace the earlier generic prototype directions with the
      requested three-state, three-theme comparison.
- [x] Add default workspace, Quick, and Deep stories for Ghost, Null, and Wipeout using comparable
      workspace and result fixtures.
- [x] Keep centered Quick and Deep modals for Ghost and Null. Test prototype-scoped black surface
      roles for Ghost and Wipeout dark polarity while retaining border-defined hierarchy.
- [x] Add the Wipeout workspace accent rule and align the empty launcher's blinking block cursor to
      it.
- [x] Anchor Wipeout Quick to the top-left on wide screens and the top half on narrow screens. Make
      Wipeout Deep fill the viewport while preserving the same launcher content and interaction.
- [x] Port Reflection Step's post-facto border-tracing model: realize state immediately, then draw
      five 1px frames at 30ms intervals that finish decaying within 340ms.
- [x] Verify wide and narrow viewports, dark and light polarity, keyboard and pointer paths, and
      reduced motion in Storybook and real Chrome.
- [x] Review the prototypes with the user. Record a verdict and the useful or rejected ideas from
      each theme and state.
- [x] After review, decide where any accepted decisions belong in the canonical design and Phase 12
      plan. Make no production adoption in this session. Route the next handoff to Session 5.

## Acceptance

- All executable artifacts are Storybook-only and the production application behaves unchanged.
- Three stories per theme compare the workspace, Quick, and Deep states with the same content.
- Ghost and Null retain the approved modal relationship. Only Wipeout changes launcher geometry.
- Wipeout communicates its latent anchor, Quick entry, Deep expansion, return, and dismissal
  without delaying the realized state.
- Ghost and Wipeout's darker candidate roles remain local to the prototype; Session 5 owns their
  production adoption and canonical token review.
- The centered baseline and Wipeout alternative receive real-browser review.
- Review distinguishes approved decisions from interesting evidence and rejected ideas.
- No schema, persistence, sync, query, or production code changes.

## Verification

- Build Storybook and inspect every state in real Chrome at desktop and narrow widths.
- Check keyboard focus, Escape/return cues, pointer dismissal expectations, light/dark polarity,
  and reduced motion.
- Run static checks only if shared source changes unexpectedly; such a change requires explicit
  scope review before it remains in this session.
- Format touched documents and prototype files, run `git diff --check`, and verify active links.

The Storybook production build, typecheck, and focused lint pass. Real Chrome review covered 1200 ×
900 and 500 × 844 viewports, both polarities, theme-scoped palette resolution, keyboard selection,
Quick-to-Deep continuity, Escape dismissal, focus containment and restoration, and the reduced-motion
CSS fallback. Wipeout's workspace rule and empty Quick and Deep block cursors resolve to the same
viewport coordinate. Its five 1px echo frames use 0–120ms staggered starts and share a 340ms
completion boundary.

## Review notes

The first user review accepted the post-facto animation as a strong foundation and requested a
Wipeout iteration. Wipeout now shares Ghost's black surface roles in dark polarity. A follow-up
clarified that the workspace header remains unboxed and that its mark must align with both empty
launcher cursors. One shared anchor geometry gives all three the same viewport position. The
unboxed header's mark and vertically aligned text, plus an 8px inset, supply the measured Quick
origin. Echoes use the lighter semantic decoration grey and interpolate each axis independently
between measured boxes at progress 0, 0.18, 0.4, 0.67, and 1; Deep measures the responsive Quick box
before expanding to the viewport. Echo starts are 30ms apart, and every frame finishes fading at
340ms. Ghost and Null rely on the colored caret and selected result instead of adding an input
underline.

## Verdict and routing

The reviewed stories are approved as the provisional direction for production integration and
continued dogfooding. This is not a permanent commitment to Wipeout's bolder geometry. The
variation is also an intentional robustness check: all themes must consume one launcher state,
content, interaction, focus, dismissal, and accessibility contract through modular presentation
shells.

- Ghost and Null retain centered floating Quick and Deep shells.
- Wipeout uses the aligned workspace mark, top-left Quick shell, full-viewport Deep shell, block
  cursor, black border-defined surfaces, and measured post-facto echoes.
- Session 5 owns Quick integration, including the workspace mark and open echo.
- Session 6 owns Deep integration and the Quick-to-Deep expansion echo.
- Broader adoption of the black-surface preference follows canonical token review and the remaining
  Phase 13 surface migrations; production code must not copy prototype-local palette literals.
