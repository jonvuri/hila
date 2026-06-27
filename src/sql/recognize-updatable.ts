// Updatable-query recognizer (Phase 9.3 Session 2; see context/Phase-9.3.md).
//
// The view-update problem is undecidable for arbitrary SQL, so we do not decide
// it — we build a *sound* recognizer: accept a narrow, well-defined updatable
// subset, reject everything else, with **no false positives**. The bundled
// sqlite-wasm lacks `SQLITE_ENABLE_COLUMN_METADATA` (Session 1 spike), so this
// is the AST-parsing route, reusing the same `sqlite3-parser` machinery that
// already backs tables-visited invalidation (`src/core/worker/invalidation.ts`).
//
// This is the binder kernel restricted to the v1 subset — single base table, no
// row-collapsing or compound shapes. It is a pure function: SQL in, resolved
// passthrough bindings out. SQL stays canonical (no IR); the recognizer
// *annotates* a query, it never rewrites it.

import { parseStmt, traverse } from 'sqlite3-parser'

import type { ColumnDefinition } from '../core/matrix'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AstNode = any

/** SQLite aggregate functions: their presence in the projection collapses rows,
 *  so an aggregate result is not a row-addressable view. */
const AGGREGATE_FUNCTIONS = new Set([
  'count',
  'sum',
  'avg',
  'min',
  'max',
  'total',
  'group_concat',
])

export type UpdatableRecognition =
  | { updatable: false; reason: string }
  | {
      updatable: true
      /** the single base table's matrix id (from `mx_<id>_data`) */
      baseMatrixId: number
      /** projection includes `*` or `<baseAlias>.*` (so every base column,
       *  including `id`, is in the result set) */
      star: boolean
      /** passthrough output columns: result key → base column name */
      passthrough: { outputName: string; baseColumn: string }[]
    }

const reject = (reason: string): UpdatableRecognition => ({ updatable: false, reason })

/** Does an expression subtree contain an aggregate function call? */
const containsAggregate = (expr: AstNode): boolean => {
  let found = false
  traverse(expr, {
    nodes: {
      FunctionCallStarExpr() {
        found = true
      },
      FunctionCallExpr(node: AstNode) {
        const name: string | undefined = node.name?.name
        if (name && AGGREGATE_FUNCTIONS.has(name.toLowerCase())) found = true
      },
    },
  })
  return found
}

/**
 * Recognize whether a `SELECT` is a sound single-base-table updatable view.
 *
 * Accepts iff: a plain `SELECT` (no `WITH`/CTE, no compound `UNION`/etc.), not
 * `DISTINCT`, no `GROUP BY`/`HAVING`, a single non-subquery `FROM` table of the
 * form `mx_<id>_data` with no `JOIN`, and no aggregate in the projection.
 * (Subqueries in `WHERE` are fine — they don't change the outer row identity,
 * so the snippet's correlated `EXISTS` host-scoping passes.)
 *
 * Per projection column: a bare or table-qualified column reference (matching
 * the base table) is a **passthrough**; `*` / `<base>.*` expand to all base
 * columns; anything else (expression, function, literal, subquery, `CASE`) is
 * derived and silently omitted (rendered read-only). Identity, formula
 * exclusion, and the id-presence gate are applied later by
 * `resolveEditableColumns` against the real catalog.
 */
