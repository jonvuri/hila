// Handles SQL messages, and also manages subscriptions to SQL statements.

import type { PreparedStatement } from '@sqlite.org/sqlite-wasm'

import type { SqlBindings, SqlClientMessage, SqlWorkerMessage } from '../sql-types'
import { isReadOnlySelect, parseSingleStatement } from '../../sql/sql-statement'

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

type SubscriptionId = string

type PreparedTemplate = {
  statement: PreparedStatement
  tables: Set<string>
  scope: SubscriptionScope
  subscriptionIds: Set<SubscriptionId>
}

type Subscription = {
  id: SubscriptionId
  sql: string
  bindings: SqlBindings
  template: PreparedTemplate
}

// A subscription's opaque identity is distinct from the reusable prepared SQL
// template. Multiple bound executions can therefore share one statement shape
// without sharing results or bindings.
const preparedTemplatesBySql = new Map<string, PreparedTemplate>()
const subscriptionsById = new Map<SubscriptionId, Subscription>()
const subscribersByTable = new Map<string, Set<SubscriptionId>>()
const preparingSubscriptionIds = new Set<SubscriptionId>()
const cancelledSubscriptionIds = new Set<SubscriptionId>()
const pendingTemplateUsersBySql = new Map<string, number>()

// Phase 9.7 Stage C2 — gather subscriptions (inline block folding). A gather is
// not a single prepared statement (it's the count+slice flattener over
// scroll_index + each block's source), so it can't ride `preparedStatementsBySql`.
// It registers a table-grained runner here; the same update-hook flush re-runs it
// when any table it visits changes (no new invalidation machinery — 9.7b §1).
type GatherRunner = { tables: Set<string>; run: () => void }
const gatherRunners: Map<string, GatherRunner> = new Map()

export const registerGatherRunner = (key: string, tables: Set<string>, run: () => void) => {
  gatherRunners.set(key, { tables, run })
}

export const unregisterGatherRunner = (key: string) => {
  gatherRunners.delete(key)
}

const parseSelectStatement = (
  sql: string,
): { root: unknown; error: null } | { root: null; error: string } => {
  const parsed = parseSingleStatement(sql)
  if (!parsed.ok) return { root: null, error: parsed.message }
  if (!isReadOnlySelect(parsed.statement.root)) {
    return { root: null, error: 'query SQL must be a read-only SELECT' }
  }
  return { root: parsed.statement.root, error: null }
}

const postSubscriptionError = (subscriptionId: string, sql: string, detail: string): void => {
  postMessage({
    type: 'subscribeError',
    subscriptionId,
    error: new Error(`Error preparing SQL: ${trimSql(sql)} (${detail})`),
  })
}

const finalizeUnusedTemplate = (sql: string, template: PreparedTemplate): void => {
  if (
    preparedTemplatesBySql.get(sql) === template &&
    template.subscriptionIds.size === 0 &&
    (pendingTemplateUsersBySql.get(sql) ?? 0) === 0
  ) {
    template.statement.finalize()
    preparedTemplatesBySql.delete(sql)
  }
}

const prepareTemplate = async (
  subscriptionId: string,
  sql: string,
): Promise<PreparedTemplate | null> => {
  const existing = preparedTemplatesBySql.get(sql)
  if (existing) return existing

  const parsed = parseSelectStatement(sql)
  if (parsed.error) {
    postSubscriptionError(subscriptionId, sql, parsed.error)
    return null
  }

  const { db, sqlite3 } = await sqliteWasm
  // Concurrent worker message handlers can both cross the await above. Recheck
  // before preparing so equal templates still converge on one statement.
  const preparedWhileWaiting = preparedTemplatesBySql.get(sql)
  if (preparedWhileWaiting) return preparedWhileWaiting

  try {
    const statement = db.prepare(sql)
    if (!sqlite3.capi.sqlite3_stmt_readonly(statement)) {
      statement.finalize()
      postSubscriptionError(subscriptionId, sql, 'statement is not read-only')
      return null
    }
    const visited = tablesVisitedBySql(sql, parsed.root)
    const template: PreparedTemplate = {
      statement,
      tables: visited,
      scope: inferScope(sql, visited, parsed.root),
      subscriptionIds: new Set(),
    }
    preparedTemplatesBySql.set(sql, template)

    console.log(`Prepared SQL for subscription: ${trimSql(sql)}`)
    return template
  } catch (err: unknown) {
    const error = new Error(`Error preparing SQL: ${trimSql(sql)}`, { cause: err })
    postMessage({ type: 'subscribeError', subscriptionId, error })
    return null
  }
}

