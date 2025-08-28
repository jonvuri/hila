import type { ClientMessage, WorkerMessage } from '../types'

import { handleMatrixWorkerMessage } from './matrix-client-handler'
import { handleSqlWorkerMessage } from './sql-client-handler'

export const worker = new Worker(new URL('../worker/worker.ts', import.meta.url), {
  type: 'module',
})

let workerReady = false
const pendingMessages: ClientMessage[] = []
let readyResolve: (() => void) | null = null

export const awaitWorkerReady = () => {
  return new Promise<void>((resolve) => {
    readyResolve = resolve
  })
}

const flushPending = () => {
  if (!workerReady) return
  while (pendingMessages.length > 0) {
    const msg = pendingMessages.shift()
    worker.postMessage(msg)
  }
}

export const postMessage = (message: ClientMessage) => {
  if (workerReady) {
    worker.postMessage(message)
  } else {
    pendingMessages.push(message)
  }
}

worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data
  const { type } = message

  switch (type) {
    case 'ready':
      workerReady = true
      flushPending()
      if (readyResolve) {
        readyResolve()
        readyResolve = null
      }
      return
    case 'log':
      console.log(message.message)
      return
    case 'error':
      console.error(message.error)
      return
    case 'subscribeResult':
    case 'subscribeError':
    case 'executeAck':
    case 'executeError':
      handleSqlWorkerMessage(message)
      return
    case 'createMatrixSuccess':
    case 'createMatrixError':
    case 'addSampleRowsAck':
    case 'addSampleRowsError':
    case 'resetDatabaseAck':
    case 'resetDatabaseError':
      handleMatrixWorkerMessage(message)
      return
    default:
      throw type satisfies never
  }
}
