// Matrix Client Messages (from client to worker)
export type CreateMatrixMessage = {
  type: 'createMatrix'
  id: string
  title: string
}

export type AddSampleRowsMessage = {
  type: 'addSampleRows'
  id: string
  matrixId: number
}

export type ResetDatabaseMessage = {
  type: 'resetDatabase'
  id: string
}

export type InsertRowMessage = {
  type: 'insertRow'
  id: string
  matrixId: number
  parentKey?: Uint8Array
  prevKey?: Uint8Array
  nextKey?: Uint8Array
  values?: Record<string, unknown>
}

export type UpdateRowMessage = {
  type: 'updateRow'
  id: string
  matrixId: number
  rowId: number
  values: Record<string, unknown>
}

export type DeleteRowMessage = {
  type: 'deleteRow'
  id: string
  matrixId: number
  key: Uint8Array
}

export type ReparentRowMessage = {
  type: 'reparentRow'
  id: string
  matrixId: number
  nodeKey: Uint8Array
  newParentKey?: Uint8Array
  prevSiblingKey?: Uint8Array
  nextSiblingKey?: Uint8Array
}

export type DeleteSubtreeMessage = {
  type: 'deleteSubtree'
  id: string
  matrixId: number
  key: Uint8Array
}

export type MatrixClientMessage =
  | CreateMatrixMessage
  | AddSampleRowsMessage
  | ResetDatabaseMessage
  | InsertRowMessage
  | UpdateRowMessage
  | DeleteRowMessage
  | ReparentRowMessage
  | DeleteSubtreeMessage

// Matrix Worker Messages (from worker to client)
export type CreateMatrixSuccessMessage = {
  type: 'createMatrixSuccess'
  id: string
  matrixId: number
}

export type CreateMatrixErrorMessage = {
  type: 'createMatrixError'
  id: string
  error: Error
}

export type AddSampleRowsAckMessage = {
  type: 'addSampleRowsAck'
  id: string
}

export type AddSampleRowsErrorMessage = {
  type: 'addSampleRowsError'
  id: string
  error: Error
}

export type ResetDatabaseAckMessage = {
  type: 'resetDatabaseAck'
  id: string
}

export type ResetDatabaseErrorMessage = {
  type: 'resetDatabaseError'
  id: string
  error: Error
}

export type InsertRowSuccessMessage = {
  type: 'insertRowSuccess'
  id: string
  key: Uint8Array
  rowId: number
}

export type InsertRowErrorMessage = {
  type: 'insertRowError'
  id: string
  error: Error
}

export type UpdateRowAckMessage = {
  type: 'updateRowAck'
  id: string
}

export type UpdateRowErrorMessage = {
  type: 'updateRowError'
  id: string
  error: Error
}

export type DeleteRowAckMessage = {
  type: 'deleteRowAck'
  id: string
}

export type DeleteRowErrorMessage = {
  type: 'deleteRowError'
  id: string
  error: Error
}

export type ReparentRowSuccessMessage = {
  type: 'reparentRowSuccess'
  id: string
  newKey: Uint8Array
}

export type ReparentRowErrorMessage = {
  type: 'reparentRowError'
  id: string
  error: Error
}

export type DeleteSubtreeAckMessage = {
  type: 'deleteSubtreeAck'
  id: string
}

export type DeleteSubtreeErrorMessage = {
  type: 'deleteSubtreeError'
  id: string
  error: Error
}

export type MatrixWorkerMessage =
  | CreateMatrixSuccessMessage
  | CreateMatrixErrorMessage
  | AddSampleRowsAckMessage
  | AddSampleRowsErrorMessage
  | ResetDatabaseAckMessage
  | ResetDatabaseErrorMessage
  | InsertRowSuccessMessage
  | InsertRowErrorMessage
  | UpdateRowAckMessage
  | UpdateRowErrorMessage
  | DeleteRowAckMessage
  | DeleteRowErrorMessage
  | ReparentRowSuccessMessage
  | ReparentRowErrorMessage
  | DeleteSubtreeAckMessage
  | DeleteSubtreeErrorMessage
