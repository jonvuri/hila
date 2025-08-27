import type { MatrixClientMessage, MatrixWorkerMessage } from './matrix-types'
import {
  initMatrixSchema,
  createMatrix as createMatrixImpl,
  addSampleRowsToMatrix,
} from './matrix'
import { sqliteWasm } from './worker-db'

const postMessage = (message: MatrixWorkerMessage) => {
  self.postMessage(message)
}

sqliteWasm.then(({ db }) => {
  initMatrixSchema(db)
})

export const handleMatrixClientMessage = async (message: MatrixClientMessage) => {
  switch (message.type) {
    case 'createMatrix': {
      const { title, id } = message
      try {
        const { db } = await sqliteWasm
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
        const { db } = await sqliteWasm
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
      const { db, sqlite3 } = await sqliteWasm

      if (!sqlite3) {
        postMessage({
          type: 'resetDatabaseError',
          id,
          error: new Error('SQLite not initialized'),
        })
        return
      }

      try {
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
