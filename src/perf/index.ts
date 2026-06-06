// Perf-test harness (Phase 8, Stage P0).
//
// A deterministic, work-and-plan-based test harness guarding the app's
// sub-50ms / single-frame design goal. The guards assert on what actually
// breaks the budget -- accidental full-table scans, super-linear ops, and
// over-broad reactive invalidation -- which show up deterministically in query
// plans and work counts, rather than on noisy wall-clock time.
//
// Guard families:
//   - query-plan: `assertQueryPlan` (EXPLAIN QUERY PLAN shape checks)
//   - work-count: `createWorkCounter` + the shared `installWriteHook`
//   - scaling-ratio: `assertScaling`
//   - invalidation fan-out: `createInvalidationTracker`
//
// `createPerfDb` (setup) bundles all of the above on an in-memory connection.

export { createPerfDb } from './setup'
export type { PerfHarness, CreatePerfDbOptions } from './setup'

export { assertQueryPlan, explainQueryPlan, formatQueryPlan } from './query-plan'
export type { QueryPlanRow, QueryPlanAssertions } from './query-plan'

export { createWorkCounter, installWriteHook } from './work-counter'
export type {
  WorkCounter,
  WorkCounters,
  TableWork,
  WriteHook,
  WriteEvent,
  WriteListener,
} from './work-counter'

export { assertScaling, measureScaling } from './scaling'
export type { ScalingOrder, ScalingMeasurement, AssertScalingOptions } from './scaling'

export {
  createInvalidationTracker,
  assertNoCrossInvalidation,
  tablesVisitedBySql,
} from './invalidation'
export type { InvalidationTracker, RecordedEdit } from './invalidation'

export { generateForest, createForestMatrix } from './forest'
export type { Forest, ForestNode, GenerateForestOptions } from './forest'

export { categorizeTables, normalizeTable } from './tables'
