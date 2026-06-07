// Invalidation fan-out recorder.
//
// Supports both the old table-grained path and the new range-aware path
// (Phase 8b §4). Each subscribed SQL has both a table set (for table-grained)
// and a SubscriptionScope (for range-aware matching against a DirtySet).
//
// When testing range-aware invalidation, pass a DirtySet to `recordWithDirty`
// to simulate the handler's dirty-set emission and verify that only overlapping
// subscriptions recompute.

import {
  inferScope,
  shouldRecompute,
  tablesVisitedBySql,
  type DirtySet,
  type SubscriptionScope,
} from '../core/worker/invalidation'

import type { WriteHook } from './work-counter'

export { tablesVisitedBySql }

export type RecordedEdit = {
  /** Tables that received at least one row write during the edit. */
  writtenTables: Set<string>
  /** Subscribed SQLs that would recompute under table-grained invalidation. */
  recomputed: Set<string>
}

export type RecordedEditRangeAware = {
  writtenTables: Set<string>
  recomputed: Set<string>
}

export type InvalidationTracker = {
  subscribe: (sql: string) => void
  unsubscribe: (sql: string) => void
  tablesFor: (sql: string) => Set<string>
  scopeFor: (sql: string) => SubscriptionScope | undefined
  /** Run an edit and report the written tables and the resulting recomputes (table-grained). */
  record: (edit: () => void) => RecordedEdit
  /** Compute recomputes for a hypothetical write set (no edit run, table-grained). */
  recomputedFor: (writtenTables: Iterable<string>) => Set<string>
  /**
   * Run an edit WITH a dirty set and report recomputes using range-aware
   * invalidation (Phase 8b §4). This simulates what the worker does: the
   * edit writes to tables (captured via the write hook), and a structural
   * dirty set narrows which subscriptions actually fire.
   */
  recordWithDirty: (edit: () => void, dirty: DirtySet) => RecordedEditRangeAware
  /**
   * Compute recomputes given a write set + dirty set (range-aware).
   */
  recomputedForRangeAware: (writtenTables: Iterable<string>, dirty: DirtySet) => Set<string>
}

/**
 * Create a tracker bound to the shared write hook. Subscribe the queries under
 * test, then call `record` around an edit to capture its fan-out.
 */
export const createInvalidationTracker = (writeHook: WriteHook): InvalidationTracker => {
  const tablesBySql = new Map<string, Set<string>>()
  const scopesBySql = new Map<string, SubscriptionScope>()

  const recomputedFor = (writtenTables: Iterable<string>): Set<string> => {
    const written = new Set([...writtenTables].map((t) => t.toLowerCase()))
    const recomputed = new Set<string>()
    for (const [sql, tables] of tablesBySql) {
      for (const table of tables) {
        if (written.has(table)) {
          recomputed.add(sql)
          break
        }
      }
    }
    return recomputed
  }

  const recomputedForRangeAware = (
    writtenTables: Iterable<string>,
    dirty: DirtySet,
  ): Set<string> => {
    const written = new Set([...writtenTables].map((t) => t.toLowerCase()))
    const recomputed = new Set<string>()
    for (const [sql, scope] of scopesBySql) {
      if (shouldRecompute(scope, written, dirty)) {
        recomputed.add(sql)
      }
    }
    return recomputed
  }

  return {
    subscribe: (sql) => {
      const tables = tablesVisitedBySql(sql)
      tablesBySql.set(sql, tables)
      scopesBySql.set(sql, inferScope(sql, tables))
    },
    unsubscribe: (sql) => {
      tablesBySql.delete(sql)
      scopesBySql.delete(sql)
    },
    tablesFor: (sql) => tablesBySql.get(sql) ?? tablesVisitedBySql(sql),
    scopeFor: (sql) => scopesBySql.get(sql),
    recomputedFor,
    recomputedForRangeAware,
    record: (edit) => {
      const writtenTables = new Set<string>()
      const unsubscribe = writeHook.onWrite((event) => {
        writtenTables.add(event.table.toLowerCase())
      })
      try {
        edit()
      } finally {
        unsubscribe()
      }
      return { writtenTables, recomputed: recomputedFor(writtenTables) }
    },
    recordWithDirty: (edit, dirty) => {
      const writtenTables = new Set<string>()
      const unsubscribe = writeHook.onWrite((event) => {
        writtenTables.add(event.table.toLowerCase())
      })
      try {
        edit()
      } finally {
        unsubscribe()
      }
      return { writtenTables, recomputed: recomputedForRangeAware(writtenTables, dirty) }
    },
  }
}

/**
 * Assert that an edit does not recompute a subscription it should be isolated
 * from. With today's table-grained invalidation this only holds across
 * different tables; Phase 8b tightens it to disjoint key ranges.
 */
export const assertNoCrossInvalidation = (edit: RecordedEdit, isolatedSql: string): void => {
  if (edit.recomputed.has(isolatedSql)) {
    throw new Error(
      `Invalidation guard failed: edit writing [${[...edit.writtenTables].join(', ')}] ` +
        `recomputed a subscription expected to be isolated:\n  ${isolatedSql.trim().replace(/\s+/g, ' ')}`,
    )
  }
}

/**
 * Assert that a range-aware edit does not recompute an isolated subscription.
 */
export const assertNoCrossInvalidationRangeAware = (
  edit: RecordedEditRangeAware,
  isolatedSql: string,
): void => {
  if (edit.recomputed.has(isolatedSql)) {
    throw new Error(
      `Range-aware invalidation guard failed: edit writing [${[...edit.writtenTables].join(', ')}] ` +
        `recomputed a subscription expected to be isolated:\n  ${isolatedSql.trim().replace(/\s+/g, ' ')}`,
    )
  }
}
