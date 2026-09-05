// Phase 9.7 — Stage B: count + slice window flattening (production).
//
// The "all N rows inline" flattener the Phase 9.7 convergence needs, promoted
// from the validated spike (src/perf/windowing-spike.ts) onto the real schema
// and wired for production use. See context/Phase-9.7.md §6 and Phase-9.7b.md §1
// for the settled model; the spike's Stage-P0 guards are ported onto this module
// in window-flatten.test.ts.
//
// The model:
//   - Own-positioned content (loose children, dedicated containers, deep
//     portals — Phase 9.7a) is materialized in `scroll_index`: ordinary rows.
//   - Gather-positioned content (a `view` result, or a shared container's
//     extent) is NOT materialized. A single `scroll_index` row — the block's
//     marker — stands for the whole block, carrying a cached COUNT and an
//     ordered slice source.
//   - The flattened displayed sequence = `scroll_index` with each block marker
//     replaced by its COUNT virtual rows. Windowing by ROWS_PER_WINDOW happens
//     over *that* flattened sequence: a block contributes its COUNT to window
//     budgets (a 1-row block never gets a lonely window), and a block spanning
//     multiple windows is rendered as a LIMIT/OFFSET slice into its own order.
//   - A window straddling a block boundary gathers from BOTH sources — a
//     `scroll_index` keyset range (bounded to the marker-delimited gap) plus a
//     block slice — never more sources than boundaries crossed.
//
// Render-only flattening: no `own`-edges are minted (the firewall). Nested
// blocks (a block's slice source itself containing a marker) are out of scope
// for v1 — `Block.slice` returns plain rows (context/Phase-9.7b.md §5).

import type { Database } from '@sqlite.org/sqlite-wasm'

import { isReadOnlySelect, parseSingleStatement, topLevelLimitNode } from '../sql/sql-statement'

// -- Block descriptor -----------------------------------------------------------

/**
 * A block marker: one real `scroll_index` row (`key`) whose displayed content is
 * NOT that row itself but `count` rows drawn from `slice`, in the block's own
 * order (a container's matrix-rank order, or a view's `ORDER BY`).
 *
 * `count` is a cached value — a live COUNT query in the wired path, invalidated
 * by the same tables-visited reactive mechanism `useQuery`/`addObserver` already
 * uses for `usePagedWorkspaceData`'s `totalRows` (no new invalidation machinery;
 * see context/Phase-9.7b.md §1).
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
  /** Exclusive `scroll_index` key range this segment's ordinary rows span. */
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

/**
 * Count the materialized (ordinary) rows in the open interval (start, end).
 * Injectable so the production wiring can supply the *filtered* outline count
 * (focus scope, collapse, block-marker exclusion — see
 * src/workspace/gather-handler.ts) while the spike/tests use the bare
 * `scroll_index` range count below.
 */
export type CountGap = (
  db: Database,
  start: Uint8Array | null,
  end: Uint8Array | null,
) => number

/**
 * Execute a materialized-segment slice request. Injectable for the same reason
 * as `CountGap`: production supplies the full outline-row projection + filters,
 * the spike/tests use the bare `scroll_index` slice below.
 */
export type GatherMaterialized = (
  db: Database,
  req: Extract<SliceRequest, { kind: 'materialized' }>,
) => Record<string, unknown>[]

