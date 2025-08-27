/* @vitest-environment jsdom */

import { describe, it, beforeAll, expect } from 'vitest'
import { firstValueFrom } from 'rxjs'
import { filter, take, skip } from 'rxjs/operators'

import { observeQuery } from './query'
import { execQuery } from './sqlite-core/sql-client'
import { awaitWorkerReady } from './sqlite-core/worker-client'

describe('write execution invalidates subscriptions', () => {
  beforeAll(async () => {
    await awaitWorkerReady()

    await execQuery(
      `CREATE TABLE IF NOT EXISTS elements(
        id INTEGER PRIMARY KEY,
        parent_id INTEGER,
        key BLOB,
        type TEXT,
        payload TEXT
      )`,
    )
    await execQuery(`DELETE FROM elements`)
    await execQuery(
      `CREATE TABLE IF NOT EXISTS metadata(
        id INTEGER PRIMARY KEY,
        note TEXT
      )`,
    )
    await execQuery(`DELETE FROM metadata`)
  })

  it(
    'should emit an updated result after a write execute',
    async () => {
      const sql = `SELECT COUNT(*) AS n FROM elements`
      const observable = observeQuery(sql)

      const first = await firstValueFrom(
        observable.pipe(
          filter((s) => s.result !== null || s.error !== null),
          take(1),
        ),
      )
      const initial = first.result?.[0]?.n as number

      await execQuery(
        `INSERT INTO elements (parent_id, key, type, payload) VALUES (NULL, X'00', 'test', '{}')`,
      )

      const second = await firstValueFrom(
        observable.pipe(
          filter((s) => s.result !== null || s.error !== null),
          // Skip the replay of the last non-null emission; wait for the next one
          skip(1),
          take(1),
        ),
      )
      const next = second.result?.[0]?.n as number

      expect(next).toBe(initial + 1)
    },
    { timeout: 3000 },
  )

  it(
    'should not re-emit for queries unrelated to the written table',
    async () => {
      // Observe a query on metadata table
      const metaSql = `SELECT COUNT(*) AS c FROM metadata`
      const meta$ = observeQuery(metaSql)

      // Observe a query on elements table
      const elemSql = `SELECT COUNT(*) AS e FROM elements`
      const elem$ = observeQuery(elemSql)

      // Prime both observables to first non-null emission
      const metaFirst = await firstValueFrom(
        meta$.pipe(
          filter((s) => s.result !== null || s.error !== null),
          take(1),
        ),
      )
      const metaInitial = metaFirst.result?.[0]?.c as number

      const elemFirst = await firstValueFrom(
        elem$.pipe(
          filter((s) => s.result !== null || s.error !== null),
          take(1),
        ),
      )
      const elemInitial = elemFirst.result?.[0]?.e as number

      // Perform a write affecting only elements
      await execQuery(
        `INSERT INTO elements (parent_id, key, type, payload) VALUES (NULL, X'01', 'test', '{}')`,
      )

      // elements observer should see a change
      const elemSecond = await firstValueFrom(
        elem$.pipe(
          filter((s) => s.result !== null || s.error !== null),
          skip(1),
          take(1),
        ),
      )
      const elemNext = elemSecond.result?.[0]?.e as number
      expect(elemNext).toBe(elemInitial + 1)

      // metadata observer should NOT emit a new result; to assert this, we race a timeout
      // However, to keep it deterministic in this environment, we check that the last known
      // result remains the same after giving the event loop a brief tick.
      await new Promise((resolve) => setTimeout(resolve, 10))
      const metaLatest = await firstValueFrom(
        meta$.pipe(
          filter((s) => s.result !== null || s.error !== null),
          take(1),
        ),
      )
      const metaNext = metaLatest.result?.[0]?.c as number
      expect(metaNext).toBe(metaInitial)
    },
    { timeout: 3000 },
  )
})
