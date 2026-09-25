---
title: Phase 13 Session 2 — Theme and fidelity inputs
kind: phase-session
state: complete
updated: 2026-09-25
---

# Phase 13 Session 2 — Theme and fidelity inputs

## Goal

Make build/development-startup visual-theme selection explicit and establish the recursive host
fidelity inputs that each migrated surface will consume.

## Depends on

Session 1 must define the host boundary and implicit substrate fallback.

## Requirements

- [x] Read `VITE_HILA_VISUAL_THEME` as `ghost`, `null`, or `wipeout` at build or development-server
      startup. Resolve a missing or invalid value to Ghost before writing root attributes.
- [x] Keep polarity independent of visual theme. Preserve the existing polarity fallback and isolated
      preview-scope rules.
- [x] Resolve fidelity through the host tree in this order: active x-ray, explicit local fidelity,
      inherited fidelity, then composed root fallback.
- [x] Expose resolved composed/substrate state to face interiors without storing it in recipes, schema,
      plugin metadata, or session history.
- [x] Keep x-ray transient and available for development inspection. The system-edge control may land
      in Session 8, but the runtime state and test seam belong here.
- [x] Prove that theme, polarity, density, component variants, responsive shell presentation, and
      fidelity cannot select or mutate one another.

## Boundaries

- Do not add a runtime theme chooser, persisted preference, or replicated setting.
- Ghost is analogous to a quiet substrate-like visual expression, but selecting Ghost must not
  select substrate fidelity.
- Do not require non-face editor, browser, or system controls to implement composed and substrate
  renderings. They still consume canonical semantic design roles.
- Do not migrate later live surface styles in this session.

## Acceptance

- [x] Local development and offline builds can choose any approved visual theme through one documented
      environment value.
- [x] Missing and invalid values produce Ghost without an invalid root attribute or startup flash into
      another theme.
- [x] X-ray forces substrate through nested face hosts and leaves all other design axes unchanged.
- [x] Reload resets fidelity inspection state while preserving the environment-selected visual theme.

## Verification

- [x] Cover environment parsing, fallback, root attributes, nested fidelity inheritance, local
      override, and x-ray priority with deterministic tests.
- [x] Inspect all visual themes and polarities in the app shell and an isolated preview scope.
- [x] Run formatter, linter, static types, focused unit/component coverage, Storybook build, and
      `git diff --check`.

## Outcome

Vite now validates `VITE_HILA_VISUAL_THEME` during development-server or build startup and writes
the resolved value into the initial `<html>` tag. Ghost, Null, and Wipeout therefore arrive before
paint; missing or invalid input emits Ghost. The existing early polarity selection remains
independent, and the value is documented without adding a chooser or preference.

`FaceFidelityRoot` owns transient x-ray state, publishes composed/substrate state at the application
root, and exposes a testable setter for the later system edge. Each `FaceHostSlot` resolves x-ray,
local input, inherited input, then composed fallback; provides that context to descendants; and
passes the resolved value to the selected interior. No recipe, schema, plugin metadata, or session
state changed.

Deterministic coverage exercises startup parsing and attributes, nested inheritance, local
override, x-ray priority and restoration, axis independence, and reload reset. All 1,271 unit
tests pass. Production builds emitted the expected initial attribute for every approved value and
invalid fallback. Storybook builds, and the six theme/polarity combinations passed live shell and
isolated-scope inspection.

## Handoff

Every later migration session uses these inputs and verifies its surface across the approved theme
and fidelity matrix.
