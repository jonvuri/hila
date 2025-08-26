import type { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm'

import type { MatrixClientMessage, MatrixWorkerMessage } from './matrix-types'
import { createMatrix as createMatrixImpl, addSampleRowsToMatrix } from './matrix'

// Message posting interface - will be injected by main worker
type MessagePoster = (message: MatrixWorkerMessage) => void

let postMessage: MessagePoster = () => {
  throw new Error('Matrix handler not initialized - postMessage not set')
}
let getDatabase: Promise<Database> = Promise.reject(
  new Error('Matrix handler not initialized - getDatabase not set'),
)

let sqlite3: Sqlite3Static | null = null

export const initMatrixHandler = (
  poster: MessagePoster,
  databaseGetter: Promise<Database>,
  sqlite3_: Sqlite3Static,
) => {
  postMessage = poster
  getDatabase = databaseGetter
  sqlite3 = sqlite3_
}

export const handleMatrixClientMessage = async (message: MatrixClientMessage) => {
  switch (message.type) {
    case 'createMatrix': {
      const { title, id } = message
      try {
        const db = await getDatabase
        const matrixId = createMatrixImpl(db, title)
        postMessage({ type: 'createMatrixSuccess', id, matrixId })
      } catch (err: unknown) {
        postMessage({
          type: 'createMatrixError',
          id,
          error: err instanceof Error ? err : new Error(String(err)),
        })
      }
      break
    }

    case 'addSampleRows': {
      const { matrixId, id } = message
      try {
        const db = await getDatabase
        addSampleRowsToMatrix(db, matrixId)
        postMessage({ type: 'addSampleRowsAck', id })
      } catch (err: unknown) {
        postMessage({
          type: 'addSampleRowsError',
          id,
          error: err instanceof Error ? err : new Error(String(err)),
        })
      }
      break
    }

    case 'resetDatabase': {
      const { id } = message

      if (!sqlite3) {
        postMessage({
          type: 'resetDatabaseError',
          id,
          error: new Error('SQLite not initialized'),
        })
        return
      }

      try {
        const db = await getDatabase

        // Reset database using SQLite C-API
        sqlite3.capi.sqlite3_db_config(db, sqlite3.capi.SQLITE_DBCONFIG_RESET_DATABASE, 1, 0)
        sqlite3.capi.sqlite3_exec(db, 'VACUUM', 0, 0, 0)
        sqlite3.capi.sqlite3_db_config(db, sqlite3.capi.SQLITE_DBCONFIG_RESET_DATABASE, 0, 0)

        postMessage({ type: 'resetDatabaseAck', id })
      } catch (err: unknown) {
        postMessage({
          type: 'resetDatabaseError',
          id,
          error: err instanceof Error ? err : new Error(String(err)),
        })
      }
      break
    }
  }
}