const subscribe = async (
  subscriptionId: SubscriptionId,
  sql: string,
  bindings: SqlBindings,
): Promise<boolean> => {
  if (subscriptionsById.has(subscriptionId)) {
    postSubscriptionError(subscriptionId, sql, 'subscription identity is already active')
    return false
  }
  // Attaching to a live template is synchronous. This matters because worker
  // message handlers overlap: a following unsubscribe must not finalize the
  // template between this subscription's lookup and registration.
  let template = preparedTemplatesBySql.get(sql) ?? null
  if (!template) {
    preparingSubscriptionIds.add(subscriptionId)
    pendingTemplateUsersBySql.set(sql, (pendingTemplateUsersBySql.get(sql) ?? 0) + 1)
    template = await prepareTemplate(subscriptionId, sql)
    preparingSubscriptionIds.delete(subscriptionId)
    const pendingUsers = (pendingTemplateUsersBySql.get(sql) ?? 1) - 1
    if (pendingUsers === 0) pendingTemplateUsersBySql.delete(sql)
    else pendingTemplateUsersBySql.set(sql, pendingUsers)
  }
  if (!template) {
    cancelledSubscriptionIds.delete(subscriptionId)
    return false
  }
  // The matching unsubscribe may have arrived while preparation awaited the
  // database. Do not resurrect a subscription that the client already ended.
  if (cancelledSubscriptionIds.delete(subscriptionId)) {
    finalizeUnusedTemplate(sql, template)
    return false
  }

  const subscription: Subscription = { id: subscriptionId, sql, bindings, template }
  subscriptionsById.set(subscriptionId, subscription)
  template.subscriptionIds.add(subscriptionId)
  for (const table of template.tables) {
    const subscribers = subscribersByTable.get(table)
    if (subscribers) subscribers.add(subscriptionId)
    else subscribersByTable.set(table, new Set([subscriptionId]))
  }
  return true
}

const unsubscribe = (subscriptionId: SubscriptionId) => {
  const subscription = subscriptionsById.get(subscriptionId)
  if (!subscription) {
    if (preparingSubscriptionIds.has(subscriptionId)) {
      cancelledSubscriptionIds.add(subscriptionId)
    }
    return
  }

  subscriptionsById.delete(subscriptionId)
  subscription.template.subscriptionIds.delete(subscriptionId)
  for (const table of subscription.template.tables) {
    const subscribers = subscribersByTable.get(table)
    if (subscribers) {
      subscribers.delete(subscriptionId)
      if (subscribers.size === 0) {
        subscribersByTable.delete(table)
      }
    }
  }

  finalizeUnusedTemplate(subscription.sql, subscription.template)

  console.log(`Unsubscribed from SQL: ${trimSql(subscription.sql)}`)
}

const runSubscribedSql = (subscriptionId: SubscriptionId) => {
  const subscription = subscriptionsById.get(subscriptionId)
  if (!subscription) {
    console.error(`Tried to run inactive SQL subscription: ${subscriptionId}`)
    return
  }

  const { statement } = subscription.template
  try {
    if (subscription.bindings.length > 0) statement.bind(subscription.bindings)
    const result = []
    while (statement.step()) {
      result.push(statement.get({}))
    }

    postMessage({ type: 'subscribeResult', subscriptionId, result })
  } catch (err: unknown) {
    const error = new Error(`Error running subscribed SQL: ${trimSql(subscription.sql)}`, {
      cause: err,
    })
    postMessage({ type: 'subscribeError', subscriptionId, error })
  } finally {
    try {
      statement.reset(true)
    } catch {
      // Preserve the original execution error. A broken statement will fail
      // again on invalidation and is finalized when its last subscriber leaves.
    }
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

  const firedSubscriptions = new Set<SubscriptionId>()

  // If a dirty set was emitted, use range-aware matching for all subscriptions.
  // Otherwise, fall back to pure table-grained (the pre-8b behavior for
  // non-structural ops like ref-join creation).
  if (dirty) {
    for (const [subscriptionId, subscription] of subscriptionsById) {
      if (
        !firedSubscriptions.has(subscriptionId) &&
        shouldRecompute(subscription.template.scope, tables, dirty)
      ) {
        firedSubscriptions.add(subscriptionId)
        runSubscribedSql(subscriptionId)
      }
    }
  } else {
    for (const table of tables) {
      const subscriptionIds = subscribersByTable.get(table)
      if (subscriptionIds) {
        for (const subscriptionId of subscriptionIds) {
          if (!firedSubscriptions.has(subscriptionId)) {
            firedSubscriptions.add(subscriptionId)
            runSubscribedSql(subscriptionId)
          }
        }
      }
    }
  }

  // Re-run gather subscriptions whose visited tables intersect this batch's
  // writes (table-grained; the flattener isn't a single prepared statement).
  if (gatherRunners.size > 0) {
    for (const runner of gatherRunners.values()) {
      for (const table of tables) {
        if (runner.tables.has(table)) {
          runner.run()
          break
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
      const { subscriptionId, sql, bindings } = message
      if (await subscribe(subscriptionId, sql, bindings)) runSubscribedSql(subscriptionId)
      break
    }

    case 'unsubscribe': {
      unsubscribe(message.subscriptionId)
      break
    }

    case 'execute': {
      const { sql, id, bindings, mode } = message
      try {
        const syntaxError = mode === 'query' ? parseSelectStatement(sql).error : null
        if (syntaxError) throw new Error(syntaxError)

        const { db, sqlite3 } = await sqliteWasm
        const stmt = db.prepare(sql)
        const result = []
        try {
          if (mode === 'query' && !sqlite3.capi.sqlite3_stmt_readonly(stmt)) {
            throw new Error('query execution requires a read-only statement')
          }
          if (bindings.length > 0) stmt.bind(bindings)
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
