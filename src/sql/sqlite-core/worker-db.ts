import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import type { CoreWorkerMessage } from './types'

const log = (message: string) => {
  self.postMessage({ type: 'log', message } as CoreWorkerMessage)
}

const logError = (error: Error | string) => {
  self.postMessage({
    type: 'error',
    error: error instanceof Error ? error : new Error(error),
  } as CoreWorkerMessage)
}

export const sqliteWasm = initSqliteWasm({
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

    log('Done initializing worker core')
    self.postMessage({ type: 'ready' } as CoreWorkerMessage)

    return {
      db,
      sqlite3,
    }
  } catch (err: unknown) {
    throw new Error('Worker core failed to initialize', { cause: err })
  }
})
