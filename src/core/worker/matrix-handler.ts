import type { Database } from '@sqlite.org/sqlite-wasm'

import type { MatrixClientMessage, MatrixWorkerMessage } from '../matrix-types'
import {
  initMatrixSchema,
  getOrCreateDeviceId,
  resetDeviceIdCache,
  createMatrix as createMatrixImpl,
  addSampleRowsToMatrix,
  insertDataRow as insertDataRowImpl,
  insertRow as insertRowImpl,
  updateRow as updateRowImpl,
  deleteRow as deleteRowImpl,
  deleteSubtree as deleteSubtreeImpl,
  reparentRow as reparentRowImpl,
  getParent,
  getChildren,
  getColumns as getColumnsImpl,
  addColumn as addColumnImpl,
  removeColumn as removeColumnImpl,
  renameColumn as renameColumnImpl,
  updateColumnDisplayType as updateColumnDisplayTypeImpl,
  updateColumnOptions as updateColumnOptionsImpl,
  reorderColumns as reorderColumnsImpl,
} from '../matrix'
import {
  applyFaceToMatrix as applyFaceToMatrixImpl,
  saveFaceConfig as saveFaceConfigImpl,
  getFaceConfigsForMatrix as getFaceConfigsForMatrixImpl,
} from '../face-config'
import { registerFaceType as registerFaceTypeImpl } from '../face-registry'
import {
  registerPlugin as registerPluginImpl,
  getAllPlugins as getAllPluginsImpl,
} from '../plugin'
import { installCoreTableTriggers, compactChangelog } from '../sync'
import { ensureTrait as ensureTraitImpl, getTraits as getTraitsImpl } from '../traits'

import { triggerSubscribedQueries } from './sql-handler'
import { sqliteWasm } from './worker-db'

const EMPTY_DOC_JSON = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })

const postMessage = (message: MatrixWorkerMessage) => {
  self.postMessage(message)
}

const toError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)))

const seedWelcomeRow = (db: Database, matrixId: number, content: string) => {
  const checkStmt = db.prepare(`SELECT 1 FROM "mx_${matrixId}_data" LIMIT 1`)
  const hasRows = checkStmt.step()
  checkStmt.finalize()

  if (hasRows) return

  const rowId = insertDataRowImpl(db, matrixId, { content })
  insertRowImpl(db, { matrixId, rowKind: 0, rowId })
}

