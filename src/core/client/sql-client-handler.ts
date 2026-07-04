// Incoming side of the SQL client interface. Handles the receiving of messages from the worker
// and resolves the promises once results are available.

import type { SqlWorkerMessage } from '../sql-types'

import { pendingExecs, subscribedObservers, gatherObservers } from './sql-client-promises'

export const handleSqlWorkerMessage = (message: SqlWorkerMessage) => {
  const { type } = message

  switch (type) {
    // Subscribed queries, that repeat and return new results when the underlying data changes
    case 'subscribeResult': {
      const { sql } = message
      const observers = subscribedObservers.get(sql)
      if (!observers) break
      for (const observer of observers) {
        observer(message.result, null)
      }
      break
    }
    case 'subscribeError': {
      const { sql } = message
      const observers = subscribedObservers.get(sql)
      if (!observers) break
      for (const observer of observers) {
        observer(null, message.error)
      }
      break
    }

    // Executed queries, that run and return a result once
    case 'executeResult': {
      const { id, result } = message
      const resolver = pendingExecs.get(id)
      if (resolver) {
        resolver.resolve(result)
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

    // Gather subscriptions (Phase 9.7 Stage C2 — inline block folding).
    case 'gatherResult': {
      const entry = gatherObservers.get(message.key)
      if (!entry) break
      for (const observer of entry.observers) observer(message.result, null)
      break
    }
    case 'gatherError': {
      const entry = gatherObservers.get(message.key)
      if (!entry) break
      for (const observer of entry.observers) observer(null, message.error)
      break
    }
  }
}
