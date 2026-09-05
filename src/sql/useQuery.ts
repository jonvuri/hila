import { createSignal, createEffect, onCleanup, type Accessor } from 'solid-js'

import { addObserver, removeObserver } from '../core/client/sql-client'
import type { SqlObserver, SqlRequest } from '../core/sql-types'

import type { SqlResult } from './types'

export const useQuery = (
  sql: Accessor<SqlRequest>,
): {
  result: Accessor<SqlResult | null>
  error: Accessor<Error | null>
} => {
  const [result, setResult] = createSignal<SqlResult | null>(null)
  const [error, setError] = createSignal<Error | null>(null)

  let currentRequest: SqlRequest | null = null
  let currentObserver: SqlObserver | null = null
  let generation = 0

  createEffect(() => {
    const nextRequest = sql()
    const nextSql = typeof nextRequest === 'string' ? nextRequest : nextRequest.sql
    const nextGeneration = ++generation

    if (!nextSql) {
      if (currentRequest && currentObserver) removeObserver(currentRequest, currentObserver)
      currentRequest = null
      currentObserver = null
      return
    }

    setError(null)

    const observer: SqlObserver = (r, e) => {
      if (generation !== nextGeneration) return
      if (r !== null) {
        setResult(() => r)
        setError(null)
      }
      if (e !== null) {
        setError(() => e)
        setResult(null)
      }
    }

    // Subscribe first so a value-only request change keeps the worker's shared
    // prepared template alive while the old subscription is released.
    addObserver(nextRequest, observer)
    if (currentRequest && currentObserver) removeObserver(currentRequest, currentObserver)
    currentRequest = nextRequest
    currentObserver = observer
  })

  onCleanup(() => {
    generation++
    if (currentRequest && currentObserver) removeObserver(currentRequest, currentObserver)
  })

  return { result, error }
}
