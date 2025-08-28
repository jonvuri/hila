import type { SqlResult as SqlResultCore } from '../core/sql-types'

export type SqlResult = SqlResultCore

export type SqlQueryState = {
  result: SqlResult | null
  error: Error | null
}
