// Phase 9.7b — windowing / count+slice spike (prototype).
//
// Prototype of the "all N rows inline" flattener the Phase 9.7 convergence needs:
// `scroll_index` (materialized: loose children, dedicated containers, deep-portal
// subtrees — see Phase 9.7a) interleaved with **block markers** — single
// scroll_index rows standing in for a `view` result or a shared container's
// extent — that expand *inline* to their cached row COUNT at render time. No
// nested virtualizer, no drill-down: the block's rows are just more rows in the
// same window, windowed by `ROWS_PER_WINDOW` over the *flattened* sequence.
//
// This module is a spike: it stands up production's real own-forest/scroll_index
// (via `createPerfDb` + `createTreePosition`) for the materialized mesh, and adds
// a lightweight, in-memory `Block` descriptor (NOT a schema change — see
// context/Phase-9.7b.md for why persistence is deferred to the 9.7 build proper)
// to prototype the flattening math and the per-window multi-source gather. It is
// NOT wired into the production renderer — that is the 9.7 build.
//
// The model (see context/Phase-9.7.md §6 and Phase-9.7-visuals.html diagram 4):
//   - Own-positioned content (loose, dedicated containers, deep portals) is
//     materialized in scroll_index — ordinary rows, no different from today.
//   - Gather-positioned content (views, shared container extents) is NOT
//     materialized. A single scroll_index row (the block's marker — e.g. the
//     view's block-marker row, or the shared container's type-node row) stands
//     for the whole block. It carries a cached COUNT and an ordered slice source.
//   - The flattened displayed sequence = scroll_index with each block marker
//     replaced by its COUNT virtual rows. Windowing by ROWS_PER_WINDOW happens
//     over *that* sequence: a block contributes its COUNT to window budgets (a
//     1-row block doesn't get a lonely window), and a block spanning multiple
//     windows is rendered as a LIMIT/OFFSET slice into its own order per window.
//   - A window whose virtual range straddles a block boundary gathers from BOTH
//     sources: a scroll_index keyset range (bounded to the marker-delimited gap)
//     plus a block slice. Never more sources than boundaries crossed.
//   - Nested blocks (a block's own slice source containing another block marker)
//     are out of scope for v1 — `Block.slice` returns plain rows, not further
//     flattened. See context/Phase-9.7b.md for the deferral rationale.

import type { Database } from '@sqlite.org/sqlite-wasm'

// -- Block descriptor -----------------------------------------------------------

/**
 * A block marker: one real scroll_index row (`key`) whose displayed content is
 * NOT that row itself but `count` rows drawn from `slice`, in the block's own
 * order (a container's matrix-rank order, or a view's `ORDER BY`).
 *
 * `count` is a cached value (a live COUNT query in the real build, invalidated
 * by the same tables-visited reactive mechanism `useQuery`/`addObserver` already
 * uses for `usePagedWorkspaceData`'s `totalRows` — no new invalidation machinery
 * needed; see context/Phase-9.7b.md).
 */
export type Block = {
  key: Uint8Array
  count: number
  slice: (db: Database, offset: number, limit: number) => Record<string, unknown>[]
}

// -- Segments: the flattened sequence, chunked at block boundaries -------------

export type MaterializedSegment = {
  kind: 'materialized'
  virtualStart: number
  virtualSize: number
  /** Exclusive scroll_index key range this segment's ordinary rows span. */
  rangeStart: Uint8Array | null
  rangeEnd: Uint8Array | null
}

export type BlockSegment = {
  kind: 'block'
  virtualStart: number
  virtualSize: number
  block: Block
}

export type Segment = MaterializedSegment | BlockSegment

const compareBytes = (a: Uint8Array, b: Uint8Array): number => {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i]! !== b[i]!) return a[i]! - b[i]!
  }
  return a.length - b.length
}

