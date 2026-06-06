// Perf-harness bootstrap.
//
// Creates an in-memory SQLite connection with the matrix schema, installs the
// shared write hook, wires the work counter and invalidation recorder, and
// applies the deterministic-planner pragmas the query-plan guards depend on:
//
//   - `PRAGMA automatic_index = OFF` so a *missing* index surfaces as a `SCAN`
//     in `EXPLAIN QUERY PLAN` instead of being papered over by a synthesized
//     automatic index (which the EQP guard would otherwise have to special-case).
//   - `ANALYZE` (run after seeding, via `analyze()`) so the planner sees
//     realistic row-count statistics and chooses production-like plans.

import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { initMatrixSchema } from '../core/matrix'

import { createInvalidationTracker, type InvalidationTracker } from './invalidation'
import {
  createWorkCounter,
  installWriteHook,
  type WorkCounters,
  type WriteHook,
} from './work-counter'

type Sqlite3Static = Awaited<ReturnType<typeof initSqliteWasm>>

export type PerfHarness = {
  /** Instrumented connection: run measured ops here so work is counted. */
  db: Database
  /** Raw connection (same underlying db): use for fixture seeding/setup. */
  rawDb: Database
  sqlite3: Sqlite3Static
  /** Live work counters (reset between measured sections). */
  counters: WorkCounters
  /** Zero the work counters. */
  reset: () => void
  /** Run `ANALYZE` so the planner has realistic statistics (call post-seed). */
  analyze: () => void
  /** Create an invalidation recorder bound to the shared write hook. */
  createTracker: () => InvalidationTracker
  /** Close the connection. */
  close: () => void
}

export type CreatePerfDbOptions = {
  /** Initialize the matrix schema (default true). */
  initSchema?: boolean
}

export const createPerfDb = async (options: CreatePerfDbOptions = {}): Promise<PerfHarness> => {
  const { initSchema = true } = options

  const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
  const rawDb: Database = new sqlite3.oo1.DB(':memory:', 'c')

  if (initSchema) {
    initMatrixSchema(rawDb)
  }

  // Deterministic planner: never let a missing index hide behind an auto index.
  rawDb.exec('PRAGMA automatic_index = OFF')

  const writeHook: WriteHook = installWriteHook(rawDb, sqlite3)
  const work = createWorkCounter(writeHook)
  const db = work.instrument(rawDb)

  return {
    db,
    rawDb,
    sqlite3,
    counters: work.counters,
    reset: work.reset,
    analyze: () => rawDb.exec('ANALYZE'),
    createTracker: () => createInvalidationTracker(writeHook),
    close: () => rawDb.close(),
  }
}
