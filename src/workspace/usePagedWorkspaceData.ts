import { createSignal, createEffect, createMemo, onCleanup, type Accessor } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'

import { addObserver, removeObserver } from '../core/client/sql-client'
import type { SqlObserver } from '../core/sql-types'
import { useQuery } from '../sql/useQuery'
import type { AspectAttachment } from '../shared/property-surface'
import { buildTagsForRowsQuery } from '../tags/tag-queries'

import {
  buildPaginatedOutlineQuery,
  buildOutlineCountQuery,
  buildHydrationQuery,
} from './workspace-plugin'

export const ROWS_PER_WINDOW = 100

/** Cross-matrix row *data* identity. Row ids collide across matrixes (each
 *  `mx_{id}_data` autoincrements from 1), so hydration keys everything by the
 *  `(matrix_id, row_id)` pair. Note: this is NOT unique per rendered row — a
 *  portaled row appears at its home and each portal with the same `(matrix,
 *  row)` — so it is used only for hydration lookup, not as the DOM/store key
 *  (that is `pk`, the position key). */
export const compositeKey = (matrixId: number, rowId: number): string => `${matrixId}:${rowId}`

/** Position key: the hex `global_lexkey`. Phase 9.7 Stage C — ownership is
 *  single but position is plural, so a row can legitimately appear more than
 *  once (home + portals). The renderer keys DOM rows by position, not by
 *  `(matrix_id, row_id)`. */
const positionKey = (key: Uint8Array): string =>
  Array.from(key)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

// One row of the index-only window scan (before hydration).
type WindowRow = {
  /** Render/reconcile key. Move-stable for the common single-appearance case
   *  (`rk === ck`), so the stateful ProseMirror editors survive indent/outdent/
   *  drag without remounting; position-disambiguated (`ck:pk`) only when the
   *  same `(matrix, row)` appears more than once in the loaded range (a portaled
   *  row's home + portals — Phase 9.7 Stage C). See `assignRenderKeys`. */
  rk: string
  /** Position key (hex `global_lexkey`) — unique per appearance, changes on move. */
  pk: string
  ck: string
  matrix_id: number
  row_id: number
  key: Uint8Array
  depth: number
  has_children: number
  is_type_node: number
  is_ghost: number
  matrix_title: string | null
}

/**
 * Assign each row its render key `rk` in place. A `(matrix, row)` that occurs
 * once in the loaded range keeps `rk === ck` (move-stable — the editor persists
 * across reparents); one that occurs more than once (home + portals) gets
 * `rk = ck:pk` for every occurrence, so each appearance is a distinct DOM row.
 */
const assignRenderKeys = (rows: WindowRow[]): void => {
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.ck, (counts.get(r.ck) ?? 0) + 1)
  for (const r of rows) r.rk = counts.get(r.ck)! > 1 ? `${r.ck}:${r.pk}` : r.ck
}

// A fully-hydrated outline row: window metadata merged with the row's data.
export type WorkspaceRowData = WindowRow & {
  label: string | null
  content: string | null
  data: Record<string, unknown> | null
}

export type UsePagedWorkspaceDataOpts = {
  matrixId: number
  focusRootHex: Accessor<string | null>
  collapsedKeyHexes: Accessor<string[]>
}

const INITIAL_NEEDED_WINDOWS = new Set([0, 1, 2, 3])

const toWindowRow = (raw: Record<string, unknown>): WindowRow => {
  const matrix_id = raw.matrix_id as number
  const row_id = raw.row_id as number
  const key = raw.key as Uint8Array
  const ck = compositeKey(matrix_id, row_id)
  return {
    rk: ck, // finalized by assignRenderKeys once the full set is known
    pk: positionKey(key),
    ck,
    matrix_id,
    row_id,
    key,
    depth: raw.depth as number,
    has_children: raw.has_children as number,
    is_type_node: (raw.is_type_node as number) ?? 0,
    is_ghost: (raw.is_ghost as number) ?? 0,
    matrix_title: (raw.matrix_title as string | null) ?? null,
  }
}

