import type { ColumnDefinition } from '../core/matrix'

import { compileFormula } from './formula'

export { compileFormula, parseFormulaRefs } from './formula'

export type SortConfig = {
  columnId: number
  direction: 'ASC' | 'DESC'
}

export type FilterOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'NOT LIKE'

export type FilterConfig = {
  columnId: number
  operator: FilterOperator
  value: string
}

export const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`

const escapeString = (value: string): string => `'${value.replace(/'/g, "''")}'`

/**
 * Build a SQL query for the table face. Resolves column IDs to names via
 * the provided columns array.
 */
export const buildTableQuery = (
  matrixId: number,
  sort: SortConfig | null,
  filters: FilterConfig[],
  columns: ColumnDefinition[],
): string => {
  const nameById = new Map(columns.map((c) => [c.id, c.name]))
  const formulaCols = columns.filter((c) => c.formula !== null)

  let selectClause: string
  if (formulaCols.length > 0) {
    const extras = formulaCols
      .map((c) => {
        const compiled = compileFormula(c.formula!, columns)
        return `(${compiled}) AS ${quoteIdent(c.name)}`
      })
      .join(', ')
    selectClause = `SELECT *, ${extras} FROM "mx_${matrixId}_data"`
  } else {
    selectClause = `SELECT * FROM "mx_${matrixId}_data"`
  }

  let query = selectClause

  if (filters.length > 0) {
    const clauses = filters
      .map((f) => {
        const colName = nameById.get(f.columnId)
        if (!colName) return null
        const col = quoteIdent(colName)
        const val = escapeString(f.value)
        if (f.operator === 'LIKE' || f.operator === 'NOT LIKE') {
          return `${col} ${f.operator} '%' || ${val} || '%'`
        }
        return `${col} ${f.operator} ${val}`
      })
      .filter((c): c is string => c !== null)
    if (clauses.length > 0) {
      query += ` WHERE ${clauses.join(' AND ')}`
    }
  }

  if (sort) {
    const sortColName = nameById.get(sort.columnId)
    if (sortColName) {
      query += ` ORDER BY ${quoteIdent(sortColName)} ${sort.direction}`
    }
  }

  return query
}

export const FILTER_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: '=', label: 'equals' },
  { value: '!=', label: 'not equals' },
  { value: '>', label: 'greater than' },
  { value: '<', label: 'less than' },
  { value: '>=', label: 'at least' },
  { value: '<=', label: 'at most' },
  { value: 'LIKE', label: 'contains' },
  { value: 'NOT LIKE', label: 'does not contain' },
]
