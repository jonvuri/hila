/* @vitest-environment jsdom */

import { describe, it, beforeAll, expect } from 'vitest'

import { addObserver, removeObserver, execMutation } from '../core/client/sql-client'
import type { SqlObserver } from '../core/sql-types'
import { awaitWorkerReady } from '../core/client/worker-client'

import type { SqlResult } from './types'

/**
 * Creates a subscription that collects results into an async queue.
 * Each call to nextResult() returns a promise resolving with the next emission.
 */
const observeResults = (sql: string) => {
  const pending: ((result: SqlResult) => void)[] = []
  const buffered: SqlResult[] = []

  const observer: SqlObserver = (result) => {
    if (result !== null) {
      const waiter = pending.shift()
      if (waiter) {
        waiter(result)
      } else {
        buffered.push(result)
      }
    }
  }

  addObserver(sql, observer)

  return {
    nextResult: () =>
      new Promise<SqlResult>((resolve) => {
        const item = buffered.shift()
        if (item) {
          resolve(item)
        } else {
          pending.push(resolve)
        }
      }),
    cleanup: () => removeObserver(sql, observer),
  }
}

describe('write execution invalidates subscriptions', () => {
  beforeAll(async () => {
    await awaitWorkerReady()

    await execMutation(
      `CREATE TABLE IF NOT EXISTS elements(
        id INTEGER PRIMARY KEY,
        parent_id INTEGER,
        key BLOB,
        type TEXT,
        payload TEXT
      )`,
    )
    await execMutation(`DELETE FROM elements`)
    await execMutation(
      `CREATE TABLE IF NOT EXISTS metadata(
        id INTEGER PRIMARY KEY,
        note TEXT
      )`,
    )
    await execMutation(`DELETE FROM metadata`)
  })

  it(
    'should emit an updated result after a write execute',
    async () => {
      const sql = `SELECT COUNT(*) AS n FROM elements`
      const { nextResult, cleanup } = observeResults(sql)

      try {
        const first = await nextResult()
        const initial = first[0]?.n as number

        await execMutation(
          `INSERT INTO elements (parent_id, key, type, payload) VALUES (NULL, X'00', 'test', '{}')`,
        )

        const second = await nextResult()
        const next = second[0]?.n as number

        expect(next).toBe(initial + 1)
      } finally {
        cleanup()
      }
    },
    { timeout: 3000 },
  )

  it(
    'should not re-emit for queries unrelated to the written table',
    async () => {
      const metaSql = `SELECT COUNT(*) AS c FROM metadata`
      const elemSql = `SELECT COUNT(*) AS e FROM elements`

      const meta = observeResults(metaSql)
      const elem = observeResults(elemSql)

      try {
        const metaFirst = await meta.nextResult()
        const metaInitial = metaFirst[0]?.c as number

        const elemFirst = await elem.nextResult()
        const elemInitial = elemFirst[0]?.e as number

        await execMutation(
          `INSERT INTO elements (parent_id, key, type, payload) VALUES (NULL, X'01', 'test', '{}')`,
        )

        const elemSecond = await elem.nextResult()
        const elemNext = elemSecond[0]?.e as number
        expect(elemNext).toBe(elemInitial + 1)

        // metadata observer should NOT have received a new result.
        // Give the event loop a tick and verify the buffer is still empty.
        await new Promise((resolve) => setTimeout(resolve, 50))

        // Re-subscribe to metadata to get its current value and confirm it hasn't changed
        const metaCheck = observeResults(metaSql)
        const metaLatest = await metaCheck.nextResult()
        const metaNext = metaLatest[0]?.c as number
        expect(metaNext).toBe(metaInitial)
        metaCheck.cleanup()
      } finally {
        meta.cleanup()
        elem.cleanup()
      }
    },
    { timeout: 3000 },
  )
})
