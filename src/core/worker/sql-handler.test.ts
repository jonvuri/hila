import { describe, expect, test, vi } from 'vitest'

const harness = vi.hoisted(() => {
  const posted: unknown[] = []
  const statements: FakeStatement[] = []

  class FakeStatement {
    bindings: readonly unknown[] = []
    finalized = false
    stepped = false

    bind(values: readonly unknown[]) {
      this.bindings = [...values]
      return this
    }

    reset(clear?: boolean) {
      this.stepped = false
      if (clear) this.bindings = []
      return this
    }

    step() {
      if (this.stepped) return false
      this.stepped = true
      return true
    }

    get() {
      return { value: this.bindings[0] ?? null }
    }

    finalize() {
      this.finalized = true
      return 0
    }
  }

  const db = {
    prepare: vi.fn(() => {
      const statement = new FakeStatement()
      statements.push(statement)
      return statement
    }),
  }

  return { posted, statements, db }
})

vi.mock('./worker-db', () => ({
  sqliteWasm: Promise.resolve({
    db: harness.db,
    sqlite3: { capi: { sqlite3_stmt_readonly: () => 1 } },
  }),
}))

vi.mock('./invalidation', () => ({
  consumePendingDirtySet: () => null,
  inferScope: () => ({ dataTables: new Set(['items']), structuralTables: new Set() }),
  setPendingFlushCallback: () => undefined,
  shouldRecompute: () => true,
  STRUCTURAL_TABLES: new Set<string>(),
  tablesVisitedBySql: () => new Set(['items']),
}))

vi.stubGlobal('self', { postMessage: (message: unknown) => harness.posted.push(message) })

const { handleSqlClientMessage, triggerSubscribedQueries } = await import('./sql-handler')

describe('bound SQL worker runtime', () => {
  test('separates subscription identity from templates and enforces read-only edges', async () => {
    const sql = 'SELECT ? AS value FROM items'

    await handleSqlClientMessage({
      type: 'subscribe',
      subscriptionId: 'a',
      sql,
      bindings: ['alpha'],
    })
    await handleSqlClientMessage({
      type: 'subscribe',
      subscriptionId: 'b',
      sql,
      bindings: ['beta'],
    })

    expect(harness.db.prepare).toHaveBeenCalledTimes(1)
    expect(harness.posted).toContainEqual({
      type: 'subscribeResult',
      subscriptionId: 'a',
      result: [{ value: 'alpha' }],
    })
    expect(harness.posted).toContainEqual({
      type: 'subscribeResult',
      subscriptionId: 'b',
      result: [{ value: 'beta' }],
    })

    harness.posted.length = 0
    triggerSubscribedQueries('items')
    await Promise.resolve()
    expect(harness.posted).toEqual([
      {
        type: 'subscribeResult',
        subscriptionId: 'a',
        result: [{ value: 'alpha' }],
      },
      {
        type: 'subscribeResult',
        subscriptionId: 'b',
        result: [{ value: 'beta' }],
      },
    ])
    expect(harness.db.prepare).toHaveBeenCalledTimes(1)

    const replacement = handleSqlClientMessage({
      type: 'subscribe',
      subscriptionId: 'c',
      sql,
      bindings: ['gamma'],
    })
    const releaseOld = handleSqlClientMessage({ type: 'unsubscribe', subscriptionId: 'a' })
    await Promise.all([replacement, releaseOld])
    expect(harness.db.prepare).toHaveBeenCalledTimes(1)
    expect(harness.statements[0]!.finalized).toBe(false)

    harness.posted.length = 0
    await handleSqlClientMessage({
      type: 'subscribe',
      subscriptionId: 'write',
      sql: 'DELETE FROM items',
      bindings: [],
    })
    await handleSqlClientMessage({
      type: 'subscribe',
      subscriptionId: 'trailing',
      sql: 'SELECT 1; SELECT 2',
      bindings: [],
    })
    expect(harness.posted).toEqual([
      expect.objectContaining({ type: 'subscribeError', subscriptionId: 'write' }),
      expect.objectContaining({ type: 'subscribeError', subscriptionId: 'trailing' }),
    ])
    expect(harness.db.prepare).toHaveBeenCalledTimes(1)

    harness.posted.length = 0
    await handleSqlClientMessage({
      type: 'execute',
      id: 'read-write',
      sql: 'DELETE FROM items',
      bindings: [],
      mode: 'query',
    })
    await handleSqlClientMessage({
      type: 'execute',
      id: 'deliberate-write',
      sql: 'DELETE FROM items',
      bindings: [],
      mode: 'mutation',
    })
    expect(harness.posted).toEqual([
      expect.objectContaining({ type: 'executeError', id: 'read-write' }),
      expect.objectContaining({ type: 'executeResult', id: 'deliberate-write' }),
    ])

    await handleSqlClientMessage({ type: 'unsubscribe', subscriptionId: 'b' })
    expect(harness.statements[0]!.finalized).toBe(false)
    await handleSqlClientMessage({ type: 'unsubscribe', subscriptionId: 'c' })
    expect(harness.statements[0]!.finalized).toBe(true)
  })
})
