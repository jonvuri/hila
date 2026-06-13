// Range-aware reactive invalidation (Phase 8b §4).
//
// Replaces the table-grained "any write to table X fires all subscriptions
// reading X" approach for the structural tables (scroll_index, closure, joins).
// A structural edit emits a DirtySet describing the affected key ranges and
// node identities; each subscription carries a SubscriptionScope; only
// overlapping subscriptions recompute.
//
// Non-structural tables (mx_N_data, matrix, matrix_columns, etc.) continue to
// use table-grained invalidation unchanged.

// -- Scope inference from SQL (AST-based via sqlite3-parser) ------------------

import { parseStmt, traverse } from 'sqlite3-parser'

export const STRUCTURAL_TABLES = new Set(['scroll_index', 'closure', 'joins'])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AstNode = any

/**
 * Extract the set of table names read by a SQL statement via AST traversal.
 * Handles JOINs, subqueries, CTEs, and correlated subqueries by collecting
 * all `TableSelectTable` nodes (the sqlite3-parser AST node for table
 * references in FROM/JOIN clauses), then excluding CTE-defined names.
 */
export const tablesVisitedBySql = (sql: string): Set<string> => {
  const result = parseStmt(sql, { allowTrailing: true })
  if (result.status !== 'ok') return new Set()

  const cteNames = new Set<string>()
  const tables = new Set<string>()

  traverse(result.root as AstNode, {
    nodes: {
      CommonTableExpr(node: AstNode) {
        const name: string | undefined = node.tblName?.text
        if (name) {
          cteNames.add(name.toLowerCase())
        }
      },
      TableSelectTable(node: AstNode) {
        const tableName: string | undefined = node.tblName?.objName?.text
        if (tableName) {
          tables.add(tableName.toLowerCase())
        }
        return 'skip'
      },
    },
  })

  for (const cte of cteNames) {
    tables.delete(cte)
  }

  return tables
}

// -- Types --------------------------------------------------------------------

export type KeyRange = {
  matrixId: number
  low: Uint8Array | null // null = beginning of the key space
  high: Uint8Array | null // null = end of the key space
}

export type NodeId = { matrixId: number; rowId: number }

export type DirtySet = {
  scrollRanges: KeyRange[]
  closureNodes: NodeId[]
}

export type StructuralScope = {
  // null = the scope spans the whole global forest (the Phase 9.1 unified
  // outline reads `scroll_index` without a `matrix_id` filter). Overlap is then
  // decided by the global `global_lexkey` range alone.
  matrixId: number | null
  keyLow: Uint8Array | null
  keyHigh: Uint8Array | null
  closureNodeIds?: NodeId[]
  readsClosure: boolean
}

export type SubscriptionScope = {
  dataTables: Set<string>
  structuralTables: Set<string>
  structural?: StructuralScope
}

/**
 * Infer the subscription's scope from its SQL and the tables it reads.
 * Uses sqlite3-parser's LALR(1) AST walk to extract structural scope
 * (matrix filter, key range, closure nodes) robustly — handles aliases,
 * blob literals, and expression nesting correctly regardless of formatting.
 */
export const inferScope = (sql: string, tables: Set<string>): SubscriptionScope => {
  const dataTables = new Set<string>()
  const structuralTables = new Set<string>()

  for (const table of tables) {
    if (STRUCTURAL_TABLES.has(table)) {
      structuralTables.add(table)
    } else {
      dataTables.add(table)
    }
  }

  let structural: StructuralScope | undefined

  if (structuralTables.has('scroll_index') || structuralTables.has('closure')) {
    structural = extractStructuralScope(sql, structuralTables)
  }

  return { dataTables, structuralTables, structural }
}

/**
 * Parse the SQL and walk the AST to extract structural scope metadata.
 * Returns undefined if the SQL can't be parsed or doesn't contain
 * recognizable scope patterns (safe fallback to table-grained).
 */
