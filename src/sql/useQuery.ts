import { createSignal, createEffect, onCleanup, type Accessor } from 'solid-js'

import { addObserver, removeObserver } from '../core/client/sql-client'
import type { SqlObserver } from '../core/sql-types'

import type { SqlResult } from './types'

export const useQuery = (
  sql: Accessor<string>,
): {
  result: Accessor<SqlResult | null>
  error: Accessor<Error | null>
} => {
  const [result, setResult] = createSignal<SqlResult | null>(null)
  const [error, setError] = createSignal<Error | null>(null)

  createEffect(() => {
    const currentSql = sql()
    if (!currentSql) return

    setResult(null)
    setError(null)

    const observer: SqlObserver = (r, e) => {
      if (r !== null) {
        setResult(() => r)
        setError(null)
      }
      if (e !== null) {
        setError(() => e)
        setResult(null)
      }
    }

    addObserver(currentSql, observer)

    onCleanup(() => {
      removeObserver(currentSql, observer)
    })
  })

  return { result, error }
}
