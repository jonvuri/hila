/**
 * Phase 9.7 Stage C2 — inline block folding: the gather with production filters.
 *
 * Guards the count+slice flattener wired through the *filtered* outline query
 * (src/workspace/gather-flatten.ts), the layer the worker↔client gather RPC runs
 * (src/core/worker/gather-handler.ts). Complements window-flatten.test.ts (which
 * guards the bare engine): here the materialized segments carry the real outline
 * projection + filters, and a `view` block marker's content folds inline at its
 * position.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { createMatrix, insertDataRow } from '../core/matrix'
import { createTreePosition } from '../core/tree'
import { getGlobalKey } from '../core/scroll-index'
import { withTransaction } from '../core/transaction'
import { createPerfDb, type PerfHarness } from '../perf/index'
import type { GatherSpec } from '../core/sql-types'

import { computeGather, bytesToHex } from './gather-flatten'
import { buildPaginatedOutlineQuery } from './outline-queries'

const RPW = 10

const appendLooseRows = (
  db: Database,
  matrixId: number,
  count: number,
  label: string,
): void => {
  withTransaction(db, () => {
    for (let i = 0; i < count; i++) {
      const rowId = insertDataRow(db, matrixId, { label: `${label} ${i}` })
      createTreePosition(db, matrixId, rowId)
    }
  })
}

describe('Phase 9.7 Stage C2 — gather flatten (production filters)', () => {
  let h: PerfHarness
  beforeEach(async () => {
    h = await createPerfDb()
  })
  afterEach(() => h.close())

  const setup = () => {
    const wsId = createMatrix(h.rawDb, 'Workspace', [
      { name: 'label', type: 'TEXT', role: 'label' },
    ])
    // 5 loose rows, then a `view` block marker (a real scroll_index participant
    // recorded in block_sources), then 5 more loose rows.
    appendLooseRows(h.rawDb, wsId, 5, 'Before')
    const markerRowId = insertDataRow(h.rawDb, wsId, { label: 'marker' })
    createTreePosition(h.rawDb, wsId, markerRowId)
    const markerKey = getGlobalKey(h.rawDb, wsId, markerRowId)!
    appendLooseRows(h.rawDb, wsId, 5, 'After')

    // The view's base matrix — 20 rows folded inline.
    const tId = createMatrix(h.rawDb, 'Tasks', [{ name: 'label', type: 'TEXT', role: 'label' }])
    withTransaction(h.rawDb, () => {
      for (let i = 0; i < 20; i++) insertDataRow(h.rawDb, tId, { label: `Task ${i}` })
    })
    const sql = `SELECT id, label FROM "mx_${tId}_data" ORDER BY id`
    h.rawDb.exec(
      `INSERT INTO block_sources (marker_matrix_id, marker_row_id, kind, sql) VALUES (?, ?, 'view', ?)`,
      { bind: [wsId, markerRowId, sql] },
    )

    const spec: GatherSpec = {
      focusRootHex: null,
      collapsedKeyHexes: [],
      afterKeyHex: null,
      minPage: 0,
      maxPage: 2,
      rowsPerWindow: RPW,
      blocks: [
        {
          keyHex: bytesToHex(markerKey),
          kind: 'view',
          sourceMatrixId: tId,
          markerDepth: 0,
          sql,
        },
      ],
    }
    return { wsId, tId, spec }
  }

  test('a view block folds inline at its marker position; exact coverage, in the view order', () => {
    const { tId, spec } = setup()
    const { rows, totalVirtual } = computeGather(h.rawDb, spec)

    // 5 loose + 20 folded + 5 loose = 30 (the marker row itself is excluded — it
    // stands in for its content, not a plain row).
    expect(totalVirtual).toBe(30)
    expect(rows.length).toBe(30)

    // The folded rows sit at [5, 25): from the view's matrix, flagged, with
    // inline data.
    const folded = rows.slice(5, 25)
    expect(folded.every((r) => r.is_block_row === 1)).toBe(true)
    expect(folded.every((r) => r.matrix_id === tId)).toBe(true)

    // The loose rows around them are materialized (not flagged).
    expect(rows[4]!.is_block_row).toBe(0)
    expect(rows[25]!.is_block_row).toBe(0)

    // The folded rows appear once each, in the view's own order (`ORDER BY id`),
    // sliced consistently across windows — the count+slice ordering guarantee.
    const groundTruth = (
      h.rawDb.selectObjects(`SELECT id FROM "mx_${tId}_data" ORDER BY id`) as unknown as {
        id: number
      }[]
    ).map((r) => r.id)
    expect(folded.map((r) => (r.block_data as { id: number }).id)).toEqual(groundTruth)
  })

  test('a window straddling the block boundary folds both sources', () => {
    const { spec } = setup()
    // Window 0 = flattened rows [0,10): 5 loose + first 5 folded.
    const { rows } = computeGather(h.rawDb, { ...spec, minPage: 0, maxPage: 0 })
    expect(rows.length).toBe(RPW)
    expect(rows.filter((r) => r.is_block_row === 0).length).toBe(5)
    expect(rows.filter((r) => r.is_block_row === 1).length).toBe(5)
  })

  test('no-block gather is behaviour-identical to the plain outline slice', () => {
    const wsId = createMatrix(h.rawDb, 'Workspace', [
      { name: 'label', type: 'TEXT', role: 'label' },
    ])
    appendLooseRows(h.rawDb, wsId, 12, 'Row')

    const spec: GatherSpec = {
      focusRootHex: null,
      collapsedKeyHexes: [],
      afterKeyHex: null,
      minPage: 0,
      maxPage: 0,
      rowsPerWindow: RPW,
      blocks: [],
    }
    const { rows, totalVirtual } = computeGather(h.rawDb, spec)
    expect(totalVirtual).toBe(12)

    const plain = h.rawDb.selectObjects(
      buildPaginatedOutlineQuery({ limit: RPW, offset: 0 }),
    ) as unknown as Record<string, unknown>[]
    expect(rows.length).toBe(plain.length)
    expect(rows.map((r) => r.row_id)).toEqual(plain.map((r) => r.row_id))
  })

  test('empty and invalid views preserve surrounding rows without minting structure', () => {
    const { spec } = setup()
    const joinsBefore = h.rawDb.selectValue('SELECT COUNT(*) FROM joins')
    const positionsBefore = h.rawDb.selectValue('SELECT COUNT(*) FROM scroll_index')

    for (const sql of ['SELECT 1 WHERE 0', 'SELECT * FROM missing_view_source']) {
      const result = computeGather(h.rawDb, {
        ...spec,
        blocks: [{ ...spec.blocks[0]!, sql }],
      })
      expect(result.totalVirtual).toBe(10)
      expect(result.rows).toHaveLength(10)
      expect(result.rows.every((row) => row.is_block_row === 0)).toBe(true)
    }

    expect(h.rawDb.selectValue('SELECT COUNT(*) FROM joins')).toBe(joinsBefore)
    expect(h.rawDb.selectValue('SELECT COUNT(*) FROM scroll_index')).toBe(positionsBefore)
  })
})
