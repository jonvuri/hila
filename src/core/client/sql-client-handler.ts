import type { SqlWorkerMessage } from '../sql-types'

import { pendingExecs, subscribedObservers } from './sql-client-promises'

const trimSql = (sql: string) => {
  return sql.trim().replace(/\s+/g, ' ')
}

export const handleSqlWorkerMessage = (message: SqlWorkerMessage) => {
  const { type } = message

  switch (type) {
    // Subscribed queries, that repeat and return new results when the underlying data changes
    case 'subscribeResult': {
      const { sql } = message
      const observers = subscribedObservers.get(sql)
      if (observers) {
        for (const observer of observers) {
          observer(message.result, null)
        }
      } else {
        throw new Error(`No observers for subscribe result of SQL: ${trimSql(sql)}`)
      }
      break
    }
    case 'subscribeError': {
      const { sql } = message
      const observers = subscribedObservers.get(sql)
      if (observers) {
        for (const observer of observers) {
          observer(null, message.error)
        }
      } else {
        throw new Error(`No observers for subscribe error of SQL: ${trimSql(sql)}`, {
          cause: message.error,
        })
      }
      break
    }

    // Executed queries, that run and return a result once
    case 'executeAck': {
      const { id } = message
      const resolver = pendingExecs.get(id)
      if (resolver) {
        resolver.resolve()
        pendingExecs.delete(id)
      }
      break
    }
    case 'executeError': {
      const { id, error } = message
      const resolver = pendingExecs.get(id)
      if (resolver) {
        resolver.reject(error)
        pendingExecs.delete(id)
      }
      break
    }
  }
}
