import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

import type { GatherResult, GatherSpec, SqlResult } from '../sql-types'
import { gatherKey } from '../sql-types'

// Mock the worker transport so we can assert what the client posts without a
// real Worker. All other modules under test are pure.
vi.mock('./worker-client', () => ({ postMessage: vi.fn() }))

const { addObserver, removeObserver, addGatherObserver, removeGatherObserver, sqlRequestKey } =
  await import('./sql-client')
const { handleSqlWorkerMessage } = await import('./sql-client-handler')
const { postMessage } = await import('./worker-client')
const {
  subscribedObservers,
  subscriptionKeysById,
  lastOutcomeBySql,
  gatherObservers,
  lastGatherOutcomeByKey,
} = await import('./sql-client-promises')

const mockPost = postMessage as Mock

const subscribeCalls = () => mockPost.mock.calls.filter(([m]) => m.type === 'subscribe').length
const unsubscribeCalls = () =>
  mockPost.mock.calls.filter(([m]) => m.type === 'unsubscribe').length
const subscribeGatherCalls = () =>
  mockPost.mock.calls.filter(([m]) => m.type === 'subscribeGather').length
const lastSubscriptionId = (): string => {
  const call = mockPost.mock.calls.filter(([m]) => m.type === 'subscribe').at(-1)
  if (!call) throw new Error('expected a subscription message')
  return call[0].subscriptionId as string
}

const makeSpec = (focusRootHex: string): GatherSpec => ({
  focusRootHex,
  collapsedKeyHexes: [],
  afterKeyHex: focusRootHex,
  minPage: 0,
  maxPage: 0,
  rowsPerWindow: 100,
  blocks: [],
})

describe('SQL subscription observer pool (late-joiner replay)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    subscribedObservers.clear()
    subscriptionKeysById.clear()
    lastOutcomeBySql.clear()
  })

  it('subscribes only once when a second observer joins the same pool', () => {
    addObserver('SELECT 1', vi.fn())
    addObserver('SELECT 1', vi.fn())

    // The worker should be told to subscribe exactly once — a duplicate would
    // trigger the "already subscribed" error + a whole-pool re-run.
    expect(subscribeCalls()).toBe(1)
  })

  it('replays the last result synchronously to a late joiner', () => {
    const o1 = vi.fn()
    addObserver('SELECT 1', o1)
    const subscriptionId = lastSubscriptionId()

    // Worker delivers the initial result to the live pool.
    const result: SqlResult = [{ id: 1, label: 'a' }]
    handleSqlWorkerMessage({ type: 'subscribeResult', subscriptionId, result })
    expect(o1).toHaveBeenCalledWith(result, null)

    // A late joiner (e.g. a remount before the previous cleanup) must receive
    // the cached result immediately — the regression this fix guards.
    const o2 = vi.fn()
    addObserver('SELECT 1', o2)
    expect(o2).toHaveBeenCalledWith(result, null)
    expect(subscribeCalls()).toBe(1) // no redundant re-subscribe
  })

  it('replays the last error synchronously to a late joiner', () => {
    const o1 = vi.fn()
    addObserver('SELECT bad', o1)
    const subscriptionId = lastSubscriptionId()

    const error = new Error('boom')
    handleSqlWorkerMessage({ type: 'subscribeError', subscriptionId, error })
    expect(o1).toHaveBeenCalledWith(null, error)

    const o2 = vi.fn()
    addObserver('SELECT bad', o2)
    expect(o2).toHaveBeenCalledWith(null, error)
  })

  it('does not replay to the first observer of a fresh pool', () => {
    const o1 = vi.fn()
    addObserver('SELECT 1', o1)
    // First observer waits for the async worker result; nothing to replay yet.
    expect(o1).not.toHaveBeenCalled()
    expect(subscribeCalls()).toBe(1)
  })

  it('clears the replay cache and re-subscribes after the pool empties', () => {
    const o1 = vi.fn()
    addObserver('SELECT 1', o1)
    const subscriptionId = lastSubscriptionId()
    handleSqlWorkerMessage({
      type: 'subscribeResult',
      subscriptionId,
      result: [{ id: 1 }],
    })
    expect(lastOutcomeBySql.has(sqlRequestKey('SELECT 1'))).toBe(true)

    removeObserver('SELECT 1', o1)
    expect(unsubscribeCalls()).toBe(1)
    expect(lastOutcomeBySql.has(sqlRequestKey('SELECT 1'))).toBe(false)

    // A brand-new pool for the same SQL subscribes again and has nothing stale
    // to replay.
    const o2 = vi.fn()
    addObserver('SELECT 1', o2)
    expect(subscribeCalls()).toBe(2)
    expect(o2).not.toHaveBeenCalled()
  })

  it('does not cache a result that arrives after the pool was torn down', () => {
    const o1 = vi.fn()
    addObserver('SELECT 1', o1)
    const subscriptionId = lastSubscriptionId()
    removeObserver('SELECT 1', o1)

    // A result in flight past the unsubscribe finds no pool: it must not
    // resurrect a cache entry that would then outlive any subscription.
    handleSqlWorkerMessage({
      type: 'subscribeResult',
      subscriptionId,
      result: [{ id: 1 }],
    })
    expect(lastOutcomeBySql.has(sqlRequestKey('SELECT 1'))).toBe(false)
  })

  it('pools only exact bound requests', () => {
    const sql = 'SELECT * FROM items WHERE label = ?'
    addObserver({ sql, bindings: ['a'] }, vi.fn())
    addObserver({ sql, bindings: ['a'] }, vi.fn())
    addObserver({ sql, bindings: ['b'] }, vi.fn())

    expect(subscribeCalls()).toBe(2)
    const messages = mockPost.mock.calls
      .map(([message]) => message)
      .filter((message) => message.type === 'subscribe')
    expect(messages.map((message) => message.bindings)).toEqual([['a'], ['b']])
    expect(messages[0].subscriptionId).not.toBe(messages[1].subscriptionId)
  })

  it('cannot collide an unbound SQL string with a bound request key', () => {
    const bound = { sql: 'SELECT ?', bindings: ['value'] }
    addObserver(bound, vi.fn())
    addObserver(sqlRequestKey(bound), vi.fn())

    expect(subscribeCalls()).toBe(2)
  })

  it('does not deliver an old result to a fresh identical request', () => {
    const first = vi.fn()
    addObserver('SELECT 1', first)
    const oldId = lastSubscriptionId()
    removeObserver('SELECT 1', first)

    const fresh = vi.fn()
    addObserver('SELECT 1', fresh)
    const freshId = lastSubscriptionId()
    expect(freshId).not.toBe(oldId)

    handleSqlWorkerMessage({
      type: 'subscribeResult',
      subscriptionId: oldId,
      result: [{ id: 1 }],
    })
    expect(fresh).not.toHaveBeenCalled()

    handleSqlWorkerMessage({
      type: 'subscribeResult',
      subscriptionId: freshId,
      result: [{ id: 2 }],
    })
    expect(fresh).toHaveBeenCalledWith([{ id: 2 }], null)
  })
})

