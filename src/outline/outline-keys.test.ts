/**
 * Data-layer tests for outline keyboard interactions.
 *
 * These exercise the core matrix operations that back Enter, Tab, Shift-Tab,
 * and Backspace. ProseMirror state is not involved — we test the structural
 * operations (insert-after, split content, reparent, delete/merge) directly
 * against an in-memory SQLite database.
 */

import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { initMatrixSchema, ensureRootMatrix, insertDataRow, updateRow } from '../core/matrix'
import {
  createTreePosition,
  removeTreePosition,
  reparentRow,
  getChildren,
  getParent,
} from '../core/tree'
import { compareKeys } from '../core/lexorank'

let db: Database
let matrixId: number

const EMPTY_DOC = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })

const makeDoc = (text: string) =>
  JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })

const insertContentRow = (
  text: string,
  opts?: { parentKey?: Uint8Array; prevKey?: Uint8Array },
) => {
  const content = text ? makeDoc(text) : EMPTY_DOC
  const rowId = insertDataRow(db, matrixId, { content })
  const key = createTreePosition(db, matrixId, rowId, {
    parentKey: opts?.parentKey,
    prevKey: opts?.prevKey,
  })
  return { key, rowId }
}

const getRowContent = (rowId: number): string => {
  const stmt = db.prepare(`SELECT content FROM "mx_${matrixId}_data" WHERE id = ?`)
  stmt.bind([rowId])
  stmt.step()
  const row = stmt.get({}) as { content: string }
  stmt.finalize()
  return row.content
}

const allRankKeys = (): Uint8Array[] => {
  const stmt = db.prepare('SELECT key FROM rank WHERE matrix_id = ? ORDER BY key')
  stmt.bind([matrixId])
  const keys: Uint8Array[] = []
  while (stmt.step()) {
    const row = stmt.get({}) as { key: Uint8Array }
    keys.push(new Uint8Array(row.key))
  }
  stmt.finalize()
  return keys
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

    // Simulate Enter at end of Row A: insert empty row after it
    const b = insertContentRow('', { prevKey: a.key })

    expect(compareKeys(a.key, b.key)).toBe(-1)
    const content = getRowContent(b.rowId)
    expect(content).toBe(EMPTY_DOC)
  })

  test('insert between two root rows', () => {
    const a = insertContentRow('Row A')
    const c = insertContentRow('Row C', { prevKey: a.key })

    // Insert after A (before C)
    const b = insertContentRow('Row B', { prevKey: a.key })

    expect(compareKeys(a.key, b.key)).toBe(-1)
    expect(compareKeys(b.key, c.key)).toBe(-1)
  })

  test('insert after a row that has children preserves subtree', () => {
    const parent = insertContentRow('Parent')
    const child = insertContentRow('Child', { parentKey: parent.key })

    // Insert sibling after parent (should appear after parent's subtree)
    const sibling = insertContentRow('Sibling', { prevKey: parent.key })

    expect(compareKeys(parent.key, child.key)).toBe(-1)
    expect(compareKeys(child.key, sibling.key)).toBe(-1)
    expect(getParent(db, matrixId, child.key)).not.toBeNull()
    expect(getParent(db, matrixId, sibling.key)).toBeNull()
  })

  test('insert child row after existing children', () => {
    const parent = insertContentRow('Parent')
    const child1 = insertContentRow('Child 1', { parentKey: parent.key })

    // Insert second child after child1 under same parent
    const _child2 = insertContentRow('Child 2', {
      parentKey: parent.key,
      prevKey: child1.key,
    })

    const children = getChildren(db, matrixId, parent.key)
    expect(children).toHaveLength(2)
    expect(compareKeys(children[0]!, children[1]!)).toBe(-1)
  })
})

// ---------------------------------------------------------------------------
// Enter: split content
// ---------------------------------------------------------------------------

