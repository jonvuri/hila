import type { SqlValue } from '@sqlite.org/sqlite-wasm'

export type SqlResult = {
  [column: string]: SqlValue
}[]

export type QuerySubjectState = {
  result: SqlResult | null
  error: Error | null
}

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

type LogMessage = {
  type: 'log'
  message: string
}

type ErrorMessage = {
  type: 'error'
  error: Error
}

export type ClientMessage = SubscribeMessage | UnsubscribeMessage

export type WorkerMessage =
  | SubscribeResultMessage
  | SubscribeErrorMessage
  | LogMessage
  | ErrorMessage
