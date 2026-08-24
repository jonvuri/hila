---
title: Current state
kind: status
state: active
updated: 2026-08-23
phase: phase-10
session: phase-10-session-4j-contract-review
---

# Now

Phase 10 Session 4j has a complete contract draft and is at its review gate. The contract defines
fundamental tokens as simple values and semantic tokens as stable component-facing roles. Session
4k will replace the old token API and migrate all current design-system consumers in one change. It
will not keep compatibility aliases.

The contract also defines `data-visual-theme`, an independent `data-theme` polarity, the typed
component-variant registry, composed and substrate fidelity, x-ray resolution, accessibility
ownership, and the ordered migration slices.

The next five sessions are planned in [Sessions 4j–4m](Phase-10-Sessions-4j-4m-plan.md) and
[Sessions 4n–4o](Phase-10-Sessions-4n-4o-plan.md):

1. Implement the canonical tokens and migrate the approved specimens.
2. Make sticky-header transitions seamless.
3. Integrate the old and new navigation-outline variants as an independent component setting.
4. Migrate the approved workspace into the live shell without changing data or gestures.
5. Remove the executable overlaid-card implementation and its legacy styles after the cutover
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

- The Session 4j draft changes documentation only. The touched documents are formatted, and
  `git diff --check` passes.
- The changed-file list contains no runtime or canonical token source.

## Read for Session 4j review

1. The [canonical token and theme contract](Design.md#token-system).
2. The [component-variant registry](Design-Faces.md#variant-registry).
3. The [Session 4j checklist](Phase-10-Sessions-4j-4m-plan.md#session-4j--define-the-canonical-token-and-configuration-contract).

## Next action

Review the Session 4j contract. Confirm or revise it before any canonical token source changes.
After approval, close Session 4j and prepare Session 4k. Do not implement tokens before that review.

## Documentation boundary

Until Phase 10 settles, limit cleanup to routing, current-state accuracy, and clear historical
markers. The broader documentation audit remains deferred until after Phase 10.

## Handoff rule

At the end of each session, check off the detailed session items. Then update this file with the
completed outcome, verification, next session, and minimum reading set.