describe('Enter — split content into two rows', () => {
  test('split produces two rows with correct content', () => {
    const original = insertContentRow('HelloWorld')

    // Simulate split: update original to "Hello", insert new row with "World"
    updateRow(db, {
      matrixId,
      rowId: original.rowId,
      values: { content: makeDoc('Hello') },
    })
    const newRow = insertContentRow('World', { prevKey: original.key })

    expect(getRowContent(original.rowId)).toBe(makeDoc('Hello'))
    expect(getRowContent(newRow.rowId)).toBe(makeDoc('World'))
    expect(compareKeys(original.key, newRow.key)).toBe(-1)
  })

  test('split row with children: new sibling appears after subtree', () => {
    const parent = insertContentRow('ParentText')
    const child = insertContentRow('Child', { parentKey: parent.key })

    updateRow(db, {
      matrixId,
      rowId: parent.rowId,
      values: { content: makeDoc('Parent') },
    })
    const splitRow = insertContentRow('Text', { prevKey: parent.key })

    // splitRow should be after the child
    expect(compareKeys(child.key, splitRow.key)).toBe(-1)
    expect(getParent(db, matrixId, splitRow.key)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tab: reparent as last child of previous sibling
// ---------------------------------------------------------------------------

describe('Tab — indent (reparent under previous sibling)', () => {
  test('reparent as first child of previous sibling', () => {
    const a = insertContentRow('Row A')
    const b = insertContentRow('Row B', { prevKey: a.key })

    // Tab on B: make it a child of A
    reparentRow(db, { matrixId, nodeKey: b.key, newParentKey: a.key })

    const children = getChildren(db, matrixId, a.key)
    expect(children).toHaveLength(1)

    // The reparented row should have a new key, but same row_id
    const stmt = db.prepare('SELECT row_id FROM rank WHERE matrix_id = ? AND key = ?')
    stmt.bind([matrixId, children[0]!])
    stmt.step()
    const result = stmt.get({}) as { row_id: number }
    stmt.finalize()
    expect(result.row_id).toBe(b.rowId)
  })

  test('reparent as last child when previous sibling already has children', () => {
    const a = insertContentRow('Row A')
    const a1 = insertContentRow('A child', { parentKey: a.key })
    const b = insertContentRow('Row B', { prevKey: a.key })

    // Tab on B with prevSiblingKey = a1 (last child of A)
    reparentRow(db, {
      matrixId,
      nodeKey: b.key,
      newParentKey: a.key,
      prevSiblingKey: a1.key,
    })

    const children = getChildren(db, matrixId, a.key)
    expect(children).toHaveLength(2)
    // a1 should still be first, reparented B should be second
    expect(compareKeys(children[0]!, children[1]!)).toBe(-1)
  })

  test('indent moves subtree with the row', () => {
    const a = insertContentRow('Row A')
    const b = insertContentRow('Row B', { prevKey: a.key })
    insertContentRow('B child', { parentKey: b.key })

    reparentRow(db, { matrixId, nodeKey: b.key, newParentKey: a.key })

    const bNewKey = getChildren(db, matrixId, a.key)[0]!
    const bChildren = getChildren(db, matrixId, bNewKey)
    expect(bChildren).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Shift-Tab: outdent (reparent to grandparent level)
// ---------------------------------------------------------------------------

describe('Shift-Tab — outdent (reparent to parent level)', () => {
  test('outdent to root level', () => {
    const a = insertContentRow('Row A')
    const a1 = insertContentRow('A child', { parentKey: a.key })

    // Shift-Tab on a1: move to root, after A
    reparentRow(db, {
      matrixId,
      nodeKey: a1.key,
      prevSiblingKey: a.key,
    })

    const parent = getParent(db, matrixId, a1.key)
    expect(parent).toBeNull()

    const keys = allRankKeys()
    expect(keys.length).toBe(2)
    expect(compareKeys(keys[0]!, keys[1]!)).toBe(-1)
  })

  test('outdent nested child to parent level', () => {
    const a = insertContentRow('Row A')
    const a1 = insertContentRow('A child', { parentKey: a.key })
    const a1a = insertContentRow('Grandchild', { parentKey: a1.key })

    // Shift-Tab on a1a: move to A's children, after a1
    reparentRow(db, {
      matrixId,
      nodeKey: a1a.key,
      newParentKey: a.key,
      prevSiblingKey: a1.key,
    })

    const aChildren = getChildren(db, matrixId, a.key)
    expect(aChildren).toHaveLength(2)

    const a1Children = getChildren(db, matrixId, a1.key)
    expect(a1Children).toHaveLength(0)
  })

  test('outdent moves subtree with the row', () => {
    const a = insertContentRow('Row A')
    const a1 = insertContentRow('A child', { parentKey: a.key })
    const a1a = insertContentRow('Grandchild', { parentKey: a1.key })
    insertContentRow('Great-grandchild', { parentKey: a1a.key })

    // Outdent a1a to A's level (after a1)
    reparentRow(db, {
      matrixId,
      nodeKey: a1a.key,
      newParentKey: a.key,
      prevSiblingKey: a1.key,
    })

    // a1a's child should still be under it
    const a1aNewKey = getChildren(db, matrixId, a.key).find((k) => {
      const stmt = db.prepare('SELECT row_id FROM rank WHERE key = ?')
      stmt.bind([k])
      stmt.step()
      const r = stmt.get({}) as { row_id: number }
      stmt.finalize()
      return r.row_id === a1a.rowId
    })
    expect(a1aNewKey).toBeDefined()
    const subChildren = getChildren(db, matrixId, a1aNewKey!)
    expect(subChildren).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Backspace: delete empty row
// ---------------------------------------------------------------------------

describe('Backspace — delete empty row', () => {
  test('delete empty row with no children', () => {
    insertContentRow('Row A')
    const b = insertContentRow('')

    const keysBefore = allRankKeys()
    expect(keysBefore).toHaveLength(2)

    removeTreePosition(db, matrixId, b.rowId)
    db.exec(`DELETE FROM "mx_${matrixId}_data" WHERE id = ?`, { bind: [b.rowId] })

    const keysAfter = allRankKeys()
    expect(keysAfter).toHaveLength(1)
  })

  test('delete empty row with children reparents them', () => {
    insertContentRow('Row A')
    const b = insertContentRow('')
    const b1 = insertContentRow('B child', { parentKey: b.key })
    insertContentRow('B child 2', { parentKey: b.key, prevKey: b1.key })

    // Reparent b's children to root (b's parent) before deleting
    const children = getChildren(db, matrixId, b.key)
    const parentKey = getParent(db, matrixId, b.key)
    let prevKey: Uint8Array | undefined
    for (const childKey of children) {
      const newKey = reparentRow(db, {
        matrixId,
        nodeKey: childKey,
        newParentKey: parentKey ?? undefined,
        prevSiblingKey: prevKey,
      })
      prevKey = newKey
    }
    removeTreePosition(db, matrixId, b.rowId)
    db.exec(`DELETE FROM "mx_${matrixId}_data" WHERE id = ?`, { bind: [b.rowId] })

    // Children are now root-level
    const keys = allRankKeys()
    expect(keys).toHaveLength(3) // A + two former children of B
  })
})

// ---------------------------------------------------------------------------
// Backspace: merge content into previous row
// ---------------------------------------------------------------------------

describe('Backspace — merge content with previous row', () => {
  test('merge appends current content to previous row', () => {
    const a = insertContentRow('Hello')
    const b = insertContentRow(' World', { prevKey: a.key })

    // Simulate merge: update A's content to combined, then delete B
    updateRow(db, {
      matrixId,
      rowId: a.rowId,
      values: { content: makeDoc('Hello World') },
    })
    removeTreePosition(db, matrixId, b.rowId)
    db.exec(`DELETE FROM "mx_${matrixId}_data" WHERE id = ?`, { bind: [b.rowId] })

    expect(getRowContent(a.rowId)).toBe(makeDoc('Hello World'))
    const keys = allRankKeys()
    expect(keys).toHaveLength(1)
  })

  test('merge with nested row: children are reparented before deletion', () => {
    const a = insertContentRow('Hello')
    const b = insertContentRow(' World', { prevKey: a.key })
    insertContentRow('Child of B', { parentKey: b.key })

    // Reparent b's children to root before deleting
    const children = getChildren(db, matrixId, b.key)
    const parentOfB = getParent(db, matrixId, b.key)
    for (const childKey of children) {
      reparentRow(db, {
        matrixId,
        nodeKey: childKey,
        newParentKey: parentOfB ?? undefined,
      })
    }

    updateRow(db, {
      matrixId,
      rowId: a.rowId,
      values: { content: makeDoc('Hello World') },
    })
    removeTreePosition(db, matrixId, b.rowId)
    db.exec(`DELETE FROM "mx_${matrixId}_data" WHERE id = ?`, { bind: [b.rowId] })

    expect(getRowContent(a.rowId)).toBe(makeDoc('Hello World'))
    const keys = allRankKeys()
    expect(keys).toHaveLength(2) // A + former child of B
  })
})
