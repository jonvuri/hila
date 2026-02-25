import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { createRoot, createSignal, type Accessor } from 'solid-js'

import type { SqlObserver } from '../core/sql-types'

import type { SqlResult } from './types'

vi.mock('../core/client/sql-client', () => ({
  addObserver: vi.fn(),
  removeObserver: vi.fn(),
}))

// Must import after mock is declared so the mock takes effect
const { useQuery } = await import('./useQuery')
const { addObserver, removeObserver } = await import('../core/client/sql-client')

const mockAddObserver = addObserver as Mock
const mockRemoveObserver = removeObserver as Mock

const getLastObserver = (): SqlObserver => {
  const calls = mockAddObserver.mock.calls
  const lastCall = calls[calls.length - 1]
  if (!lastCall) throw new Error('addObserver should have been called')
  return lastCall[1] as SqlObserver
}

describe('useQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should subscribe on mount and unsubscribe on dispose', () => {
    const dispose = createRoot((dispose) => {
      useQuery(() => 'SELECT 1')
      return dispose
    })

    expect(mockAddObserver).toHaveBeenCalledTimes(1)
    expect(mockAddObserver).toHaveBeenCalledWith('SELECT 1', expect.any(Function))
    expect(mockRemoveObserver).not.toHaveBeenCalled()

    dispose()

    expect(mockRemoveObserver).toHaveBeenCalledTimes(1)
    expect(mockRemoveObserver).toHaveBeenCalledWith('SELECT 1', expect.any(Function))
  })

  it('should return null result and error initially', () => {
    let result!: Accessor<SqlResult | null>
    let error!: Accessor<Error | null>

    const dispose = createRoot((dispose) => {
      const query = useQuery(() => 'SELECT 1')
      result = query.result
      error = query.error
      return dispose
    })

    expect(result()).toBeNull()
    expect(error()).toBeNull()

    dispose()
  })

  it('should update result when observer fires with data', () => {
    let result!: Accessor<SqlResult | null>
    let error!: Accessor<Error | null>

    const dispose = createRoot((dispose) => {
      const query = useQuery(() => 'SELECT 1')
      result = query.result
      error = query.error
      return dispose
    })

    const observer = getLastObserver()
    const testResult: SqlResult = [{ id: 1, name: 'test' }]
    observer(testResult, null)

    expect(result()).toEqual(testResult)
    expect(error()).toBeNull()

    dispose()
  })

  it('should update error when observer fires with error', () => {
    let result!: Accessor<SqlResult | null>
    let error!: Accessor<Error | null>

    const dispose = createRoot((dispose) => {
      const query = useQuery(() => 'SELECT 1')
      result = query.result
      error = query.error
      return dispose
    })

    const observer = getLastObserver()
    const testError = new Error('Test error')
    observer(null, testError)

    expect(result()).toBeNull()
    expect(error()).toBe(testError)

    dispose()
  })

  it('should clear error when a successful result arrives', () => {
    let result!: Accessor<SqlResult | null>
    let error!: Accessor<Error | null>

    const dispose = createRoot((dispose) => {
      const query = useQuery(() => 'SELECT 1')
      result = query.result
      error = query.error
      return dispose
    })

    const observer = getLastObserver()

    observer(null, new Error('fail'))
    expect(error()).toBeTruthy()

    const testResult: SqlResult = [{ id: 1 }]
    observer(testResult, null)
    expect(result()).toEqual(testResult)
    expect(error()).toBeNull()

    dispose()
  })

  it('should resubscribe when the SQL signal changes', () => {
    let setSql!: (v: string) => void

    const dispose = createRoot((dispose) => {
      const [sql, _setSql] = createSignal('SELECT 1')
      setSql = _setSql
      useQuery(sql)
      return dispose
    })

    expect(mockAddObserver).toHaveBeenCalledTimes(1)
    expect(mockAddObserver).toHaveBeenCalledWith('SELECT 1', expect.any(Function))

    setSql('SELECT 2')

    expect(mockRemoveObserver).toHaveBeenCalledTimes(1)
    expect(mockRemoveObserver).toHaveBeenCalledWith('SELECT 1', expect.any(Function))
    expect(mockAddObserver).toHaveBeenCalledTimes(2)
    expect(mockAddObserver).toHaveBeenCalledWith('SELECT 2', expect.any(Function))

    dispose()
  })

  it('should not subscribe when SQL is empty', () => {
    const dispose = createRoot((dispose) => {
      useQuery(() => '')
      return dispose
    })

    expect(mockAddObserver).not.toHaveBeenCalled()

    dispose()
  })

  it('should reset result and error when SQL changes', () => {
    let result!: Accessor<SqlResult | null>
    let error!: Accessor<Error | null>
    let setSql!: (v: string) => void

    const dispose = createRoot((dispose) => {
      const [sql, _setSql] = createSignal('SELECT 1')
      setSql = _setSql
      const query = useQuery(sql)
      result = query.result
      error = query.error
      return dispose
    })

    const observer = getLastObserver()
    observer([{ id: 1 }], null)
    expect(result()).toEqual([{ id: 1 }])

    setSql('SELECT 2')

    expect(result()).toBeNull()
    expect(error()).toBeNull()

    dispose()
  })
})
