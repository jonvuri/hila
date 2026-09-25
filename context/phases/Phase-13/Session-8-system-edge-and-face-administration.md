---
title: Phase 13 Session 8 — System edge and face administration
kind: phase-session
state: planned
updated: 2026-09-25
---

# Phase 13 Session 8 — System edge and face administration

## Goal

Migrate development and administrative surfaces to canonical design roles and make face
administration operate on the final single-recipe contract.

## Depends on

Sessions 1–7A must establish the runtime, live face consumers, fidelity behavior, and final
navigation-row surface.

## Requirements

- Migrate application system-edge chrome, matrix browsing, SQL inspection, and face configuration
  as complete local style boundaries.
- Keep the matrix browser an administrative membership lens. It must not become a second product
  root or bypass rooted navigation for ordinary work.
- Make face administration inspect and replace the matrix's one intentional recipe rather than
  append ambiguous alternatives.
- Expose supported component settings, including table treatment, through validated recipe state.
  Unknown values fall back without entering CSS.
- Provide transient development access to x-ray inspection without persisting it or coupling it to
  visual theme.
- Preserve the development system-edge route, reset behavior, schema operations, raw data
  inspection, and existing safety boundaries.

## Boundaries

- Do not add a runtime visual-theme chooser or store the environment-selected theme.
- Do not promote schema or face administration into the launcher or stream as ordinary places.
- Do not add general typed/batch operation dispatch; Phase 15 owns that work.
- Do not let administrative inspection mutate subject ownership or infer product navigation.

## Acceptance

- Matrix, SQL, and face administration remain fully reachable through one canonical system edge.
- Applying a face leaves one deterministic intentional recipe and immediately resolves through the
  same host path used by production.
- X-ray can be entered and exited during development and resets on reload.
- Administrative controls preserve clear focus, invalid, disabled, danger, and confirmation states
  in every theme and polarity.
- No system-edge surface depends on legacy global surface styles or palette aliases.

## Verification

- Run focused matrix-browser, face-config, recipe-resolution, reset, SQL-runner, theme, fidelity,
  and accessibility suites.
- Exercise recipe replacement, table treatment fallback, x-ray entry/exit, database reset, narrow
  width, keyboard navigation, and destructive confirmations in the system browser.
- Run formatter, linter, static types, the full unit suite, focused E2E, Storybook build, and
  `git diff --check`.

## Handoff

Session 9 audits the whole application and removes only the compatibility and legacy paths that no
longer have live consumers.
