---
title: Current state
kind: status
state: active
updated: 2026-08-23
phase: phase-10
session: phase-10-sessions-4j-4m-review
---

# Now

Phase 10 Session 4i is closed. Ghost, Null, and Wipeout are final and intended to ship as one
visual-theme family. `Design/Theme previewer` renders one `ThemeCard` with an instant theme control.
The fixed theme stories retain their approved intent and delta copy.

The next six sessions are planned in
[Sessions 4j–4m](Phase-10-Sessions-4j-4m-plan.md) and
[Sessions 4n–4o](Phase-10-Sessions-4n-4o-plan.md):

1. Define the canonical token, visual-theme, component-variant, fidelity, and migration contracts.
2. Implement the canonical tokens and migrate the approved specimens.
3. Make sticky-header transitions seamless.
4. Integrate the old and new navigation-outline variants as an independent component setting.
5. Migrate the approved workspace into the live shell without changing data or gestures.
6. Remove the executable overlaid-card implementation and its legacy styles after the cutover
   passes review.

The live shell migration starts only after the four design sessions close. Full overlaid-card
removal starts only after the live cutover passes its user review and verification gate.

## Planning evidence

- Chrome DevTools measured a 32-pixel sticky-layer height change at each ancestor threshold. The
  current flow row and sticky copy meet at the seam while a stack row mounts or unmounts.
- The old outline renderer owns both decoration and interaction. The forward navigation owns a
  separate interaction contract. Session 4m will keep behavior in the shared navigation row and
  adapt outline calculation and paint only.
- Guide, notch, and vector variants need data outside a virtualized visible range. The new contract
  must supply ancestry, continuation, look-ahead, and up to 100 forward rows.
- Two new candidates are planned: VS Code-inspired hover guides and a Notion-inspired toggle
  gutter.

## Current verification

- The Session 4i source set passed format, lint, typecheck, all 845 tests, and the Storybook build.
  Lint reports 14 existing warnings and no errors.
- Chrome DevTools confirmed instant Ghost, Null, and Wipeout switching, narrow-width containment,
  intentional workspace scrolling, and all 13 aligned Wipeout workspace notches.
- This planning update changes documentation only. Format and `git diff --check` are the required
  checks before review.

## Read for Session 4j

1. The [Sessions 4j–4m fixed decisions and Session 4j checklist](Phase-10-Sessions-4j-4m-plan.md).
2. The [Sessions 4n–4o dependency boundary](Phase-10-Sessions-4n-4o-plan.md#current-dependency-boundary).
3. [Phase 10 §4](Phase-10.md#4-cohesive-design-token-and-theming-system).
4. The [Session 4i semantic token requirements](Phase-10-Session-4c-plan.md#semantic-token-requirements).
5. The approved [Design](Design.md) and [Design Faces](Design-Faces.md) rules.

## Next action

Review the staged Session 4i closeout and Sessions 4j–4o plans. After approval, execute Session 4j
only. Do not implement canonical tokens, navigation motion, outline adapters, live migration, or
retirement deletion in the planning review.

## Documentation boundary

Until Phase 10 settles, limit cleanup to routing, current-state accuracy, and clear historical
markers. The broader documentation audit remains deferred until after Phase 10.

## Handoff rule

At the end of each session, check off the detailed session items. Then update this file with the
completed outcome, verification, next session, and minimum reading set.
