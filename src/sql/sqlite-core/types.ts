import type { SqlValue } from '@sqlite.org/sqlite-wasm'

export type Sql = string

export type SqlResult = {
  [column: string]: SqlValue
}[]

export type SqlObserver = (result: SqlResult | null, error: Error | null) => void

export type SubscribeMessage = {
  type: 'subscribe'
  sql: string
}

export type SubscribeResultMessage = {
  type: 'subscribeResult'
  sql: string
  result: SqlResult
}

export type SubscribeErrorMessage = {
  type: 'subscribeError'
  sql: string
  error: Error
}

export type UnsubscribeMessage = {
  type: 'unsubscribe'
  sql: string
}

export type ExecuteMessage = {
  type: 'execute'
  id: string
  sql: string
}

export type ExecuteAckMessage = {
  type: 'executeAck'
  id: string
}

export type ExecuteErrorMessage = {
  type: 'executeError'
  id: string
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

type ReadyMessage = {
  type: 'ready'
}

export type ClientMessage = SubscribeMessage | UnsubscribeMessage | ExecuteMessage

export type WorkerMessage =
  | SubscribeResultMessage
  | SubscribeErrorMessage
  | ExecuteAckMessage
  | ExecuteErrorMessage
  | LogMessage
  | ErrorMessage
  | ReadyMessage
