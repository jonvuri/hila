import type { SqlValue } from '@sqlite.org/sqlite-wasm'

import { quoteSqlIdentifier } from '../sql-statement'

import {
  physicalTextRoleColumns,
  resolveCatalogColumn,
  resolveCatalogMatrix,
  type QueryCatalog,
  type QueryCatalogMatrix,
} from './catalog'
import { normalizeQuerySpec } from './normalize'
import type {
  CompiledQuerySpec,
  NormalizedQuerySpec,
  QueryPredicate,
  QueryScalar,
  QuerySpec,
} from './types'

export type ValueRenderer = (value: QueryScalar) => string

const columnSql = (name: string): string => `d.${quoteSqlIdentifier(name)}`

export const escapeLikeText = (value: string): string =>
  value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')

export const renderScopeTerm = (
  spec: NormalizedQuerySpec,
  renderValue: ValueRenderer,
): string | null => {
  if (spec.scope.type === 'all' || spec.kind.type !== 'matrix') return null

  const resultMatrix = renderValue(spec.kind.matrixId)
  const scopeMatrix = renderValue(spec.scope.matrixId)
  const scopeRow = renderValue(spec.scope.rowId)
  return `(EXISTS (
    SELECT 1
    FROM joins AS j
    WHERE j.target_matrix_id = ${resultMatrix}
      AND j.target_row_id = d.id
      AND j.kind = 'own'
      AND (
        (j.source_matrix_id = ${scopeMatrix} AND j.source_row_id = ${scopeRow})
        OR EXISTS (
          SELECT 1
          FROM closure AS c
          WHERE c.ancestor_matrix_id = ${scopeMatrix}
            AND c.ancestor_row_id = ${scopeRow}
            AND c.descendant_matrix_id = j.source_matrix_id
            AND c.descendant_row_id = j.source_row_id
        )
      )
  ))`
}

export const renderTextTerm = (
  spec: NormalizedQuerySpec,
  matrix: QueryCatalogMatrix,
  renderValue: ValueRenderer,
): string | null => {
  if (spec.text === '') return null
  const pattern = renderValue(`%${escapeLikeText(spec.text)}%`)
  const terms = physicalTextRoleColumns(matrix).map(
    (column) => `CAST(${columnSql(column.name)} AS TEXT) LIKE ${pattern} ESCAPE '\\'`,
  )
  return `(${terms.join(' OR ')})`
}

export const renderPredicateTerm = (
  predicate: QueryPredicate,
  matrix: QueryCatalogMatrix,
  renderValue: ValueRenderer,
): string => {
  if (predicate.type === 'opaque') return `(${predicate.sql})`

  const column = resolveCatalogColumn(matrix, predicate.columnId)
  const lhs = columnSql(column.name)
  if (predicate.op === 'empty') return `(${lhs} IS NULL OR ${lhs} = '')`
  if (predicate.op === 'notEmpty') return `(${lhs} IS NOT NULL AND ${lhs} != '')`
  if (!('value' in predicate)) throw new Error(`Unhandled predicate operator: ${predicate.op}`)
  if (predicate.value === null) return `${lhs} IS${predicate.op === 'neq' ? ' NOT' : ''} NULL`
  if (predicate.op === 'contains') {
    return `${lhs} LIKE ${renderValue(`%${escapeLikeText(String(predicate.value))}%`)} ESCAPE '\\'`
  }

  const operators = {
    eq: '=',
    neq: '!=',
    lt: '<',
    lte: '<=',
    gt: '>',
    gte: '>=',
  } as const
  return `${lhs} ${operators[predicate.op]} ${renderValue(predicate.value)}`
}

export const renderNormalizedQuerySpec = (
  spec: NormalizedQuerySpec,
  catalog: QueryCatalog,
  renderValue: ValueRenderer,
): string => {
  if (spec.kind.type !== 'matrix') throw new Error('Normalized query kind must be a matrix')
  const matrix = resolveCatalogMatrix(catalog, spec.kind.matrixId)
  const terms: string[] = []
  const scope = renderScopeTerm(spec, renderValue)
  if (scope) terms.push(scope)
  const text = renderTextTerm(spec, matrix, renderValue)
  if (text) terms.push(text)
  terms.push(
    ...spec.where.map((predicate) => renderPredicateTerm(predicate, matrix, renderValue)),
  )

  let orderSql = 'd.id ASC'
  if (spec.order.type === 'column') {
    const column = resolveCatalogColumn(matrix, spec.order.columnId)
    orderSql = `${columnSql(column.name)} ${spec.order.direction.toUpperCase()}, d.id ASC`
  }

  return [
    'SELECT d.*',
    `FROM ${quoteSqlIdentifier(matrix.tableName)} AS d`,
    terms.length > 0 ? `WHERE ${terms.join('\n  AND ')}` : null,
    `ORDER BY ${orderSql}`,
    `LIMIT ${renderValue(spec.limit)}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}

export const compileQuerySpec = (
  input: QuerySpec,
  catalog: QueryCatalog,
): CompiledQuerySpec => {
  const spec = normalizeQuerySpec(input, catalog)
  const bindings: SqlValue[] = []
  const bind: ValueRenderer = (value) => {
    bindings.push(value)
    return `?${bindings.length}`
  }
  return {
    spec,
    plan: {
      template: renderNormalizedQuerySpec(spec, catalog, bind),
      bindings,
    },
  }
}
