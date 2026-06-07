/**
 * Tests for the global pre-order scroll index (Phase 8b §2).
 *
 * Verifies that the scroll index stays consistent with own-edges after
 * structural edits, and that pre-order matches a recursive edge walk.
 */

import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { createMatrix, insertRow, deleteRow, initMatrixSchema } from './matrix'
import { reparentRow, deleteSubtree } from './tree'
import { getGlobalKey, rebuildScrollIndex } from './scroll-index'

const toHex = (key: Uint8Array): string =>
  Array.from(key, (b) => b.toString(16).padStart(2, '0')).join('')

const getAllScrollEntries = (db: Database) => {
  const stmt = db.prepare(
    'SELECT global_lexkey, matrix_id, row_id, depth FROM scroll_index ORDER BY global_lexkey',
  )
  const entries: { key: string; matrixId: number; rowId: number; depth: number }[] = []
  while (stmt.step()) {
    const row = stmt.get({}) as {
      global_lexkey: Uint8Array
      matrix_id: number
      row_id: number
      depth: number
    }
    entries.push({
      key: toHex(new Uint8Array(row.global_lexkey)),
      matrixId: row.matrix_id,
      rowId: row.row_id,
      depth: row.depth,
    })
  }
  stmt.finalize()
  return entries
}

