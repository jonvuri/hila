// Phase 9.7 Stage C2 — the count+slice gather, wired for production filters.
//
// The pure core of the inline block-folding gather (the worker↔client RPC lives
// in src/core/worker/gather-handler.ts, which is worker-only; this module has no
// worker deps so it is directly unit-testable). Given a live Database and a
// GatherSpec — the outline scan params + the in-range block set — it runs the
// count+slice flattener (window-flatten.ts) with the *filtered* outline query as
// the materialized source, and returns the requested window range's rows plus
// the flattened total.
//
// Render-only flattening: no `own`-edges are minted (the firewall). Folded rows
// carry `(sourceMatrixId, id)` identity + inline data so the client renders them
// through the substrate cell renderer (the container→PropertyRow collapse).

import type { Database } from '@sqlite.org/sqlite-wasm'

import type { GatherBlockSpec, GatherResult, GatherRow, GatherSpec } from '../core/sql-types'

import { buildOutlineCountQuery, buildPaginatedOutlineQuery } from './outline-queries'
import {
  computeSegments,
  containerBlockCountSql,
  containerBlockSliceSql,
  gatherWindow,
  sliceWindow,
  viewBlockCountSql,
  viewBlockSliceSql,
  type Block,
  type CountGap,
  type GatherMaterialized,
} from './window-flatten'

export const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

export const hexToBytes = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/** A folded row's synthetic position key: the marker key, then the row's global
 *  offset — unique per appearance, sorted within the marker's (freed) slot. */
export const foldedKey = (markerKey: Uint8Array, globalOffset: number): Uint8Array => {
  const suffix = new Uint8Array([
    0x00,
    (globalOffset >>> 24) & 0xff,
    (globalOffset >>> 16) & 0xff,
    (globalOffset >>> 8) & 0xff,
    globalOffset & 0xff,
  ])
  const out = new Uint8Array(markerKey.length + suffix.length)
  out.set(markerKey, 0)
  out.set(suffix, markerKey.length)
  return out
}

const selectOne = (db: Database, sql: string): Record<string, unknown> | undefined =>
  (db.selectObjects(sql) as unknown as GatherRow[])[0]

const matrixTitle = (db: Database, matrixId: number): string | null => {
  const row = selectOne(db, `SELECT title FROM matrix WHERE id = ${matrixId}`)
  return (row?.title as string | null) ?? null
}

/**
 * Build a `Block` for the flattener from a client spec. `count` and the slice
 * are recomputed live (so they ride tables-visited invalidation). Folded rows
 * are enriched with outline-row shape (`is_block_row = 1`) + inline data.
 */
export const buildBlock = (db: Database, spec: GatherBlockSpec): Block => {
  const markerKey = hexToBytes(spec.keyHex)
  const title = matrixTitle(db, spec.sourceMatrixId)
  const countSql =
    spec.kind === 'view' ?
      viewBlockCountSql(spec.sql!)
    : containerBlockCountSql(spec.sourceMatrixId)
  const count = Number((selectOne(db, countSql)?.n as number | undefined) ?? 0)

  return {
    key: markerKey,
    count,
    slice: (sliceDb, offset, limit) => {
      const sliceSql =
        spec.kind === 'view' ?
          viewBlockSliceSql(spec.sql!)
        : containerBlockSliceSql(spec.sourceMatrixId)
      const raw = sliceDb.selectObjects(sliceSql, [limit, offset]) as unknown as GatherRow[]
      return raw.map((r, i) => {
        const globalOffset = offset + i
        const id = Number(r.id)
        return {
          key: foldedKey(markerKey, globalOffset),
          matrix_id: spec.sourceMatrixId,
          row_id: Number.isFinite(id) ? id : globalOffset,
          depth: spec.markerDepth,
          is_ghost: 0,
          matrix_title: title,
          has_children: 0,
          is_type_node: 0,
          is_block_row: 1,
          block_data: r,
        }
      })
    },
  }
}

/** Run the flattener for `spec`'s window range against `db`. */
export const computeGather = (db: Database, spec: GatherSpec): GatherResult => {
  const blocks = spec.blocks.map((b) => buildBlock(db, b))

  // Materialized segments use the *filtered* outline query (focus scope,
  // collapse, block-marker exclusion) bounded to each marker-delimited gap — so
  // a no-block gather degenerates to today's single outline slice.
  const afterHexFor = (start: Uint8Array | null): string | null =>
    start ? bytesToHex(start) : spec.afterKeyHex
  const beforeHexFor = (end: Uint8Array | null): string | null => (end ? bytesToHex(end) : null)

  const countGap: CountGap = (gapDb, start, end) => {
    const sql = buildOutlineCountQuery({
      focusRootHex: spec.focusRootHex,
      collapsedKeyHexes: spec.collapsedKeyHexes,
      afterKeyHex: afterHexFor(start),
      beforeKeyHex: beforeHexFor(end),
    })
    return Number((selectOne(gapDb, sql)?.row_count as number | undefined) ?? 0)
  }

  const gatherMaterialized: GatherMaterialized = (matDb, req) => {
    const sql = buildPaginatedOutlineQuery({
      focusRootHex: spec.focusRootHex,
      collapsedKeyHexes: spec.collapsedKeyHexes,
      afterKeyHex: afterHexFor(req.rangeStart),
      beforeKeyHex: beforeHexFor(req.rangeEnd),
      limit: req.limit,
      offset: req.offset,
    })
    return (matDb.selectObjects(sql) as unknown as GatherRow[]).map((r) => ({
      ...r,
      is_block_row: 0,
    }))
  }

  const segments = computeSegments(db, blocks, null, null, countGap)
  const totalVirtual = segments.reduce((sum, s) => sum + s.virtualSize, 0)

  const rows: GatherRow[] = []
  for (let w = spec.minPage; w <= spec.maxPage; w++) {
    const reqs = sliceWindow(segments, w, spec.rowsPerWindow)
    rows.push(...gatherWindow(db, reqs, gatherMaterialized))
  }

  return { rows, totalVirtual }
}
