/**
 * Data-layer tests for outline keyboard interactions.
 *
 * These exercise the core matrix operations that back Enter, Tab, Shift-Tab,
 * and Backspace. ProseMirror state is not involved — we test the structural
 * operations (insert-after, split content, reparent, delete/merge) directly
 * against an in-memory SQLite database, now expressed over the own-forest of
 * `own`-edges (hierarchy is the edge; the edge_key only orders siblings).
 */

import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  initMatrixSchema,
  ensureRootMatrix,
  insertDataRow,
  updateRow,
  ROOT_MATRIX_ID,
  ROOT_ROW_ID,
} from './matrix'
import {
  createTreePosition,
  removeTreePosition,
  reparentRow,
  getOwnChildren,
  getOwnEdge,
  type NodeRef,
} from './tree'
import { compareKeys } from './lexorank'

let db: Database
let matrixId: number

const EMPTY_DOC = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })

const makeDoc = (text: string) =>
  JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })

const SENTINEL: NodeRef = { matrixId: ROOT_MATRIX_ID, rowId: ROOT_ROW_ID }

type Inserted = { rowId: number; edgeKey: Uint8Array; ref: NodeRef }

const insertContentRow = (
  text: string,
  opts?: { parent?: NodeRef; prevSiblingKey?: Uint8Array },
): Inserted => {
  const content = text ? makeDoc(text) : EMPTY_DOC
  const rowId = insertDataRow(db, matrixId, { content })
  const edgeKey = createTreePosition(db, matrixId, rowId, {
    parent: opts?.parent,
    prevSiblingKey: opts?.prevSiblingKey,
  })
  return { rowId, edgeKey, ref: { matrixId, rowId } }
}

const getRowContent = (rowId: number): string => {
  const stmt = db.prepare(`SELECT content FROM "mx_${matrixId}_data" WHERE id = ?`)
  stmt.bind([rowId])
  stmt.step()
  const row = stmt.get({}) as { content: string }
  stmt.finalize()
  return row.content
}

/** Row ids of a parent's own-children, in sibling order. */
const childRowIds = (parent: NodeRef): number[] =>
  getOwnChildren(db, parent).map((c) => c.rowId)

/** The own-parent of a row, or null if it is a forest root (sentinel-parented). */
const parentRefOf = (rowId: number): NodeRef | null => {
  const edge = getOwnEdge(db, matrixId, rowId)
  if (!edge) return null
  if (edge.parent.matrixId === ROOT_MATRIX_ID && edge.parent.rowId === ROOT_ROW_ID) return null
  return edge.parent
}

const edgeKeyOf = (rowId: number): Uint8Array => getOwnEdge(db, matrixId, rowId)!.edgeKey

/** Total rows of this matrix attached to the own-forest. */
const forestRowCount = (): number => {
  const stmt = db.prepare(
    `SELECT COUNT(*) AS n FROM joins WHERE target_matrix_id = ? AND kind = 'own'`,
  )
  stmt.bind([matrixId])
  stmt.step()
  const n = (stmt.get({}) as { n: number }).n
  stmt.finalize()
  return n
}

beforeEach(async () => {
  const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
  db = new sqlite3.oo1.DB(':memory:', 'c')
  initMatrixSchema(db)
  matrixId = ensureRootMatrix(db)
})

// ---------------------------------------------------------------------------
// Enter: insert after
// ---------------------------------------------------------------------------

describe('Enter — insert sibling after current row', () => {
  test('insert at root level after a single row', () => {
    const a = insertContentRow('Row A')
    const b = insertContentRow('', { prevSiblingKey: a.edgeKey })

    expect(childRowIds(SENTINEL)).toEqual([a.rowId, b.rowId])
    expect(getRowContent(b.rowId)).toBe(EMPTY_DOC)
  })

  test('insert between two root rows', () => {
    const a = insertContentRow('Row A')
    const c = insertContentRow('Row C', { prevSiblingKey: a.edgeKey })
    const b = insertContentRow('Row B', { prevSiblingKey: a.edgeKey })

    expect(childRowIds(SENTINEL)).toEqual([a.rowId, b.rowId, c.rowId])
  })

  test('insert after a row that has children preserves subtree', () => {
    const parent = insertContentRow('Parent')
    const child = insertContentRow('Child', { parent: parent.ref })
    const sibling = insertContentRow('Sibling', { prevSiblingKey: parent.edgeKey })

    expect(parentRefOf(child.rowId)).toEqual(parent.ref)
    expect(parentRefOf(sibling.rowId)).toBeNull()
    expect(childRowIds(SENTINEL)).toEqual([parent.rowId, sibling.rowId])
  })

  test('insert child row after existing children', () => {
    const parent = insertContentRow('Parent')
    const child1 = insertContentRow('Child 1', { parent: parent.ref })
    const child2 = insertContentRow('Child 2', {
      parent: parent.ref,
      prevSiblingKey: child1.edgeKey,
    })

    expect(childRowIds(parent.ref)).toEqual([child1.rowId, child2.rowId])
  })
})

