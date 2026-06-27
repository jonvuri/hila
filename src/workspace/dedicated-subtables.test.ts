import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  initMatrixSchema,
  createMatrix,
  createOwnedMatrix,
  createDependentRow,
  insertRow,
} from '../core/matrix'

import { buildDedicatedSubtablesQuery } from './workspace-plugin'

/**
 * The Phase 9.4 discovery query: a node's *dedicated* own-matrixes (private
 * sub-tables), excluding *shared* ones (tag types). This is the SQL twin of
 * `isSharedMatrix`, and the sole source of truth for the sub-table band (which
 * is live-derived from ownership, not persisted).
 */
describe('buildDedicatedSubtablesQuery (Phase 9.4)', () => {
  let db: Database
  let wsMatrixId: number

  const runQuery = (sql: string): { id: number; title: string }[] => {
    const out: { id: number; title: string }[] = []
    const stmt = db.prepare(sql)
    while (stmt.step()) out.push(stmt.get({}) as unknown as { id: number; title: string })
    stmt.finalize()
    return out
  }

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    wsMatrixId = createMatrix(db, 'Workspace', [{ name: 'label', type: 'TEXT', role: 'label' }])
  })

  test('an empty dedicated own-matrix is discovered for its owner node', () => {
    const { rowId: nodeId } = insertRow(db, wsMatrixId)
    const subId = createOwnedMatrix(db, { matrixId: wsMatrixId, rowId: nodeId }, 'Sub-table', [
      { name: 'title', type: 'TEXT', role: 'label' },
    ])

    const rows = runQuery(buildDedicatedSubtablesQuery(wsMatrixId, nodeId))
    expect(rows.map((r) => r.id)).toEqual([subId])
  })

  test('a dedicated sub-table with node-owned rows stays dedicated', () => {
    const { rowId: nodeId } = insertRow(db, wsMatrixId)
    const subId = createOwnedMatrix(db, { matrixId: wsMatrixId, rowId: nodeId }, 'Sub-table', [
      { name: 'title', type: 'TEXT', role: 'label' },
    ])
    // Rows inserted via the anchored band: own-edge source = the focal node.
    createDependentRow(db, wsMatrixId, nodeId, subId, { title: 'r1' })
    createDependentRow(db, wsMatrixId, nodeId, subId, { title: 'r2' })

    const rows = runQuery(buildDedicatedSubtablesQuery(wsMatrixId, nodeId))
    expect(rows.map((r) => r.id)).toEqual([subId])
  })

  test('a shared matrix (rows owned by a different host) is excluded', () => {
    const { rowId: typeNodeId } = insertRow(db, wsMatrixId)
    const { rowId: otherHostId } = insertRow(db, wsMatrixId)
    const sharedId = createOwnedMatrix(
      db,
      { matrixId: wsMatrixId, rowId: typeNodeId },
      'Tasks',
      [{ name: 'label', type: 'TEXT', role: 'label' }],
    )
    // A row owned by a *different* host makes the matrix shared (a tag type).
    createDependentRow(db, wsMatrixId, otherHostId, sharedId, { label: 'foreign task' })

    expect(runQuery(buildDedicatedSubtablesQuery(wsMatrixId, typeNodeId))).toEqual([])
  })

  test('only the queried node’s dedicated sub-tables are returned', () => {
    const { rowId: nodeA } = insertRow(db, wsMatrixId)
    const { rowId: nodeB } = insertRow(db, wsMatrixId)
    const subA = createOwnedMatrix(db, { matrixId: wsMatrixId, rowId: nodeA }, 'A', [
      { name: 'title', type: 'TEXT', role: 'label' },
    ])
    createOwnedMatrix(db, { matrixId: wsMatrixId, rowId: nodeB }, 'B', [
      { name: 'title', type: 'TEXT', role: 'label' },
    ])

    const rows = runQuery(buildDedicatedSubtablesQuery(wsMatrixId, nodeA))
    expect(rows.map((r) => r.id)).toEqual([subA])
  })
})
