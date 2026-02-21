// Handles Matrix messages, and also manages the Matrix schema and operations.

import type { Database } from '@sqlite.org/sqlite-wasm'

import type { MatrixClientMessage, MatrixWorkerMessage } from '../matrix-types'
import {
  initMatrixSchema,
  createMatrix as createMatrixImpl,
  addSampleRowsToMatrix,
  ensureRootMatrix,
  insertDataRow,
  insertRow as insertRowImpl,
  updateRow as updateRowImpl,
  deleteRow as deleteRowImpl,
  deleteSubtree as deleteSubtreeImpl,
  reparentRow as reparentRowImpl,
  getParent,
  getChildren,
} from '../matrix'

import { sqliteWasm } from './worker-db'

const postMessage = (message: MatrixWorkerMessage) => {
  self.postMessage(message)
}

const toError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)))

export const initMatrixHandler = (db: Database) => {
  initMatrixSchema(db)
  ensureRootMatrix(db)
}

export const handleMatrixClientMessage = async (message: MatrixClientMessage) => {
  switch (message.type) {
    case 'createMatrix': {
      const { title, id } = message
      try {
        const { db } = await sqliteWasm
        const matrixId = createMatrixImpl(db, title)
        postMessage({ type: 'createMatrixSuccess', id, matrixId })
      } catch (err: unknown) {
        postMessage({ type: 'createMatrixError', id, error: toError(err) })
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
        postMessage({ type: 'addSampleRowsError', id, error: toError(err) })
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

        // Reinitialize schema and root matrix after reset
        initMatrixSchema(db)
        ensureRootMatrix(db)

        postMessage({ type: 'resetDatabaseAck', id })
      } catch (err: unknown) {
        postMessage({ type: 'resetDatabaseError', id, error: toError(err) })
      }
      break
    }

    case 'insertRow': {
      const { matrixId, id, parentKey, prevKey, nextKey, values } = message
      try {
        const { db } = await sqliteWasm
        const rowId = insertDataRow(db, matrixId, values)
        const key = insertRowImpl(db, {
          matrixId,
          parentKey,
          prevKey,
          nextKey,
          rowKind: 0,
          rowId,
        })
        postMessage({ type: 'insertRowSuccess', id, key, rowId })
      } catch (err: unknown) {
        postMessage({ type: 'insertRowError', id, error: toError(err) })
      }
      break
    }

    case 'updateRow': {
      const { matrixId, id, rowId, values } = message
      try {
        const { db } = await sqliteWasm
        updateRowImpl(db, { matrixId, rowId, values })
        postMessage({ type: 'updateRowAck', id })
      } catch (err: unknown) {
        postMessage({ type: 'updateRowError', id, error: toError(err) })
      }
      break
    }

    case 'deleteRow': {
      const { matrixId, id, key } = message
      try {
        const { db } = await sqliteWasm

        // Re-parent children to the deleted row's parent before deleting
        const parentKey = getParent(db, matrixId, key)
        const children = getChildren(db, matrixId, key)

        let prevSiblingKey: Uint8Array | undefined = undefined
        for (const childKey of children) {
          const newKey = reparentRowImpl(db, {
            matrixId,
            nodeKey: childKey,
            newParentKey: parentKey ?? undefined,
            prevSiblingKey,
          })
          prevSiblingKey = newKey
        }

        deleteRowImpl(db, { matrixId, key })
        postMessage({ type: 'deleteRowAck', id })
      } catch (err: unknown) {
        postMessage({ type: 'deleteRowError', id, error: toError(err) })
      }
      break
    }

    case 'reparentRow': {
      const { matrixId, id, nodeKey, newParentKey, prevSiblingKey, nextSiblingKey } = message
      try {
        const { db } = await sqliteWasm
        const newKey = reparentRowImpl(db, {
          matrixId,
          nodeKey,
          newParentKey,
          prevSiblingKey,
          nextSiblingKey,
        })
        postMessage({ type: 'reparentRowSuccess', id, newKey })
      } catch (err: unknown) {
        postMessage({ type: 'reparentRowError', id, error: toError(err) })
      }
      break
    }

    case 'deleteSubtree': {
      const { matrixId, id, key } = message
      try {
        const { db } = await sqliteWasm
        deleteSubtreeImpl(db, { matrixId, key })
        postMessage({ type: 'deleteSubtreeAck', id })
      } catch (err: unknown) {
        postMessage({ type: 'deleteSubtreeError', id, error: toError(err) })
      }
      break
    }
  }
}