const extractStructuralScope = (
  sql: string,
  structuralTables: Set<string>,
): StructuralScope | undefined => {
  const result = parseStmt(sql, { allowTrailing: true })
  if (result.status !== 'ok') return undefined

  // Build alias → table mapping from the FROM/JOIN clauses.
  const aliasToTable = new Map<string, string>()
  traverse(result.root as AstNode, {
    nodes: {
      TableSelectTable(node: AstNode) {
        const tableName: string | undefined = node.tblName?.objName?.text
        const aliasName: string | undefined = node.alias?.name?.text

        if (tableName) {
          const lower = tableName.toLowerCase()
          if (aliasName) {
            aliasToTable.set(aliasName.toLowerCase(), lower)
          } else {
            aliasToTable.set(lower, lower)
          }
        }
        return 'skip'
      },
    },
  })

  // Walk WHERE clauses collecting comparisons on structural columns.
  let matrixId: number | undefined
  let keyLow: Uint8Array | null = null
  let keyHigh: Uint8Array | null = null
  const closureNodeIds: NodeId[] = []
  let closureMatrixId: number | undefined
  const closureRowIds: number[] = []

  const resolveTable = (alias: string): string | undefined =>
    aliasToTable.get(alias.toLowerCase())

  const isStructuralAlias = (alias: string): boolean => {
    const table = resolveTable(alias)
    return table !== undefined && STRUCTURAL_TABLES.has(table)
  }

  traverse(result.root as AstNode, {
    nodes: {
      BinaryExpr(node: AstNode) {
        const op: string = node.op
        const left: AstNode = node.left
        const right: AstNode = node.right

        if (!left || !right) return

        if (left.type === 'QualifiedExpr' && isStructuralAlias(left.table.text)) {
          const column: string = left.column.text.toLowerCase()
          const tableAlias: string = left.table.text.toLowerCase()
          const table = resolveTable(tableAlias)

          if (table === 'scroll_index' && column === 'matrix_id' && op === 'Equals') {
            if (right.type === 'NumericLiteral') {
              matrixId = parseInt(right.value, 10)
            }
          }

          if (table === 'scroll_index' && column === 'global_lexkey') {
            if ((op === 'GreaterEquals' || op === 'Greater') && right.type === 'BlobLiteral') {
              keyLow = new Uint8Array(right.bytes)
            }
            if ((op === 'Less' || op === 'LessEquals') && right.type === 'BlobLiteral') {
              keyHigh = new Uint8Array(right.bytes)
            }
          }

          if (table === 'closure' && column === 'descendant_matrix_id' && op === 'Equals') {
            if (right.type === 'NumericLiteral') {
              closureMatrixId = parseInt(right.value, 10)
            }
          }
        }
      },

      InListExpr(node: AstNode) {
        const lhs: AstNode = node.lhs
        const rhs: AstNode[] | undefined = node.rhs

        if (lhs?.type === 'QualifiedExpr') {
          const tableAlias: string = lhs.table.text.toLowerCase()
          const column: string = lhs.column.text.toLowerCase()
          const table = resolveTable(tableAlias)

          if (table === 'closure' && column === 'descendant_row_id' && rhs) {
            for (const item of rhs) {
              if (item.type === 'NumericLiteral') {
                closureRowIds.push(parseInt(item.value, 10))
              }
            }
          }
        }
        return 'skip'
      },
    },
  })

  const readsScroll = structuralTables.has('scroll_index')

  // Bail to table-grained only when we learned nothing useful. A query over
  // `scroll_index` always yields a structural scope (matrix-agnostic when there
  // is no `matrix_id` filter — the global Phase 9.1 outline), so range overlap
  // can still discriminate it.
  if (matrixId === undefined && closureMatrixId === undefined && !readsScroll) {
    return undefined
  }

  // Resolve closure node IDs from the collected matrix + row IDs.
  if (closureMatrixId !== undefined && closureRowIds.length > 0) {
    for (const rowId of closureRowIds) {
      closureNodeIds.push({ matrixId: closureMatrixId, rowId })
    }
  }

  return {
    matrixId: matrixId ?? closureMatrixId ?? null,
    keyLow,
    keyHigh,
    closureNodeIds: closureNodeIds.length > 0 ? closureNodeIds : undefined,
    readsClosure: structuralTables.has('closure'),
  }
}

// -- Overlap checking ---------------------------------------------------------

const compareKeys = (a: Uint8Array, b: Uint8Array): number => {
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    if (a[i]! < b[i]!) return -1
    if (a[i]! > b[i]!) return 1
  }
  return a.length - b.length
}

const rangesOverlap = (dirty: KeyRange, scope: StructuralScope): boolean => {
  // A null scope matrix spans the whole forest; discriminate by key range only.
  if (scope.matrixId !== null && dirty.matrixId !== scope.matrixId) return false

  // If scope has no bounds, any key in this matrix overlaps.
  if (!scope.keyLow && !scope.keyHigh) return true

  // If dirty has no bounds (full range), it overlaps any scope.
  if (!dirty.low && !dirty.high) return true

  // Closed-interval overlap: dirty.low <= scope.high AND dirty.high >= scope.low.
  // Dirty ranges are emitted as points (low == high), so half-open semantics
  // would make every point-range empty. Scope bounds are already exclusive on
  // the high end (the focus-root `<` bound), so closed comparison is correct.
  const dirtyLowBeforeScopeHigh =
    !scope.keyHigh || !dirty.low || compareKeys(dirty.low, scope.keyHigh) <= 0
  const dirtyHighAfterScopeLow =
    !scope.keyLow || !dirty.high || compareKeys(dirty.high, scope.keyLow) >= 0

  return dirtyLowBeforeScopeHigh && dirtyHighAfterScopeLow
}

