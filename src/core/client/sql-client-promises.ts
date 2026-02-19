import type { Sql, SqlObserver, SqlResult } from '../sql-types'

export const subscribedObservers: Map<Sql, Set<SqlObserver>> = new Map()

export const pendingExecs: Map<
  string,
  { resolve: (result: SqlResult) => void; reject: (err: unknown) => void }
> = new Map()
