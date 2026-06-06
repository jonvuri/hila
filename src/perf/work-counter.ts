// Deterministic work-counting instrumentation for the perf harness.
//
// Two complementary mechanisms, both fully deterministic (no wall-clock):
//
//   1. A single SQLite `update_hook` that fires once per row written
//      (INSERT/UPDATE/DELETE). This is the authoritative source for
//      "rows written", broken down by logical table. It is the most robust
//      class of metric: it depends on neither the query planner nor SQLite
//      statement internals, only on the rows actually mutated.
//
//   2. A transparent `Database` proxy that counts statements prepared/executed
//      and rows stepped (read), bucketed by the tables each statement
//      references. This captures "statements executed" and "data-table queries
//      issued per gather" without touching any data-layer code: the harness
//      hands the proxied db to the ops under test.
//
// Only one `update_hook` may be installed per connection, so the harness owns
// it via `installWriteHook` and fans out to any number of listeners (the work
// counter and the invalidation recorder both subscribe).

import type initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { categorizeTables, normalizeTable } from './tables'

type Sqlite3Static = Awaited<ReturnType<typeof initSqliteWasm>>

export type WriteEvent = {
  /** Raw table name from SQLite, e.g. `mx_42_data`. */
  table: string
  /** Logical category, e.g. `data` (see `normalizeTable`). */
  category: string
  /** SQLite op code (capi.SQLITE_INSERT / _UPDATE / _DELETE). */
  op: number
}

export type WriteListener = (event: WriteEvent) => void

export type WriteHook = {
  /** Register a listener; returns an unsubscribe function. */
  onWrite: (listener: WriteListener) => () => void
  /** Remove all listeners (the underlying hook stays installed). */
  clear: () => void
}

/**
 * Install the single shared `update_hook` on `db` and return a fan-out
 * registry. Mirrors the worker's own hook wiring (`initSqlHandler`) but is
 * dedicated to the test connection.
 */
export const installWriteHook = (db: Database, sqlite3: Sqlite3Static): WriteHook => {
  const listeners = new Set<WriteListener>()

  sqlite3.capi.sqlite3_update_hook(
    db,
    (_ctx: number, op: number, _dbName: string, table: string) => {
      const event: WriteEvent = { table, category: normalizeTable(table), op }
      for (const listener of listeners) listener(event)
    },
    0,
  )

  return {
    onWrite: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    clear: () => listeners.clear(),
  }
}

export type TableWork = {
  statements: number
  steps: number
  rowsWritten: number
}

export type WorkCounters = {
  /** Total statements prepared or exec'd through the proxied db. */
  statements: number
  /** Total rows stepped (read) across all prepared statements. */
  steps: number
  /** Total rows written (one per update-hook callback). */
  rowsWritten: number
  /** Per-logical-table breakdown of the three totals above. */
  byTable: Record<string, TableWork>
}

const emptyCounters = (): WorkCounters => ({
  statements: 0,
  steps: 0,
  rowsWritten: 0,
  byTable: {},
})

const bucket = (counters: WorkCounters, category: string): TableWork => {
  let entry = counters.byTable[category]
  if (!entry) {
    entry = { statements: 0, steps: 0, rowsWritten: 0 }
    counters.byTable[category] = entry
  }
  return entry
}

export type WorkCounter = {
  /** Live counters object (mutated in place; safe to read after `reset`). */
  counters: WorkCounters
  /** Zero all counters. Call at the top of each measured section. */
  reset: () => void
  /** Wrap a db so its statement/step work is counted. */
  instrument: (db: Database) => Database
}

const wrapStatement = (
  stmt: ReturnType<Database['prepare']>,
  categories: Set<string>,
  counters: WorkCounters,
): ReturnType<Database['prepare']> =>
  new Proxy(stmt, {
    get(target, prop, _receiver) {
      if (prop === 'step') {
        return (): boolean => {
          const advanced = target.step()
          if (advanced) {
            counters.steps++
            for (const category of categories) bucket(counters, category).steps++
          }
          return advanced
        }
      }
      const value = Reflect.get(target, prop, target) as unknown
      return typeof value === 'function' ?
          (value as (...a: unknown[]) => unknown).bind(target)
        : value
    },
  })

/**
 * Create a work counter wired to a write hook. The returned `instrument`
 * proxies any db so that statements and stepped rows are tallied; row writes
 * are tallied via the write hook. All three reset together.
 */
export const createWorkCounter = (writeHook: WriteHook): WorkCounter => {
  const counters = emptyCounters()

  writeHook.onWrite((event) => {
    counters.rowsWritten++
    bucket(counters, event.category).rowsWritten++
  })

  const reset = (): void => {
    counters.statements = 0
    counters.steps = 0
    counters.rowsWritten = 0
    counters.byTable = {}
  }

  const instrument = (db: Database): Database =>
    new Proxy(db, {
      get(target, prop, _receiver) {
        if (prop === 'prepare') {
          return (sql: string, ...rest: unknown[]) => {
            const categories = categorizeTables(String(sql))
            counters.statements++
            for (const category of categories) bucket(counters, category).statements++
            const stmt = (
              target.prepare as (s: string, ...r: unknown[]) => ReturnType<Database['prepare']>
            )(sql, ...rest)
            return wrapStatement(stmt, categories, counters)
          }
        }
        if (prop === 'exec') {
          return (...args: unknown[]) => {
            const first = args[0]
            const sql =
              typeof first === 'string' ? first
              : first && typeof first === 'object' && 'sql' in first ?
                String((first as { sql: unknown }).sql)
              : ''
            counters.statements++
            for (const category of categorizeTables(sql))
              bucket(counters, category).statements++
            return (target.exec as (...a: unknown[]) => unknown)(...args)
          }
        }
        const value = Reflect.get(target, prop, target) as unknown
        return typeof value === 'function' ?
            (value as (...a: unknown[]) => unknown).bind(target)
          : value
      },
    })

  return { counters, reset, instrument }
}
