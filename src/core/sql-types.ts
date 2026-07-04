import type { SqlValue } from '@sqlite.org/sqlite-wasm'

export type Sql = string

export type SqlResult = {
  [column: string]: SqlValue
}[]

export type SqlObserver = (result: SqlResult | null, error: Error | null) => void

// -- Gather subscription (Phase 9.7 Stage C2) --------------------------------
//
// The count+slice inline block-folding path. Unlike an ordinary subscription
// (one prepared statement), a gather flattens `scroll_index` with each in-range
// block marker expanded inline to its rows (src/workspace/window-flatten.ts) —
// several queries concatenated by segment offset math — so it needs its own
// subscription kind. The worker re-runs it on any write to the union of tables
// it visits (scroll_index + block_sources + each block's source tables), via
// the same update-hook invalidation (no new machinery). Keyed by the serialized
// spec.

/** One in-range block marker feeding the gather (a `view` or shared `container`). */
export type GatherBlockSpec = {
  /** The marker's `global_lexkey` position, hex-encoded. */
  keyHex: string
  kind: 'view' | 'container'
  /** The matrix a folded row's identity resolves to (`view`: recognized base
   *  matrix; `container`: the source matrix). Folded rows are `(sourceMatrixId,
   *  id)`. */
  sourceMatrixId: number
  /** The marker's depth (folded rows render at the marker's outline depth). */
  markerDepth: number
  /** The persisted SQL for a `view` block. */
  sql?: string
}

export type GatherSpec = {
  focusRootHex: string | null
  collapsedKeyHexes: string[]
  afterKeyHex: string | null
  /** Inclusive window-page range to gather (each page = ROWS_PER_WINDOW rows). */
  minPage: number
  maxPage: number
  rowsPerWindow: number
  blocks: GatherBlockSpec[]
}

/** Stable serialization used as the gather's subscription key on both sides. */
export const gatherKey = (spec: GatherSpec): string => JSON.stringify(spec)

/** A gathered row carries the outline-row metadata plus (for folded block rows)
 *  its inline data — richer than a plain SqlResult row, so it's untyped here. */
export type GatherRow = Record<string, unknown>

export type GatherResult = { rows: GatherRow[]; totalVirtual: number }

export type GatherObserver = (result: GatherResult | null, error: Error | null) => void

// SQL Client Messages (from client to worker)
export type SubscribeMessage = {
  type: 'subscribe'
  sql: string
}

export type UnsubscribeMessage = {
  type: 'unsubscribe'
  sql: string
}

export type ExecuteMessage = {
  type: 'execute'
  id: string
  sql: string
}

export type SubscribeGatherMessage = {
  type: 'subscribeGather'
  key: string
  spec: GatherSpec
}

export type UnsubscribeGatherMessage = {
  type: 'unsubscribeGather'
  key: string
}

export type SqlClientMessage =
  | SubscribeMessage
  | UnsubscribeMessage
  | ExecuteMessage
  | SubscribeGatherMessage
  | UnsubscribeGatherMessage

// SQL Worker Messages (from worker to client)
export type SubscribeResultMessage = {
  type: 'subscribeResult'
  sql: string
  result: SqlResult
}

export type SubscribeErrorMessage = {
  type: 'subscribeError'
  sql: string
  error: Error
}

export type ExecuteResultMessage = {
  type: 'executeResult'
  id: string
  result: SqlResult
}

export type ExecuteErrorMessage = {
  type: 'executeError'
  id: string
  error: Error
}

export type GatherResultMessage = {
  type: 'gatherResult'
  key: string
  result: GatherResult
}

export type GatherErrorMessage = {
  type: 'gatherError'
  key: string
  error: Error
}

export type SqlWorkerMessage =
  | SubscribeResultMessage
  | SubscribeErrorMessage
  | ExecuteResultMessage
  | ExecuteErrorMessage
  | GatherResultMessage
  | GatherErrorMessage
