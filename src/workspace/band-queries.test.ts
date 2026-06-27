import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { initMatrixSchema, createMatrix, insertRow, createDependentRow } from '../core/matrix'

import { buildBandsForNodeQuery, buildTypeInSubtreeQuery } from './band-queries'

describe('band query builders (Phase 9.3)', () => {
  let db: Database
  let wsMatrixId: number
  let typeMatrixId: number

  const runIds = (sql: string): number[] => {
    const stmt = db.prepare(sql)
    const ids: number[] = []
    while (stmt.step()) ids.push((stmt.get({}) as { id: number }).id)
    stmt.finalize()
    return ids.sort((a, b) => a - b)
  }

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    wsMatrixId = createMatrix(db, 'Workspace', [{ name: 'content', type: 'TEXT' }])
    typeMatrixId = createMatrix(db, 'Task', [{ name: 'label', type: 'TEXT', role: 'label' }])
  })

  test('buildBandsForNodeQuery is a runnable SELECT scoped to the focal node', () => {
    // No bands yet — runs and returns nothing, no error.
    expect(runIds(buildBandsForNodeQuery(wsMatrixId, 1))).toEqual([])
  })

  test('buildTypeInSubtreeQuery returns hosts of {node} ∪ descendants(node)', () => {
    // Outline: node -> child (closure: node is ancestor of child at depth 1).
    const node = insertRow(db, wsMatrixId)
    const child = insertRow(db, wsMatrixId, {
      parent: { matrixId: wsMatrixId, rowId: node.rowId },
    })
    // An unrelated sibling outside the subtree.
    const outside = insertRow(db, wsMatrixId)

    // Attach a Task to the node itself (direct host — the no-self-pair case the
    // closure union must cover), to the descendant child, and to the outsider.
    const taskOnNode = createDependentRow(db, wsMatrixId, node.rowId, typeMatrixId)
    const taskOnChild = createDependentRow(db, wsMatrixId, child.rowId, typeMatrixId)
    createDependentRow(db, wsMatrixId, outside.rowId, typeMatrixId)

    const result = runIds(buildTypeInSubtreeQuery(typeMatrixId, wsMatrixId, node.rowId))
    expect(result).toEqual([taskOnNode, taskOnChild].sort((a, b) => a - b))
  })

  test('buildTypeInSubtreeQuery on a leaf node returns only its own hosted rows', () => {
    const node = insertRow(db, wsMatrixId)
    const taskOnNode = createDependentRow(db, wsMatrixId, node.rowId, typeMatrixId)

    expect(runIds(buildTypeInSubtreeQuery(typeMatrixId, wsMatrixId, node.rowId))).toEqual([
      taskOnNode,
    ])
  })
})
