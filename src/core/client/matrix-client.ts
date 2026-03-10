import type { FaceConfig, FaceTypeDefinition } from '../face-types'
import type { ColumnDefinition } from '../matrix'
import type {
  MatrixOperationType,
  MatrixOperationMap,
  MatrixClientMessage,
} from '../matrix-types'
import type { PluginContext, PluginDefinition, PluginRow } from '../plugin-types'
import type { TraitHandle, TraitRow, TraitType } from '../traits'

import { postMessage } from './worker-client'
import { pendingRequests } from './matrix-client-promises'

export const workerCall = <K extends MatrixOperationType>(
  type: K,
  params: MatrixOperationMap[K]['params'],
): Promise<MatrixOperationMap[K]['result']> =>
  new Promise((resolve, reject) => {
    const id = crypto.randomUUID()
    pendingRequests.set(id, { resolve, reject })
    postMessage({ type, id, ...params } as MatrixClientMessage)
  })

export const createMatrix = (title: string) => workerCall('createMatrix', { title })

export const addSampleRows = (matrixId: number) => workerCall('addSampleRows', { matrixId })

export const resetDatabase = () => workerCall('resetDatabase', {})

export const insertRow = (
  matrixId: number,
  params?: {
    parentKey?: Uint8Array
    prevKey?: Uint8Array
    nextKey?: Uint8Array
    values?: Record<string, unknown>
  },
) => workerCall('insertRow', { matrixId, ...params })

export const updateRow = (matrixId: number, rowId: number, values: Record<string, unknown>) =>
  workerCall('updateRow', { matrixId, rowId, values })

export const deleteRow = (matrixId: number, key: Uint8Array) =>
  workerCall('deleteRow', { matrixId, key })

export const reparentRow = (
  matrixId: number,
  nodeKey: Uint8Array,
  params?: {
    newParentKey?: Uint8Array
    prevSiblingKey?: Uint8Array
    nextSiblingKey?: Uint8Array
  },
) => workerCall('reparentRow', { matrixId, nodeKey, ...params })

export const deleteSubtree = (matrixId: number, key: Uint8Array) =>
  workerCall('deleteSubtree', { matrixId, key })

export const registerPlugin = async (definition: PluginDefinition): Promise<PluginContext> => {
  const { init, destroy: _destroy, ...registration } = definition
  const ctx = await workerCall('registerPlugin', { definition: registration })
  if (init) {
    await init(ctx)
  }
  return ctx
}

export const getPlugins = (): Promise<PluginRow[]> => workerCall('getPlugins', {})

export const ensureTrait = (traitType: TraitType, matrixId: number): Promise<TraitHandle> =>
  workerCall('ensureTrait', { traitType, matrixId })

export const getTraits = (matrixId: number): Promise<TraitRow[]> =>
  workerCall('getTraits', { matrixId })

export const applyFaceToMatrix = (
  faceTypeId: string,
  matrixId: number,
  pluginId?: string,
): Promise<FaceConfig> => workerCall('applyFaceToMatrix', { faceTypeId, matrixId, pluginId })

export const saveFaceConfig = (config: FaceConfig): Promise<void> =>
  workerCall('saveFaceConfig', { config })

export const getFaceConfigs = (matrixId: number): Promise<FaceConfig[]> =>
  workerCall('getFaceConfigs', { matrixId })

export const seedWelcomeRow = (matrixId: number, content: string): Promise<void> =>
  workerCall('seedWelcomeRow', { matrixId, content })

export const registerFaceType = (definition: FaceTypeDefinition): Promise<void> =>
  workerCall('registerFaceType', { definition })

export const addColumn = (matrixId: number, name: string, columnType: string): Promise<void> =>
  workerCall('addColumn', { matrixId, name, columnType })

export const removeColumn = (matrixId: number, columnName: string): Promise<void> =>
  workerCall('removeColumn', { matrixId, columnName })

export const renameColumn = (
  matrixId: number,
  oldName: string,
  newName: string,
): Promise<void> => workerCall('renameColumn', { matrixId, oldName, newName })

export const getColumns = (matrixId: number): Promise<ColumnDefinition[]> =>
  workerCall('getColumns', { matrixId })
