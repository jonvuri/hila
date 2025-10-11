// Outgoing side of the SQL client interface. Sends messages to the worker
// that will resolve the promises once results are available.

import type { SqlObserver, ExecuteMessage } from '../sql-types'

import { postMessage } from './worker-client'
import { pendingExecs, subscribedObservers } from './sql-client-promises'

const trimSql = (sql: string) => {
  return sql.trim().replace(/\s+/g, ' ')
}

export const addObserver = (sql: string, observer: SqlObserver) => {
  const observersForSql = subscribedObservers.get(sql)

  if (observersForSql) {
    observersForSql.add(observer)
  } else {
    // No observers yet, create new observer pool and subscribe
    subscribedObservers.set(sql, new Set([observer]))
  }

  postMessage({ type: 'subscribe', sql })
}

export const removeObserver = (sql: string, observer: SqlObserver) => {
  const observersForSql = subscribedObservers.get(sql)

  if (observersForSql) {
    observersForSql.delete(observer)

    if (observersForSql.size === 0) {
      // No observers left, unsubscribe
      subscribedObservers.delete(sql)
      postMessage({ type: 'unsubscribe', sql })
    }
  } else {
    throw new Error(
      `Tried to remove observer, but no observers were found for SQL: ${trimSql(sql)}`,
    )
  }
}

export const execQuery = (sql: string) =>
  new Promise<void>((resolve, reject) => {
    const id = crypto.randomUUID()
    pendingExecs.set(id, { resolve, reject })
    const message: ExecuteMessage = { type: 'execute', id, sql }
    postMessage(message)
  })
