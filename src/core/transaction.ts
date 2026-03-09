import type { Database } from '@sqlite.org/sqlite-wasm'

let savepointId = 0

/**
 * Execute `fn` inside a SAVEPOINT. If `fn` returns normally the savepoint
 * is released (committed); if it throws, the savepoint is rolled back and
 * the error re-thrown.
 *
 * SAVEPOINTs nest naturally: when called inside another `withTransaction`,
 * a nested savepoint is created instead of a conflicting `BEGIN TRANSACTION`.
 * At the outermost level a SAVEPOINT implicitly starts a real transaction.
 */
export const withTransaction = <T>(db: Database, fn: () => T): T => {
  const name = `sp_${++savepointId}`
  db.exec(`SAVEPOINT "${name}"`)
  try {
    const result = fn()
    db.exec(`RELEASE "${name}"`)
    return result
  } catch (error) {
    db.exec(`ROLLBACK TO "${name}"`)
    db.exec(`RELEASE "${name}"`)
    throw error
  }
}