export const usePagedWorkspaceData = (opts: UsePagedWorkspaceDataOpts) => {
  const countQuery = createMemo(() =>
    buildOutlineCountQuery({
      focusRootHex: opts.focusRootHex(),
      collapsedKeyHexes: opts.collapsedKeyHexes(),
    }),
  )

  const { result: countResult, error: countError } = useQuery(() => countQuery())

  const totalRows = createMemo(() => {
    const data = countResult()
    if (!data || data.length === 0) return 0
    return (data[0] as { row_count: number }).row_count
  })

  const visibleRowCount = createMemo(() => {
    const count = totalRows()
    return opts.focusRootHex() ? Math.max(0, count - 1) : count
  })

  const totalWindows = createMemo(() => {
    const count = visibleRowCount()
    return count === 0 ? 0 : Math.ceil(count / ROWS_PER_WINDOW)
  })

  // Focus root row (separate query when in focus mode). Only its depth is used
  // (to compute the focus depth offset), so it does not need hydration.
  const focusRootQuery = createMemo(() => {
    const hex = opts.focusRootHex()
    if (!hex) return ''
    return buildPaginatedOutlineQuery({ focusRootHex: hex, limit: 1 })
  })

  const { result: focusRootResult } = useQuery(() => focusRootQuery())

  const focusRootRow = createMemo((): WindowRow | null => {
    const data = focusRootResult()
    if (!data || data.length === 0) return null
    return toWindowRow(data[0] as Record<string, unknown>)
  })

  // -----------------------------------------------------------------------
  // Window layer: the index-only pre-order scan for the loaded page range.
  //
  // Phase 9.7 Stage B — count + slice flattening. The displayed sequence is the
  // flattened `scroll_index` with each block marker (a `view` result or a shared
  // container's extent) expanded inline to its cached COUNT
  // (src/workspace/window-flatten.ts: computeSegments / sliceWindow /
  // gatherWindow, guarded in window-flatten.test.ts). In this stage the loose
  // outline scan *excludes* block markers (EXCLUDE_BLOCK_MARKERS in
  // workspace-plugin.ts) — `view` blocks render in the focus panel, not inline —
  // so the flattened loose sequence is a single **materialized segment** whose
  // slice IS `buildPaginatedOutlineQuery` below (segments = [materialized], no
  // block segments). Folding block content inline (feeding real blocks +
  // per-block COUNT subscriptions to `gatherWindow`, rendered by the unified
  // renderer) is the renderer stage (Stage C) — this is the wiring point.
  // -----------------------------------------------------------------------
  const [neededWindows, setNeededWindows] = createSignal<Set<number>>(INITIAL_NEEDED_WINDOWS)
  const [windowRows, setWindowRows] = createStore<WindowRow[]>([])

  const loadedRange = createMemo((): [number, number] | null => {
    const needed = neededWindows()
    if (needed.size === 0) return null
    const sorted = Array.from(needed).sort((a, b) => a - b)
    return [sorted[0]!, sorted[sorted.length - 1]!]
  })

  const rangeQuery = createMemo(() => {
    const range = loadedRange()
    if (!range) return ''

    const [minPage, maxPage] = range
    const offset = minPage * ROWS_PER_WINDOW
    const limit = (maxPage - minPage + 1) * ROWS_PER_WINDOW

    return buildPaginatedOutlineQuery({
      focusRootHex: opts.focusRootHex(),
      collapsedKeyHexes: opts.collapsedKeyHexes(),
      afterKeyHex: opts.focusRootHex(),
      limit,
      offset,
    })
  })

  createEffect(() => {
    const sql = rangeQuery()
    if (!sql) {
      setWindowRows(reconcile([] as WindowRow[], { key: 'rk' }))
      return
    }

    const observer: SqlObserver = (result) => {
      if (result) {
        const mapped = (result as Record<string, unknown>[]).map(toWindowRow)
        assignRenderKeys(mapped)
        setWindowRows(reconcile(mapped, { key: 'rk' }))
      }
    }

    addObserver(sql, observer)
    onCleanup(() => removeObserver(sql, observer))
  })

  // -----------------------------------------------------------------------
  // Gather layer: hydrate the window's (matrix_id, row_id) pairs with a single
  // batched `SELECT *` per distinct matrix (Phase 8b §5 multi-table gather).
  // Subscriptions are reconciled when the per-matrix id set changes, not on
  // every scroll tick.
  // -----------------------------------------------------------------------
  const [hydrated, setHydrated] = createStore<Record<string, Record<string, unknown>>>({})

  // Active gather subscriptions, keyed by SQL string.
  const gatherObservers = new Map<string, SqlObserver>()

  const removeGather = (sql: string) => {
    const observer = gatherObservers.get(sql)
    if (observer) {
      removeObserver(sql, observer)
      gatherObservers.delete(sql)
    }
  }

  createEffect(() => {
    // Group the current window's rows by matrix.
    const byMatrix = new Map<number, Set<number>>()
    for (const row of windowRows) {
      let ids = byMatrix.get(row.matrix_id)
      if (!ids) {
        ids = new Set<number>()
        byMatrix.set(row.matrix_id, ids)
      }
      ids.add(row.row_id)
    }

    const desired = new Map<string, number>() // sql -> matrixId
    for (const [matrixId, idSet] of byMatrix) {
      const rowIds = Array.from(idSet).sort((a, b) => a - b)
      desired.set(buildHydrationQuery(matrixId, rowIds), matrixId)
    }

    // Tear down subscriptions no longer needed.
    for (const sql of Array.from(gatherObservers.keys())) {
      if (!desired.has(sql)) removeGather(sql)
    }

    // Add subscriptions for newly-needed matrix/id sets.
    for (const [sql, matrixId] of desired) {
      if (gatherObservers.has(sql)) continue
      const observer: SqlObserver = (result) => {
        if (!result) return
        const updates: Record<string, Record<string, unknown>> = {}
        for (const dataRow of result as Record<string, unknown>[]) {
          updates[compositeKey(matrixId, dataRow.id as number)] = dataRow
        }
        setHydrated(updates)
      }
      gatherObservers.set(sql, observer)
      addObserver(sql, observer)
    }
  })

  onCleanup(() => {
    for (const sql of Array.from(gatherObservers.keys())) removeGather(sql)
    removeAspectGather()
  })

  // -----------------------------------------------------------------------
  // Aspect gather: tag attachments for workspace-matrix rows in the window.
  // Only workspace-matrix rows can have tag aspects, so we filter by matrixId.
  // This is the data spine for the Phase 9.2 property surface (see
  // context/Phase-9.2.md): `aspectsByHostCk` maps a host row to its owned aspect
  // attachments, and `getHydratedData` supplies their fields. Consumed by the
  // navigation-row aspect previews (NavigationPanel); the focus-panel aspect band
  // hydrates per-aspect directly via `useRowData`.
  // -----------------------------------------------------------------------
  const [aspectsByHostCk, setAspectsByHostCk] = createStore<Record<string, AspectAttachment[]>>(
    {},
  )

  const aspectGatherMap = new Map<string, SqlObserver>()

  const removeAspectGather = () => {
    for (const [sql, observer] of aspectGatherMap) {
      removeObserver(sql, observer)
    }
    aspectGatherMap.clear()
  }

  createEffect(() => {
    const wsId = opts.matrixId
    const wsRowIds = windowRows
      .filter((r) => r.matrix_id === wsId)
      .map((r) => r.row_id)
      .sort((a, b) => a - b)

    const sql = wsRowIds.length > 0 ? buildTagsForRowsQuery(wsId, wsRowIds) : ''

    // If the desired query hasn't changed, nothing to do.
    if (sql ? aspectGatherMap.has(sql) : aspectGatherMap.size === 0) return

    removeAspectGather()

    if (!sql) {
      setAspectsByHostCk(reconcile({}))
      return
    }

    const observer: SqlObserver = (result) => {
      if (!result) return
      const byHostCk: Record<string, AspectAttachment[]> = {}
      for (const row of result as Record<string, unknown>[]) {
        const hostCk = compositeKey(wsId, row.source_row_id as number)
        if (!byHostCk[hostCk]) byHostCk[hostCk] = []
        byHostCk[hostCk]!.push({
          target_matrix_id: row.target_matrix_id as number,
          target_row_id: row.target_row_id as number,
          tag_type_name: row.tag_type_name as string,
        })
      }
      setAspectsByHostCk(reconcile(byHostCk))
    }

    aspectGatherMap.set(sql, observer)
    addObserver(sql, observer)
  })

  // -----------------------------------------------------------------------
  // Merge layer: window order ⨝ hydrated data → the consumer-facing rows.
  // -----------------------------------------------------------------------
  const [rows, setRows] = createStore<WorkspaceRowData[]>([])

  createEffect(() => {
    const merged: WorkspaceRowData[] = windowRows.map((w) => {
      const data = hydrated[w.ck] ?? null
      return {
        ...w,
        label: (data?.label as string | null) ?? null,
        content: (data?.content as string | null) ?? null,
        data,
      }
    })
    setRows(reconcile(merged, { key: 'rk' }))
  })

  const getWindowRows = (windowIndex: number): WorkspaceRowData[] => {
    const range = loadedRange()
    if (!range) return []
    const [minPage] = range
    const localOffset = (windowIndex - minPage) * ROWS_PER_WINDOW
    if (localOffset < 0) return []
    return rows.slice(localOffset, localOffset + ROWS_PER_WINDOW) as WorkspaceRowData[]
  }

  const getHydratedData = (mid: number, rowId: number): Record<string, unknown> | null =>
    hydrated[compositeKey(mid, rowId)] ?? null

  return {
    totalWindows,
    totalRows,
    visibleRowCount,
    focusRootRow,
    rows,
    loadedRange,
    getWindowRows,
    setNeededWindows,
    error: countError,
    aspectsByHostCk,
    getHydratedData,
  }
}
