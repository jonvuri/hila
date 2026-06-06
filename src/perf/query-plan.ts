// Query-plan guards built on `EXPLAIN QUERY PLAN`.
//
// These assert on the *shape* of a hot query's plan rather than its runtime:
// the intended index is used, no large table is full-scanned, and the planner
// is not papering over a missing index with an `AUTOMATIC` one. Run against a
// representative-scale fixture with `ANALYZE` (so the planner has realistic
// statistics) and `PRAGMA automatic_index = OFF` (so a missing index surfaces
// as a `SCAN` rather than a silently-synthesized auto index).

import type { Database, SqlValue } from '@sqlite.org/sqlite-wasm'

import { normalizeTable } from './tables'

export type QueryPlanRow = {
  id: number
  parent: number
  detail: string
}

/** Run `EXPLAIN QUERY PLAN` and return the plan rows. */
export const explainQueryPlan = (
  db: Database,
  sql: string,
  params: SqlValue[] = [],
): QueryPlanRow[] => {
  const rows = db.selectObjects('EXPLAIN QUERY PLAN ' + sql, params) as unknown as {
    id: number
    parent: number
    detail: string
  }[]
  return rows.map((r) => ({ id: r.id, parent: r.parent, detail: r.detail }))
}

/** Render a plan as an indented tree for assertion messages. */
export const formatQueryPlan = (plan: QueryPlanRow[]): string =>
  plan.map((r) => `  ${r.detail}`).join('\n')

// `SCAN <table>` (no `USING INDEX`) is a full table scan. `SEARCH <table> USING
// INDEX` and `SCAN <table> USING ... INDEX` (a full *index* scan) are fine.
const scanTargetOf = (detail: string): string | null => {
  const match = /^SCAN\s+(\S+)/.exec(detail)
  if (!match) return null
  if (/USING\s+(?:COVERING\s+|PARTIAL\s+)*INDEX/.test(detail)) return null
  return match[1]!
}

export type QueryPlanAssertions = {
  /** Index name(s) that must appear in the plan (`USING [COVERING] INDEX <name>`). */
  usesIndex?: string | string[]
  /** Logical/concrete table names that must not be full-scanned. */
  noScanOf?: string[]
  /** Fail if the plan contains an `AUTOMATIC` index (default: true). */
  noAutoIndex?: boolean
  /** Fail if the plan contains a `USE TEMP B-TREE` step (default: false). */
  noTempBTree?: boolean
}

/**
 * Assert structural properties of a query's plan. Throws with the full plan
 * rendered in the message on any violation.
 */
export const assertQueryPlan = (
  db: Database,
  sql: string,
  params: SqlValue[],
  assertions: QueryPlanAssertions,
): QueryPlanRow[] => {
  const plan = explainQueryPlan(db, sql, params)
  const planText = formatQueryPlan(plan)
  const fail = (reason: string): never => {
    throw new Error(`Query-plan guard failed: ${reason}\nPlan:\n${planText}`)
  }

  if (assertions.usesIndex !== undefined) {
    const required =
      Array.isArray(assertions.usesIndex) ? assertions.usesIndex : [assertions.usesIndex]
    for (const indexName of required) {
      const used = plan.some((r) =>
        new RegExp(`USING\\s+(?:COVERING\\s+|PARTIAL\\s+)*INDEX\\s+${indexName}\\b`).test(
          r.detail,
        ),
      )
      if (!used) fail(`expected plan to use index "${indexName}"`)
    }
  }

  if (assertions.noScanOf) {
    const banned = new Set(assertions.noScanOf.map(normalizeTable))
    for (const row of plan) {
      const scanned = scanTargetOf(row.detail)
      if (
        scanned &&
        (banned.has(normalizeTable(scanned)) || banned.has(scanned.toLowerCase()))
      ) {
        fail(`unexpected full SCAN of "${scanned}"`)
      }
    }
  }

  if (assertions.noAutoIndex !== false) {
    const auto = plan.find((r) => /\bAUTOMATIC\b/.test(r.detail))
    if (auto) fail(`plan uses an AUTOMATIC index ("${auto.detail.trim()}")`)
  }

  if (assertions.noTempBTree) {
    const temp = plan.find((r) => /USE TEMP B-TREE/.test(r.detail))
    if (temp) fail(`plan uses a temporary B-tree ("${temp.detail.trim()}")`)
  }

  return plan
}
