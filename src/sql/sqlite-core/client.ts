import type { ClientMessage, WorkerMessage, Sql, SqlObserver, ExecuteMessage } from './types'

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })

let workerReady = false
const pendingMessages: ClientMessage[] = []

const flushPending = () => {
  if (!workerReady) return
  while (pendingMessages.length > 0) {
    const msg = pendingMessages.shift()
    worker.postMessage(msg)
  }
}

const post = (message: ClientMessage) => {
  if (workerReady) {
    worker.postMessage(message)
  } else {
    pendingMessages.push(message)
  }
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

const pendingExecs: Map<string, { resolve: () => void; reject: (err: unknown) => void }> =
  new Map()

export const execQuery = (sql: string) =>
  new Promise<void>((resolve, reject) => {
    const id = crypto.randomUUID()
    pendingExecs.set(id, { resolve, reject })
    const message: ExecuteMessage = { type: 'execute', id, sql }
    post(message as ClientMessage)
  })

worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type } = event.data

  switch (type) {
    // Fired once on startup, when the worker is initialized and ready to receive messages
    case 'ready': {
      workerReady = true
      flushPending()
      break
    }

    // Logging
    case 'log': {
      console.log(event.data.message)
      break
    }
    case 'error': {
      console.error(event.data.error)
      break
    }

    // Subscribed queries, that repeat and return new results when the underlying data changes
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

    // Executed queries, that run and return a result once
    case 'executeAck': {
      const { id } = event.data
      const resolver = pendingExecs.get(id)
      if (resolver) {
        resolver.resolve()
        pendingExecs.delete(id)
      }
      break
    }
    case 'executeError': {
      const { id, error } = event.data
      const resolver = pendingExecs.get(id)
      if (resolver) {
        resolver.reject(error)
        pendingExecs.delete(id)
      }
      break
    }
  }
}
