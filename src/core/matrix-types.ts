import type { PluginContext, PluginRegistration, PluginRow } from './plugin-types'

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
      parentKey?: Uint8Array
      prevKey?: Uint8Array
      nextKey?: Uint8Array
      values?: Record<string, unknown>
    }
    result: { key: Uint8Array; rowId: number }
  }
  updateRow: {
    params: { matrixId: number; rowId: number; values: Record<string, unknown> }
    result: void
  }
  deleteRow: {
    params: { matrixId: number; key: Uint8Array }
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
