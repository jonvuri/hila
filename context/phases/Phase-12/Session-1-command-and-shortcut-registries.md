---
title: Phase 12 Session 1 — Shared command and shortcut registries
kind: phase-session
state: complete
updated: 2026-09-05
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

- [x] Write command-registry tests for stable registration order, duplicate policy, surface
      filtering, matching, subject availability, disabled reasons, async failure propagation, and
      disposal.
- [x] Define the main-thread command descriptor and invocation context. Keep subject requirements
      separate from surface availability and return a concrete unavailable reason.
- [x] Add read-only enumeration and matching APIs. Do not expose a mutable registry array.
- [x] Register only the existing table and attach commands. Keep their implementations delegated to
      current typed operations and surface capabilities.
- [x] Convert `slash-commands.ts` to a thin slash adapter and keep `slash-plugin.ts` trigger,
      deletion, selection, and follow-up behavior unchanged.
- [x] Add plugin contribution wiring only where a real built-in uses it. Prove reset/re-registration
      cannot duplicate commands and teardown cannot leak them.
- [x] Make global shortcut registrations self-describing and enumerable. Define how editor-local
      keymap descriptors join the future help projection without moving their handlers into the
      global manager.
- [x] Test platform key normalization/display independently from event matching.
- [x] Update the session and `NOW.md` handoff to Session 2.

## Outcome

- `commandRegistry` is the ordered main-thread authority for command discovery, availability, and
  invocation. It owns immutable descriptor copies. Owner replacement reserves IDs before plugin
  side effects, preserves position, and is generation-safe.
- `hila.workspace` contributes only `hila.table` and `hila.attach`. Callable commands and lifecycle
  hooks are removed from the worker payload before structured cloning.
- `slash-commands.ts` supplies surface capabilities without exposing `EditorView` to the registry.
  Existing keyboard and pointer deletion and table/type-picker handoffs remain intact.
- Global and editor-local shortcut descriptors now share one help-projection shape. Key
  normalization and platform display are independent from event dispatch.
- No schema or durability-policy change occurred.

## Verification results

- Focused command, slash, shortcut, plugin, and main-thread client tests pass: 50 tests.
- Full unit suite passes: 990 tests.
- Focused `/table` and `/attach` system-Chrome tests pass: 4 tests.
- `npm run format`, `npm run lint`, `npm run typecheck`, `npm run test:run`, and
  `git diff --check` pass.

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
