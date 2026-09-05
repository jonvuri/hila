/**
 * Phase 9.7 — Stage B: count + slice window flattening (production ops).
 *
 * Ports the windowing spike's Stage-P0 guards (src/perf/windowing-spike.test.ts)
 * onto the production flattener (src/workspace/window-flatten.ts) and the real
 * schema/ops, proving the settled model holds where it now lives:
 *   1. a window straddling a block boundary gathers from exactly the sources it
 *      crosses (one materialized range + one block slice), never more;
 *   2. a 1-row block does not get a lonely window — the window keeps pulling
 *      subsequent rows to fill its budget;
 *   3. a block spanning multiple windows renders as consecutive offset slices,
 *      and the whole flattened sequence is covered exactly once;
 *   4. per-window gather cost is bounded by ROWS_PER_WINDOW, independent of total
 *      forest size and total block size;
 *   5. BOTH source kinds — a `view` and a shared `container` — ride an ordered
 *      index/PK walk with no sort step (no TEMP B-TREE, no AUTOMATIC index).
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { createMatrix, insertDataRow } from '../core/matrix'
import { createTreePosition } from '../core/tree'
import { getGlobalKey } from '../core/scroll-index'
import { withTransaction } from '../core/transaction'
import { createPerfDb, type PerfHarness } from '../perf/index'
import { assertQueryPlan } from '../perf/query-plan'

import {
  computeSegments,
  containerBlock,
  containerBlockSliceSql,
  gatherWindow,
  materializedSliceSql,
  sliceWindow,
  viewBlock,
  viewBlockCountSql,
  viewBlockSliceSql,
  type Block,
  type Segment,
} from './window-flatten'

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

/** A container matrix of `count` rows, plus a `container` block over its extent. */
const makeContainerBlock = (
  db: Database,
  markerKey: Uint8Array,
  count: number,
): { block: Block; matrixId: number } => {
  const matrixId = createMatrix(db, 'Tasks', [{ name: 'label', type: 'TEXT', role: 'label' }])
  withTransaction(db, () => {
    for (let i = 0; i < count; i++) insertDataRow(db, matrixId, { label: `Task ${i}` })
  })
  return { block: containerBlock(markerKey, matrixId, count), matrixId }
}

