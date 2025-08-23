import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database, PreparedStatement } from '@sqlite.org/sqlite-wasm'
import { Parser } from 'node-sql-parser/build/sqlite'

import type { ClientMessage, WorkerMessage } from './types'

const parser = new Parser()

// Table specifiers from parser.tableList have this format:
// "{type}::{dbName}::{tableName}"
// We normalize them to just the table name.
const normalizeTableName = (tableSpecifier: string) => {
  const tableName = tableSpecifier.split('::').pop()

  if (!tableName) {
    throw new Error(`Invalid table specifier: ${tableSpecifier}`)
  }

  return tableName.toLowerCase()
}

const tablesVisitedBySql = (sql: string): string[] => {
  try {
    const list = parser.tableList(sql)
    return list.map(normalizeTableName)
  } catch (_err) {
    return []
  }
}

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
    let db: Database
    if ('opfs' in sqlite3) {
      try {
        db = new sqlite3.oo1.OpfsDb('/hioa-db.sqlite3')
      } catch (_) {
        // Fall back to in-memory in case OPFS is unavailable (e.g., in tests)
        db = new sqlite3.oo1.DB(':memory:', 'c')
        log('Fell back to in-memory DB')
      }
    } else {
      db = new sqlite3.oo1.DB(':memory:', 'c')
      log('Using in-memory DB (no OPFS)')
    }

    log('Done initializing SQLite')
    post({ type: 'ready' })

    // Register update hook to re-run subscribed statements when tables are changed.
    try {
      // The update hook fires on INSERT/UPDATE/DELETE operations.
      sqlite3.capi.sqlite3_update_hook(
        db,
        (_bind: number, _op: number, _dbName: string, table: string, _rowid: bigint) => {
          const normalizedTable = table.toLowerCase()
          const sqls = subscribersByTable.get(normalizedTable)
          if (sqls) {
            for (const sql of sqls) {
              // Fire and forget; errors are reported via subscribeError channel
              runSubscribedSql(sql)
            }
          }
        },
        0,
      )
      log('Registered sqlite3_update_hook for write invalidation')
    } catch (err) {
      logError(new Error('Failed to register sqlite3_update_hook', { cause: err as Error }))
    }

    return db
  } catch (err: unknown) {
    throw new Error('SQLite failed to initialize', { cause: err })
  }
})

// Keep track of subscriber queries and their tables, to run queries again when
// tables update.
type Sql = string
// type TableName = string

const preparedStatementsBySql: Map<Sql, PreparedStatement> = new Map()
const tablesBySql: Map<Sql, Set<string>> = new Map()
const subscribersByTable: Map<string, Set<Sql>> = new Map()

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

    // Track tables read by this SQL for selective invalidation
    const visited = new Set(tablesVisitedBySql(sql))
    tablesBySql.set(sql, visited)
    for (const table of visited) {
      const set = subscribersByTable.get(table)
      if (set) {
        set.add(sql)
      } else {
        subscribersByTable.set(table, new Set([sql]))
      }
    }

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

  // Remove from table indexes
  const tables = tablesBySql.get(sql)
  if (tables) {
    for (const table of tables) {
      const set = subscribersByTable.get(table)
      if (set) {
        set.delete(sql)
        if (set.size === 0) {
          subscribersByTable.delete(table)
        }
      }
    }
    tablesBySql.delete(sql)
  }

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
    statement.reset()

    post({ type: 'subscribeResult', sql, result })
  } catch (err: unknown) {
    const error = new Error(`Error running subscribed SQL: ${trimSql(sql)}`, { cause: err })

    post({ type: 'subscribeError', sql, error })
  }
}

const handleMessage = async (event: MessageEvent<ClientMessage>) => {
  const { type } = event.data

  log(`Received message ${type}: ${JSON.stringify(event.data)}`)

  if (type === 'subscribe') {
    const { sql } = event.data

    await subscribe(sql)
    await runSubscribedSql(sql)
  } else if (type === 'unsubscribe') {
    const { sql } = event.data

    unsubscribe(sql)
  } else if (type === 'execute') {
    const { sql, id } = event.data

    try {
      const db = await sqlite
      db.exec(sql)

      post({ type: 'executeAck', id })
    } catch (err: unknown) {
      post({
        type: 'executeError',
        id,
        error: err instanceof Error ? err : new Error(String(err)),
      })
    }
  }
}

// Support both assignment and explicit event listener to be robust across environments
onmessage = handleMessage
addEventListener('message', handleMessage as unknown as EventListener)
