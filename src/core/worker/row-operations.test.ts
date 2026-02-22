/* @vitest-environment jsdom */

/**
 * Worker integration tests for the new row-level operations.
 *
 * These exercise the full client → worker → client message pipeline.
 *
 * NOTE: jsdom's Worker shim does not preserve Uint8Array through postMessage
 * (structured cloning). Operations that send Uint8Array keys from client to
 * worker (deleteRow, reparentRow, deleteSubtree, insertRow with positioning)
 * cannot be integration-tested here. Those code paths are thoroughly covered
 * by the unit-level round-trip tests in matrix.test.ts which test the same
 * handler logic directly.
 */

import { describe, it, beforeAll, expect } from 'vitest'

import { addObserver, removeObserver } from '../client/sql-client'
import { createMatrix, insertRow, updateRow } from '../client/matrix-client'
import { awaitWorkerReady } from '../client/worker-client'
import type { SqlObserver } from '../sql-types'
import type { SqlResult } from '../../sql/types'

function observeResults(sql: string) {
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

describe('row operations through worker', () => {
  let matrixId: number

  beforeAll(async () => {
    await awaitWorkerReady()
    matrixId = await createMatrix('row-ops-test')
  })

  it('insertRow returns key and rowId', async () => {
    const { key, rowId } = await insertRow(matrixId, { values: { title: 'Hello' } })

    // jsdom structured clone returns an ArrayBuffer-backed object, not
    // necessarily a Uint8Array instance from the same realm
    expect(key).toBeTruthy()
    expect(key.length).toBeGreaterThan(0)
    expect(key[key.length - 1]).toBe(0x00) // terminator byte
    expect(rowId).toBeTypeOf('number')
    expect(rowId).toBeGreaterThan(0)
  }, 5000)

  it('insertRow triggers subscription update on rank table', async () => {
    const sql = `SELECT COUNT(*) AS n FROM rank WHERE matrix_id = ${matrixId}`
    const { nextResult, cleanup } = observeResults(sql)

    try {
      const before = await nextResult()
      const initialCount = before[0]?.n as number

      await insertRow(matrixId, { values: { title: 'Subscribed insert' } })

      const after = await nextResult()
      const newCount = after[0]?.n as number
      expect(newCount).toBe(initialCount + 1)
    } finally {
      cleanup()
    }
  }, 5000)

  it('insertRow triggers subscription update on data table', async () => {
    const sql = `SELECT COUNT(*) AS n FROM "mx_${matrixId}_data"`
    const { nextResult, cleanup } = observeResults(sql)

    try {
      const before = await nextResult()
      const initialCount = before[0]?.n as number

      await insertRow(matrixId, { values: { title: 'Data table check' } })

      const after = await nextResult()
      const newCount = after[0]?.n as number
      expect(newCount).toBe(initialCount + 1)
    } finally {
      cleanup()
    }
  }, 5000)

  it('updateRow modifies data and triggers subscription', async () => {
    const { rowId } = await insertRow(matrixId, { values: { title: 'Before update' } })

    const sql = `SELECT title FROM "mx_${matrixId}_data" WHERE id = ${rowId}`
    const { nextResult, cleanup } = observeResults(sql)

    try {
      const before = await nextResult()
      expect(before[0]?.title).toBe('Before update')

      await updateRow(matrixId, rowId, { title: 'After update' })

      const after = await nextResult()
      expect(after[0]?.title).toBe('After update')
    } finally {
      cleanup()
    }
  }, 5000)

  it('multiple inserts produce correct data via subscription', async () => {
    // Insert three rows at root level (no positioning keys needed)
    const r1 = await insertRow(matrixId, { values: { title: 'Multi A' } })
    const r2 = await insertRow(matrixId, { values: { title: 'Multi B' } })
    const r3 = await insertRow(matrixId, { values: { title: 'Multi C' } })

    // Verify all three exist via a single subscription query
    const sql = `
      SELECT d.title
      FROM rank r
      JOIN "mx_${matrixId}_data" d ON d.id = r.row_id
      WHERE r.matrix_id = ${matrixId}
        AND r.row_id IN (${r1.rowId}, ${r2.rowId}, ${r3.rowId})
      ORDER BY r.key
    `
    const { nextResult, cleanup } = observeResults(sql)

    try {
      const result = await nextResult()
      expect(result).toHaveLength(3)
      expect(result.map((r) => r.title)).toEqual(['Multi A', 'Multi B', 'Multi C'])
    } finally {
      cleanup()
    }
  }, 5000)

  it('insertRow with no values creates a row with null columns', async () => {
    const { rowId } = await insertRow(matrixId)

    const sql = `SELECT title FROM "mx_${matrixId}_data" WHERE id = ${rowId}`
    const { nextResult, cleanup } = observeResults(sql)

    try {
      const result = await nextResult()
      expect(result).toHaveLength(1)
      expect(result[0]?.title).toBeNull()
    } finally {
      cleanup()
    }
  }, 5000)
})

describe('root matrix content column defaults', () => {
  // Root matrix (id=1) is initialized by the worker on startup via ensureRootMatrix.
  // It has a single 'content' TEXT column.

  const ROOT_MATRIX_ID = 1

  it('insertRow into root matrix sets empty-doc default when no content provided', async () => {
    const { rowId } = await insertRow(ROOT_MATRIX_ID)

    const sql = `SELECT content FROM "mx_${ROOT_MATRIX_ID}_data" WHERE id = ${rowId}`
    const { nextResult, cleanup } = observeResults(sql)

    try {
      const result = await nextResult()
      expect(result).toHaveLength(1)
      const content = result[0]?.content as string
      expect(typeof content).toBe('string')
      const parsed = JSON.parse(content) as unknown
      expect(parsed).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
    } finally {
      cleanup()
    }
  }, 5000)

  it('insertRow with explicit content stores it instead of default', async () => {
    const customDoc = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'custom' }] }],
    })
    const { rowId } = await insertRow(ROOT_MATRIX_ID, { values: { content: customDoc } })

    const sql = `SELECT content FROM "mx_${ROOT_MATRIX_ID}_data" WHERE id = ${rowId}`
    const { nextResult, cleanup } = observeResults(sql)

    try {
      const result = await nextResult()
      expect(result[0]?.content).toBe(customDoc)
    } finally {
      cleanup()
    }
  }, 5000)

  it('updateRow on root matrix content persists JSON round-trip', async () => {
    const { rowId } = await insertRow(ROOT_MATRIX_ID)
    const updatedDoc = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'updated' }] }],
    })

    const sql = `SELECT content FROM "mx_${ROOT_MATRIX_ID}_data" WHERE id = ${rowId}`
    const { nextResult, cleanup } = observeResults(sql)

    try {
      // consume initial result
      await nextResult()

      await updateRow(ROOT_MATRIX_ID, rowId, { content: updatedDoc })

      const after = await nextResult()
      expect(after[0]?.content).toBe(updatedDoc)
    } finally {
      cleanup()
    }
  }, 5000)
})
