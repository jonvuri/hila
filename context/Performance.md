---
title: Performance contract
kind: canonical
state: active
updated: 2026-08-29
---

# Performance contract

Performance is a correctness property for hila's workspace, data operations, and reactive query
system. Hot interactions should feel single-frame and complete within 50 milliseconds unless a
surface documents a stricter frame budget or an intentionally asynchronous boundary.

## Two complementary layers

### Deterministic guards

These are the primary CI gates because they identify structural regressions without timing noise:

1. **Query plans:** hot queries use intended indexes, avoid large-table scans, temporary sorts, and
   automatic indexes.
2. **Work counts:** bound statements, stepped rows, rows written, cache rows touched, and hydration
   gathers per operation.
3. **Scaling ratios:** compare seeded fixtures at `N` and `kN`; work must follow its documented
   constant or linear order and never become accidentally super-linear.
4. **Invalidation fan-out:** an edit recomputes only subscriptions whose table or structural range
   overlaps the dirty set.
5. **UI churn:** keyed rows, editors, and panels mount, unmount, and update only when their logical
   identity or residency changes.

The shared harness lives in `src/perf/`. New performance-sensitive primitives add guards to that
harness rather than inventing local timing assertions.

### Wall-clock browser stress tests

Deterministic guards do not catch every constant-factor, browser-layout, WASM, or DOM regression.
Bounded wall-clock tests provide that backstop.

- Use fixed, seeded fixtures and bounded operations.
- Warm the path before measurement.
- Record several samples and report at least median and p95.
- Record browser version, viewport, fixture size, throttle setting, and machine class with results.
- Run at Chrome DevTools' maximum available CPU slowdown when that slowdown is at least as severe
  as the estimated gap between the development machine and a typical downmarket target.
- Record the machine-to-target estimate and its basis. Re-evaluate it when the development machine,
  browser throttle range, or target class changes.
- If maximum DevTools slowdown is weaker than the estimate, scale the local acceptance threshold
  conservatively or use a slower reference environment for that test.

Wall-clock tests may use generous thresholds to avoid false failures, but repeated threshold drift
is a regression signal. They supplement rather than replace deterministic guards.

## Budgets

- Data and structural operations on representative bounded fixtures: under 50 milliseconds at the
  target-equivalent throttle unless the operation explicitly runs in a background slice.
- Scroll-linked work: no repeated forced layout and no long task attributable to one frame update.
- Reactive writes: no recomputation outside the affected table/range contract.
- Windowed rendering: mounted rows stay within the configured retained-window bound.
- Query gathers: work is bounded by the requested window and distinct schemas it touches, not total
  forest or block size.

Budgets should be tightened when measured headroom proves stable. Do not loosen them to accommodate
an unexplained regression.

## Editor and surface churn

The ProseMirror counters in `src/debug/debugState.ts` support exact lifecycle assertions. The
browser suite must cover:

- within-page insert: exactly one editor mount and no unrelated unmount;
- page-boundary insert/delete: only the new/deleted row and at most the one migrating row churn;
- large collapse/expand: churn equals rows leaving/entering residency, with no unrelated remounts;
- content update: the mounted editor is preserved unless its identity or schema requires
  replacement;
- panel navigation and sticky transitions: stable content identity does not remount when ancestry
  or presentation state changes.

Equivalent counters or stable-instance assertions should protect future expensive renderers.

## Test design rules

- Prefer work/plan assertions for algorithmic complexity.
- Prefer browser traces and lifecycle counters for layout, rendering, and editor ownership.
- Seed representative cross-matrix, deep-tree, portal, and folded-view cases.
- Include a failure control when adding a new harness family so the test proves it can catch the
  intended regression.
- Keep stress fixtures large enough to expose scale dependence but bounded enough for repeatable
  local and CI runs.
- Store thresholds and fixture rationale beside the test.

## Required review for performance-sensitive changes

A phase that changes paging, structural caches, query gathering, editor residency, sticky scroll,
or broad invalidation must state:

- the expected work order;
- the deterministic guards added or retained;
- the wall-clock scenario, when browser or constant-factor risk exists;
- the relevant churn or fan-out invariant;
- the measured result at the target-equivalent throttle.
