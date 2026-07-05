import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

import type { GatherResult, GatherSpec, SqlResult } from '../sql-types'
import { gatherKey } from '../sql-types'

// Mock the worker transport so we can assert what the client posts without a
// real Worker. All other modules under test are pure.
vi.mock('./worker-client', () => ({ postMessage: vi.fn() }))

const { addObserver, removeObserver, addGatherObserver, removeGatherObserver } = await import(
  './sql-client'
)
const { handleSqlWorkerMessage } = await import('./sql-client-handler')
const { postMessage } = await import('./worker-client')
const { subscribedObservers, lastOutcomeBySql, gatherObservers, lastGatherOutcomeByKey } =
  await import('./sql-client-promises')

const mockPost = postMessage as Mock

const subscribeCalls = () => mockPost.mock.calls.filter(([m]) => m.type === 'subscribe').length
const unsubscribeCalls = () =>
  mockPost.mock.calls.filter(([m]) => m.type === 'unsubscribe').length
const subscribeGatherCalls = () =>
  mockPost.mock.calls.filter(([m]) => m.type === 'subscribeGather').length

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

    // Worker delivers the initial result to the live pool.
    const result: SqlResult = [{ id: 1, label: 'a' }]
    handleSqlWorkerMessage({ type: 'subscribeResult', sql: 'SELECT 1', result })
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

    const error = new Error('boom')
    handleSqlWorkerMessage({ type: 'subscribeError', sql: 'SELECT bad', error })
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
    handleSqlWorkerMessage({
      type: 'subscribeResult',
      sql: 'SELECT 1',
      result: [{ id: 1 }],
    })
    expect(lastOutcomeBySql.has('SELECT 1')).toBe(true)

    removeObserver('SELECT 1', o1)
    expect(unsubscribeCalls()).toBe(1)
    expect(lastOutcomeBySql.has('SELECT 1')).toBe(false)

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
    removeObserver('SELECT 1', o1)

    // A result in flight past the unsubscribe finds no pool: it must not
    // resurrect a cache entry that would then outlive any subscription.
    handleSqlWorkerMessage({
      type: 'subscribeResult',
      sql: 'SELECT 1',
      result: [{ id: 1 }],
    })
    expect(lastOutcomeBySql.has('SELECT 1')).toBe(false)
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
