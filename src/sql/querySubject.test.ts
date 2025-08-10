import { describe, it, expect, vi, beforeEach } from 'vitest'
import { firstValueFrom } from 'rxjs'
import { filter, take } from 'rxjs/operators'

import { createQuerySubject, type SubjectState } from './querySubject'
import type { SqlResult } from './types'

describe('createQuerySubject', () => {
  let mockEmitResult: (value: SqlResult) => void
  let mockEmitError: (error: Error) => void
  let mockCleanup: () => void
  let setupSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockCleanup = vi.fn()
    setupSpy = vi.fn().mockImplementation((emitResult, emitError) => {
      mockEmitResult = emitResult
      mockEmitError = emitError
      return mockCleanup
    })
  })

  it('should emit initial null state immediately on subscription', async () => {
    const subject = createQuerySubject(setupSpy)

    const initialState = await firstValueFrom(subject.pipe(take(1)))

    expect(initialState).toEqual({
      result: null,
      error: null,
    })
  })

  it('should call setup function on first subscription', () => {
    const subject = createQuerySubject(setupSpy)

    const subscription = subject.subscribe()

    expect(setupSpy).toHaveBeenCalledTimes(1)
    expect(setupSpy).toHaveBeenCalledWith(expect.any(Function), expect.any(Function))

    subscription.unsubscribe()
  })

  it('should not call setup function multiple times for multiple subscribers', () => {
    const subject = createQuerySubject(setupSpy)

    const sub1 = subject.subscribe()
    const sub2 = subject.subscribe()

    expect(setupSpy).toHaveBeenCalledTimes(1)

    sub1.unsubscribe()
    sub2.unsubscribe()
  })

  it('should emit results to all subscribers', async () => {
    const subject = createQuerySubject<SqlResult>(setupSpy)

    const results1: SubjectState<SqlResult>[] = []
    const results2: SubjectState<SqlResult>[] = []

    const sub1 = subject.subscribe((state) => results1.push(state))
    const sub2 = subject.subscribe((state) => results2.push(state))

    const testResult: SqlResult = [{ id: 1, name: 'test' }]
    mockEmitResult(testResult)

    // Wait a tick for emissions to propagate
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(results1).toHaveLength(2) // initial + result
    expect(results2).toHaveLength(2) // initial + result

    expect(results1[1]).toEqual({ result: testResult, error: null })
    expect(results2[1]).toEqual({ result: testResult, error: null })

    sub1.unsubscribe()
    sub2.unsubscribe()
  })

  it('should replay last result to new subscribers (shareReplay behavior)', async () => {
    const subject = createQuerySubject<SqlResult>(setupSpy)

    // First subscriber gets the result
    const sub1 = subject.subscribe()
    const testResult: SqlResult = [{ id: 1, name: 'test' }]
    mockEmitResult(testResult)

    // Wait for emission
    await new Promise((resolve) => setTimeout(resolve, 0))

    // New subscriber should immediately get the last result
    const newSubResults: SubjectState<SqlResult>[] = []
    const sub2 = subject.subscribe((state) => newSubResults.push(state))

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(newSubResults).toHaveLength(1)
    expect(newSubResults[0]).toEqual({ result: testResult, error: null })

    sub1.unsubscribe()
    sub2.unsubscribe()
  })

  it('should emit errors to all subscribers', async () => {
    const subject = createQuerySubject<SqlResult>(setupSpy)

    const results1: SubjectState<SqlResult>[] = []
    const results2: SubjectState<SqlResult>[] = []

    const sub1 = subject.subscribe((state) => results1.push(state))
    const sub2 = subject.subscribe((state) => results2.push(state))

    const testError = new Error('Test error')
    mockEmitError(testError)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(results1).toHaveLength(2) // initial + error
    expect(results2).toHaveLength(2) // initial + error

    expect(results1[1]).toEqual({ result: null, error: testError })
    expect(results2[1]).toEqual({ result: null, error: testError })

    sub1.unsubscribe()
    sub2.unsubscribe()
  })

  it('should call cleanup when all subscribers unsubscribe', () => {
    const subject = createQuerySubject<SqlResult>(setupSpy)

    const sub1 = subject.subscribe()
    const sub2 = subject.subscribe()

    expect(mockCleanup).not.toHaveBeenCalled()

    sub1.unsubscribe()
    expect(mockCleanup).not.toHaveBeenCalled()

    sub2.unsubscribe()
    expect(mockCleanup).toHaveBeenCalledTimes(1)
  })

  it('should not call cleanup if there are still subscribers', () => {
    const subject = createQuerySubject<SqlResult>(setupSpy)

    const sub1 = subject.subscribe()
    const sub2 = subject.subscribe()
    const sub3 = subject.subscribe()

    sub1.unsubscribe()
    sub2.unsubscribe()

    expect(mockCleanup).not.toHaveBeenCalled()

    sub3.unsubscribe()
    expect(mockCleanup).toHaveBeenCalledTimes(1)
  })

  it('should re-initialize setup after all subscribers unsubscribe and new subscription occurs', () => {
    const subject = createQuerySubject<SqlResult>(setupSpy)

    // First round of subscriptions
    const sub1 = subject.subscribe()
    sub1.unsubscribe()

    expect(setupSpy).toHaveBeenCalledTimes(1)
    expect(mockCleanup).toHaveBeenCalledTimes(1)

    // Second round - should call setup again
    const sub2 = subject.subscribe()

    expect(setupSpy).toHaveBeenCalledTimes(2)

    sub2.unsubscribe()
    expect(mockCleanup).toHaveBeenCalledTimes(2)
  })

  it('should work correctly with firstValueFrom when filtering out null state', async () => {
    const subject = createQuerySubject<SqlResult>(setupSpy)

    // This simulates the fix in SqlRunner.tsx
    const resultPromise = firstValueFrom(
      subject.pipe(filter((state) => state.result !== null || state.error !== null)),
    )

    // Emit result after a delay to simulate async worker
    setTimeout(() => {
      const testResult: SqlResult = [{ id: 1, name: 'test' }]
      mockEmitResult(testResult)
    }, 10)

    const result = await resultPromise

    expect(result).toEqual({
      result: [{ id: 1, name: 'test' }],
      error: null,
    })

    // Cleanup should have been called since firstValueFrom unsubscribes after first emission
    expect(mockCleanup).toHaveBeenCalledTimes(1)
  })

  it('should work correctly with firstValueFrom when error occurs', async () => {
    const subject = createQuerySubject<SqlResult>(setupSpy)

    const resultPromise = firstValueFrom(
      subject.pipe(filter((state) => state.result !== null || state.error !== null)),
    )

    setTimeout(() => {
      const testError = new Error('Test error')
      mockEmitError(testError)
    }, 10)

    const result = await resultPromise

    expect(result).toEqual({
      result: null,
      error: expect.any(Error),
    })
    expect(result.error?.message).toBe('Test error')
  })

  it('should handle multiple results emitted over time', async () => {
    const subject = createQuerySubject<SqlResult>(setupSpy)

    const allResults: SubjectState<SqlResult>[] = []
    const subscription = subject.subscribe((state) => allResults.push(state))

    // Emit multiple results
    const result1: SqlResult = [{ id: 1, name: 'first' }]
    const result2: SqlResult = [{ id: 2, name: 'second' }]

    mockEmitResult(result1)
    await new Promise((resolve) => setTimeout(resolve, 0))

    mockEmitResult(result2)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(allResults).toHaveLength(3) // initial + result1 + result2
    expect(allResults[0]).toEqual({ result: null, error: null })
    expect(allResults[1]).toEqual({ result: result1, error: null })
    expect(allResults[2]).toEqual({ result: result2, error: null })

    subscription.unsubscribe()
  })

  it('should maintain subscriber count correctly with complex subscription patterns', () => {
    const subject = createQuerySubject<SqlResult>(setupSpy)

    // Start with 2 subscribers
    const sub1 = subject.subscribe()
    const sub2 = subject.subscribe()
    expect(setupSpy).toHaveBeenCalledTimes(1)

    // Add third subscriber
    const sub3 = subject.subscribe()
    expect(setupSpy).toHaveBeenCalledTimes(1) // Still only called once

    // Remove one
    sub1.unsubscribe()
    expect(mockCleanup).not.toHaveBeenCalled()

    // Add fourth subscriber
    const sub4 = subject.subscribe()
    expect(setupSpy).toHaveBeenCalledTimes(1) // Still only called once

    // Remove all but one
    sub2.unsubscribe()
    sub3.unsubscribe()
    expect(mockCleanup).not.toHaveBeenCalled()

    // Remove last subscriber
    sub4.unsubscribe()
    expect(mockCleanup).toHaveBeenCalledTimes(1)
  })
})
