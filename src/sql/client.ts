import type { WorkerMessage, SqlResult } from './types'

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })

// Keep track of all pending queries for a given SQL statement (the string key),
// to deduplicate them. All queries are resolved or rejected together.
const pendingQueries = new Map<
  string,
  { resolve: (result: SqlResult) => void; reject: (error: Error) => void }[]
>()

worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type } = event.data

  if (type === 'executeResult') {
    const { sql } = event.data
    const resolvers = pendingQueries.get(sql)

    if (resolvers) {
      for (const { resolve } of resolvers) {
        resolve(event.data.result)
      }
      pendingQueries.delete(sql)
    } else {
      throw new Error(`No pending queries for execute result of ${sql}`)
    }
  } else if (type === 'executeError') {
    const { sql } = event.data
    const resolvers = pendingQueries.get(sql)

    if (resolvers) {
      for (const { reject } of resolvers) {
        reject(event.data.error)
      }
      pendingQueries.delete(sql)
    } else {
      throw new Error(`No pending queries for execute error of ${sql}`)
    }
  } else if (type === 'log') {
    console.log(event.data.message)
  } else if (type === 'error') {
    console.error(event.data.error)
  }
}

export const executeSql = (sql: string, bind?: (string | number | boolean)[]) => {
  return new Promise<SqlResult>((resolve, reject) => {
    const existing = pendingQueries.get(sql)
    if (existing) {
      existing.push({ resolve, reject })
    } else {
      pendingQueries.set(sql, [{ resolve, reject }])
      worker.postMessage({ type: 'execute', sql, bind })
    }
  })
}
