// Invalidation fan-out recorder.
//
// Mirrors the worker's table-grained subscription invalidation
// (`src/core/worker/sql-handler.ts`): each subscribed SQL is mapped to the set
// of tables it reads (via the same `node-sql-parser`), and an applied edit
// recomputes every subscription that reads a table the edit wrote.
//
// The recorder observes *real writes* through the shared write hook, so it
// tests the actual write -> subscription fan-out deterministically. Today's
// mapping is table-grained, so an edit confined to subtree A *will* recompute a
// subscription scoped to disjoint subtree B when both read the same table -- a
// guard documents this as the baseline. Phase 8b §4 makes invalidation
// range-aware; this recorder is the unit those guards tighten against.

import { Parser } from 'node-sql-parser/build/sqlite'

import type { WriteHook } from './work-counter'

const parser = new Parser()

// Parser table specifiers look like "{type}::{db}::{table}"; reduce to the
// lower-cased table name, matching the worker's normalization.
const normalizeSpecifier = (specifier: string): string => {
  const name = specifier.split('::').pop()
  return (name ?? '').toLowerCase()
}

/** Tables a SQL statement reads, by the same logic the worker uses. */
export const tablesVisitedBySql = (sql: string): Set<string> => {
  try {
    return new Set(parser.tableList(sql).map(normalizeSpecifier))
  } catch {
    return new Set()
  }
}

export type RecordedEdit = {
  /** Tables that received at least one row write during the edit. */
  writtenTables: Set<string>
  /** Subscribed SQLs that would recompute under table-grained invalidation. */
  recomputed: Set<string>
}

export type InvalidationTracker = {
  subscribe: (sql: string) => void
  unsubscribe: (sql: string) => void
  tablesFor: (sql: string) => Set<string>
  /** Run an edit and report the written tables and the resulting recomputes. */
  record: (edit: () => void) => RecordedEdit
  /** Compute recomputes for a hypothetical write set (no edit run). */
  recomputedFor: (writtenTables: Iterable<string>) => Set<string>
}

/**
 * Create a tracker bound to the shared write hook. Subscribe the queries under
 * test, then call `record` around an edit to capture its fan-out.
 */
export const createInvalidationTracker = (writeHook: WriteHook): InvalidationTracker => {
  const tablesBySql = new Map<string, Set<string>>()

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

  return {
    subscribe: (sql) => {
      tablesBySql.set(sql, tablesVisitedBySql(sql))
    },
    unsubscribe: (sql) => {
      tablesBySql.delete(sql)
    },
    tablesFor: (sql) => tablesBySql.get(sql) ?? tablesVisitedBySql(sql),
    recomputedFor,
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
