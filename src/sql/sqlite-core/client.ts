import type { ClientMessage, WorkerMessage, Sql, SqlObserver } from './types'

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })

const post = (message: ClientMessage) => {
  worker.postMessage(message)
}

const trimSql = (sql: string) => {
  return sql.trim().replace(/\s+/g, ' ')
}

const subscribedObservers: Map<Sql, Set<SqlObserver>> = new Map()

export const addObserver = (sql: string, observer: SqlObserver) => {
  const observersForSql = subscribedObservers.get(sql)

  if (observersForSql) {
    observersForSql.add(observer)
  } else {
    // No observers yet, create new observer pool and subscribe
    subscribedObservers.set(sql, new Set([observer]))
  }

  post({ type: 'subscribe', sql })
}

export const removeObserver = (sql: string, observer: SqlObserver) => {
  const observersForSql = subscribedObservers.get(sql)

  if (observersForSql) {
    observersForSql.delete(observer)

    if (observersForSql.size === 0) {
      // No observers left, unsubscribe
      subscribedObservers.delete(sql)
      post({ type: 'unsubscribe', sql })
    }
  } else {
    throw new Error(
      `Tried to remove observer, but no observers were found for SQL: ${trimSql(sql)}`,
    )
  }
}

worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type } = event.data

  switch (type) {
    case 'subscribeResult': {
      const { sql } = event.data
      const observers = subscribedObservers.get(sql)
      if (observers) {
        for (const observer of observers) {
          observer(event.data.result, null)
        }
      } else {
        throw new Error(`No observers for subscribe result of SQL: ${trimSql(sql)}`)
      }
      break
    }
    case 'subscribeError': {
      const { sql } = event.data
      const observers = subscribedObservers.get(sql)
      if (observers) {
        for (const observer of observers) {
          observer(null, event.data.error)
        }
      } else {
        throw new Error(`No observers for subscribe error of SQL: ${trimSql(sql)}`, {
          cause: event.data.error,
        })
      }
      break
    }
    case 'log': {
      console.log(event.data.message)
      break
    }
    case 'error': {
      console.error(event.data.error)
      break
    }
  }
}
