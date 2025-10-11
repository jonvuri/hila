// Handles SQL messages, and also manages subscriptions to SQL statements.

import type { PreparedStatement } from '@sqlite.org/sqlite-wasm'
import { Parser } from 'node-sql-parser/build/sqlite'

import type { SqlClientMessage, SqlWorkerMessage } from '../sql-types'

import { sqliteWasm } from './worker-db'

const parser = new Parser()

const postMessage = (message: SqlWorkerMessage) => {
  self.postMessage(message)
}

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

const trimSql = (sql: string) => {
  return sql.trim().replace(/\s+/g, ' ')
}

// Keep track of subscriber queries and their tables, to run queries again when
// tables update.
type Sql = string

const preparedStatementsBySql: Map<Sql, PreparedStatement> = new Map()
const tablesBySql: Map<Sql, Set<string>> = new Map()
const subscribersByTable: Map<string, Set<Sql>> = new Map()

const subscribe = async (sql: Sql) => {
  const existing = preparedStatementsBySql.get(sql)

  if (existing) {
    console.error(`Tried to subscribe, but SQL was already subscribed: ${trimSql(sql)}`)
    return
  }

  const { db } = await sqliteWasm

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

    console.log(`Prepared SQL for subscription: ${trimSql(sql)}`)
  } catch (err: unknown) {
    const error = new Error(`Error preparing SQL: ${trimSql(sql)}`, { cause: err })
    postMessage({ type: 'subscribeError', sql, error })
    throw error
  }
}

const unsubscribe = (sql: Sql) => {
  const preparedStatement = preparedStatementsBySql.get(sql)

  if (!preparedStatement) {
    console.error(
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

  console.log(`Unsubscribed from SQL: ${trimSql(sql)}`)
}

const runSubscribedSql = async (sql: Sql) => {
  const statement = preparedStatementsBySql.get(sql)

  if (!statement) {
    console.error(`Tried to run, but no prepared statement was found for SQL: ${trimSql(sql)}`)
    return
  }

  try {
    const result = []
    while (statement.step()) {
      result.push(statement.get({}))
    }
    statement.reset()

    postMessage({ type: 'subscribeResult', sql, result })
  } catch (err: unknown) {
    const error = new Error(`Error running subscribed SQL: ${trimSql(sql)}`, { cause: err })
    postMessage({ type: 'subscribeError', sql, error })
  }
}

// Public interface for triggering subscribed queries when tables change
export const triggerSubscribedQueries = (tableName: string) => {
  const normalizedTable = tableName.toLowerCase()
  const sqls = subscribersByTable.get(normalizedTable)
  if (sqls) {
    for (const sql of sqls) {
      // Fire and forget; errors are reported via subscribeError channel
      runSubscribedSql(sql)
    }
  }
}

// Register update hook to re-run subscribed statements when tables are changed
sqliteWasm.then(({ db, sqlite3 }) => {
  sqlite3.capi.sqlite3_update_hook(
    db,
    (_bind: number, _op: number, _dbName: string, table: string, _rowid: bigint) => {
      triggerSubscribedQueries(table)
    },
    0,
  )
})

export const handleSqlClientMessage = async (message: SqlClientMessage) => {
  switch (message.type) {
    case 'subscribe': {
      const { sql } = message
      await subscribe(sql)
      await runSubscribedSql(sql)
      break
    }

    case 'unsubscribe': {
      const { sql } = message
      unsubscribe(sql)
      break
    }

    case 'execute': {
      const { sql, id } = message
      try {
        const { db } = await sqliteWasm
        db.exec(sql)
        postMessage({ type: 'executeAck', id })
      } catch (err: unknown) {
        postMessage({
          type: 'executeError',
          id,
          error: err instanceof Error ? err : new Error(String(err)),
        })
      }
      break
    }
  }
}
