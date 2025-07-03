import type { SqlValue } from '@sqlite.org/sqlite-wasm'

export type SqlResult = {
  [column: string]: SqlValue
}[]

type ExecuteMessage = {
  type: 'execute'
  sql: string
  bind?: (string | number | boolean)[]
}

export type ExecuteResultMessage = {
  type: 'executeResult'
  sql: string
  result: SqlResult
}

export type ExecuteErrorMessage = {
  type: 'executeError'
  sql: string
  error: Error
}

type LogMessage = {
  type: 'log'
  message: string
}

type ErrorMessage = {
  type: 'error'
  error: Error
}

export type ClientMessage = ExecuteMessage

export type WorkerMessage =
  | ExecuteResultMessage
  | ExecuteErrorMessage
  | LogMessage
  | ErrorMessage
