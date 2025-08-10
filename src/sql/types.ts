import type { SqlResult as SqlResultCore } from './sqlite-core/types'

export type SqlResult = SqlResultCore

export type SqlQueryState = {
  result: SqlResult | null
  error: Error | null
}
