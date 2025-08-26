import type {
  SqlClientMessage,
  SqlWorkerMessage,
  Sql,
  SqlObserver,
  ExecuteMessage,
} from './sql-types'

// Message posting interface - will be injected by main client
type MessagePoster = (message: SqlClientMessage) => void

let postMessage: MessagePoster = () => {
  throw new Error('SQL client not initialized - postMessage not set')
}

export const initSqlClient = (poster: MessagePoster) => {
  postMessage = poster
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

const pendingExecs: Map<string, { resolve: () => void; reject: (err: unknown) => void }> =
  new Map()

export const execQuery = (sql: string) =>
  new Promise<void>((resolve, reject) => {
    const id = crypto.randomUUID()
    pendingExecs.set(id, { resolve, reject })
    const message: ExecuteMessage = { type: 'execute', id, sql }
    postMessage(message)
  })

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
