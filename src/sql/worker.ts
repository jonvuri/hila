import initSqliteWasm from '@sqlite.org/sqlite-wasm'

import type { ClientMessage, WorkerMessage } from './types'

const sendLog = (message: string) => {
  postMessage({ type: 'log', message })
}

const sendError = (error: Error | string) => {
  postMessage({ type: 'error', error: error instanceof Error ? error : new Error(error) })
}

sendLog('Initializing SQLite')

const sqlite = initSqliteWasm({
  print: sendLog,
  printErr: sendError,
}).then((sqlite3) => {
  try {
    if (!('opfs' in sqlite3)) {
      sendError(new Error('OPFS is not available'))
    }

    const opfsDb = new sqlite3.oo1.OpfsDb('/hioa-db.sqlite3')

    sendLog('Done initializing SQLite')

    return opfsDb
  } catch (err: unknown) {
    if (err instanceof Error) {
      sendError(err)
    } else {
      sendError(new Error(`Unknown error initializing SQLite: ${err}`))
    }

    return null
  }
})

onmessage = (event: MessageEvent<ClientMessage>) => {
  const { type } = event.data

  if (type === 'execute') {
    const { sql, bind } = event.data

    sendLog(`Executing SQL: ${sql}`)

    sqlite
      .then((db) => {
        if (!db) {
          throw new Error('SQLite failed to initialize')
        }

        const result = db.exec({
          sql,
          bind,
          returnValue: 'resultRows',
          rowMode: 'object',
        })

        const message: WorkerMessage = {
          type: 'executeResult',
          sql,
          result,
        }

        postMessage(message)
      })
      .catch((err) => {
        const error = err instanceof Error ? err : new Error(`Unknown error: ${err}`)

        postMessage({ type: 'executeError', sql, error })
      })
  }
}
