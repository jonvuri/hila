import type { ClientMessage, WorkerMessage } from './types'
import {
  initSqlClient,
  addObserver,
  removeObserver,
  execQuery as execSqlQuery,
  handleSqlWorkerMessage,
} from './sql-client'
import {
  initMatrixClient,
  createMatrix as createMatrixImpl,
  addSampleRows as addSampleRowsImpl,
  resetDatabase as resetDatabaseImpl,
  handleMatrixWorkerMessage,
} from './matrix-client'

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })

let workerReady = false
const pendingMessages: ClientMessage[] = []

const flushPending = () => {
  if (!workerReady) return
  while (pendingMessages.length > 0) {
    const msg = pendingMessages.shift()
    worker.postMessage(msg)
  }
}

const post = (message: ClientMessage) => {
  if (workerReady) {
    worker.postMessage(message)
  } else {
    pendingMessages.push(message)
  }
}

// Initialize submodule clients
initSqlClient(post)
initMatrixClient(post)

// Re-export SQL operations
export { addObserver, removeObserver }
export const execQuery = execSqlQuery

// Re-export Matrix operations
export const createMatrix = createMatrixImpl
export const addSampleRows = addSampleRowsImpl
export const resetDatabase = resetDatabaseImpl

worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type } = event.data

  // Handle core worker messages
  switch (type) {
    case 'ready': {
      workerReady = true
      flushPending()
      return
    }
    case 'log': {
      console.log(event.data.message)
      return
    }
    case 'error': {
      console.error(event.data.error)
      return
    }
  }

  // Route SQL messages to SQL client handler
  if (
    type === 'subscribeResult' ||
    type === 'subscribeError' ||
    type === 'executeAck' ||
    type === 'executeError'
  ) {
    handleSqlWorkerMessage(event.data)
    return
  }

  // Route Matrix messages to Matrix client handler
  if (
    type === 'createMatrixSuccess' ||
    type === 'createMatrixError' ||
    type === 'addSampleRowsAck' ||
    type === 'addSampleRowsError' ||
    type === 'resetDatabaseAck' ||
    type === 'resetDatabaseError'
  ) {
    handleMatrixWorkerMessage(event.data)
    return
  }

  throw new Error(`Unknown message type: ${type}`)
}