// ---------------------------------------------------------------------------
// Enter: split content
// ---------------------------------------------------------------------------

describe('Enter — split content into two rows', () => {
  test('split produces two rows with correct content', () => {
    const original = insertContentRow('HelloWorld')

    updateRow(db, {
      matrixId,
      rowId: original.rowId,
      values: { content: makeDoc('Hello') },
    })
    const newRow = insertContentRow('World', { prevSiblingKey: original.edgeKey })

    expect(getRowContent(original.rowId)).toBe(makeDoc('Hello'))
    expect(getRowContent(newRow.rowId)).toBe(makeDoc('World'))
    expect(childRowIds(SENTINEL)).toEqual([original.rowId, newRow.rowId])
  })

  test('split row with children: new sibling appears after subtree', () => {
    const parent = insertContentRow('ParentText')
    const child = insertContentRow('Child', { parent: parent.ref })

    updateRow(db, {
      matrixId,
      rowId: parent.rowId,
      values: { content: makeDoc('Parent') },
    })
    const splitRow = insertContentRow('Text', { prevSiblingKey: parent.edgeKey })

    expect(parentRefOf(child.rowId)).toEqual(parent.ref)
    expect(parentRefOf(splitRow.rowId)).toBeNull()
    expect(childRowIds(SENTINEL)).toEqual([parent.rowId, splitRow.rowId])
  })
})

// ---------------------------------------------------------------------------
// Tab: reparent as last child of previous sibling
// ---------------------------------------------------------------------------

