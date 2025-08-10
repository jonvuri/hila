import { firstValueFrom } from 'rxjs'
import { filter } from 'rxjs/operators'

import { addObserver, removeObserver } from './sqlite-core/client'
import { createQuerySubject } from './querySubject'
import type { SqlResult } from './types'
import type { SqlObserver } from './sqlite-core/types'

export const observeQuery = (sql: string) =>
  createQuerySubject<SqlResult>((emitResult, emitError) => {
    const observer: SqlObserver = (result, error) => {
      if (result !== null) {
        emitResult(result)
      }
      if (error !== null) {
        emitError(error)
      }
    }

    addObserver(sql, observer)

    return () => {
      removeObserver(sql, observer)
    }
  })

export const execQuery = async (sql: string) => {
  const observer = observeQuery(sql)

  // Filter out the initial null state to wait for actual results
  const result = await firstValueFrom(
    observer.pipe(filter((state) => state.result !== null || state.error !== null)),
  )

  if (result.result) {
    return result.result
  }
  if (result.error) {
    throw result.error
  }

  // Should never happen due to filter above
  throw new Error('Unexpected observer state: null result and null error')
}
