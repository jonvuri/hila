import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { initMatrixSchema, createMatrix, insertRow, updateRow } from './matrix'
import {
  createViewBlock,
  deleteViewBlock,
  getViewBlocksForNode,
  updateViewBlockSql,
} from './block-marker'
import { getGlobalKey, positionsOf } from './scroll-index'
import { addPortal } from './portal'
import { deleteSubtree, getOwnEdge, type NodeRef } from './tree'

const textFromStoredName = (stored: string): string => {
  const doc = JSON.parse(stored) as { content?: { content?: { text?: string }[] }[] }
  return doc.content?.[0]?.content?.[0]?.text ?? ''
}

describe('View block markers (Phase 9.7 Stage B)', () => {
  let db: Database
  let wsId: number
  let focal: NodeRef

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    wsId = createMatrix(db, 'Workspace', [{ name: 'label', type: 'TEXT', role: 'label' }])
    const { rowId } = insertRow(db, wsId)
    focal = { matrixId: wsId, rowId }
  })

  test('createViewBlock mints one named marker identity and records its SQL', () => {
    const marker = createViewBlock(db, focal, 'SELECT 1 AS x', 'Open work')

    // The SQL is persisted and listed under its focal parent.
    const blocks = getViewBlocksForNode(db, focal)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.marker_matrix_id).toBe(marker.matrixId)
    expect(blocks[0]!.marker_row_id).toBe(marker.rowId)
    expect(textFromStoredName(blocks[0]!.name)).toBe('Open work')
    expect(blocks[0]!.sql).toBe('SELECT 1 AS x')

    // The marker is a real forest node: it has an own-edge under focal and a
    // scroll_index position (Phase 9.7 §6 — block markers are real participants).
    const edge = getOwnEdge(db, marker.matrixId, marker.rowId)
    expect(edge?.parent).toEqual(focal)
    expect(positionsOf(db, marker)).toHaveLength(1)
    expect(getGlobalKey(db, marker.matrixId, marker.rowId)).not.toBeNull()
  })

  test('defaults the name and requires a writable label-role field', () => {
    const marker = createViewBlock(db, focal, 'SELECT 1')
    expect(textFromStoredName(getViewBlocksForNode(db, focal)[0]!.name)).toBe('Untitled view')

    const unlabeled = createMatrix(db, 'Unlabeled', [{ name: 'content', type: 'TEXT' }])
    const { rowId } = insertRow(db, unlabeled)
    expect(() => createViewBlock(db, { matrixId: unlabeled, rowId }, 'SELECT 1')).toThrow(
      /no writable label field/,
    )
    expect(getOwnEdge(db, marker.matrixId, marker.rowId)).not.toBeNull()
  })

  test('rename changes only the marker label field', () => {
    const marker = createViewBlock(db, focal, 'SELECT 1', 'Before')
    const edgeBefore = getOwnEdge(db, marker.matrixId, marker.rowId)
    const keyBefore = getGlobalKey(db, marker.matrixId, marker.rowId)

    updateRow(db, {
      matrixId: marker.matrixId,
      rowId: marker.rowId,
      values: {
        label: JSON.stringify({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'After' }] }],
        }),
      },
    })

    const block = getViewBlocksForNode(db, focal)[0]!
    expect(textFromStoredName(block.name)).toBe('After')
    expect(block.sql).toBe('SELECT 1')
    expect(getOwnEdge(db, marker.matrixId, marker.rowId)).toEqual(edgeBefore)
    expect(getGlobalKey(db, marker.matrixId, marker.rowId)).toEqual(keyBefore)
  })

  test('empty and invalid SQL remain valid named places', () => {
    createViewBlock(db, focal, 'SELECT 1 WHERE 0', 'Empty')
    createViewBlock(db, focal, 'SELECT FROM', 'Broken')
    expect(
      getViewBlocksForNode(db, focal).map((block) => textFromStoredName(block.name)),
    ).toEqual(['Empty', 'Broken'])
  })

  test('markers list in edge_key (position) order under the focal', () => {
    const a = createViewBlock(db, focal, 'SELECT 1')
    const b = createViewBlock(db, focal, 'SELECT 2')
    const c = createViewBlock(db, focal, 'SELECT 3')
    const listed = getViewBlocksForNode(db, focal).map((r) => r.marker_row_id)
    expect(listed).toEqual([a.rowId, b.rowId, c.rowId])
  })

  test('getViewBlocksForNode is scoped to the focal node', () => {
    const { rowId: otherRow } = insertRow(db, wsId)
    const other = { matrixId: wsId, rowId: otherRow }
    createViewBlock(db, focal, 'SELECT 1')
    createViewBlock(db, other, 'SELECT 2')
    expect(getViewBlocksForNode(db, focal)).toHaveLength(1)
    expect(getViewBlocksForNode(db, other)).toHaveLength(1)
  })

  test('updateViewBlockSql replaces the SQL', () => {
    const marker = createViewBlock(db, focal, 'SELECT 1')
    updateViewBlockSql(db, marker, 'SELECT 2 AS y')
    expect(getViewBlocksForNode(db, focal)[0]!.sql).toBe('SELECT 2 AS y')
  })

  test('deleteViewBlock removes the SQL row and the marker node', () => {
    const marker = createViewBlock(db, focal, 'SELECT 1')
    deleteViewBlock(db, marker)
    expect(getViewBlocksForNode(db, focal)).toHaveLength(0)
    // The marker node is gone from the forest and the scroll index.
    expect(getOwnEdge(db, marker.matrixId, marker.rowId)).toBeNull()
    expect(positionsOf(db, marker)).toHaveLength(0)
  })

  test('ordinary view deletion ghosts portals and removes executable SQL', () => {
    const { rowId: portalHostRowId } = insertRow(db, wsId)
    const portalHost = { matrixId: wsId, rowId: portalHostRowId }
    const marker = createViewBlock(db, focal, 'SELECT 1', 'Portaled view')
    addPortal(db, portalHost, marker)

    deleteViewBlock(db, marker)

    expect(db.selectValue('SELECT COUNT(*) FROM block_sources')).toBe(0)
    expect(getOwnEdge(db, marker.matrixId, marker.rowId)).toBeNull()
    expect(positionsOf(db, marker)).toHaveLength(1)
    expect(
      db.selectValue('SELECT is_ghost FROM scroll_index WHERE matrix_id = ? AND row_id = ?', [
        marker.matrixId,
        marker.rowId,
      ]),
    ).toBe(1)
  })

  test('deleting an ancestor cannot orphan descendant view SQL', () => {
    createViewBlock(db, focal, 'SELECT 1', 'Descendant')
    deleteSubtree(db, focal)
    expect(db.selectValue('SELECT COUNT(*) FROM block_sources')).toBe(0)
  })
})
