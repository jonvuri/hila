import type { ColumnDefinition } from '../core/matrix'

export type SortConfig = {
  column: string
  direction: 'ASC' | 'DESC'
}

export type FilterOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'NOT LIKE'

export type FilterConfig = {
  column: string
  operator: FilterOperator
  value: string
}

const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`

const escapeString = (value: string): string => `'${value.replace(/'/g, "''")}'`

export const buildTableQuery = (
  matrixId: number,
  sort: SortConfig | null,
  filters: FilterConfig[],
  columns?: ColumnDefinition[],
): string => {
  const formulaCols = columns?.filter((c) => c.formula !== null) ?? []

  let selectClause: string
  if (formulaCols.length > 0) {
    const extras = formulaCols.map((c) => `(${c.formula}) AS ${quoteIdent(c.name)}`).join(', ')
    selectClause = `SELECT *, ${extras} FROM "mx_${matrixId}_data"`
  } else {
    selectClause = `SELECT * FROM "mx_${matrixId}_data"`
  }

  let query = selectClause

  if (filters.length > 0) {
    const clauses = filters.map((f) => {
      const col = quoteIdent(f.column)
      const val = escapeString(f.value)
      if (f.operator === 'LIKE' || f.operator === 'NOT LIKE') {
        return `${col} ${f.operator} '%' || ${val} || '%'`
      }
      return `${col} ${f.operator} ${val}`
    })
    query += ` WHERE ${clauses.join(' AND ')}`
  }

  if (sort) {
    query += ` ORDER BY ${quoteIdent(sort.column)} ${sort.direction}`
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