describe('Tab — indent (reparent under previous sibling)', () => {
  test('reparent as first child of previous sibling', () => {
    const a = insertContentRow('Row A')
    const b = insertContentRow('Row B', { prevSiblingKey: a.edgeKey })

    reparentRow(db, { matrixId, rowId: b.rowId, newParent: a.ref })

    expect(childRowIds(a.ref)).toEqual([b.rowId])
  })

  test('reparent as last child when previous sibling already has children', () => {
    const a = insertContentRow('Row A')
    const a1 = insertContentRow('A child', { parent: a.ref })
    const b = insertContentRow('Row B', { prevSiblingKey: a.edgeKey })

    reparentRow(db, {
      matrixId,
      rowId: b.rowId,
      newParent: a.ref,
      prevSiblingKey: a1.edgeKey,
    })

    expect(childRowIds(a.ref)).toEqual([a1.rowId, b.rowId])
  })

  test('indent leaves the subtree attached to the moved row', () => {
    const a = insertContentRow('Row A')
    const b = insertContentRow('Row B', { prevSiblingKey: a.edgeKey })
    const bChild = insertContentRow('B child', { parent: b.ref })

    reparentRow(db, { matrixId, rowId: b.rowId, newParent: a.ref })

    expect(childRowIds(a.ref)).toEqual([b.rowId])
    expect(childRowIds(b.ref)).toEqual([bChild.rowId])
  })

  test('indent leaves descendant edge keys byte-identical (O(1) re-point)', () => {
    const a = insertContentRow('Row A')
    const b = insertContentRow('Row B', { prevSiblingKey: a.edgeKey })
    const bChild = insertContentRow('B child', { parent: b.ref })

    const childKeyBefore = edgeKeyOf(bChild.rowId)
    reparentRow(db, { matrixId, rowId: b.rowId, newParent: a.ref })
    const childKeyAfter = edgeKeyOf(bChild.rowId)

    expect(compareKeys(childKeyBefore, childKeyAfter)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Shift-Tab: outdent (reparent to grandparent level)
// ---------------------------------------------------------------------------

describe('Shift-Tab — outdent (reparent to parent level)', () => {
  test('outdent to root level', () => {
    const a = insertContentRow('Row A')
    const a1 = insertContentRow('A child', { parent: a.ref })

    reparentRow(db, {
      matrixId,
      rowId: a1.rowId,
      prevSiblingKey: a.edgeKey,
    })

    expect(parentRefOf(a1.rowId)).toBeNull()
    expect(childRowIds(SENTINEL)).toEqual([a.rowId, a1.rowId])
  })

  test('outdent nested child to parent level', () => {
    const a = insertContentRow('Row A')
    const a1 = insertContentRow('A child', { parent: a.ref })
    const a1a = insertContentRow('Grandchild', { parent: a1.ref })

    reparentRow(db, {
      matrixId,
      rowId: a1a.rowId,
      newParent: a.ref,
      prevSiblingKey: a1.edgeKey,
    })

    expect(childRowIds(a.ref)).toEqual([a1.rowId, a1a.rowId])
    expect(childRowIds(a1.ref)).toEqual([])
  })

  test('outdent leaves the moved row’s subtree attached', () => {
    const a = insertContentRow('Row A')
    const a1 = insertContentRow('A child', { parent: a.ref })
    const a1a = insertContentRow('Grandchild', { parent: a1.ref })
    const a1aChild = insertContentRow('Great-grandchild', { parent: a1a.ref })

    reparentRow(db, {
      matrixId,
      rowId: a1a.rowId,
      newParent: a.ref,
      prevSiblingKey: a1.edgeKey,
    })

    expect(childRowIds(a.ref)).toEqual([a1.rowId, a1a.rowId])
    expect(childRowIds(a1a.ref)).toEqual([a1aChild.rowId])
  })

  test('reparent under one’s own descendant is rejected', () => {
    const a = insertContentRow('Row A')
    const a1 = insertContentRow('A child', { parent: a.ref })

    expect(() => reparentRow(db, { matrixId, rowId: a.rowId, newParent: a1.ref })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Backspace: delete empty row
// ---------------------------------------------------------------------------

describe('Backspace — delete empty row', () => {
  test('delete empty row with no children', () => {
    insertContentRow('Row A')
    const b = insertContentRow('')

    expect(forestRowCount()).toBe(2)

    removeTreePosition(db, matrixId, b.rowId)
    db.exec(`DELETE FROM "mx_${matrixId}_data" WHERE id = ?`, { bind: [b.rowId] })

    expect(forestRowCount()).toBe(1)
  })

  test('delete empty row with children promotes them', () => {
    const a = insertContentRow('Row A')
    const b = insertContentRow('')
    const b1 = insertContentRow('B child', { parent: b.ref })
    const b2 = insertContentRow('B child 2', { parent: b.ref, prevSiblingKey: b1.edgeKey })

    // removeTreePosition promotes b's children to its parent (root) in order.
    removeTreePosition(db, matrixId, b.rowId)
    db.exec(`DELETE FROM "mx_${matrixId}_data" WHERE id = ?`, { bind: [b.rowId] })

    expect(forestRowCount()).toBe(3) // A + two former children of B
    expect(childRowIds(SENTINEL)).toEqual([a.rowId, b1.rowId, b2.rowId])
    expect(parentRefOf(b1.rowId)).toBeNull()
  })

  test('deleting a node with a following sibling promotes children into its slot', () => {
    // A, N, Z at root; N has children C1, C2. Deleting N must leave the
    // children where N was (between A and Z), not appended after Z.
    const a = insertContentRow('A')
    const n = insertContentRow('N', { prevSiblingKey: a.edgeKey })
    const z = insertContentRow('Z', { prevSiblingKey: n.edgeKey })
    const c1 = insertContentRow('C1', { parent: n.ref })
    const c2 = insertContentRow('C2', { parent: n.ref, prevSiblingKey: c1.edgeKey })

    removeTreePosition(db, matrixId, n.rowId)
    db.exec(`DELETE FROM "mx_${matrixId}_data" WHERE id = ?`, { bind: [n.rowId] })

    expect(childRowIds(SENTINEL)).toEqual([a.rowId, c1.rowId, c2.rowId, z.rowId])
  })
})

// ---------------------------------------------------------------------------
// Backspace: merge content into previous row
// ---------------------------------------------------------------------------

describe('Backspace — merge content with previous row', () => {
  test('merge appends current content to previous row', () => {
    const a = insertContentRow('Hello')
    const b = insertContentRow(' World', { prevSiblingKey: a.edgeKey })

    updateRow(db, {
      matrixId,
      rowId: a.rowId,
      values: { content: makeDoc('Hello World') },
    })
    removeTreePosition(db, matrixId, b.rowId)
    db.exec(`DELETE FROM "mx_${matrixId}_data" WHERE id = ?`, { bind: [b.rowId] })

    expect(getRowContent(a.rowId)).toBe(makeDoc('Hello World'))
    expect(forestRowCount()).toBe(1)
  })

  test('merge with nested row: children are promoted before deletion', () => {
    const a = insertContentRow('Hello')
    const b = insertContentRow(' World', { prevSiblingKey: a.edgeKey })
    const bChild = insertContentRow('Child of B', { parent: b.ref })

    updateRow(db, {
      matrixId,
      rowId: a.rowId,
      values: { content: makeDoc('Hello World') },
    })
    removeTreePosition(db, matrixId, b.rowId)
    db.exec(`DELETE FROM "mx_${matrixId}_data" WHERE id = ?`, { bind: [b.rowId] })

    expect(getRowContent(a.rowId)).toBe(makeDoc('Hello World'))
    expect(forestRowCount()).toBe(2) // A + former child of B
    expect(childRowIds(SENTINEL)).toEqual([a.rowId, bChild.rowId])
  })
})
