import type { GatherObserver, GatherSpec, Sql, SqlObserver, SqlResult } from '../sql-types'

export const subscribedObservers: Map<Sql, Set<SqlObserver>> = new Map()

export const pendingExecs: Map<
  string,
  { resolve: (result: SqlResult) => void; reject: (err: unknown) => void }
> = new Map()

// Phase 9.7 Stage C2 — gather subscriptions, keyed by the serialized spec.
// `spec` is retained so a resubscribe (e.g. a fresh observer for the same key)
// can re-send it to the worker.
export const gatherObservers: Map<
  string,
  { spec: GatherSpec; observers: Set<GatherObserver> }
> = new Map()
