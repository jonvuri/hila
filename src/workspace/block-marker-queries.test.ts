import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { initMatrixSchema, createMatrix, insertRow } from '../core/matrix'
import { createViewBlock } from '../core/block-marker'

import { buildViewBlocksForNodeQuery, buildViewSourceQuery } from './block-marker-queries'

describe('view-block query builders (Phase 9.7 Stage B)', () => {
  let db: Database
  let wsMatrixId: number

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
  })

  test('buildViewBlocksForNodeQuery is a runnable SELECT scoped to the focal node', () => {
    // No view blocks yet — runs and returns nothing, no error.
    expect(runIds(buildViewBlocksForNodeQuery(wsMatrixId, 1))).toEqual([])
  })

  test('named discovery and source lookup share the marker identity', () => {
    const namedMatrixId = createMatrix(db, 'Named', [
      { name: 'heading', type: 'TEXT', role: 'label' },
    ])
    const focal = insertRow(db, namedMatrixId)
    const marker = createViewBlock(
      db,
      { matrixId: namedMatrixId, rowId: focal.rowId },
      'SELECT 1 AS value',
      'Saved view',
    )
    const discovery = db.selectObjects(
      buildViewBlocksForNodeQuery(namedMatrixId, focal.rowId, 'heading'),
    ) as unknown as { marker_matrix_id: number; marker_row_id: number; name: string }[]
    const source = db.selectObjects(
      buildViewSourceQuery(marker.matrixId, marker.rowId),
    ) as unknown as { marker_matrix_id: number; marker_row_id: number; sql: string }[]

    expect(discovery).toHaveLength(1)
    expect(discovery[0]).toMatchObject({
      marker_matrix_id: marker.matrixId,
      marker_row_id: marker.rowId,
    })
    expect(discovery[0]!.name).toContain('Saved view')
    expect(source).toEqual([
      {
        marker_matrix_id: marker.matrixId,
        marker_row_id: marker.rowId,
        sql: 'SELECT 1 AS value',
      },
    ])
  })
})
