import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { PreparedStatement } from '@sqlite.org/sqlite-wasm'

import type { ClientMessage, WorkerMessage } from './types'

const post = (message: WorkerMessage) => {
  postMessage(message)
}

const log = (message: string) => {
  post({ type: 'log', message })
}

const logError = (error: Error | string) => {
  post({ type: 'error', error: error instanceof Error ? error : new Error(error) })
}

const trimSql = (sql: string) => {
  return sql.trim().replace(/\s+/g, ' ')
}

log('Initializing SQLite')

const sqlite = initSqliteWasm({
  print: log,
  printErr: logError,
}).then((sqlite3) => {
  try {
    if (!('opfs' in sqlite3)) {
      logError(new Error('OPFS is not available'))
    }

    const opfsDb = new sqlite3.oo1.OpfsDb('/hioa-db.sqlite3')

    log('Done initializing SQLite')

    return opfsDb
  } catch (err: unknown) {
    throw new Error('SQLite failed to initialize', { cause: err })
  }
})

// Keep track of subscriber queries and their tables, to run queries again when
// tables update.
type Sql = string
// type TableName = string

const preparedStatementsBySql: Map<Sql, PreparedStatement> = new Map()

// const subscribersByTable: Map<TableName, Set<Sql>> = new Map()

// Access patterns:
// - subscribe to a query (by sql and id)
// - unsubscribe from a query (by sql and id)
// - send query result to all subscribers for that query (sql to ids)
// - retrieve all sql queries subscribed to for a given table (table name to sqls)

const subscribe = async (sql: Sql) => {
  const existing = preparedStatementsBySql.get(sql)

  if (existing) {
    logError(`Tried to subscribe, but SQL was already subscribed: ${trimSql(sql)}`)

    return
  }

  const db = await sqlite

  try {
    const preparedStatement = db.prepare(sql)

    preparedStatementsBySql.set(sql, preparedStatement)

    log(`Prepared SQL for subscription: ${trimSql(sql)}`)
  } catch (err: unknown) {
    const error = new Error(`Error preparing SQL: ${trimSql(sql)}`, { cause: err })
    post({ type: 'subscribeError', sql, error })
    throw error
  }
}

const unsubscribe = (sql: Sql) => {
  const preparedStatement = preparedStatementsBySql.get(sql)

  if (!preparedStatement) {
    logError(
      `Tried to unsubscribe, but no prepared statement was found for SQL: ${trimSql(sql)}`,
    )

    return
  }

  preparedStatement.finalize()
  preparedStatementsBySql.delete(sql)

  log(`Unsubscribed from SQL: ${trimSql(sql)}`)
}

const runSubscribedSql = async (sql: Sql) => {
  const statement = preparedStatementsBySql.get(sql)

  if (!statement) {
    logError(`Tried to run, but no prepared statement was found for SQL: ${trimSql(sql)}`)
    return
  }

  try {
    const result = []
    while (statement.step()) {
      result.push(statement.get({}))
    }

    post({ type: 'subscribeResult', sql, result })
  } catch (err: unknown) {
    const error = new Error(`Error running subscribed SQL: ${trimSql(sql)}`, { cause: err })

    post({ type: 'subscribeError', sql, error })
  }
}

onmessage = async (event: MessageEvent<ClientMessage>) => {
  const { type } = event.data

  log(`Received message ${type}: ${JSON.stringify(event.data)}`)

  if (type === 'subscribe') {
    const { sql } = event.data

    await subscribe(sql)
    await runSubscribedSql(sql)
  } else if (type === 'unsubscribe') {
    const { sql } = event.data

    unsubscribe(sql)
  }
}
