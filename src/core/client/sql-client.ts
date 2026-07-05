// Outgoing side of the SQL client interface. Sends messages to the worker
// that will resolve the promises once results are available.

import type {
  SqlObserver,
  SqlResult,
  ExecuteMessage,
  GatherObserver,
  GatherSpec,
} from '../sql-types'
import { gatherKey } from '../sql-types'

import { postMessage } from './worker-client'
import {
  pendingExecs,
  subscribedObservers,
  gatherObservers,
  lastOutcomeBySql,
  lastGatherOutcomeByKey,
} from './sql-client-promises'

const trimSql = (sql: string) => {
  return sql.trim().replace(/\s+/g, ' ')
}

export const addObserver = (sql: string, observer: SqlObserver) => {
  const observersForSql = subscribedObservers.get(sql)

  if (observersForSql) {
    // Joining an existing pool. Don't re-subscribe: the worker would log a
    // duplicate-subscribe error and re-run the SQL for the whole pool. Instead
    // replay the last delivered outcome synchronously so a late joiner isn't
    // left blank until the next invalidation (the original late-joiner race).
    // Mirrors `addGatherObserver`'s post-once model.
    observersForSql.add(observer)
    const last = lastOutcomeBySql.get(sql)
    if (last) observer(last.result, last.error)
  } else {
    // No observers yet: create the pool and subscribe.
    subscribedObservers.set(sql, new Set([observer]))
    postMessage({ type: 'subscribe', sql })
  }
}

export const removeObserver = (sql: string, observer: SqlObserver) => {
  const observersForSql = subscribedObservers.get(sql)

  if (observersForSql) {
    observersForSql.delete(observer)

    if (observersForSql.size === 0) {
      // No observers left, unsubscribe and drop the replay cache
      subscribedObservers.delete(sql)
      lastOutcomeBySql.delete(sql)
      postMessage({ type: 'unsubscribe', sql })
    }
  } else {
    throw new Error(
      `Tried to remove observer, but no observers were found for SQL: ${trimSql(sql)}`,
    )
  }
}

// -- Gather subscriptions (Phase 9.7 Stage C2) -------------------------------

export const addGatherObserver = (spec: GatherSpec, observer: GatherObserver) => {
  const key = gatherKey(spec)
  const existing = gatherObservers.get(key)
  if (existing) {
    // Joining an existing pool: the worker won't re-run (we don't re-post
    // subscribeGather), so replay the last outcome synchronously — the twin of
    // addObserver's late-joiner replay.
    existing.observers.add(observer)
    const last = lastGatherOutcomeByKey.get(key)
    if (last) observer(last.result, last.error)
  } else {
    gatherObservers.set(key, { spec, observers: new Set([observer]) })
    postMessage({ type: 'subscribeGather', key, spec })
  }
}

export const removeGatherObserver = (spec: GatherSpec, observer: GatherObserver) => {
  const key = gatherKey(spec)
  const entry = gatherObservers.get(key)
  if (!entry) return
  entry.observers.delete(observer)
  if (entry.observers.size === 0) {
    gatherObservers.delete(key)
    lastGatherOutcomeByKey.delete(key)
    postMessage({ type: 'unsubscribeGather', key })
  }
}

export const execQuery = (sql: string) =>
  new Promise<SqlResult>((resolve, reject) => {
    const id = crypto.randomUUID()
    pendingExecs.set(id, { resolve, reject })
    const message: ExecuteMessage = { type: 'execute', id, sql }
    postMessage(message)
  })

export const execMutation = async (sql: string): Promise<void> => {
  await execQuery(sql)
}
