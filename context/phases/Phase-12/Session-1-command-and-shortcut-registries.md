---
title: Phase 12 Session 1 — Shared command and shortcut registries
kind: phase-session
state: ready
updated: 2026-09-03
---

# Phase 12 Session 1 — Shared command and shortcut registries

## Goal

Extract one main-thread command registry without changing `/` behavior. Make command and shortcut
metadata introspectable so the launcher and its help guide cannot grow copied lists.

## Boundaries

- Do not build the launcher, query spec, or retire tabs.
- Keep callable plugin contributions out of the serializable worker registration payload.
- Use namespaced string command IDs and deterministic registration order.
- Use a small surface-neutral invocation context with surface, optional subject, and explicit
  capability callbacks. Do not expose `EditorView` through the core registry.
- Preserve `/table` naming and `/attach` picker handoffs exactly.

## Current seams

- `src/editor/slash-commands.ts`, `slash-plugin.ts`, `slash-type-picker.ts`, and
  `slash-commands.test.ts`.
- `src/core/plugin-types.ts`, `plugin.ts`, and `plugin.test.ts`.
- `src/shortcuts.ts`, `src/editor/keymap.ts`, and `src/App.tsx`.
- Existing `/table` and `/attach` E2E in `e2e/focus-panel.spec.ts`.

## Plan

- [ ] Write command-registry tests for stable registration order, duplicate policy, surface
      filtering, matching, subject availability, disabled reasons, async failure propagation, and
      disposal.
- [ ] Define the main-thread command descriptor and invocation context. Keep subject requirements
      separate from surface availability and return a concrete unavailable reason.
- [ ] Add read-only enumeration and matching APIs. Do not expose a mutable registry array.
- [ ] Register only the existing table and attach commands. Keep their implementations delegated to
      current typed operations and surface capabilities.
- [ ] Convert `slash-commands.ts` to a thin slash adapter and keep `slash-plugin.ts` trigger,
      deletion, selection, and follow-up behavior unchanged.
- [ ] Add plugin contribution wiring only where a real built-in uses it. Prove reset/re-registration
      cannot duplicate commands and teardown cannot leak them.
- [ ] Make global shortcut registrations self-describing and enumerable. Define how editor-local
      keymap descriptors join the future help projection without moving their handlers into the
      global manager.
- [ ] Test platform key normalization/display independently from event matching.
- [ ] Update the session and `NOW.md` handoff to Session 2.

## Acceptance

- One authoritative command collection can serve slash and launcher consumers.
- `/` empty/filter order remains table then attach; keyboard and pointer commits remove the trigger
  text and preserve both follow-up flows.
- Node-required commands cannot run without a subject and remain discoverable with a reason.
- Plugin command functions stay on the main thread; worker messages remain structured-clone safe.
- Shortcut/help metadata is derived from registered descriptors rather than copied prose.
- No schema or durability-policy change occurs.

## Verification

- Run focused command, slash-command, shortcut, and plugin unit tests.
- Run focused `/table` and `/attach` E2E outside the sandbox.
- Run format, lint, typecheck, unit tests, and `git diff --check`.
