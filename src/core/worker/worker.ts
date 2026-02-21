// Main worker entry point - handles all messages coming from the core client
// and routes them to the appropriate handler.
//
// Messages that arrive before initialization completes are queued and drained
// once the DB and all handlers are ready, then onmessage is swapped to the
// real handler for all subsequent messages.

import type { ClientMessage, CoreWorkerMessage } from '../types'

import { handleMatrixClientMessage, initMatrixHandler } from './matrix-handler'
import { handleSqlClientMessage, initSqlHandler } from './sql-handler'
import { sqliteWasm } from './worker-db'

const post = (message: CoreWorkerMessage) => {
  self.postMessage(message)
}

post({ type: 'log', message: 'Initializing worker core' })

const handleMessage = async (event: MessageEvent<ClientMessage>) => {
  const message = event.data

  post({ type: 'log', message: `Received message ${message.type}: ${JSON.stringify(message)}` })

  switch (message.type) {
    case 'subscribe':
    case 'unsubscribe':
    case 'execute':
      await handleSqlClientMessage(message)
      return
    default:
      await handleMatrixClientMessage(message)
      return
  }
}

// Queue messages until init completes
const messageQueue: MessageEvent<ClientMessage>[] = []
self.onmessage = (event: MessageEvent<ClientMessage>) => {
  messageQueue.push(event)
}

const init = async () => {
  const { db, sqlite3 } = await sqliteWasm

  initMatrixHandler(db)
  initSqlHandler(db, sqlite3)

  // Drain any messages that arrived during init, preserving order
  while (messageQueue.length > 0) {
    await handleMessage(messageQueue.shift()!)
  }

  self.onmessage = handleMessage

  post({ type: 'log', message: 'Worker initialization complete' })
  post({ type: 'ready' })
}

init()
