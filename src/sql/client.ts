import { Observable } from 'rxjs'

import { createQuerySubject } from './querySubject'
import type { ClientMessage, WorkerMessage, SqlResult, QuerySubjectState } from './types'

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })

const post = (message: ClientMessage) => {
  worker.postMessage(message)
}

const trimSql = (sql: string) => {
  return sql.trim().replace(/\s+/g, ' ')
}

type Sql = string
type ObserveListener = (result: SqlResult | null, error: Error | null) => void

const subscribedObservers: Map<Sql, Set<ObserveListener>> = new Map()

const addObserveListener = (sql: string, listener: ObserveListener) => {
  const observersForSql = subscribedObservers.get(sql)

  if (observersForSql) {
    observersForSql.add(listener)
    console.log(`Added listener for SQL: ${trimSql(sql)}`)
  } else {
    // No listeners yet, create new listener pool and subscribe
    subscribedObservers.set(sql, new Set([listener]))
    console.log(`Created listener pool for SQL: ${trimSql(sql)}`)
  }

  post({ type: 'subscribe', sql })
}

const removeObserveListener = (sql: string, listener: ObserveListener) => {
  const observersForSql = subscribedObservers.get(sql)

  if (observersForSql) {
    observersForSql.delete(listener)

    if (observersForSql.size === 0) {
      // No listeners left, unsubscribe
      subscribedObservers.delete(sql)
      post({ type: 'unsubscribe', sql })
      console.log(`Removed listener pool for SQL: ${trimSql(sql)}`)
    } else {
      console.log(`Removed listener for SQL: ${trimSql(sql)}`)
    }
  } else {
    throw new Error(
      `Tried to remove listener, but no listeners were found for SQL: ${trimSql(sql)}`,
    )
  }
}

export const observeSql = (sql: string): Observable<QuerySubjectState> =>
  createQuerySubject((emitResult, emitError) => {
    console.log(`Creating query subject for SQL: ${trimSql(sql)}`)
    const listener: ObserveListener = (result, error) => {
      console.log(`Emitting result for SQL: ${trimSql(sql)}`, result, error)
      if (result !== null) {
        emitResult(result)
      }
      if (error !== null) {
        emitError(error)
      }
    }
    addObserveListener(sql, listener)
    return () => {
      console.log(`Cleaning up query subject for SQL: ${trimSql(sql)}`)
      removeObserveListener(sql, listener)
    }
  })

worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type } = event.data

  switch (type) {
    case 'subscribeResult': {
      const { sql } = event.data
      const listeners = subscribedObservers.get(sql)
      if (listeners) {
        for (const listener of listeners) {
          listener(event.data.result, null)
        }
      } else {
        throw new Error(`No listeners for subscribe result of SQL: ${trimSql(sql)}`)
      }
      break
    }
    case 'subscribeError': {
      const { sql } = event.data
      const listeners = subscribedObservers.get(sql)
      if (listeners) {
        for (const listener of listeners) {
          listener(null, event.data.error)
        }
      } else {
        throw new Error(`No listeners for subscribe error of SQL: ${trimSql(sql)}`, {
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
