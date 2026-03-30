import type { FaceConfig, FaceTypeDefinition } from './face-types'
import type { ColumnDefinition, JoinKind } from './matrix'
import type { PluginContext, PluginRegistration, PluginRow } from './plugin-types'
import type { TraitHandle, TraitRow, TraitType } from './traits'

// Matrix operation registry: maps operation names to request params and response results.
// All message types and the protocol shape are derived from this single declaration.

export type MatrixOperationMap = {
  createMatrix: {
    params: { title: string }
    result: number
  }
  addSampleRows: {
    params: { matrixId: number }
    result: void
  }
  resetDatabase: {
    params: Record<string, never>
    result: void
  }
  insertRow: {
    params: {
      matrixId: number
      values?: Record<string, unknown>
      parentKey?: Uint8Array
      prevKey?: Uint8Array
      nextKey?: Uint8Array
    }
    result: { rowId: number; key: Uint8Array | null }
  }
  updateRow: {
    params: { matrixId: number; rowId: number; values: Record<string, unknown> }
    result: void
  }
  deleteRow: {
    params: { matrixId: number; rowId: number }
    result: void
  }
  reparentRow: {
    params: {
      matrixId: number
      nodeKey: Uint8Array
      newParentKey?: Uint8Array
      prevSiblingKey?: Uint8Array
      nextSiblingKey?: Uint8Array
    }
    result: Uint8Array
  }
  deleteSubtree: {
    params: { matrixId: number; key: Uint8Array }
    result: void
  }
  compactChangelog: {
    params: { retentionDays?: number; perRowCap?: number }
    result: number
  }
  registerPlugin: {
    params: { definition: PluginRegistration }
    result: PluginContext
  }
  getPlugins: {
    params: Record<string, never>
    result: PluginRow[]
  }
  ensureTrait: {
    params: { traitType: TraitType; matrixId: number }
    result: TraitHandle
  }
  getTraits: {
    params: { matrixId: number }
    result: TraitRow[]
  }
  applyFaceToMatrix: {
    params: { faceTypeId: string; matrixId: number; pluginId?: string }
    result: FaceConfig
  }
  saveFaceConfig: {
    params: { config: FaceConfig }
    result: void
  }
  getFaceConfigs: {
    params: { matrixId: number }
    result: FaceConfig[]
  }
  seedWelcomeRow: {
    params: { matrixId: number; content: string }
    result: void
  }
  seedRow: {
    params: { matrixId: number; values: Record<string, unknown> }
    result: void
  }
  registerFaceType: {
    params: { definition: FaceTypeDefinition }
    result: void
  }
  addColumn: {
    params: {
      matrixId: number
      name: string
      columnType: string
      displayType?: string
      options?: string
    }
    result: void
  }
  addFormulaColumn: {
    params: {
      matrixId: number
      name: string
      formula: string
    }
    result: void
  }
  removeColumn: {
    params: { matrixId: number; columnName: string }
    result: void
  }
  renameColumn: {
    params: { matrixId: number; oldName: string; newName: string }
    result: void
  }
  getColumns: {
    params: { matrixId: number }
    result: ColumnDefinition[]
  }
  updateColumnDisplayType: {
    params: { matrixId: number; columnName: string; displayType: string }
    result: void
  }
  updateColumnOptions: {
    params: { matrixId: number; columnName: string; options: string | null }
    result: void
  }
  reorderColumns: {
    params: { matrixId: number; columnNames: string[] }
    result: void
  }
  insertJoin: {
    params: {
      sourceMatrixId: number
      sourceRowId: number
      targetMatrixId: number
      targetRowId: number
      kind?: JoinKind
    }
    result: void
  }
  deleteJoin: {
    params: {
      sourceMatrixId: number
      sourceRowId: number
      targetMatrixId: number
      targetRowId: number
    }
    result: void
  }
  getTargets: {
    params: { sourceMatrixId: number; sourceRowId: number }
    result: { targetMatrixId: number; targetRowId: number; kind: JoinKind }[]
  }
  getSources: {
    params: { targetMatrixId: number; targetRowId: number }
    result: { sourceMatrixId: number; sourceRowId: number; kind: JoinKind }[]
  }
}

export type MatrixOperationType = keyof MatrixOperationMap

// Request messages (client → worker): { type, id, ...params }
export type MatrixClientMessage = {
  [K in MatrixOperationType]: { type: K; id: string } & MatrixOperationMap[K]['params']
}[MatrixOperationType]

// Response messages (worker → client)
export type MatrixSuccessMessage = {
  [K in MatrixOperationType]: {
    type: `${K}Success`
    id: string
    result: MatrixOperationMap[K]['result']
  }
}[MatrixOperationType]

export type MatrixErrorMessage = {
  [K in MatrixOperationType]: { type: `${K}Error`; id: string; error: Error }
}[MatrixOperationType]

export type MatrixWorkerMessage = MatrixSuccessMessage | MatrixErrorMessage
