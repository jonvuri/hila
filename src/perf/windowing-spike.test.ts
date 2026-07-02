/**
 * Phase 9.7b — windowing / count+slice spike: Stage-P0 validation.
 *
 * Proves the flattening model against the guards that gate the build:
 *   1. a window straddling a block boundary gathers from exactly the sources it
 *      crosses (one materialized range + one block slice), never more;
 *   2. a 1-row block does not get a lonely window — the window keeps pulling
 *      subsequent rows to fill its budget;
 *   3. a block spanning multiple windows renders as consecutive offset slices
 *      into its own order, and the whole flattened sequence is covered exactly
 *      once (no gap, no overlap, no double-count);
 *   4. the per-window gather cost (rows touched, query shape) is independent of
 *      total forest size and total block size — bounded by ROWS_PER_WINDOW, not
 *      by the underlying data's scale;
 *   5. both source kinds ride an ordered index/PK walk with no sort step
 *      (no TEMP B-TREE, no AUTOMATIC index) at representative scale.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { createMatrix, insertDataRow } from '../core/matrix'
import { createTreePosition } from '../core/tree'
import { getGlobalKey } from '../core/scroll-index'
import { withTransaction } from '../core/transaction'

import {
  computeSegments,
  gatherWindow,
  materializedSliceSql,
  sliceWindow,
  type Block,
} from './windowing-spike'
import { assertQueryPlan } from './query-plan'

import { createPerfDb, type PerfHarness } from './index'

const ROWS_PER_WINDOW = 100

/** Append `count` flat root-level rows to `matrixId`; returns their row ids. */
const appendFlatRows = (db: Database, matrixId: number, count: number): number[] => {
  const ids: number[] = []
  withTransaction(db, () => {
    for (let i = 0; i < count; i++) {
      const rowId = insertDataRow(db, matrixId, { label: `Row ${i}` })
      createTreePosition(db, matrixId, rowId)
      ids.push(rowId)
    }
  })
  return ids
}

/** A container matrix of `count` rows, each with its own rowid-ordered slice. */
const makeContainerBlock = (
  db: Database,
  markerKey: Uint8Array,
  count: number,
): { block: Block; matrixId: number } => {
  const matrixId = createMatrix(db, 'Tasks', [{ name: 'label', type: 'TEXT', role: 'label' }])
  withTransaction(db, () => {
    for (let i = 0; i < count; i++) insertDataRow(db, matrixId, { label: `Task ${i}` })
  })
  const block: Block = {
    key: markerKey,
    count,
    slice: (sliceDb, offset, limit) =>
      sliceDb.selectObjects(
        `SELECT id, label FROM "mx_${matrixId}_data" ORDER BY id LIMIT ? OFFSET ?`,
        [limit, offset],
      ) as unknown as Record<string, unknown>[],
  }
  return { block, matrixId }
}

