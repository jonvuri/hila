import type { ColumnDefinition } from '../core/matrix'
import type { SqlQuery } from '../core/sql-types'
import { escapeLikeText } from '../sql/query-spec/compile'
import { matrixDataTableName } from '../sql/query-spec/catalog'
import { quoteSqlIdentifier } from '../sql/sql-statement'

export const DISTINCT_VALUE_LIMIT = 12

export const buildDistinctValuesRequest = (
  matrixId: number,
  column: ColumnDefinition,
  query: string,
): SqlQuery => {
  const value = quoteSqlIdentifier(column.name)
  return {
    sql: [
      `SELECT DISTINCT d.${value} AS value`,
      `FROM ${quoteSqlIdentifier(matrixDataTableName(matrixId))} AS d`,
      `WHERE d.${value} IS NOT NULL`,
      `  AND CAST(d.${value} AS TEXT) != ''`,
      `  AND CAST(d.${value} AS TEXT) LIKE ?1 ESCAPE '\\'`,
      'ORDER BY value',
      'LIMIT ?2',
    ].join('\n'),
    bindings: [`%${escapeLikeText(query)}%`, DISTINCT_VALUE_LIMIT],
  }
}
