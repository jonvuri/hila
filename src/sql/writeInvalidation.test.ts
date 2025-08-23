/* @vitest-environment jsdom */

import { describe, it, beforeAll, expect } from 'vitest'
import { firstValueFrom } from 'rxjs'
import { filter, take, skip } from 'rxjs/operators'

import { observeQuery } from './query'
import { execQuery } from './sqlite-core/client'

describe('write execution invalidates subscriptions', () => {
  beforeAll(async () => {
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
})