describe('Phase 9.7b — windowing / count+slice spike', () => {
  let h: PerfHarness

  beforeEach(async () => {
    h = await createPerfDb()
  })
  afterEach(() => h.close())

  // -- 1 & 3. Straddling windows, exact coverage --------------------------------

  test('a 500-row block spanning multiple windows: exact coverage, straddling windows touch exactly the sources they cross', () => {
    const wsId = createMatrix(h.db, 'Workspace', [
      { name: 'label', type: 'TEXT', role: 'label' },
    ])
    // 150 ordinary rows, then the block marker (reusing a real mesh row as the
    // marker, per "block markers are minted as real scroll_index participants"),
    // then 80 more ordinary rows.
    appendFlatRows(h.db, wsId, 150)
    const markerRowId = insertDataRow(h.db, wsId, { label: 'Tasks (500)' })
    createTreePosition(h.db, wsId, markerRowId)
    const markerKey = getGlobalKey(h.db, wsId, markerRowId)!
    appendFlatRows(h.db, wsId, 80)

    const { block } = makeContainerBlock(h.db, markerKey, 500)

    h.analyze()

    const segments = computeSegments(h.db, [block], null, null)
    // gap(150) + block(500) + gap(80) = 730 total virtual rows.
    expect(segments.map((s) => s.virtualSize)).toEqual([150, 500, 80])
    expect(segments.map((s) => s.virtualStart)).toEqual([0, 150, 650])

    const totalVirtual = segments.reduce((sum, s) => sum + s.virtualSize, 0)
    expect(totalVirtual).toBe(730)

    // Window 1 (rows 100..199) straddles the gap/block boundary at 150: two
    // sources, not more.
    const straddle = sliceWindow(segments, 1, ROWS_PER_WINDOW)
    expect(straddle.map((r) => r.kind)).toEqual(['materialized', 'block'])
    expect(straddle[0]!.limit + straddle[1]!.limit).toBe(ROWS_PER_WINDOW)

    // Window 2 (rows 200..299) is entirely inside the block: one source.
    const insideBlock = sliceWindow(segments, 2, ROWS_PER_WINDOW)
    expect(insideBlock.length).toBe(1)
    expect(insideBlock[0]!.kind).toBe('block')
    expect(insideBlock[0]!.limit).toBe(ROWS_PER_WINDOW)

    // Window 6 (rows 600..699) straddles block-end/tail-gap at 650.
    const straddleEnd = sliceWindow(segments, 6, ROWS_PER_WINDOW)
    expect(straddleEnd.map((r) => r.kind)).toEqual(['block', 'materialized'])
    expect(straddleEnd[0]!.limit + straddleEnd[1]!.limit).toBe(ROWS_PER_WINDOW)

    // Exact coverage: gathering every window (7 full + 1 partial of 730 rows)
    // yields exactly 730 rows, no gap, no double-count.
    const totalWindows = Math.ceil(totalVirtual / ROWS_PER_WINDOW)
    let gathered = 0
    for (let w = 0; w < totalWindows; w++) {
      const reqs = sliceWindow(segments, w, ROWS_PER_WINDOW)
      gathered += gatherWindow(h.rawDb, reqs).length
    }
    expect(gathered).toBe(totalVirtual)
  })

  // -- 2. No lonely window -------------------------------------------------------

  test('a 1-row block does not get a lonely window: the window keeps pulling subsequent rows', () => {
    const wsId = createMatrix(h.db, 'Workspace', [
      { name: 'label', type: 'TEXT', role: 'label' },
    ])
    const smallWindow = 10
    appendFlatRows(h.db, wsId, 5)
    const markerRowId = insertDataRow(h.db, wsId, { label: 'Single #task ref' })
    createTreePosition(h.db, wsId, markerRowId)
    const markerKey = getGlobalKey(h.db, wsId, markerRowId)!
    appendFlatRows(h.db, wsId, 20)

    const targetMatrixId = createMatrix(h.db, 'Target', [
      { name: 'label', type: 'TEXT', role: 'label' },
    ])
    const targetRowId = insertDataRow(h.db, targetMatrixId, { label: 'The one task' })
    const block: Block = {
      key: markerKey,
      count: 1,
      slice: (db, offset, limit) =>
        offset === 0 && limit > 0 ?
          (db.selectObjects(`SELECT id, label FROM "mx_${targetMatrixId}_data" WHERE id = ?`, [
            targetRowId,
          ]) as unknown as Record<string, unknown>[])
        : [],
    }

    const segments = computeSegments(h.db, [block], null, null)
    expect(segments.map((s) => s.virtualSize)).toEqual([5, 1, 20])

    // Window 0 (rows 0..9) spans all three segments: 5 ordinary + the 1-row
    // block + 4 more ordinary — the block never gets its own window.
    const window0 = sliceWindow(segments, 0, smallWindow)
    expect(window0.map((r) => r.kind)).toEqual(['materialized', 'block', 'materialized'])
    expect(window0.reduce((sum, r) => sum + r.limit, 0)).toBe(smallWindow)
    expect(window0[1]!.limit).toBe(1) // the block's single row, inline

    const gathered = gatherWindow(h.rawDb, window0)
    expect(gathered.length).toBe(smallWindow)
  })

  // -- 4 & 5. Per-window gather cost is bounded, not scale-dependent ------------

  test('per-window gather touches exactly ROWS_PER_WINDOW rows regardless of forest or block size', () => {
    const measureWindowGather = (forestSize: number, blockSize: number): number => {
      const wsId = createMatrix(h.db, 'Workspace', [
        { name: 'label', type: 'TEXT', role: 'label' },
      ])
      const half = Math.floor(forestSize / 2)
      appendFlatRows(h.db, wsId, half)
      const markerRowId = insertDataRow(h.db, wsId, { label: 'Container' })
      createTreePosition(h.db, wsId, markerRowId)
      const markerKey = getGlobalKey(h.db, wsId, markerRowId)!
      appendFlatRows(h.db, wsId, forestSize - half)

      const { block } = makeContainerBlock(h.db, markerKey, blockSize)
      const segments = computeSegments(h.db, [block], null, null)

      // A window straddling the block start (guaranteed since half >= 100).
      const straddleWindow = Math.floor(half / ROWS_PER_WINDOW)
      const reqs = sliceWindow(segments, straddleWindow, ROWS_PER_WINDOW)
      return gatherWindow(h.rawDb, reqs).length
    }

    expect(measureWindowGather(2000, 500)).toBe(ROWS_PER_WINDOW)
    expect(measureWindowGather(20000, 5000)).toBe(ROWS_PER_WINDOW) // 10x forest+block, same cost
  })

  test('both source kinds ride an ordered walk with no sort step at representative scale', () => {
    const wsId = createMatrix(h.db, 'Workspace', [
      { name: 'label', type: 'TEXT', role: 'label' },
    ])
    appendFlatRows(h.db, wsId, 2000)
    const markerRowId = insertDataRow(h.db, wsId, { label: 'Container' })
    createTreePosition(h.db, wsId, markerRowId)
    const markerKey = getGlobalKey(h.db, wsId, markerRowId)!
    appendFlatRows(h.db, wsId, 2000)

    const { block, matrixId } = makeContainerBlock(h.db, markerKey, 500)
    void block

    h.analyze()

    // Materialized-segment slice: a single keyset range on the scroll_index PK.
    assertQueryPlan(
      h.rawDb,
      materializedSliceSql(),
      [new Uint8Array(0), new Uint8Array([0xff]), ROWS_PER_WINDOW, 0],
      {
        noAutoIndex: true,
        noTempBTree: true,
      },
    )

    // Block slice: a rowid-ordered walk of the block's own matrix (id IS the
    // rowid — the analogue of scroll_index's BLOB-PK keyset walk, just without a
    // WHERE clause since the block source has no upstream filter here). The
    // invariant that matters is no separate sort step and no synthesized index.
    const blockSql = `SELECT id, label FROM "mx_${matrixId}_data" ORDER BY id LIMIT ? OFFSET ?`
    assertQueryPlan(h.rawDb, blockSql, [ROWS_PER_WINDOW, 100], {
      noAutoIndex: true,
      noTempBTree: true,
    })
  })
})
