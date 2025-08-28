import type { SqlValue } from '@sqlite.org/sqlite-wasm'

export type Sql = string

export type SqlResult = {
  [column: string]: SqlValue
}[]

export type SqlObserver = (result: SqlResult | null, error: Error | null) => void

// SQL Client Messages (from client to worker)
export type SubscribeMessage = {
  type: 'subscribe'
  sql: string
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

export type SqlClientMessage = SubscribeMessage | UnsubscribeMessage | ExecuteMessage

// SQL Worker Messages (from worker to client)
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

export type ExecuteAckMessage = {
  type: 'executeAck'
  id: string
}

export type ExecuteErrorMessage = {
  type: 'executeError'
  id: string
  error: Error
}

export type SqlWorkerMessage =
  | SubscribeResultMessage
  | SubscribeErrorMessage
  | ExecuteAckMessage
  | ExecuteErrorMessage
