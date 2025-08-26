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

export type MatrixClientMessage =
  | CreateMatrixMessage
  | AddSampleRowsMessage
  | ResetDatabaseMessage

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

export type MatrixWorkerMessage =
  | CreateMatrixSuccessMessage
  | CreateMatrixErrorMessage
  | AddSampleRowsAckMessage
  | AddSampleRowsErrorMessage
  | ResetDatabaseAckMessage
  | ResetDatabaseErrorMessage
