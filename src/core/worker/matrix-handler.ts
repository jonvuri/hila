import type { Database } from '@sqlite.org/sqlite-wasm'

import type { MatrixClientMessage, MatrixWorkerMessage } from '../matrix-types'
import {
  initMatrixSchema,
  getOrCreateDeviceId,
  resetDeviceIdCache,
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
  getColumns,
} from '../matrix'
import { installCoreTableTriggers, compactChangelog } from '../sync'

import { sqliteWasm } from './worker-db'

const EMPTY_DOC_JSON = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })

const WELCOME_DOC_JSON = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Welcome to Hila' }] }],
})

const postMessage = (message: MatrixWorkerMessage) => {
  self.postMessage(message)
}

const toError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)))

const seedWelcomeRow = (db: Database, matrixId: number) => {
  const checkStmt = db.prepare(`SELECT 1 FROM "mx_${matrixId}_data" LIMIT 1`)
  const hasRows = checkStmt.step()
  checkStmt.finalize()

  if (hasRows) return

  const rowId = insertDataRow(db, matrixId, { content: WELCOME_DOC_JSON })
  insertRowImpl(db, { matrixId, rowKind: 0, rowId })
}

export const initMatrixHandler = (db: Database) => {
  initMatrixSchema(db)
  const deviceId = getOrCreateDeviceId(db)
  installCoreTableTriggers(db, deviceId)
  ensureRootMatrix(db)
  seedWelcomeRow(db, 1)
}

export const handleMatrixClientMessage = async (message: MatrixClientMessage) => {
  switch (message.type) {
    case 'createMatrix': {
      const { title, id } = message
      try {
        const { db } = await sqliteWasm
        const matrixId = createMatrixImpl(db, title)
        postMessage({ type: 'createMatrixSuccess', id, result: matrixId })
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
        postMessage({ type: 'addSampleRowsSuccess', id, result: undefined })
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
        sqlite3.capi.sqlite3_db_config(db, sqlite3.capi.SQLITE_DBCONFIG_RESET_DATABASE, 1, 0)
        sqlite3.capi.sqlite3_exec(db, 'VACUUM', 0, 0, 0)
        sqlite3.capi.sqlite3_db_config(db, sqlite3.capi.SQLITE_DBCONFIG_RESET_DATABASE, 0, 0)

        resetDeviceIdCache()
        initMatrixSchema(db)
        const newDeviceId = getOrCreateDeviceId(db)
        installCoreTableTriggers(db, newDeviceId)
        ensureRootMatrix(db)
        seedWelcomeRow(db, 1)

        postMessage({ type: 'resetDatabaseSuccess', id, result: undefined })
      } catch (err: unknown) {
        postMessage({ type: 'resetDatabaseError', id, error: toError(err) })
      }
      break
    }

    case 'insertRow': {
      const { matrixId, id, parentKey, prevKey, nextKey, values } = message
      try {
        const { db } = await sqliteWasm

        // If the matrix has a content column and no content is provided, set the empty-doc default
        let resolvedValues = values
        if (resolvedValues === undefined || !('content' in resolvedValues)) {
          const columns = getColumns(db, matrixId)
          if (columns.some((c) => c.name === 'content')) {
            resolvedValues = { ...resolvedValues, content: EMPTY_DOC_JSON }
          }
        }

        const rowId = insertDataRow(db, matrixId, resolvedValues)
        const key = insertRowImpl(db, {
          matrixId,
          parentKey,
          prevKey,
          nextKey,
          rowKind: 0,
          rowId,
        })
        postMessage({ type: 'insertRowSuccess', id, result: { key, rowId } })
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
        postMessage({ type: 'updateRowSuccess', id, result: undefined })
      } catch (err: unknown) {
        postMessage({ type: 'updateRowError', id, error: toError(err) })
      }
      break
    }

    case 'deleteRow': {
      const { matrixId, id, key } = message
      try {
        const { db } = await sqliteWasm

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
        postMessage({ type: 'deleteRowSuccess', id, result: undefined })
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
        postMessage({ type: 'reparentRowSuccess', id, result: newKey })
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
        postMessage({ type: 'deleteSubtreeSuccess', id, result: undefined })
      } catch (err: unknown) {
        postMessage({ type: 'deleteSubtreeError', id, error: toError(err) })
      }
      break
    }

    case 'compactChangelog': {
      const { id, retentionDays, perRowCap } = message
      try {
        const { db } = await sqliteWasm
        const deleted = compactChangelog(db, { retentionDays, perRowCap })
        postMessage({ type: 'compactChangelogSuccess', id, result: deleted })
      } catch (err: unknown) {
        postMessage({ type: 'compactChangelogError', id, error: toError(err) })
      }
      break
    }
  }
}
