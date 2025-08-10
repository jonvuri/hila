import { addObserver, removeObserver } from './sqlite-core/client'
import { createQuerySubject } from './querySubject'
import type { SqlResult } from './types'
import type { SqlObserver } from './sqlite-core/types'

export const observeSql = (sql: string) =>
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
