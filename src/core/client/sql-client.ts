// Outgoing side of the SQL client interface. Sends messages to the worker
// that will resolve the promises once results are available.

import type {
  SqlObserver,
  SqlResult,
  ExecuteMessage,
  GatherObserver,
  GatherSpec,
  SqlBindings,
  SqlQuery,
  SqlRequest,
} from '../sql-types'
import { gatherKey } from '../sql-types'

import { postMessage } from './worker-client'
import {
  pendingExecs,
  subscribedObservers,
  gatherObservers,
  lastOutcomeBySql,
  lastGatherOutcomeByKey,
  subscriptionKeysById,
} from './sql-client-promises'

const trimSql = (sql: string) => {
  return sql.trim().replace(/\s+/g, ' ')
}

export const normalizeSqlRequest = (request: SqlRequest): SqlQuery =>
  typeof request === 'string' ?
    { sql: request, bindings: [] }
  : { sql: request.sql, bindings: [...(request.bindings ?? [])] }

let nextSubscriptionId = 0

const bytesKey = (bytes: Uint8Array): string => {
  let result = ''
  for (const byte of bytes) result += byte.toString(16).padStart(2, '0')
  return result
}

const bindingKey = (value: SqlBindings[number]): string => {
  if (value === null) return 'null'
  if (typeof value === 'string') return `s:${JSON.stringify(value)}`
  if (typeof value === 'bigint') return `i:${value.toString()}`
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'n:nan'
    if (Object.is(value, -0)) return 'n:-0'
    return `n:${String(value)}`
  }
  if (value instanceof ArrayBuffer) return `b:${bytesKey(new Uint8Array(value))}`
  return `b:${bytesKey(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))}`
}

/** Stable only for exact-request pooling; the worker protocol uses opaque IDs. */
const normalizedSqlRequestKey = (query: SqlQuery): string => {
  const bindings = query.bindings ?? []
  if (bindings.length === 0) return `unbound:${query.sql}`
  return `bound:${query.sql.length}:${query.sql}|${bindings.map(bindingKey).join('|')}`
}

export const sqlRequestKey = (request: SqlRequest): string =>
  normalizedSqlRequestKey(normalizeSqlRequest(request))

export const addObserver = (request: SqlRequest, observer: SqlObserver) => {
  const query = normalizeSqlRequest(request)
  const key = normalizedSqlRequestKey(query)
  const existing = subscribedObservers.get(key)

  if (existing) {
    // Joining an existing pool. Don't re-subscribe: the worker would log a
    // duplicate-subscribe error and re-run the SQL for the whole pool. Instead
    // replay the last delivered outcome synchronously so a late joiner isn't
    // left blank until the next invalidation (the original late-joiner race).
    // Mirrors `addGatherObserver`'s post-once model.
    existing.observers.add(observer)
    const last = lastOutcomeBySql.get(key)
    if (last) observer(last.result, last.error)
  } else {
    // No observers yet: create the pool and subscribe.
    const subscriptionId = `sql-subscription-${nextSubscriptionId++}`
    subscribedObservers.set(key, { subscriptionId, query, observers: new Set([observer]) })
    subscriptionKeysById.set(subscriptionId, key)
    postMessage({
      type: 'subscribe',
      subscriptionId,
      sql: query.sql,
      bindings: query.bindings ?? [],
    })
  }
}

export const removeObserver = (request: SqlRequest, observer: SqlObserver) => {
  const query = normalizeSqlRequest(request)
  const key = normalizedSqlRequestKey(query)
  const existing = subscribedObservers.get(key)

  if (existing) {
    existing.observers.delete(observer)

    if (existing.observers.size === 0) {
      // No observers left, unsubscribe and drop the replay cache
      subscribedObservers.delete(key)
      subscriptionKeysById.delete(existing.subscriptionId)
      lastOutcomeBySql.delete(key)
      postMessage({ type: 'unsubscribe', subscriptionId: existing.subscriptionId })
    }
  } else {
    throw new Error(
      `Tried to remove observer, but no observers were found for SQL: ${trimSql(query.sql)}`,
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

const execute = (request: SqlRequest, mode: ExecuteMessage['mode']) =>
  new Promise<SqlResult>((resolve, reject) => {
    const query = normalizeSqlRequest(request)
    const id = crypto.randomUUID()
    pendingExecs.set(id, { resolve, reject })
    const message: ExecuteMessage = {
      type: 'execute',
      id,
      sql: query.sql,
      bindings: query.bindings ?? [],
      mode,
    }
    postMessage(message)
  })

export const execQuery = (request: SqlRequest) => execute(request, 'query')

/** Deliberate development-system edge. Allows mutation SQL and returns rows. */
export const execDevelopmentSql = (request: SqlRequest) => execute(request, 'mutation')

export const execMutation = async (request: SqlRequest): Promise<void> => {
  await execDevelopmentSql(request)
}
