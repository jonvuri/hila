// Table-name normalization shared by the perf-harness guards.
//
// The data layer touches a fixed set of logical tables, several of which are
// per-matrix (`mx_<id>_data`, `mx_<id>_closure`, and future `mx_<id>_*`
// projections). For work-counting and per-table assertions we collapse the
// per-matrix tables onto their logical category (`data`, `closure`, ...) so a
// guard can assert e.g. "this op wrote 0 closure rows" without naming a
// specific matrix id.

/**
 * Normalize a single concrete table name to its logical category.
 *
 * `mx_42_data` -> `data`, `mx_42_closure` -> `closure`, everything else is
 * returned lower-cased and unchanged (`rank`, `joins`, `matrix`, ...).
 */
export const normalizeTable = (table: string): string => {
  const lower = table.toLowerCase()
  const mx = /^mx_\d+_(.+)$/.exec(lower)
  return mx ? mx[1]! : lower
}

// Standalone (non per-matrix) tables referenced on hot paths. Longer names are
// listed first so the word-boundary scan attributes `matrix_columns` correctly
// rather than counting it as `matrix` (\b treats `_` as a word char, so this is
// belt-and-suspenders).
const STANDALONE_TABLES = [
  'matrix_columns',
  'matrix',
  'joins',
  'closure',
  'scroll_index',
  'plugins',
  'face_configs',
  'formula_column_deps',
  '_sync_changelog',
  '_sync_state',
]

/**
 * Extract the set of logical table categories a SQL string references.
 *
 * Regex-based on purpose: it must never throw (unlike a full SQL parse) and
 * must tolerate the dynamic `mx_<id>_*` identifiers the data layer builds. It
 * is used only to bucket work counters, so over- or under-matching degrades a
 * breakdown but never corrupts the authoritative global totals.
 */
export const categorizeTables = (sql: string): Set<string> => {
  const lower = sql.toLowerCase()
  const found = new Set<string>()

  for (const [, suffix] of lower.matchAll(/\bmx_\d+_(\w+)\b/g)) {
    found.add(suffix!)
  }

  for (const table of STANDALONE_TABLES) {
    if (new RegExp(`\\b${table}\\b`).test(lower)) {
      found.add(table)
    }
  }

  return found
}
