import type { Sql, SqlObserver } from '../sql-types'

export const subscribedObservers: Map<Sql, Set<SqlObserver>> = new Map()

export const pendingExecs: Map<
  string,
  { resolve: () => void; reject: (err: unknown) => void }
> = new Map()
