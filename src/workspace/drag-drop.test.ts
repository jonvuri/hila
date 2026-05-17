/**
 * Tests for drag-and-drop drop-target computation and data-layer integration.
 *
 * Pure tests exercise computeDropPosition and clampDropDepth against synthetic
 * row arrays.  Integration tests build a real tree in SQLite, derive drop
 * parameters the same way the UI would, then call reparentRow and verify rank
 * order and closure integrity.
 */

import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { initMatrixSchema, ensureRootMatrix, insertDataRow } from '../core/matrix'
import { createTreePosition, reparentRow, getChildren, getParent } from '../core/tree'
import { compareKeys, parseKey } from '../core/lexorank'

import { computeDropPosition, clampDropDepth, isNoOpDrop, type RowInfo } from './drag-drop'

// ---------------------------------------------------------------------------
// Helpers for synthetic row arrays
// ---------------------------------------------------------------------------

const k = (...bytes: number[]): Uint8Array => new Uint8Array(bytes)

const row = (id: number, key: Uint8Array, depth: number): RowInfo => ({
  row_id: id,
  key,
  depth,
})

// ---------------------------------------------------------------------------
// Pure logic: computeDropPosition
// ---------------------------------------------------------------------------

describe('computeDropPosition', () => {
  /*
   * Tree shape used for most tests:
   *
   *   A (depth 0)          row_id=1  key=[1,0]
   *     B (depth 1)        row_id=2  key=[1,0,1,0]
   *       C (depth 2)      row_id=3  key=[1,0,1,0,1,0]
   *   D (depth 0)          row_id=4  key=[2,0]
   */
  const A = row(1, k(1, 0), 0)
  const B = row(2, k(1, 0, 1, 0), 1)
  const C = row(3, k(1, 0, 1, 0, 1, 0), 2)
  const D = row(4, k(2, 0), 0)
  const rows = [A, B, C, D]

  test('drop between C and D at depth 0 → sibling after A, before D', () => {
    // gapIndex=3 (between C at index 2 and D at index 3), depth 0
    const pos = computeDropPosition(rows, 3, 0, 0, null)
    expect(pos.depth).toBe(0)
    expect(pos.parentKey).toBeUndefined()
    expect(compareKeys(pos.prevSiblingKey!, A.key)).toBe(0)
    expect(compareKeys(pos.nextSiblingKey!, D.key)).toBe(0)
  })

  test('drop between C and D at depth 1 → child of A, after B', () => {
    const pos = computeDropPosition(rows, 3, 1, 0, null)
    expect(pos.depth).toBe(1)
    expect(compareKeys(pos.parentKey!, A.key)).toBe(0)
    expect(compareKeys(pos.prevSiblingKey!, B.key)).toBe(0)
    expect(pos.nextSiblingKey).toBeUndefined()
  })

  test('drop between C and D at depth 2 → child of B, after C', () => {
    const pos = computeDropPosition(rows, 3, 2, 0, null)
    expect(pos.depth).toBe(2)
    expect(compareKeys(pos.parentKey!, B.key)).toBe(0)
    expect(compareKeys(pos.prevSiblingKey!, C.key)).toBe(0)
    expect(pos.nextSiblingKey).toBeUndefined()
  })

  test('drop between C and D at depth 3 → first child of C', () => {
    const pos = computeDropPosition(rows, 3, 3, 0, null)
    expect(pos.depth).toBe(3)
    expect(compareKeys(pos.parentKey!, C.key)).toBe(0)
    expect(pos.prevSiblingKey).toBeUndefined()
    expect(pos.nextSiblingKey).toBeUndefined()
  })

  test('drop before A at depth 0 → first root item', () => {
    const pos = computeDropPosition(rows, 0, 0, 0, null)
    expect(pos.depth).toBe(0)
    expect(pos.parentKey).toBeUndefined()
    expect(pos.prevSiblingKey).toBeUndefined()
    expect(compareKeys(pos.nextSiblingKey!, A.key)).toBe(0)
  })

  test('drop after D at depth 0 → last root item', () => {
    const pos = computeDropPosition(rows, 4, 0, 0, null)
    expect(pos.depth).toBe(0)
    expect(pos.parentKey).toBeUndefined()
    expect(compareKeys(pos.prevSiblingKey!, D.key)).toBe(0)
    expect(pos.nextSiblingKey).toBeUndefined()
  })

  test('drop between A and B at depth 1 → first child of A (before B)', () => {
    const pos = computeDropPosition(rows, 1, 1, 0, null)
    expect(pos.depth).toBe(1)
    expect(compareKeys(pos.parentKey!, A.key)).toBe(0)
    expect(pos.prevSiblingKey).toBeUndefined()
    expect(compareKeys(pos.nextSiblingKey!, B.key)).toBe(0)
  })

  test('drop between B and C at depth 2 → first child of B (before C)', () => {
    const pos = computeDropPosition(rows, 2, 2, 0, null)
    expect(pos.depth).toBe(2)
    expect(compareKeys(pos.parentKey!, B.key)).toBe(0)
    expect(pos.prevSiblingKey).toBeUndefined()
    expect(compareKeys(pos.nextSiblingKey!, C.key)).toBe(0)
  })

  test('focused view: parent falls back to focusRootKey', () => {
    // Simulates focused view where A is the focus root (hidden) and B, C are visible.
    // depthOffset = A.depth + 1 = 1
    const focusRows = [B, C]
    const pos = computeDropPosition(focusRows, 0, 1, 1, A.key)
    expect(pos.depth).toBe(1)
    expect(compareKeys(pos.parentKey!, A.key)).toBe(0)
    expect(pos.prevSiblingKey).toBeUndefined()
    expect(compareKeys(pos.nextSiblingKey!, B.key)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Pure logic: clampDropDepth
// ---------------------------------------------------------------------------

describe('clampDropDepth', () => {
  const A = row(1, k(1, 0), 0)
  const B = row(2, k(1, 0, 1, 0), 1)
  const C = row(3, k(1, 0, 1, 0, 1, 0), 2)
  const D = row(4, k(2, 0), 0)
  const rows = [A, B, C, D]

  test('clamps to max depth (above.depth + 1)', () => {
    // Between C (depth 2) and D (depth 0), max = 3
    expect(clampDropDepth(rows, 3, 5, 0)).toBe(3)
  })

  test('clamps to min depth (below.depth)', () => {
    // Between C (depth 2) and D (depth 0), min = 0
    expect(clampDropDepth(rows, 3, -1, 0)).toBe(0)
  })

  test('no clamping when depth is in valid range', () => {
    expect(clampDropDepth(rows, 3, 1, 0)).toBe(1)
  })

  test('before first row: max depth is 0 (depthOffset=0)', () => {
    expect(clampDropDepth(rows, 0, 0, 0)).toBe(0)
    expect(clampDropDepth(rows, 0, 5, 0)).toBe(0)
  })

  test('after last row: min depth is depthOffset', () => {
    expect(clampDropDepth(rows, 4, 0, 0)).toBe(0)
    expect(clampDropDepth(rows, 4, 1, 0)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Pure logic: isNoOpDrop
// ---------------------------------------------------------------------------

describe('isNoOpDrop', () => {
  const A = row(1, k(1, 0), 0)
  const _B = row(2, k(1, 0, 1, 0), 1)
  const C = row(3, k(1, 0, 2, 0), 1)
  const D = row(4, k(2, 0), 0)

  test('returns true when target matches origin exactly', () => {
    // Dragging B: parent=A, prevSibling=undefined, depth=1
    // Non-dragged: [A(0), C(1), D(0)]
    const nonDragged = [A, C, D]
    const pos = computeDropPosition(nonDragged, 1, 1, 0, null)
    expect(isNoOpDrop(pos, 1, A.key, undefined)).toBe(true)
  })

  test('returns false when target has different prevSibling', () => {
    // Dragging B from before C to after C
    const nonDragged = [A, C, D]
    const pos = computeDropPosition(nonDragged, 2, 1, 0, null)
    expect(isNoOpDrop(pos, 1, A.key, undefined)).toBe(false)
  })

  test('returns false when target has different depth', () => {
    const nonDragged = [A, C, D]
    const pos = computeDropPosition(nonDragged, 1, 0, 0, null)
    expect(isNoOpDrop(pos, 1, A.key, undefined)).toBe(false)
  })

  test('returns false when target has different parent', () => {
    // Dragging a root item somewhere under A
    const pos = computeDropPosition([A, D], 1, 1, 0, null)
    expect(isNoOpDrop(pos, 0, undefined, undefined)).toBe(false)
  })

  test('returns true for root item staying in same position', () => {
    // Dragging A: parent=undefined, prevSibling=undefined, depth=0
    // Non-dragged: [D(0)]
    const pos = computeDropPosition([D], 0, 0, 0, null)
    expect(isNoOpDrop(pos, 0, undefined, undefined)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Data-layer integration: reorder within parent
// ---------------------------------------------------------------------------

describe('drag-and-drop data integration', () => {
  let db: Database
  let matrixId: number

  const makeRow = (
    title: string,
    opts: { parentKey?: Uint8Array; prevKey?: Uint8Array } = {},
  ) => {
    const rowId = insertDataRow(db, matrixId, { content: title })
    const key = createTreePosition(db, matrixId, rowId, {
      parentKey: opts.parentKey,
      prevKey: opts.prevKey,
    })
    return { key, rowId }
  }

  const getRankOrder = () => {
    const stmt = db.prepare('SELECT row_id FROM rank WHERE matrix_id = ? ORDER BY key')
    stmt.bind([matrixId])
    const ids: number[] = []
    while (stmt.step()) {
      ids.push((stmt.get({}) as { row_id: number }).row_id)
    }
    stmt.finalize()
    return ids
  }

  const getKeyForRowId = (rowId: number): Uint8Array => {
    const stmt = db.prepare('SELECT key FROM rank WHERE matrix_id = ? AND row_id = ?')
    stmt.bind([matrixId, rowId])
    stmt.step()
    const key = new Uint8Array((stmt.get({}) as { key: Uint8Array }).key)
    stmt.finalize()
    return key
  }

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    matrixId = ensureRootMatrix(db)
  })

  test('reorder within parent: move last sibling to first position', () => {
    // A, B, C at root level
    const A = makeRow('A')
    const B = makeRow('B', { prevKey: A.key })
    const C = makeRow('C', { prevKey: B.key })

    // Simulate dragging C before A.
    // Non-dragged rows: [A, B]. Gap=0 (before A), depth=0.
    const visibleRows: RowInfo[] = [
      { row_id: A.rowId, key: A.key, depth: 0 },
      { row_id: B.rowId, key: B.key, depth: 0 },
    ]
    const pos = computeDropPosition(visibleRows, 0, 0, 0, null)

    reparentRow(db, {
      matrixId,
      nodeKey: C.key,
      newParentKey: pos.parentKey,
      prevSiblingKey: pos.prevSiblingKey,
      nextSiblingKey: pos.nextSiblingKey,
    })

    expect(getRankOrder()).toEqual([C.rowId, A.rowId, B.rowId])
    // C should still be a root-level row (single segment)
    const newCKey = getKeyForRowId(C.rowId)
    expect(parseKey(newCKey).length).toBe(1)
  })

  test('reorder within parent: move first sibling to middle', () => {
    // A, B, C at root level
    const A = makeRow('A')
    const B = makeRow('B', { prevKey: A.key })
    const C = makeRow('C', { prevKey: B.key })

    // Simulate dragging A between B and C.
    // Non-dragged rows: [B, C]. Gap=1 (between B and C), depth=0.
    const visibleRows: RowInfo[] = [
      { row_id: B.rowId, key: B.key, depth: 0 },
      { row_id: C.rowId, key: C.key, depth: 0 },
    ]
    const pos = computeDropPosition(visibleRows, 1, 0, 0, null)

    reparentRow(db, {
      matrixId,
      nodeKey: A.key,
      newParentKey: pos.parentKey,
      prevSiblingKey: pos.prevSiblingKey,
      nextSiblingKey: pos.nextSiblingKey,
    })

    expect(getRankOrder()).toEqual([B.rowId, A.rowId, C.rowId])
  })

  test('cross-parent reparent: move root item to become child', () => {
    // A (root), B (root), C (child of A)
    const A = makeRow('A')
    const B = makeRow('B', { prevKey: A.key })
    const C = makeRow('C', { parentKey: A.key })

    // Simulate dragging B to become child of A, after C.
    // Non-dragged: [A(0), C(1)]. Gap=2 (after C), depth=1.
    const visibleRows: RowInfo[] = [
      { row_id: A.rowId, key: A.key, depth: 0 },
      { row_id: C.rowId, key: C.key, depth: 1 },
    ]
    const pos = computeDropPosition(visibleRows, 2, 1, 0, null)

    expect(compareKeys(pos.parentKey!, A.key)).toBe(0)
    expect(compareKeys(pos.prevSiblingKey!, C.key)).toBe(0)

    reparentRow(db, {
      matrixId,
      nodeKey: B.key,
      newParentKey: pos.parentKey,
      prevSiblingKey: pos.prevSiblingKey,
      nextSiblingKey: pos.nextSiblingKey,
    })

    // B should now be a child of A, after C
    expect(getRankOrder()).toEqual([A.rowId, C.rowId, B.rowId])
    const newBKey = getKeyForRowId(B.rowId)
    expect(parseKey(newBKey).length).toBe(2) // child of root

    const parent = getParent(db, matrixId, newBKey)
    expect(parent).not.toBeNull()
    expect(compareKeys(parent!, A.key)).toBe(0)
  })

  test('cross-parent reparent: move child to root level', () => {
    // A (root), B (child of A), C (root)
    const A = makeRow('A')
    const C = makeRow('C', { prevKey: A.key })
    const B = makeRow('B', { parentKey: A.key })

    // Simulate dragging B between A and C at depth 0.
    // Non-dragged: [A(0), C(0)]. Gap=1 (between A and C), depth=0.
    const visibleRows: RowInfo[] = [
      { row_id: A.rowId, key: A.key, depth: 0 },
      { row_id: C.rowId, key: C.key, depth: 0 },
    ]
    const pos = computeDropPosition(visibleRows, 1, 0, 0, null)

    expect(pos.parentKey).toBeUndefined()
    expect(compareKeys(pos.prevSiblingKey!, A.key)).toBe(0)
    expect(compareKeys(pos.nextSiblingKey!, C.key)).toBe(0)

    reparentRow(db, {
      matrixId,
      nodeKey: B.key,
      newParentKey: pos.parentKey,
      prevSiblingKey: pos.prevSiblingKey,
      nextSiblingKey: pos.nextSiblingKey,
    })

    expect(getRankOrder()).toEqual([A.rowId, B.rowId, C.rowId])
    const newBKey = getKeyForRowId(B.rowId)
    expect(parseKey(newBKey).length).toBe(1) // root level

    const parent = getParent(db, matrixId, newBKey)
    expect(parent).toBeNull()
  })

  test('reparent subtree via drag preserves children', () => {
    // A (root), B (root), C (child of B), D (child of C)
    const A = makeRow('A')
    const B = makeRow('B', { prevKey: A.key })
    const C = makeRow('C', { parentKey: B.key })
    const D = makeRow('D', { parentKey: C.key })

    // Drag B (with subtree C, D) to become child of A.
    // Non-dragged: [A(0)]. Gap=1 (after A), depth=1.
    const visibleRows: RowInfo[] = [{ row_id: A.rowId, key: A.key, depth: 0 }]
    const pos = computeDropPosition(visibleRows, 1, 1, 0, null)

    reparentRow(db, {
      matrixId,
      nodeKey: B.key,
      newParentKey: pos.parentKey,
      prevSiblingKey: pos.prevSiblingKey,
      nextSiblingKey: pos.nextSiblingKey,
    })

    expect(getRankOrder()).toEqual([A.rowId, B.rowId, C.rowId, D.rowId])

    // B should be child of A
    const newBKey = getKeyForRowId(B.rowId)
    const bParent = getParent(db, matrixId, newBKey)
    expect(bParent).not.toBeNull()
    expect(compareKeys(bParent!, A.key)).toBe(0)

    // C should be child of B (new key)
    const newCKey = getKeyForRowId(C.rowId)
    const cParent = getParent(db, matrixId, newCKey)
    expect(cParent).not.toBeNull()
    expect(compareKeys(cParent!, newBKey)).toBe(0)

    // D should be child of C (new key)
    const newDKey = getKeyForRowId(D.rowId)
    const dParent = getParent(db, matrixId, newDKey)
    expect(dParent).not.toBeNull()
    expect(compareKeys(dParent!, newCKey)).toBe(0)
  })

  test('within-parent reorder among children: move last child to first', () => {
    // Parent, A (child), B (child), C (child)
    const P = makeRow('Parent')
    const A = makeRow('A', { parentKey: P.key })
    const B = makeRow('B', { parentKey: P.key, prevKey: A.key })
    const C = makeRow('C', { parentKey: P.key, prevKey: B.key })

    // Drag C to before A (first child of Parent).
    // Non-dragged: [P(0), A(1), B(1)]. Gap=1 (between P and A), depth=1.
    const visibleRows: RowInfo[] = [
      { row_id: P.rowId, key: P.key, depth: 0 },
      { row_id: A.rowId, key: A.key, depth: 1 },
      { row_id: B.rowId, key: B.key, depth: 1 },
    ]
    const pos = computeDropPosition(visibleRows, 1, 1, 0, null)

    expect(compareKeys(pos.parentKey!, P.key)).toBe(0)
    expect(pos.prevSiblingKey).toBeUndefined()
    expect(compareKeys(pos.nextSiblingKey!, A.key)).toBe(0)

    reparentRow(db, {
      matrixId,
      nodeKey: C.key,
      newParentKey: pos.parentKey,
      prevSiblingKey: pos.prevSiblingKey,
      nextSiblingKey: pos.nextSiblingKey,
    })

    expect(getRankOrder()).toEqual([P.rowId, C.rowId, A.rowId, B.rowId])

    // All children should still be under P
    const children = getChildren(db, matrixId, P.key)
    expect(children.length).toBe(3)
  })
})
