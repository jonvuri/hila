import type { SqlClientMessage, SqlWorkerMessage } from './sql-types'
import type { MatrixClientMessage, MatrixWorkerMessage } from './matrix-types'

// Core worker system messages
type LogMessage = {
  type: 'log'
  message: string
}

type ErrorMessage = {
  type: 'error'
  error: Error
}

type ReadyMessage = {
  type: 'ready'
}

export type CoreWorkerMessage = LogMessage | ErrorMessage | ReadyMessage

// Combined message types for the main worker interface
export type ClientMessage = SqlClientMessage | MatrixClientMessage

export type WorkerMessage = SqlWorkerMessage | MatrixWorkerMessage | CoreWorkerMessage
