import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { initMatrixSchema, createMatrix, insertRow } from './matrix'
import {
  createViewBlock,
  deleteViewBlock,
  getViewBlocksForNode,
  updateViewBlockSql,
} from './block-marker'
import { getGlobalKey, positionsOf } from './scroll-index'
import { getOwnEdge, type NodeRef } from './tree'

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

  test('createViewBlock mints a marker node and records its SQL', () => {
    const marker = createViewBlock(db, focal, 'SELECT 1 AS x')

    // The SQL is persisted and listed under its focal parent.
    const blocks = getViewBlocksForNode(db, focal)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.marker_matrix_id).toBe(marker.matrixId)
    expect(blocks[0]!.marker_row_id).toBe(marker.rowId)
    expect(blocks[0]!.sql).toBe('SELECT 1 AS x')

    // The marker is a real forest node: it has an own-edge under focal and a
    // scroll_index position (Phase 9.7 §6 — block markers are real participants).
    const edge = getOwnEdge(db, marker.matrixId, marker.rowId)
    expect(edge?.parent).toEqual(focal)
    expect(positionsOf(db, marker)).toHaveLength(1)
    expect(getGlobalKey(db, marker.matrixId, marker.rowId)).not.toBeNull()
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
})
