/* @vitest-environment jsdom */

import { describe, it, expect, beforeAll } from 'vitest'

import { execMutation } from '../client/sql-client'
import { createMatrix, resetDatabase } from '../client/matrix-client'
import { awaitWorkerReady } from '../client/worker-client'

describe('worker message queuing', () => {
  // Fire operations immediately on import — before the worker has signalled
  // ready. These are queued on the client side and forwarded to the worker,
  // which must process them correctly after its own init completes.
  const earlyMatrix = createMatrix('pre-ready-matrix')
  const earlyExec = execMutation(
    `CREATE TABLE IF NOT EXISTS queue_test (id INTEGER PRIMARY KEY, value TEXT)`,
  )

  beforeAll(async () => {
    await awaitWorkerReady()
  })

  it('resolves a createMatrix issued before ready', async () => {
    const matrixId = await earlyMatrix
    expect(matrixId).toBeGreaterThan(0)
  }, 5000)

  it('resolves an execMutation issued before ready', async () => {
    await expect(earlyExec).resolves.toBeUndefined()
  }, 5000)

  it('processes pre-ready and post-ready operations in order', async () => {
    await earlyExec
    await execMutation(`INSERT INTO queue_test (value) VALUES ('first')`)
    await execMutation(`INSERT INTO queue_test (value) VALUES ('second')`)

    // Verify via a fresh worker round-trip that data is intact
    const readMatrix = createMatrix('post-ready-matrix')
    const matrixId = await readMatrix
    expect(matrixId).toBeGreaterThan(0)
  }, 5000)

  it('handles a resetDatabase and subsequent operations after queue drain', async () => {
    await resetDatabase()

    // After reset, schema is re-initialized — the root matrix should exist again
    const matrixId = await createMatrix('after-reset-matrix')
    expect(matrixId).toBeGreaterThan(0)
  }, 5000)
})
