// Phase 9.7 Stage C2 — the worker↔client gather RPC (inline block folding).
//
// The last piece of the Phase 9.7 build: folding a `view`/`container` block's
// *content* inline into the loose outline at its marker's position. The client
// discovers the in-range block markers (block_sources ⋈ scroll_index within the
// focus scope) and subscribes a **gather** — the count+slice flattener
// (src/workspace/gather-flatten.ts → window-flatten.ts) run worker-side against
// the live Database.
//
// Why a new subscription kind (not an ordinary prepared-SQL subscription): the
// flattened sequence is `scroll_index` with each block marker expanded inline to
// its rows — several queries (the materialized outline slices + each block's own
// slice) concatenated by segment offset math, not one statement. It re-runs on
// any write to the union of tables it visits (scroll_index + block_sources +
// each block's source tables), via the same update-hook flush the SQL
// subscriptions use — no new invalidation machinery (context/Phase-9.7b.md §1).
//
// Render-only flattening: no `own`-edges are minted (the firewall). Folded rows
// carry their identity `(sourceMatrixId, id)` + inline data so the client renders
// them through the same substrate cell renderer as a meshed cross-matrix loose
// row — the container→PropertyRow collapse at substrate.

import type { Database } from '@sqlite.org/sqlite-wasm'

import type {
  GatherSpec,
  SqlWorkerMessage,
  SubscribeGatherMessage,
  UnsubscribeGatherMessage,
} from '../sql-types'
import { buildPaginatedOutlineQuery } from '../../workspace/outline-queries'
import { computeGather } from '../../workspace/gather-flatten'

import { tablesVisitedBySql } from './invalidation'
import { registerGatherRunner, unregisterGatherRunner } from './sql-handler'
import { sqliteWasm } from './worker-db'

const postMessage = (message: SqlWorkerMessage) => {
  self.postMessage(message)
}

const runGather = (db: Database, spec: GatherSpec, key: string): void => {
  try {
    postMessage({ type: 'gatherResult', key, result: computeGather(db, spec) })
  } catch (err: unknown) {
    postMessage({
      type: 'gatherError',
      key,
      error: err instanceof Error ? err : new Error(String(err)),
    })
  }
}

/** The union of tables a gather visits — its invalidation footprint. */
const gatherTables = (spec: GatherSpec): Set<string> => {
  const tables = new Set<string>(['scroll_index', 'block_sources', 'joins', 'matrix'])
  // The materialized outline query's tables (scroll_index, joins, block_sources,
  // promoted_nodes, matrix).
  for (const t of tablesVisitedBySql(buildPaginatedOutlineQuery())) tables.add(t)
  for (const b of spec.blocks) {
    tables.add(`mx_${b.sourceMatrixId}_data`)
    if (b.kind === 'view' && b.sql) {
      for (const t of tablesVisitedBySql(b.sql)) tables.add(t)
    }
  }
  return tables
}

const subscribeGather = async (msg: SubscribeGatherMessage) => {
  const { key, spec } = msg
  const { db } = await sqliteWasm
  registerGatherRunner(key, gatherTables(spec), () => runGather(db, spec, key))
  runGather(db, spec, key)
}

const unsubscribeGather = (msg: UnsubscribeGatherMessage) => {
  unregisterGatherRunner(msg.key)
}

export const handleGatherMessage = async (
  message: SubscribeGatherMessage | UnsubscribeGatherMessage,
) => {
  if (message.type === 'subscribeGather') {
    await subscribeGather(message)
  } else {
    unsubscribeGather(message)
  }
}