/**
 * Does a dirty set overlap a subscription's structural scope?
 */
export const overlaps = (dirty: DirtySet, scope: StructuralScope): boolean => {
  // Check scroll key ranges.
  for (const range of dirty.scrollRanges) {
    if (rangesOverlap(range, scope)) return true
  }

  // Check closure nodes only if the subscription actually reads the closure
  // table. Outline queries reading scroll_index + joins don't need closure
  // invalidation.
  if (scope.readsClosure) {
    if (scope.closureNodeIds && scope.closureNodeIds.length > 0) {
      for (const dirtyNode of dirty.closureNodes) {
        for (const scopeNode of scope.closureNodeIds) {
          if (
            dirtyNode.matrixId === scopeNode.matrixId &&
            dirtyNode.rowId === scopeNode.rowId
          ) {
            return true
          }
        }
      }
    } else if (dirty.closureNodes.length > 0) {
      // Scope reads closure without specific node filtering for this matrix —
      // any closure change in the same matrix triggers.
      for (const node of dirty.closureNodes) {
        if (node.matrixId === scope.matrixId) return true
      }
    }
  }

  return false
}

// -- Dirty set accumulator (coalescing within a microtask) --------------------

let pendingDirtySet: DirtySet | null = null
let flushCallback: (() => void) | null = null

export const setPendingFlushCallback = (cb: () => void): void => {
  flushCallback = cb
}

export const emitStructuralDirty = (dirty: DirtySet): void => {
  if (pendingDirtySet) {
    pendingDirtySet.scrollRanges.push(...dirty.scrollRanges)
    pendingDirtySet.closureNodes.push(...dirty.closureNodes)
  } else {
    pendingDirtySet = {
      scrollRanges: [...dirty.scrollRanges],
      closureNodes: [...dirty.closureNodes],
    }
  }
  if (flushCallback) flushCallback()
}

export const consumePendingDirtySet = (): DirtySet | null => {
  const ds = pendingDirtySet
  pendingDirtySet = null
  return ds
}

/**
 * Determine whether a subscription should recompute given the written tables
 * and the structural dirty set (if any).
 *
 * Key design: when a structural dirty set is present and the subscription has
 * a structural scope, ALL writes (including to co-located data tables) are
 * subsumed by the structural overlap check. The reasoning: a structural op's
 * data write (e.g. inserting a row in mx_N_data) is always co-located with
 * its structural write. If the structural range doesn't overlap the
 * subscription's scope, the new row isn't in its window anyway.
 */
export const shouldRecompute = (
  scope: SubscriptionScope,
  writtenTables: Set<string>,
  dirty: DirtySet | null,
): boolean => {
  // When a dirty set is present and the subscription has a structural scope,
  // structural overlap is the primary check. If the structural dirty set does
  // not cover the subscription's matrix at all (the op was in a different
  // matrix), data-table writes are checked independently — they may be
  // non-co-located side effects (e.g. reverse inlineref cleanup writes to
  // a host matrix's data table during a cross-matrix cascade delete).
  if (dirty && scope.structural) {
    if (overlaps(dirty, scope.structural)) return true
    const structuralCoversThisMatrix =
      scope.structural.matrixId === null ||
      dirty.scrollRanges.some((r) => r.matrixId === scope.structural!.matrixId)
    if (!structuralCoversThisMatrix) {
      for (const table of scope.dataTables) {
        if (writtenTables.has(table)) return true
      }
    }
    return false
  }

  // No structural scope but dirty set present: conservative fallback for
  // subscriptions that read structural tables without a parseable scope.
  if (dirty && !scope.structural && scope.structuralTables.size > 0) {
    for (const table of scope.structuralTables) {
      if (writtenTables.has(table)) return true
    }
    // Also check data tables (they may be independently relevant).
    for (const table of scope.dataTables) {
      if (writtenTables.has(table)) return true
    }
    return false
  }

  // No dirty set (non-structural op): pure table-grained for everything.
  for (const table of scope.dataTables) {
    if (writtenTables.has(table)) return true
  }
  for (const table of scope.structuralTables) {
    if (writtenTables.has(table)) return true
  }

  return false
}