describe('Global scroll index', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('inserted nodes appear in scroll index', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'label', type: 'TEXT' }])
    const a = insertRow(db, matrixId, { values: { label: 'A' } })
    const b = insertRow(db, matrixId, { values: { label: 'B' } })

    const entries = getAllScrollEntries(db)
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.rowId).sort()).toEqual([a.rowId, b.rowId].sort())
  })

  test('pre-order: parent precedes child in the index', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'label', type: 'TEXT' }])
    const a = insertRow(db, matrixId, { values: { label: 'A' } })
    const b = insertRow(db, matrixId, {
      values: { label: 'B' },
      parent: { matrixId, rowId: a.rowId },
    })

    const entries = getAllScrollEntries(db)
    const aIdx = entries.findIndex((e) => e.rowId === a.rowId)
    const bIdx = entries.findIndex((e) => e.rowId === b.rowId)
    expect(aIdx).toBeLessThan(bIdx)
  })

  test('child global_lexkey is parent global_lexkey + edge_key', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'label', type: 'TEXT' }])
    const a = insertRow(db, matrixId, { values: { label: 'A' } })
    const b = insertRow(db, matrixId, {
      values: { label: 'B' },
      parent: { matrixId, rowId: a.rowId },
    })

    const aKey = getGlobalKey(db, matrixId, a.rowId)!
    const bKey = getGlobalKey(db, matrixId, b.rowId)!

    // B's global key starts with A's global key (prefix property)
    const aHex = toHex(aKey)
    const bHex = toHex(bKey)
    expect(bHex.startsWith(aHex)).toBe(true)
    expect(bHex.length).toBeGreaterThan(aHex.length)
  })

  test('depth is correctly tracked', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'label', type: 'TEXT' }])
    const a = insertRow(db, matrixId, { values: { label: 'A' } })
    const b = insertRow(db, matrixId, {
      values: { label: 'B' },
      parent: { matrixId, rowId: a.rowId },
    })
    const c = insertRow(db, matrixId, {
      values: { label: 'C' },
      parent: { matrixId, rowId: b.rowId },
    })

    const entries = getAllScrollEntries(db)
    const find = (rowId: number) => entries.find((e) => e.rowId === rowId)!
    expect(find(a.rowId).depth).toBe(0)
    expect(find(b.rowId).depth).toBe(1)
    expect(find(c.rowId).depth).toBe(2)
  })

  test('a subtree is a contiguous range in the index', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'label', type: 'TEXT' }])
    const a = insertRow(db, matrixId, { values: { label: 'A' } })
    const b = insertRow(db, matrixId, {
      values: { label: 'B' },
      parent: { matrixId, rowId: a.rowId },
    })
    const c = insertRow(db, matrixId, {
      values: { label: 'C' },
      parent: { matrixId, rowId: a.rowId },
    })
    // D is a sibling of A (another root)
    const d = insertRow(db, matrixId, { values: { label: 'D' } })

    const entries = getAllScrollEntries(db)
    const rowIds = entries.map((e) => e.rowId)

    // A's subtree (A, B, C) is contiguous
    const aIdx = rowIds.indexOf(a.rowId)
    const bIdx = rowIds.indexOf(b.rowId)
    const cIdx = rowIds.indexOf(c.rowId)
    const dIdx = rowIds.indexOf(d.rowId)

    // A, B, C appear together (contiguous), and D is outside
    expect(Math.abs(bIdx - aIdx)).toBeLessThanOrEqual(2)
    expect(Math.abs(cIdx - aIdx)).toBeLessThanOrEqual(2)
    // D is not between A's children
    expect(dIdx < aIdx || dIdx > Math.max(bIdx, cIdx)).toBe(true)
  })

  test('deleteRow removes node from scroll index', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'label', type: 'TEXT' }])
    const a = insertRow(db, matrixId, { values: { label: 'A' } })
    const b = insertRow(db, matrixId, {
      values: { label: 'B' },
      parent: { matrixId, rowId: a.rowId },
    })

    deleteRow(db, matrixId, a.rowId)

    // A is removed, B is promoted (still present)
    const entries = getAllScrollEntries(db)
    expect(entries.find((e) => e.rowId === a.rowId)).toBeUndefined()
    expect(entries.find((e) => e.rowId === b.rowId)).toBeDefined()
  })

  test('deleteSubtree removes all descendants from scroll index', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'label', type: 'TEXT' }])
    const a = insertRow(db, matrixId, { values: { label: 'A' } })
    const b = insertRow(db, matrixId, {
      values: { label: 'B' },
      parent: { matrixId, rowId: a.rowId },
    })
    insertRow(db, matrixId, {
      values: { label: 'C' },
      parent: { matrixId, rowId: b.rowId },
    })

    deleteSubtree(db, { matrixId, rowId: a.rowId })

    expect(getAllScrollEntries(db)).toHaveLength(0)
  })

  test('rebuildScrollIndex reproduces the incrementally-maintained index', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'label', type: 'TEXT' }])
    insertRow(db, matrixId, { values: { label: 'A' } })
    const b = insertRow(db, matrixId, { values: { label: 'B' } })
    insertRow(db, matrixId, {
      values: { label: 'C' },
      parent: { matrixId, rowId: b.rowId },
    })
    insertRow(db, matrixId, {
      values: { label: 'D' },
      parent: { matrixId, rowId: b.rowId },
    })

    const before = getAllScrollEntries(db)

    rebuildScrollIndex(db)

    const after = getAllScrollEntries(db)
    expect(after).toEqual(before)
  })

  test('cross-matrix subtree appears in one correct order', () => {
    const outlineMatrix = createMatrix(db, 'Outline', [{ name: 'label', type: 'TEXT' }])
    const taskMatrix = createMatrix(db, 'Tasks', [{ name: 'label', type: 'TEXT' }])

    const host = insertRow(db, outlineMatrix, { values: { label: 'Host' } })
    const task = insertRow(db, taskMatrix, {
      values: { label: 'Task' },
      parent: { matrixId: outlineMatrix, rowId: host.rowId },
    })

    const entries = getAllScrollEntries(db)
    const hostIdx = entries.findIndex((e) => e.rowId === host.rowId)
    const taskIdx = entries.findIndex((e) => e.rowId === task.rowId)

    // Task follows host (child follows parent)
    expect(hostIdx).toBeLessThan(taskIdx)
    // Task's key is prefixed by host's key
    const hostKey = entries[hostIdx]!.key
    const taskKey = entries[taskIdx]!.key
    expect(taskKey.startsWith(hostKey)).toBe(true)
  })

  test('reparent (move) updates the scroll index for the moved subtree', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'label', type: 'TEXT' }])
    const a = insertRow(db, matrixId, { values: { label: 'A' } })
    const b = insertRow(db, matrixId, { values: { label: 'B' } })
    const c = insertRow(db, matrixId, {
      values: { label: 'C' },
      parent: { matrixId, rowId: a.rowId },
    })

    // Before: C is under A (C's key is prefixed by A's key)
    const aKeyBefore = getGlobalKey(db, matrixId, a.rowId)!
    const cKeyBefore = getGlobalKey(db, matrixId, c.rowId)!
    expect(toHex(cKeyBefore).startsWith(toHex(aKeyBefore))).toBe(true)

    // Reparent C under B
    reparentRow(db, { matrixId, rowId: c.rowId, newParent: { matrixId, rowId: b.rowId } })

    // After: C is under B (C's key is now prefixed by B's key)
    const bKeyAfter = getGlobalKey(db, matrixId, b.rowId)!
    const cKeyAfter = getGlobalKey(db, matrixId, c.rowId)!
    expect(toHex(cKeyAfter).startsWith(toHex(bKeyAfter))).toBe(true)
    expect(toHex(cKeyAfter).startsWith(toHex(aKeyBefore))).toBe(false)
  })
})