describe('Phase 9.7 Stage B — count + slice window flattening (production)', () => {
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
    // 150 ordinary rows, then the block marker (a real scroll_index participant),
    // then 80 more ordinary rows.
    appendFlatRows(h.db, wsId, 150)
    const markerRowId = insertDataRow(h.db, wsId, { label: 'Tasks (500)' })
    createTreePosition(h.db, wsId, markerRowId)
    const markerKey = getGlobalKey(h.db, wsId, markerRowId)!
    appendFlatRows(h.db, wsId, 80)

    const { block } = makeContainerBlock(h.db, markerKey, 500)

    h.analyze()

    const segments = computeSegments(h.db, [block], null, null)
    // gap(150) + block(500) + gap(80) = 730 total virtual rows. The marker row
    // itself sits inside the tail gap's count — the block stands in for content,
    // not the marker; here we assert the flatten math against the block set.
    const totalVirtual = segments.reduce((sum, s) => sum + s.virtualSize, 0)
    expect(segments.map((s) => s.kind)).toEqual(['materialized', 'block', 'materialized'])
    expect(segments[1]!.virtualSize).toBe(500)

    // Window straddling the gap/block boundary: two sources, not more.
    const boundary = segments[1]!.virtualStart
    const straddleWindow = Math.floor(boundary / ROWS_PER_WINDOW)
    const straddle = sliceWindow(segments, straddleWindow, ROWS_PER_WINDOW)
    expect(straddle.map((r) => r.kind)).toEqual(['materialized', 'block'])
    expect(straddle.reduce((s, r) => s + r.limit, 0)).toBe(ROWS_PER_WINDOW)

    // A window entirely inside the block: one source.
    const insideWindow = straddleWindow + 1
    const insideBlock = sliceWindow(segments, insideWindow, ROWS_PER_WINDOW)
    expect(insideBlock.length).toBe(1)
    expect(insideBlock[0]!.kind).toBe('block')
    expect(insideBlock[0]!.limit).toBe(ROWS_PER_WINDOW)

    // Exact coverage: gathering every window yields exactly the virtual total,
    // no gap, no double-count.
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

    // A `view` block of exactly one row.
    const targetMatrixId = createMatrix(h.db, 'Target', [
      { name: 'label', type: 'TEXT', role: 'label' },
    ])
    const targetRowId = insertDataRow(h.db, targetMatrixId, { label: 'The one task' })
    const sql = `SELECT id, label FROM "mx_${targetMatrixId}_data" WHERE id = ${targetRowId} ORDER BY id`
    const block = viewBlock(markerKey, sql, 1)

    const segments = computeSegments(h.db, [block], null, null)
    // gap before marker (5) + block (1) + gap after marker (20). The marker row
    // at markerKey is excluded from both gaps — the block stands in for it.
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

  test('per-window gather requests exactly ROWS_PER_WINDOW rows at any segment scale', () => {
    const assertBoundedGather = (materializedSize: number, blockSize: number): void => {
      const markerKey = new Uint8Array([1])
      const materializedCalls: { offset: number; limit: number }[] = []
      const blockCalls: { offset: number; limit: number }[] = []
      const rows = (limit: number): Record<string, unknown>[] =>
        Array.from({ length: limit }, () => ({}))
      const block: Block = {
        key: markerKey,
        count: blockSize,
        slice: (_db, offset, limit) => {
          blockCalls.push({ offset, limit })
          return rows(limit)
        },
      }
      const segments: Segment[] = [
        {
          kind: 'materialized',
          virtualStart: 0,
          virtualSize: materializedSize,
          rangeStart: null,
          rangeEnd: markerKey,
        },
        {
          kind: 'block',
          virtualStart: materializedSize,
          virtualSize: blockSize,
          block,
        },
      ]
      const gatherMaterialized = (
        _db: Database,
        request: Extract<ReturnType<typeof sliceWindow>[number], { kind: 'materialized' }>,
      ): Record<string, unknown>[] => {
        materializedCalls.push({ offset: request.offset, limit: request.limit })
        return rows(request.limit)
      }

      const windowIndex = Math.floor(materializedSize / ROWS_PER_WINDOW)
      const requests = sliceWindow(segments, windowIndex, ROWS_PER_WINDOW)

      expect(requests.map((request) => request.kind)).toEqual(['materialized', 'block'])
      expect(requests.reduce((sum, request) => sum + request.limit, 0)).toBe(ROWS_PER_WINDOW)
      expect(gatherWindow(h.rawDb, requests, gatherMaterialized)).toHaveLength(ROWS_PER_WINDOW)
      expect(materializedCalls).toEqual([
        {
          offset: windowIndex * ROWS_PER_WINDOW,
          limit: materializedSize % ROWS_PER_WINDOW,
        },
      ])
      expect(blockCalls).toEqual([
        { offset: 0, limit: ROWS_PER_WINDOW - (materializedSize % ROWS_PER_WINDOW) },
      ])
    }

    assertBoundedGather(1_037, 500)
    assertBoundedGather(10_000_037, 5_000_000)
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

    const { matrixId } = makeContainerBlock(h.db, markerKey, 500)

    h.analyze()

    // Materialized-segment slice: a single keyset range on the scroll_index PK.
    assertQueryPlan(
      h.rawDb,
      materializedSliceSql(),
      [new Uint8Array(0), new Uint8Array([0xff]), ROWS_PER_WINDOW, 0],
      { noAutoIndex: true, noTempBTree: true },
    )

    // Container-block slice: a rowid-ordered walk of the block's own matrix.
    assertQueryPlan(h.rawDb, containerBlockSliceSql(matrixId), [ROWS_PER_WINDOW, 100], {
      noAutoIndex: true,
      noTempBTree: true,
    })

    // View-block slice: an ordered walk of the underlying table, wrapped in
    // LIMIT/OFFSET. The inner ORDER BY id rides the rowid PK, no synthesized sort.
    const viewSql = `SELECT id, label FROM "mx_${matrixId}_data" ORDER BY id`
    assertQueryPlan(h.rawDb, viewBlockSliceSql(viewSql), [ROWS_PER_WINDOW, 100], {
      noAutoIndex: true,
      noTempBTree: true,
    })
  })

  test('view paging keeps a stored semantic limit and strips harmless trailing syntax', () => {
    const matrixId = createMatrix(h.db, 'Limited', [
      { name: 'label', type: 'TEXT', role: 'label' },
    ])
    withTransaction(h.db, () => {
      for (let i = 0; i < 8; i++) insertDataRow(h.db, matrixId, { label: `Row ${i}` })
    })

    const limited = `SELECT id, label FROM "mx_${matrixId}_data" ORDER BY id LIMIT 5; -- saved`
    expect(viewBlockCountSql(limited)).toBe(
      `SELECT COUNT(*) AS n FROM (SELECT id, label FROM "mx_${matrixId}_data" ORDER BY id LIMIT 5)`,
    )
    expect(viewBlockSliceSql(limited)).toBe(
      `SELECT * FROM (SELECT id, label FROM "mx_${matrixId}_data" ORDER BY id LIMIT 5) LIMIT ? OFFSET ?`,
    )

    const block = viewBlock(new Uint8Array([1]), limited, 5)
    const orderedIds = (
      h.rawDb.selectObjects(
        `SELECT id FROM "mx_${matrixId}_data" ORDER BY id LIMIT 5`,
      ) as unknown as {
        id: number
      }[]
    ).map((row) => row.id)
    expect(block.slice(h.rawDb, 0, 3).map((row) => row.id)).toEqual(orderedIds.slice(0, 3))
    expect(block.slice(h.rawDb, 3, 3).map((row) => row.id)).toEqual(orderedIds.slice(3))
  })

  test('view paging rejects mutation and multiple-statement SQL', () => {
    expect(() => viewBlockSliceSql('DELETE FROM matrix')).toThrow(/read-only SELECT/)
    expect(() => viewBlockSliceSql('SELECT 1; SELECT 2')).toThrow(/read-only SELECT/)
  })
})
