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

import {
  initMatrixSchema,
  ensureRootMatrix,
  insertDataRow,
  ROOT_MATRIX_ID,
  ROOT_ROW_ID,
} from '../core/matrix'
import { createTreePosition, reparentRow, getOwnChildren, type NodeRef } from '../core/tree'
import { compareKeys } from '../core/lexorank'

import { computeDropPosition, clampDropDepth, isNoOpDrop, type RowInfo } from './drag-drop'

// ---------------------------------------------------------------------------
// Helpers for synthetic row arrays
// ---------------------------------------------------------------------------

const k = (...bytes: number[]): Uint8Array => new Uint8Array(bytes)

const row = (id: number, key: Uint8Array, depth: number): RowInfo => ({
  ck: String(id),
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

  const SENTINEL: NodeRef = { matrixId: ROOT_MATRIX_ID, rowId: ROOT_ROW_ID }

  type Made = { rowId: number; edgeKey: Uint8Array; ref: NodeRef }

  const makeRow = (
    title: string,
    opts: { parent?: NodeRef; prevSiblingKey?: Uint8Array } = {},
  ): Made => {
    const rowId = insertDataRow(db, matrixId, { content: title })
    const edgeKey = createTreePosition(db, matrixId, rowId, {
      parent: opts.parent,
      prevSiblingKey: opts.prevSiblingKey,
    })
    return { rowId, edgeKey, ref: { matrixId, rowId } }
  }

  const childRowIds = (parent: NodeRef): number[] =>
    getOwnChildren(db, parent).map((c) => c.rowId)

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
    const A = makeRow('A')
    const B = makeRow('B', { prevSiblingKey: A.edgeKey })
    const C = makeRow('C', { prevSiblingKey: B.edgeKey })

    // Drag C before A (no parent → sentinel; nextSibling = A).
    reparentRow(db, { matrixId, rowId: C.rowId, nextSiblingKey: A.edgeKey })

    expect(childRowIds(SENTINEL)).toEqual([C.rowId, A.rowId, B.rowId])
  })

  test('reorder within parent: move first sibling to middle', () => {
    const A = makeRow('A')
    const B = makeRow('B', { prevSiblingKey: A.edgeKey })
    const C = makeRow('C', { prevSiblingKey: B.edgeKey })

    // Drag A between B and C.
    reparentRow(db, {
      matrixId,
      rowId: A.rowId,
      prevSiblingKey: B.edgeKey,
      nextSiblingKey: C.edgeKey,
    })

    expect(childRowIds(SENTINEL)).toEqual([B.rowId, A.rowId, C.rowId])
  })

  test('cross-parent reparent: move root item to become child', () => {
    const A = makeRow('A')
    makeRow('B', { prevSiblingKey: A.edgeKey })
    const C = makeRow('C', { parent: A.ref })
    const B2 = childRowIds(SENTINEL).find((id) => id !== A.rowId)!

    // Drag B to become child of A, after C.
    reparentRow(db, { matrixId, rowId: B2, newParent: A.ref, prevSiblingKey: C.edgeKey })

    expect(childRowIds(SENTINEL)).toEqual([A.rowId])
    expect(childRowIds(A.ref)).toEqual([C.rowId, B2])
  })

  test('cross-parent reparent: move child to root level', () => {
    const A = makeRow('A')
    const C = makeRow('C', { prevSiblingKey: A.edgeKey })
    const B = makeRow('B', { parent: A.ref })

    // Drag B between A and C at root level.
    reparentRow(db, {
      matrixId,
      rowId: B.rowId,
      prevSiblingKey: A.edgeKey,
      nextSiblingKey: C.edgeKey,
    })

    expect(childRowIds(SENTINEL)).toEqual([A.rowId, B.rowId, C.rowId])
    expect(childRowIds(A.ref)).toEqual([])
  })

  test('reparent subtree via drag preserves children (descendants untouched)', () => {
    const A = makeRow('A')
    const B = makeRow('B', { prevSiblingKey: A.edgeKey })
    const C = makeRow('C', { parent: B.ref })
    const D = makeRow('D', { parent: C.ref })

    const cKeyBefore = getOwnChildren(db, B.ref)[0]!.rowId
    expect(cKeyBefore).toBe(C.rowId)

    // Drag B (with subtree C, D) to become child of A.
    reparentRow(db, { matrixId, rowId: B.rowId, newParent: A.ref })

    expect(childRowIds(SENTINEL)).toEqual([A.rowId])
    expect(childRowIds(A.ref)).toEqual([B.rowId])
    expect(childRowIds(B.ref)).toEqual([C.rowId])
    expect(childRowIds(C.ref)).toEqual([D.rowId])
  })

  test('within-parent reorder among children: move last child to first', () => {
    const P = makeRow('Parent')
    const A = makeRow('A', { parent: P.ref })
    const B = makeRow('B', { parent: P.ref, prevSiblingKey: A.edgeKey })
    const C = makeRow('C', { parent: P.ref, prevSiblingKey: B.edgeKey })

    // Drag C to before A (first child of Parent).
    reparentRow(db, { matrixId, rowId: C.rowId, newParent: P.ref, nextSiblingKey: A.edgeKey })

    expect(childRowIds(P.ref)).toEqual([C.rowId, A.rowId, B.rowId])
  })
})