export const initMatrixHandler = (db: Database) => {
  initMatrixSchema(db)
  const deviceId = getOrCreateDeviceId(db)
  installCoreTableTriggers(db, deviceId)
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
          const columns = getColumnsImpl(db, matrixId)
          if (columns.some((c) => c.name === 'content')) {
            resolvedValues = { ...resolvedValues, content: EMPTY_DOC_JSON }
          }
        }

        const rowId = insertDataRowImpl(db, matrixId, resolvedValues)
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

    case 'registerPlugin': {
      const { definition, id } = message
      try {
        const { db } = await sqliteWasm
        const ctx = await registerPluginImpl(db, definition)
        postMessage({ type: 'registerPluginSuccess', id, result: ctx })
      } catch (err: unknown) {
        postMessage({ type: 'registerPluginError', id, error: toError(err) })
      }
      break
    }

    case 'getPlugins': {
      const { id } = message
      try {
        const { db } = await sqliteWasm
        const plugins = getAllPluginsImpl(db)
        postMessage({ type: 'getPluginsSuccess', id, result: plugins })
      } catch (err: unknown) {
        postMessage({ type: 'getPluginsError', id, error: toError(err) })
      }
      break
    }

    case 'ensureTrait': {
      const { id, traitType, matrixId } = message
      try {
        const { db } = await sqliteWasm
        const handle = ensureTraitImpl(db, traitType, matrixId)
        postMessage({ type: 'ensureTraitSuccess', id, result: handle })
      } catch (err: unknown) {
        postMessage({ type: 'ensureTraitError', id, error: toError(err) })
      }
      break
    }

    case 'getTraits': {
      const { id, matrixId } = message
      try {
        const { db } = await sqliteWasm
        const traits = getTraitsImpl(db, matrixId)
        postMessage({ type: 'getTraitsSuccess', id, result: traits })
      } catch (err: unknown) {
        postMessage({ type: 'getTraitsError', id, error: toError(err) })
      }
      break
    }

    case 'applyFaceToMatrix': {
      const { id, faceTypeId, matrixId, pluginId } = message
      try {
        const { db } = await sqliteWasm
        const config = applyFaceToMatrixImpl(db, faceTypeId, matrixId, pluginId)
        postMessage({ type: 'applyFaceToMatrixSuccess', id, result: config })
      } catch (err: unknown) {
        postMessage({ type: 'applyFaceToMatrixError', id, error: toError(err) })
      }
      break
    }

    case 'saveFaceConfig': {
      const { id, config } = message
      try {
        const { db } = await sqliteWasm
        saveFaceConfigImpl(db, config)
        postMessage({ type: 'saveFaceConfigSuccess', id, result: undefined })
      } catch (err: unknown) {
        postMessage({ type: 'saveFaceConfigError', id, error: toError(err) })
      }
      break
    }

    case 'getFaceConfigs': {
      const { id, matrixId } = message
      try {
        const { db } = await sqliteWasm
        const configs = getFaceConfigsForMatrixImpl(db, matrixId)
        postMessage({ type: 'getFaceConfigsSuccess', id, result: configs })
      } catch (err: unknown) {
        postMessage({ type: 'getFaceConfigsError', id, error: toError(err) })
      }
      break
    }

    case 'seedWelcomeRow': {
      const { id, matrixId, content } = message
      try {
        const { db } = await sqliteWasm
        seedWelcomeRow(db, matrixId, content)
        postMessage({ type: 'seedWelcomeRowSuccess', id, result: undefined })
      } catch (err: unknown) {
        postMessage({ type: 'seedWelcomeRowError', id, error: toError(err) })
      }
      break
    }

    case 'registerFaceType': {
      const { id, definition } = message
      try {
        registerFaceTypeImpl(definition)
        postMessage({ type: 'registerFaceTypeSuccess', id, result: undefined })
      } catch (err: unknown) {
        postMessage({ type: 'registerFaceTypeError', id, error: toError(err) })
      }
      break
    }

    case 'insertDataRow': {
      const { id, matrixId, values } = message
      try {
        const { db } = await sqliteWasm
        const rowId = insertDataRowImpl(db, matrixId, values)
        postMessage({ type: 'insertDataRowSuccess', id, result: rowId })
      } catch (err: unknown) {
        postMessage({ type: 'insertDataRowError', id, error: toError(err) })
      }
      break
    }

    case 'addColumn': {
      const { id, matrixId, name, columnType, displayType, options } = message
      try {
        const { db } = await sqliteWasm
        addColumnImpl(db, matrixId, { name, type: columnType, displayType, options })
        triggerSubscribedQueries(`mx_${matrixId}_data`)
        triggerSubscribedQueries('matrix_columns')
        postMessage({ type: 'addColumnSuccess', id, result: undefined })
      } catch (err: unknown) {
        postMessage({ type: 'addColumnError', id, error: toError(err) })
      }
      break
    }

    case 'removeColumn': {
      const { id, matrixId, columnName } = message
      try {
        const { db } = await sqliteWasm
        removeColumnImpl(db, matrixId, columnName)
        triggerSubscribedQueries(`mx_${matrixId}_data`)
        triggerSubscribedQueries('matrix_columns')
        postMessage({ type: 'removeColumnSuccess', id, result: undefined })
      } catch (err: unknown) {
        postMessage({ type: 'removeColumnError', id, error: toError(err) })
      }
      break
    }

    case 'renameColumn': {
      const { id, matrixId, oldName, newName } = message
      try {
        const { db } = await sqliteWasm
        renameColumnImpl(db, matrixId, oldName, newName)
        triggerSubscribedQueries(`mx_${matrixId}_data`)
        triggerSubscribedQueries('matrix_columns')
        postMessage({ type: 'renameColumnSuccess', id, result: undefined })
      } catch (err: unknown) {
        postMessage({ type: 'renameColumnError', id, error: toError(err) })
      }
      break
    }

    case 'getColumns': {
      const { id, matrixId } = message
      try {
        const { db } = await sqliteWasm
        const columns = getColumnsImpl(db, matrixId)
        postMessage({ type: 'getColumnsSuccess', id, result: columns })
      } catch (err: unknown) {
        postMessage({ type: 'getColumnsError', id, error: toError(err) })
      }
      break
    }

    case 'updateColumnDisplayType': {
      const { id, matrixId, columnName, displayType } = message
      try {
        const { db } = await sqliteWasm
        updateColumnDisplayTypeImpl(db, matrixId, columnName, displayType)
        triggerSubscribedQueries('matrix_columns')
        postMessage({ type: 'updateColumnDisplayTypeSuccess', id, result: undefined })
      } catch (err: unknown) {
        postMessage({ type: 'updateColumnDisplayTypeError', id, error: toError(err) })
      }
      break
    }

    case 'updateColumnOptions': {
      const { id, matrixId, columnName, options } = message
      try {
        const { db } = await sqliteWasm
        updateColumnOptionsImpl(db, matrixId, columnName, options)
        triggerSubscribedQueries('matrix_columns')
        postMessage({ type: 'updateColumnOptionsSuccess', id, result: undefined })
      } catch (err: unknown) {
        postMessage({ type: 'updateColumnOptionsError', id, error: toError(err) })
      }
      break
    }

    case 'reorderColumns': {
      const { id, matrixId, columnNames } = message
      try {
        const { db } = await sqliteWasm
        reorderColumnsImpl(db, matrixId, columnNames)
        triggerSubscribedQueries('matrix_columns')
        postMessage({ type: 'reorderColumnsSuccess', id, result: undefined })
      } catch (err: unknown) {
        postMessage({ type: 'reorderColumnsError', id, error: toError(err) })
      }
      break
    }
  }
}
