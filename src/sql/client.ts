import type {
  ExecuteResultMessage,
  ExecuteErrorMessage,
  WorkerMessage,
  SqlResult,
} from './types'

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })

type ExecuteResultListener = (data: ExecuteResultMessage | ExecuteErrorMessage) => void

const executeResultListeners = new Map<string, Set<ExecuteResultListener>>()

const addExecuteResultListener = (sql: string, listener: ExecuteResultListener) => {
  const listeners = executeResultListeners.get(sql)

  if (listeners) {
    listeners.add(listener)
  } else {
    executeResultListeners.set(sql, new Set([listener]))
  }
}

worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type } = event.data

  if (type === 'executeResult') {
    const { sql } = event.data

    const listeners = executeResultListeners.get(sql)

    if (listeners) {
      for (const listener of listeners) {
        listener(event.data)
      }

      executeResultListeners.delete(sql)
    } else {
      console.warn(`No listener for execute result of ${sql}`)
    }
  } else if (type === 'executeError') {
    const { sql } = event.data

    const listeners = executeResultListeners.get(sql)

    if (listeners) {
      for (const listener of listeners) {
        listener(event.data)
      }

      executeResultListeners.delete(sql)
    } else {
      console.warn(`No listener for execute error of ${sql}`)
    }
  } else if (type === 'log') {
    console.log(event.data.message)
  } else if (type === 'error') {
    console.error(event.data.error)
  }
}

export const executeSql = (sql: string, bind?: (string | number | boolean)[]) => {
  worker.postMessage({ type: 'execute', sql, bind })

  return new Promise<SqlResult>((resolve, reject) => {
    addExecuteResultListener(sql, (data) => {
      if (data.type === 'executeResult') {
        resolve(data.result)
      } else if (data.type === 'executeError') {
        reject(data.error)
      }
    })
  })
}
