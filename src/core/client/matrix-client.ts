import type { FaceConfig, FaceTypeDefinition } from '../face-types'
import type { ColumnDefinition, JoinKind, JoinRow } from '../matrix'
import type {
  MatrixOperationType,
  MatrixOperationMap,
  MatrixClientMessage,
} from '../matrix-types'
import type { PluginContext, PluginDefinition, PluginRow } from '../plugin-types'
import type { TagType } from '../../tags/tag-types'
import {
  registerFaceType as registerFaceTypeLocal,
  getFaceType as getFaceTypeLocal,
} from '../face-registry'

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

export const renameMatrix = (matrixId: number, title: string): Promise<void> =>
  workerCall('renameMatrix', { matrixId, title })

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

export const deleteRow = (matrixId: number, rowId: number) =>
  workerCall('deleteRow', { matrixId, rowId })

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

  // Register face types on the main thread before sending to the worker.
  // The worker-side registerPlugin also registers them in its own registry.
  if (definition.faceTypes) {
    for (const ft of definition.faceTypes) {
      if (!getFaceTypeLocal(ft.id)) {
        registerFaceTypeLocal(ft)
      }
    }
  }

  const ctx = await workerCall('registerPlugin', { definition: registration })
  if (init) {
    await init(ctx)
  }
  return ctx
}

export const getPlugins = (): Promise<PluginRow[]> => workerCall('getPlugins', {})

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

export const seedRow = (matrixId: number, values: Record<string, unknown>): Promise<void> =>
  workerCall('seedRow', { matrixId, values })

export const registerFaceType = (definition: FaceTypeDefinition): Promise<void> =>
  workerCall('registerFaceType', { definition })

export const addColumn = (
  matrixId: number,
  name: string,
  columnType: string,
  displayType?: string,
  options?: string,
  constraints?: string,
): Promise<number> =>
  workerCall('addColumn', { matrixId, name, columnType, displayType, options, constraints })

export const addFormulaColumn = (
  matrixId: number,
  name: string,
  formula: string,
): Promise<number> => workerCall('addFormulaColumn', { matrixId, name, formula })

export const removeColumn = (
  matrixId: number,
  columnName: string,
  force?: boolean,
): Promise<void> => workerCall('removeColumn', { matrixId, columnName, force })

export const renameColumn = (
  matrixId: number,
  oldName: string,
  newName: string,
  force?: boolean,
): Promise<void> => workerCall('renameColumn', { matrixId, oldName, newName, force })

export const getColumns = (matrixId: number): Promise<ColumnDefinition[]> =>
  workerCall('getColumns', { matrixId })

export const updateColumnDisplayType = (
  matrixId: number,
  columnName: string,
  displayType: string,
): Promise<void> => workerCall('updateColumnDisplayType', { matrixId, columnName, displayType })

export const updateColumnOptions = (
  matrixId: number,
  columnName: string,
  options: string | null,
): Promise<void> => workerCall('updateColumnOptions', { matrixId, columnName, options })

export const updateColumnRole = (
  matrixId: number,
  columnName: string,
  role: 'label' | 'content' | null,
): Promise<void> => workerCall('updateColumnRole', { matrixId, columnName, role })

export const reorderColumns = (matrixId: number, columnNames: string[]): Promise<void> =>
  workerCall('reorderColumns', { matrixId, columnNames })

export const insertJoin = (
  sourceMatrixId: number,
  sourceRowId: number,
  targetMatrixId: number,
  targetRowId: number,
  kind?: JoinKind,
): Promise<void> =>
  workerCall('insertJoin', { sourceMatrixId, sourceRowId, targetMatrixId, targetRowId, kind })

export const createRefJoin = (
  sourceMatrixId: number,
  sourceRowId: number,
  targetMatrixId: number,
  targetRowId: number,
): Promise<void> =>
  workerCall('insertJoin', {
    sourceMatrixId,
    sourceRowId,
    targetMatrixId,
    targetRowId,
    kind: 'ref',
  })

export const deleteJoin = (
  sourceMatrixId: number,
  sourceRowId: number,
  targetMatrixId: number,
  targetRowId: number,
): Promise<void> =>
  workerCall('deleteJoin', { sourceMatrixId, sourceRowId, targetMatrixId, targetRowId })

export const getTargets = (
  sourceMatrixId: number,
  sourceRowId: number,
): Promise<{ targetMatrixId: number; targetRowId: number; kind: JoinKind }[]> =>
  workerCall('getTargets', { sourceMatrixId, sourceRowId })

export const getSources = (
  targetMatrixId: number,
  targetRowId: number,
): Promise<{ sourceMatrixId: number; sourceRowId: number; kind: JoinKind }[]> =>
  workerCall('getSources', { targetMatrixId, targetRowId })

export const createDependentRow = (
  sourceMatrixId: number,
  sourceRowId: number,
  targetMatrixId: number,
  columnValues?: Record<string, unknown>,
): Promise<number> =>
  workerCall('createDependentRow', {
    sourceMatrixId,
    sourceRowId,
    targetMatrixId,
    columnValues,
  })

export const deleteOwnedTarget = (targetMatrixId: number, targetRowId: number): Promise<void> =>
  workerCall('deleteOwnedTarget', { targetMatrixId, targetRowId })

export const deleteJoinByTarget = (
  targetMatrixId: number,
  targetRowId: number,
): Promise<JoinRow | null> => workerCall('deleteJoinByTarget', { targetMatrixId, targetRowId })

export const createTagType = (
  name: string,
  columns?: { name: string; type: string }[],
): Promise<TagType> => workerCall('createTagType', { name, columns })

export const getTagType = (name: string): Promise<TagType | null> =>
  workerCall('getTagType', { name })

export const getAllTagTypes = (): Promise<TagType[]> => workerCall('getAllTagTypes', {})

export const updateTagType = (tagTypeId: number, updates: { name?: string }): Promise<void> =>
  workerCall('updateTagType', { tagTypeId, ...updates })

export const deleteTagType = (tagTypeId: number): Promise<void> =>
  workerCall('deleteTagType', { tagTypeId })
