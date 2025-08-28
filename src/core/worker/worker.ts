import type { ClientMessage, CoreWorkerMessage } from '../types'

import { handleMatrixClientMessage } from './matrix-handler'
import { handleSqlClientMessage } from './sql-handler'

const post = (message: CoreWorkerMessage) => {
  self.postMessage(message)
}

post({ type: 'log', message: 'Initializing worker core' })

const handleMessage = async (event: MessageEvent<ClientMessage>) => {
  const { type } = event.data

  post({ type: 'log', message: `Received message ${type}: ${JSON.stringify(event.data)}` })

  // Route SQL messages to SQL handler
  if (type === 'subscribe' || type === 'unsubscribe' || type === 'execute') {
    await handleSqlClientMessage(event.data)
    return
  }

  // Route Matrix messages to Matrix handler
  if (type === 'createMatrix' || type === 'addSampleRows' || type === 'resetDatabase') {
    await handleMatrixClientMessage(event.data)
    return
  }

  console.warn('Unknown message type:', type)
}

self.onmessage = handleMessage