export const recognizeUpdatableQuery = (sql: string): UpdatableRecognition => {
  const parsed = parseStmt(sql, { allowTrailing: true })
  if (parsed.status !== 'ok') return reject('parse-error')

  const root = parsed.root as AstNode
  if (root?.type !== 'SelectStmt') return reject('not-a-select')

  const body = root.body as AstNode
  if (body?.type !== 'Select') return reject('not-a-select')
  if (body.with) return reject('cte')
  if (Array.isArray(body.compounds) && body.compounds.length > 0) return reject('compound')

  const sel = body.select as AstNode
  if (sel?.type !== 'SelectFrom') return reject('not-a-table-select')
  if (sel.distinctness === 'Distinct') return reject('distinct')
  if (sel.groupBy) return reject('group-by')
  if (sel.having) return reject('having')

  const from = sel.from as AstNode
  if (from?.type !== 'FromClause') return reject('no-from')
  if (Array.isArray(from.joins) && from.joins.length > 0) return reject('join')

  const fromTable = from.select as AstNode
  if (fromTable?.type !== 'TableSelectTable') return reject('non-table-from')

  const tableName: string | undefined = fromTable.tblName?.objName?.text
  const m = /^mx_(\d+)_data$/.exec(tableName ?? '')
  if (!m) return reject('non-base-table')
  const baseMatrixId = Number(m[1])

  const tableNameLower = tableName!.toLowerCase()
  const baseAlias = (fromTable.alias?.name?.text ?? tableName!).toLowerCase()
  const matchesBase = (t: string | undefined): boolean => {
    const tl = t?.toLowerCase()
    return tl === baseAlias || tl === tableNameLower
  }

  let star = false
  const passthrough: { outputName: string; baseColumn: string }[] = []

  for (const col of sel.columns as AstNode[]) {
    if (col?.type === 'StarResultColumn') {
      star = true
      continue
    }
    if (col?.type === 'TableStarResultColumn') {
      // `<x>.*` — only the base table exists, so a non-matching qualifier is an
      // invalid query (won't run); be conservative and reject editability.
      if (matchesBase(col.table?.text)) star = true
      else return reject('foreign-table-star')
      continue
    }
    if (col?.type === 'ExprResultColumn') {
      const expr = col.expr as AstNode
      const outputAlias: string | undefined = col.alias?.name?.text

      if (containsAggregate(expr)) return reject('aggregate')

      if (expr?.type === 'QualifiedExpr') {
        const baseColumn: string | undefined = expr.column?.text
        if (matchesBase(expr.table?.text) && baseColumn) {
          passthrough.push({ outputName: outputAlias ?? baseColumn, baseColumn })
        }
        // Mismatched qualifier → invalid/foreign → leave derived (read-only).
        continue
      }
      if (expr?.type === 'Id') {
        const baseColumn: string | undefined = expr.name
        if (baseColumn) passthrough.push({ outputName: outputAlias ?? baseColumn, baseColumn })
        continue
      }
      // Any other expression is derived → read-only (no passthrough entry).
      continue
    }
    // Unknown column node → ignore (treated as derived/read-only).
  }

  return { updatable: true, baseMatrixId, star, passthrough }
}

export type EditableResolution = {
  /** result output name → base column name, for editable cells only. Empty
   *  unless `id` is in the result set (the row-identity gate). */
  editable: Map<string, string>
  /** is `id` in the result set (via `*`/`<base>.*`/explicit `id`)? */
  idPresent: boolean
  /** would the band become editable if `id` were added to the projection? True
   *  only when `id` is absent *and* there is at least one writable passthrough
   *  (or `*` over a table with a writable column) — i.e. the one-click "add id"
   *  affordance would actually help. */
  enableableWithId: boolean
}

/**
 * Resolve which result columns are genuinely editable, against the real catalog.
 *
 * Row identity gate (v1): editability requires `id` to be present in the result
 * set (via `*`/`<base>.*` or an explicit `id` projection) — otherwise there is
 * no key to route a write through, so the band is read-only. Formula columns and
 * `id` itself are never editable.
 */
export const resolveEditableColumns = (
  recognition: Extract<UpdatableRecognition, { updatable: true }>,
  columns: ColumnDefinition[],
): EditableResolution => {
  const colByName = new Map(columns.map((c) => [c.name.toLowerCase(), c]))
  const isWritable = (col: ColumnDefinition | undefined): boolean =>
    col != null && col.formula == null && col.name.toLowerCase() !== 'id'

  // The writable passthrough set, *ignoring* the id gate.
  const writable = new Map<string, string>()
  if (recognition.star) {
    for (const col of columns) {
      if (isWritable(col)) writable.set(col.name, col.name)
    }
  }
  for (const p of recognition.passthrough) {
    const col = colByName.get(p.baseColumn.toLowerCase())
    if (isWritable(col)) writable.set(p.outputName, col!.name)
  }

  const idPresent =
    recognition.star || recognition.passthrough.some((p) => p.baseColumn.toLowerCase() === 'id')

  return {
    editable: idPresent ? writable : new Map(),
    idPresent,
    enableableWithId: !idPresent && writable.size > 0,
  }
}

/**
 * Add `id` to a recognized query's projection, returning the rewritten SQL (or
 * null if it can't be parsed). This backs the one-click "add id to edit"
 * affordance — a **user-initiated** edit of the *stored* canonical SQL (the band
 * genuinely gains `id`), distinct from the silent execution-time PK injection we
 * deliberately avoid. Splices `, <alias>.id` just before the top-level `FROM`,
 * located by the AST span so a `WHERE`-subquery `FROM` can't mislead it.
 */
export const addIdToProjection = (sql: string): string | null => {
  const parsed = parseStmt(sql, { allowTrailing: true })
  if (parsed.status !== 'ok') return null

  const sel = (parsed.root as AstNode)?.body?.select as AstNode
  if (sel?.type !== 'SelectFrom') return null

  const fromOffset: number | undefined = sel.from?.span?.offset
  if (typeof fromOffset !== 'number') return null

  const alias: string | undefined = sel.from?.select?.alias?.name?.text
  const idExpr = alias ? `${alias}.id` : 'id'

  const head = sql.slice(0, fromOffset).replace(/\s+$/, '')
  return `${head}, ${idExpr} ${sql.slice(fromOffset)}`
}