describe('gather subscription observer pool (late-joiner replay)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    gatherObservers.clear()
    lastGatherOutcomeByKey.clear()
  })

  it('subscribes only once when a second observer joins the same gather pool', () => {
    const spec = makeSpec('a')
    addGatherObserver(spec, vi.fn())
    addGatherObserver(spec, vi.fn())

    expect(subscribeGatherCalls()).toBe(1)
  })

  it('replays the last gather result synchronously to a late joiner', () => {
    const spec = makeSpec('a')
    const key = gatherKey(spec)
    const o1 = vi.fn()
    addGatherObserver(spec, o1)

    const result: GatherResult = { rows: [{ row_id: 1 }], totalVirtual: 1 }
    handleSqlWorkerMessage({ type: 'gatherResult', key, result })
    expect(o1).toHaveBeenCalledWith(result, null)

    // A late joiner (remount before the previous cleanup) must receive the
    // cached result immediately — the gather twin of the SQL late-joiner race.
    const o2 = vi.fn()
    addGatherObserver(spec, o2)
    expect(o2).toHaveBeenCalledWith(result, null)
    expect(subscribeGatherCalls()).toBe(1)
  })

  it('replays the last gather error synchronously to a late joiner', () => {
    const spec = makeSpec('a')
    const key = gatherKey(spec)
    const o1 = vi.fn()
    addGatherObserver(spec, o1)

    const error = new Error('boom')
    handleSqlWorkerMessage({ type: 'gatherError', key, error })
    expect(o1).toHaveBeenCalledWith(null, error)

    const o2 = vi.fn()
    addGatherObserver(spec, o2)
    expect(o2).toHaveBeenCalledWith(null, error)
  })

  it('clears the cache and re-subscribes after the gather pool empties', () => {
    const spec = makeSpec('a')
    const key = gatherKey(spec)
    const o1 = vi.fn()
    addGatherObserver(spec, o1)
    handleSqlWorkerMessage({
      type: 'gatherResult',
      key,
      result: { rows: [], totalVirtual: 0 },
    })
    expect(lastGatherOutcomeByKey.has(key)).toBe(true)

    removeGatherObserver(spec, o1)
    expect(lastGatherOutcomeByKey.has(key)).toBe(false)

    const o2 = vi.fn()
    addGatherObserver(spec, o2)
    expect(subscribeGatherCalls()).toBe(2)
    expect(o2).not.toHaveBeenCalled()
  })

  it('does not cache a gather result that arrives after teardown', () => {
    const spec = makeSpec('a')
    const key = gatherKey(spec)
    const o1 = vi.fn()
    addGatherObserver(spec, o1)
    removeGatherObserver(spec, o1)

    handleSqlWorkerMessage({
      type: 'gatherResult',
      key,
      result: { rows: [], totalVirtual: 0 },
    })
    expect(lastGatherOutcomeByKey.has(key)).toBe(false)
  })
})
