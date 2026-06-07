// Handles SQL messages, and also manages subscriptions to SQL statements.

import type { PreparedStatement } from '@sqlite.org/sqlite-wasm'

import type { SqlClientMessage, SqlWorkerMessage } from '../sql-types'

import {
  consumePendingDirtySet,
  inferScope,
  setPendingFlushCallback,
  shouldRecompute,
  STRUCTURAL_TABLES,
  tablesVisitedBySql,
  type SubscriptionScope,
} from './invalidation'
import { sqliteWasm } from './worker-db'

const postMessage = (message: SqlWorkerMessage) => {
  self.postMessage(message)
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
const scopesBySql: Map<Sql, SubscriptionScope> = new Map()

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
    const visited = tablesVisitedBySql(sql)
    tablesBySql.set(sql, visited)
    for (const table of visited) {
      const set = subscribersByTable.get(table)
      if (set) {
        set.add(sql)
      } else {
        subscribersByTable.set(table, new Set([sql]))
      }
    }

    // Infer structural scope for range-aware invalidation.
    const scope = inferScope(sql, visited)
    scopesBySql.set(sql, scope)

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
  scopesBySql.delete(sql)

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

// Deferred subscription trigger: collects table names during a synchronous
// batch (e.g. a SQLite transaction with multiple writes) and runs the
// subscription queries in the next microtask — after all transactions have
// committed and the database is in a consistent state.
let pendingTables = new Set<string>()
let triggerScheduled = false

const flushPendingTriggers = () => {
  triggerScheduled = false
  const tables = pendingTables
  pendingTables = new Set()

  // Consume any structural dirty set emitted during this batch.
  const dirty = consumePendingDirtySet()

  const firedSqls = new Set<Sql>()

  // If a dirty set was emitted, use range-aware matching for all subscriptions.
  // Otherwise, fall back to pure table-grained (the pre-8b behavior for
  // non-structural ops like ref-join creation).
  if (dirty) {
    for (const [sql, scope] of scopesBySql) {
      if (!firedSqls.has(sql) && shouldRecompute(scope, tables, dirty)) {
        firedSqls.add(sql)
        runSubscribedSql(sql)
      }
    }
  } else {
    for (const table of tables) {
      const sqls = subscribersByTable.get(table)
      if (sqls) {
        for (const sql of sqls) {
          if (!firedSqls.has(sql)) {
            firedSqls.add(sql)
            runSubscribedSql(sql)
          }
        }
      }
    }
  }
}

const scheduleTriggerFlush = () => {
  if (!triggerScheduled) {
    triggerScheduled = true
    queueMicrotask(flushPendingTriggers)
  }
}

export const triggerSubscribedQueries = (tableName: string) => {
  pendingTables.add(tableName.toLowerCase())
  scheduleTriggerFlush()
}

// Wire the dirty-set emitter to schedule a flush (so dirty sets emitted
// after the update_hook but before the microtask fires are included).
setPendingFlushCallback(scheduleTriggerFlush)

type SqliteWasm = Awaited<typeof sqliteWasm>

export const initSqlHandler = (db: SqliteWasm['db'], sqlite3: SqliteWasm['sqlite3']) => {
  sqlite3.capi.sqlite3_update_hook(
    db,
    (_bind: number, _op: number, _dbName: string, table: string, _rowid: bigint) => {
      triggerSubscribedQueries(table)
    },
    0,
  )
}

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
        const stmt = db.prepare(sql)
        const result = []
        try {
          while (stmt.step()) {
            result.push(stmt.get({}))
          }
        } finally {
          stmt.finalize()
        }
        postMessage({ type: 'executeResult', id, result })
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

// Exported for the perf harness invalidation recorder (it mirrors this
// module's table mapping logic to test invalidation deterministically).
export { STRUCTURAL_TABLES as structuralTables }