/** Count ordinary `scroll_index` rows in the open interval (start, end). */
const defaultCountGap: CountGap = (db, start, end): number => {
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
 * Build the segment list for the flattened sequence over `(rangeStart,
 * rangeEnd)` (exclusive bounds; null = open). `blocks` must fall within the
 * range. Each gap between consecutive block markers (and before the first /
 * after the last) becomes a `materialized` segment sized by an index-backed
 * `COUNT`; each marker becomes a `block` segment sized by its cached count.
 * O(blocks-in-range) queries, not O(forest) — the count query is a single range
 * on the `scroll_index` PK.
 */
export const computeSegments = (
  db: Database,
  blocks: Block[],
  rangeStart: Uint8Array | null,
  rangeEnd: Uint8Array | null,
  countGap: CountGap = defaultCountGap,
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
 * produces one request; a window straddling a block boundary produces exactly
 * one request per side crossed — never more than segments-crossed, regardless of
 * forest or block size.
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

/** The columns a materialized-segment slice projects (mirrors the outline scan). */
export const MATERIALIZED_SLICE_COLUMNS =
  'global_lexkey, matrix_id, row_id, depth, is_ghost, lazy'

const defaultGatherMaterialized: GatherMaterialized = (db, req): Record<string, unknown>[] => {
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
    `SELECT ${MATERIALIZED_SLICE_COLUMNS} FROM scroll_index ${where}
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
  gatherMaterialized: GatherMaterialized = defaultGatherMaterialized,
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
  `SELECT ${MATERIALIZED_SLICE_COLUMNS} FROM scroll_index
   WHERE global_lexkey > ? AND global_lexkey < ?
   ORDER BY global_lexkey LIMIT ? OFFSET ?`

// -- Block builders: the two production source kinds ---------------------------
//
// A block marker is either a `view` (a persisted SQL result — its SQL lives in
// `block_sources`, see src/core/block-marker.ts) or a shared `container` (a
// matrix's extent, derived — `matrix.owner` + membership, persists nothing new).
// Both expose the same COUNT + ordered-slice shape.

const parsedViewSql = (sql: string) => {
  const parsed = parseSingleStatement(sql)
  if (!parsed.ok || !isReadOnlySelect(parsed.statement.root)) {
    throw new Error('A saved view must contain one read-only SELECT statement')
  }
  return parsed.statement
}

/** The COUNT query for a `view` block (wrap the persisted SQL). */
export const viewBlockCountSql = (sql: string): string => {
  const statement = parsedViewSql(sql)
  return `SELECT COUNT(*) AS n FROM (${statement.sql})`
}

/**
 * Legacy no-limit views append the paging clause so SQLite cannot flatten away
 * their order. A view with its own semantic LIMIT is wrapped: the inner limit
 * prevents flattening and caps the outer page slices without producing a second
 * top-level LIMIT.
 */
export const viewBlockSliceSql = (sql: string): string => {
  const statement = parsedViewSql(sql)
  if (topLevelLimitNode(statement.root)) {
    return `SELECT * FROM (${statement.sql}) LIMIT ? OFFSET ?`
  }
  return `${statement.sql} LIMIT ? OFFSET ?`
}

/**
 * A `view` block: its rows are the persisted SQL's result set, in the SQL's own
 * `ORDER BY`. `count` is the cached COUNT (live-subscribed in the wired path).
 */
export const viewBlock = (key: Uint8Array, sql: string, count: number): Block => ({
  key,
  count,
  slice: (db, offset, limit) =>
    db.selectObjects(viewBlockSliceSql(sql), [limit, offset]) as unknown as Record<
      string,
      unknown
    >[],
})

/** The COUNT query for a shared `container` block (its matrix's extent). */
export const containerBlockCountSql = (sourceMatrixId: number): string =>
  `SELECT COUNT(*) AS n FROM "mx_${sourceMatrixId}_data"`

/** The slice query for a shared `container` block (matrix-rank / rowid order). */
export const containerBlockSliceSql = (sourceMatrixId: number): string =>
  `SELECT * FROM "mx_${sourceMatrixId}_data" ORDER BY id LIMIT ? OFFSET ?`

/**
 * A shared `container` block: its rows are the source matrix's extent, in
 * rowid (matrix-rank) order. v1 orders by `id` — the rowid-ordered walk is the
 * no-sort path (the EQP guard); trait-rank ordering is a Phase 10 refinement.
 */
export const containerBlock = (
  key: Uint8Array,
  sourceMatrixId: number,
  count: number,
): Block => ({
  key,
  count,
  slice: (db, offset, limit) =>
    db.selectObjects(containerBlockSliceSql(sourceMatrixId), [
      limit,
      offset,
    ]) as unknown as Record<string, unknown>[],
})
