import type {
  GatherObserver,
  GatherResult,
  GatherSpec,
  Sql,
  SqlObserver,
  SqlResult,
} from '../sql-types'

export const subscribedObservers: Map<Sql, Set<SqlObserver>> = new Map()

// Last outcome (result or error) delivered per subscribed SQL. An observer that
// joins an already-subscribed pool no longer triggers a worker re-run, so its
// initial value is replayed synchronously from here (see `addObserver`). Cleared
// when the pool empties (see `removeObserver`); only written while a pool is live
// (see `handleSqlWorkerMessage`) so it can't outlive its subscription.
export const lastOutcomeBySql: Map<Sql, { result: SqlResult | null; error: Error | null }> =
  new Map()

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

// Last outcome delivered per gather key — the exact twin of `lastOutcomeBySql`
// for the gather RPC. A gather late joiner triggers no worker re-run (the client
// posts `subscribeGather` only when creating a pool), so its initial value is
// replayed synchronously from here (see `addGatherObserver`). Cleared when the
// pool empties; only written while a pool is live (see `handleSqlWorkerMessage`).
export const lastGatherOutcomeByKey: Map<
  string,
  { result: GatherResult | null; error: Error | null }
> = new Map()
