import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import type { ClientMessage, CoreWorkerMessage } from './types'
import { initMatrixSchema } from './matrix'
import { initSqlHandler, handleSqlClientMessage, triggerSubscribedQueries } from './sql-handler'
import { initMatrixHandler, handleMatrixClientMessage } from './matrix-handler'

const post = (message: CoreWorkerMessage) => {
  postMessage(message)
}

const log = (message: string) => {
  post({ type: 'log', message })
}

const logError = (error: Error | string) => {
  post({ type: 'error', error: error instanceof Error ? error : new Error(error) })
}

log('Initializing worker core')

initSqliteWasm({
  print: log,
  printErr: logError,
}).then((sqlite3) => {
  try {
    let db: Database
    if ('opfs' in sqlite3) {
      try {
        db = new sqlite3.oo1.OpfsDb('/hioa-db.sqlite3')
      } catch (_) {
        // Fall back to in-memory in case OPFS is unavailable (e.g., in tests)
        db = new sqlite3.oo1.DB(':memory:', 'c')
        log('Fell back to in-memory DB')
      }
    } else {
      db = new sqlite3.oo1.DB(':memory:', 'c')
      log('Using in-memory DB (no OPFS)')
    }

    // Initialize matrix schema
    try {
      initMatrixSchema(db)
      log('Matrix schema initialized')
    } catch (err: unknown) {
      logError(new Error('Failed to initialize matrix schema', { cause: err as Error }))
    }

    // Initialize submodule handlers
    initSqlHandler(postMessage, Promise.resolve(db))
    initMatrixHandler(postMessage, Promise.resolve(db), sqlite3)

    log('Done initializing worker core')
    post({ type: 'ready' })

    // Register update hook to re-run subscribed statements when tables are changed.
    try {
      // The update hook fires on INSERT/UPDATE/DELETE operations.
      sqlite3.capi.sqlite3_update_hook(
        db,
        (_bind: number, _op: number, _dbName: string, table: string, _rowid: bigint) => {
          triggerSubscribedQueries(table)
        },
        0,
      )
      log('Registered sqlite3_update_hook for write invalidation')
    } catch (err) {
      logError(new Error('Failed to register sqlite3_update_hook', { cause: err as Error }))
    }

    return db
  } catch (err: unknown) {
    throw new Error('Worker core failed to initialize', { cause: err })
  }
})

const handleMessage = async (event: MessageEvent<ClientMessage>) => {
  const { type } = event.data

  log(`Received message ${type}: ${JSON.stringify(event.data)}`)

  // Route SQL messages to SQL handler
  if (type === 'subscribe' || type === 'unsubscribe' || type === 'execute') {
    await handleSqlClientMessage(event.data)
    return
  }

  // Route Matrix messages to Matrix handler
  if (type === 'createMatrix' || type === 'addSampleRows' || type === 'resetDatabase') {
    await handleMatrixClientMessage(event.data)
    return
  }

  console.warn('Unknown message type:', type)
}

self.onmessage = handleMessage