/** Count ordinary scroll_index rows in the open interval (start, end). */
const countGap = (db: Database, start: Uint8Array | null, end: Uint8Array | null): number => {
  const clauses: string[] = []
  const params: Uint8Array[] = []
  if (start) {
    clauses.push('global_lexkey > ?')
    params.push(start)
  }
  if (end) {
    clauses.push('global_lexkey < ?')
    params.push(end)
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const stmt = db.prepare(`SELECT COUNT(*) AS n FROM scroll_index ${where}`)
  stmt.bind(params)
  stmt.step()
  const n = (stmt.get({}) as { n: number }).n
  stmt.finalize()
  return n
}

/**
 * Build the segment list for the flattened sequence over
 * `(rangeStart, rangeEnd)` (exclusive bounds; null = open). `blocks` must be
 * sorted ascending by `key` and fall within the range. Each gap between
 * consecutive block markers (and before the first / after the last) becomes a
 * `materialized` segment sized by an index-backed `COUNT`; each marker becomes a
 * `block` segment sized by its cached count. O(blocks-in-range) queries, not
 * O(forest) — the count query is a single range on the scroll_index PK.
 */
export const computeSegments = (
  db: Database,
  blocks: Block[],
  rangeStart: Uint8Array | null,
  rangeEnd: Uint8Array | null,
): Segment[] => {
  const inRange = blocks
    .filter(
      (b) =>
        (!rangeStart || compareBytes(b.key, rangeStart) > 0) &&
        (!rangeEnd || compareBytes(b.key, rangeEnd) < 0),
    )
    .sort((a, b) => compareBytes(a.key, b.key))

  const segments: Segment[] = []
  let virtualCursor = 0
  let prevKey = rangeStart

  const pushGap = (end: Uint8Array | null) => {
    const size = countGap(db, prevKey, end)
    if (size > 0) {
      segments.push({
        kind: 'materialized',
        virtualStart: virtualCursor,
        virtualSize: size,
        rangeStart: prevKey,
        rangeEnd: end,
      })
      virtualCursor += size
    }
  }

  for (const block of inRange) {
    pushGap(block.key)
    segments.push({
      kind: 'block',
      virtualStart: virtualCursor,
      virtualSize: block.count,
      block,
    })
    virtualCursor += block.count
    prevKey = block.key
  }
  pushGap(rangeEnd)

  return segments
}

// -- Windowing: slice the flattened sequence by ROWS_PER_WINDOW ----------------

export type SliceRequest =
  | {
      kind: 'materialized'
      rangeStart: Uint8Array | null
      rangeEnd: Uint8Array | null
      offset: number
      limit: number
    }
  | { kind: 'block'; block: Block; offset: number; limit: number }

/**
 * The per-window gather plan: which segment(s) `windowIndex` overlaps, and the
 * local offset/limit slice of each. A window entirely inside one segment
 * produces one request; a window straddling a block boundary produces one
 * request per side (never more than segments-crossed + 1, regardless of forest
 * or block size — the write-amplification-style bound for reads).
 */
export const sliceWindow = (
  segments: Segment[],
  windowIndex: number,
  rowsPerWindow: number,
): SliceRequest[] => {
  const start = windowIndex * rowsPerWindow
  const end = start + rowsPerWindow
  const requests: SliceRequest[] = []

  for (const seg of segments) {
    const segEnd = seg.virtualStart + seg.virtualSize
    if (segEnd <= start || seg.virtualStart >= end) continue // no overlap

    const overlapStart = Math.max(start, seg.virtualStart)
    const overlapEnd = Math.min(end, segEnd)
    const localOffset = overlapStart - seg.virtualStart
    const localLimit = overlapEnd - overlapStart

    if (seg.kind === 'materialized') {
      requests.push({
        kind: 'materialized',
        rangeStart: seg.rangeStart,
        rangeEnd: seg.rangeEnd,
        offset: localOffset,
        limit: localLimit,
      })
    } else {
      requests.push({ kind: 'block', block: seg.block, offset: localOffset, limit: localLimit })
    }
  }

  return requests
}

// -- Gather: execute the per-window slice requests ------------------------------

const gatherMaterialized = (
  db: Database,
  req: Extract<SliceRequest, { kind: 'materialized' }>,
): Record<string, unknown>[] => {
  const clauses: string[] = []
  const params: (Uint8Array | number)[] = []
  if (req.rangeStart) {
    clauses.push('global_lexkey > ?')
    params.push(req.rangeStart)
  }
  if (req.rangeEnd) {
    clauses.push('global_lexkey < ?')
    params.push(req.rangeEnd)
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  params.push(req.limit, req.offset)
  return db.selectObjects(
    `SELECT global_lexkey, matrix_id, row_id, depth FROM scroll_index ${where}
     ORDER BY global_lexkey LIMIT ? OFFSET ?`,
    params,
  ) as unknown as Record<string, unknown>[]
}

/**
 * Execute a window's gather plan and return the rows in flattened-sequence
 * order. Each request is a single index-backed range scan (materialized) or the
 * block's own slice query — never a scan proportional to total forest or total
 * block size, only to the window's own `rowsPerWindow` budget.
 */
export const gatherWindow = (
  db: Database,
  requests: SliceRequest[],
): Record<string, unknown>[] => {
  const out: Record<string, unknown>[] = []
  for (const req of requests) {
    if (req.kind === 'materialized') {
      out.push(...gatherMaterialized(db, req))
    } else {
      out.push(...req.block.slice(db, req.offset, req.limit))
    }
  }
  return out
}

// -- Read shape: the two hot queries a window can issue -------------------------

/** The materialized-segment slice SQL shape (for EQP assertions). */
export const materializedSliceSql = (): string =>
  `SELECT global_lexkey, matrix_id, row_id, depth FROM scroll_index
   WHERE global_lexkey > ? AND global_lexkey < ?
   ORDER BY global_lexkey LIMIT ? OFFSET ?`
