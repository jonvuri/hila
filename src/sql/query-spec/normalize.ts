import type { ColumnDefinition } from '../../core/matrix'
import { parseSingleStatement, type SqlAstNode } from '../sql-statement'

import {
  physicalTextRoleColumns,
  resolveCatalogColumn,
  resolveCatalogMatrix,
  resolveCatalogNode,
  type QueryCatalog,
} from './catalog'
import {
  QuerySpecError,
  type NormalizedQuerySpec,
  type QueryPredicate,
  type QueryScalar,
  type QuerySpec,
} from './types'

const INT64_MIN = -(1n << 63n)
const INT64_MAX = (1n << 63n) - 1n

export type SqliteAffinity = 'integer' | 'text' | 'blob' | 'real' | 'numeric' | 'any'

export const sqliteAffinity = (declaredType: string): SqliteAffinity => {
  const type = declaredType.toUpperCase()
  if (type === 'ANY') return 'any'
  if (type.includes('INT')) return 'integer'
  if (type.includes('CHAR') || type.includes('CLOB') || type.includes('TEXT')) return 'text'
  if (type === '' || type.includes('BLOB')) return 'blob'
  if (type.includes('REAL') || type.includes('FLOA') || type.includes('DOUB')) return 'real'
  return 'numeric'
}

const assertPositiveSafeInteger = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new QuerySpecError('invalid-id', `${label} must be a positive safe integer`)
  }
}

const normalizeBigint = (value: bigint): number | bigint => {
  if (value < INT64_MIN || value > INT64_MAX) {
    throw new QuerySpecError('invalid-value', 'Integer value is outside SQLite int64 range')
  }
  return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER) ?
      Number(value)
    : value
}

const normalizeNumber = (value: number): number => {
  if (!Number.isFinite(value)) {
    throw new QuerySpecError('invalid-value', 'Numeric predicate values must be finite')
  }
  return Object.is(value, -0) ? 0 : value
}

const normalizeScalar = (value: QueryScalar): QueryScalar => {
  if (typeof value === 'number') return normalizeNumber(value)
  if (typeof value === 'bigint') return normalizeBigint(value)
  if (value instanceof Uint8Array) return new Uint8Array(value)
  return value
}

const assertValueMatches = (column: ColumnDefinition, value: QueryScalar): void => {
  if (value === null) return
  const affinity = sqliteAffinity(column.type)
  const valid =
    affinity === 'any' ||
    (affinity === 'text' && typeof value === 'string') ||
    (affinity === 'blob' && value instanceof Uint8Array) ||
    (affinity === 'real' && typeof value === 'number') ||
    (affinity === 'numeric' && (typeof value === 'number' || typeof value === 'bigint')) ||
    (affinity === 'integer' &&
      ((typeof value === 'number' && Number.isSafeInteger(value)) || typeof value === 'bigint'))
  if (!valid) {
    throw new QuerySpecError(
      'invalid-value',
      `Value does not match ${column.name}'s ${affinity} affinity`,
    )
  }
}

const normalizePredicate = (
  predicate: QueryPredicate,
  matrix: ReturnType<typeof resolveCatalogMatrix>,
): QueryPredicate => {
  if (predicate.type === 'opaque') {
    if (predicate.sql.trim() === '') {
      throw new QuerySpecError('empty-opaque-leaf', 'Opaque WHERE leaves cannot be blank')
    }
    const parsed = parseSingleStatement(`SELECT 1 WHERE (${predicate.sql})`)
    if (!parsed.ok) {
      throw new QuerySpecError(
        'invalid-opaque-leaf',
        `Opaque WHERE leaf is not one valid expression: ${parsed.message}`,
      )
    }

    let parameter: string | null = null
    const visit = (value: unknown): void => {
      if (parameter !== null || value === null || typeof value !== 'object') return
      if (Array.isArray(value)) {
        for (const child of value) visit(child)
        return
      }
      const node = value as SqlAstNode
      if (node.type === 'VariableExpr') {
        parameter = String(node.name)
        return
      }
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (key !== 'span') visit(child)
      }
    }
    visit(parsed.statement.root?.body?.select?.whereClause)
    if (parameter !== null) {
      throw new QuerySpecError(
        'invalid-opaque-leaf',
        `Opaque WHERE leaves cannot contain SQL parameter ${parameter}`,
      )
    }
    return { ...predicate }
  }

  assertPositiveSafeInteger(predicate.columnId, 'Column ID')
  const column = resolveCatalogColumn(matrix, predicate.columnId)
  if (column.formula !== null) {
    throw new QuerySpecError('formula-column', `Formula column ${column.name} is not queryable`)
  }

  if (predicate.op === 'contains' || predicate.op === 'empty' || predicate.op === 'notEmpty') {
    if (sqliteAffinity(column.type) !== 'text') {
      throw new QuerySpecError(
        'unsupported-operator',
        `${predicate.op} requires a text-affinity column`,
      )
    }
  }

  if (predicate.op === 'empty' || predicate.op === 'notEmpty') return { ...predicate }
  if (!('value' in predicate)) {
    throw new QuerySpecError('unsupported-operator', `Unsupported operator ${predicate.op}`)
  }

  const value = normalizeScalar(predicate.value)
  if (value === null && predicate.op !== 'eq' && predicate.op !== 'neq') {
    throw new QuerySpecError('invalid-value', 'NULL is valid only with eq or neq')
  }
  assertValueMatches(column, value)
  return { ...predicate, value }
}

export const normalizeQuerySpec = (
  input: QuerySpec,
  catalog: QueryCatalog,
): NormalizedQuerySpec => {
  if (!Number.isSafeInteger(input.limit) || input.limit <= 0) {
    throw new QuerySpecError('invalid-limit', 'Limit must be a positive safe integer')
  }
  if (input.kind.type !== 'matrix') {
    throw new QuerySpecError(
      'unsupported-kind',
      `${input.kind.type} cannot be compiled by the concrete-matrix v1 dialect`,
    )
  }
  assertPositiveSafeInteger(input.kind.matrixId, 'Matrix ID')
  const matrix = resolveCatalogMatrix(catalog, input.kind.matrixId)

  if (input.scope.type === 'node') {
    assertPositiveSafeInteger(input.scope.matrixId, 'Scope matrix ID')
    assertPositiveSafeInteger(input.scope.rowId, 'Scope row ID')
    resolveCatalogNode(catalog, input.scope)
  }

  if (input.text !== '' && physicalTextRoleColumns(matrix).length === 0) {
    throw new QuerySpecError(
      'no-text-columns',
      `Matrix ${matrix.id} has no physical text roles`,
    )
  }

  let order: NormalizedQuerySpec['order'] = { type: 'natural' }
  if (input.order.type === 'column') {
    assertPositiveSafeInteger(input.order.columnId, 'Order column ID')
    const column = resolveCatalogColumn(matrix, input.order.columnId)
    if (column.formula !== null) {
      throw new QuerySpecError(
        'formula-column',
        `Formula column ${column.name} cannot order a query`,
      )
    }
    order = { ...input.order }
  }

  return {
    kind: { ...input.kind },
    scope: { ...input.scope },
    text: input.text,
    where: input.where.map((predicate) => normalizePredicate(predicate, matrix)),
    order,
    limit: input.limit,
  }
}
