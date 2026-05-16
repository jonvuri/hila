import { createSignal, createEffect, createMemo, onCleanup, type Accessor } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'

import { addObserver, removeObserver } from '../core/client/sql-client'
import type { SqlObserver } from '../core/sql-types'
import { useQuery } from '../sql/useQuery'

import { buildPaginatedOutlineQuery, buildOutlineCountQuery } from './workspace-plugin'

export const ROWS_PER_WINDOW = 100

export type WorkspaceRowData = {
  row_id: number
  key: Uint8Array
  label: string | null
  content: string | null
  depth: number
  has_children: number
}

export type UsePagedWorkspaceDataOpts = {
  matrixId: number
  focusRootHex: Accessor<string | null>
  collapsedKeyHexes: Accessor<string[]>
}

const INITIAL_NEEDED_WINDOWS = new Set([0, 1, 2, 3])

export const usePagedWorkspaceData = (opts: UsePagedWorkspaceDataOpts) => {
  const countQuery = createMemo(() =>
    buildOutlineCountQuery(opts.matrixId, {
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

  // Focus root row (separate query when in focus mode)
  const focusRootQuery = createMemo(() => {
    const hex = opts.focusRootHex()
    if (!hex) return ''
    return buildPaginatedOutlineQuery(opts.matrixId, {
      focusRootHex: hex,
      limit: 1,
    })
  })

  const { result: focusRootResult } = useQuery(() => focusRootQuery())

  const focusRootRow = createMemo((): WorkspaceRowData | null => {
    const data = focusRootResult()
    if (!data || data.length === 0) return null
    return data[0] as unknown as WorkspaceRowData
  })

  // Page data (single range query for all needed windows)
  const [neededWindows, setNeededWindows] = createSignal<Set<number>>(INITIAL_NEEDED_WINDOWS)
  const [rows, setRows] = createStore<WorkspaceRowData[]>([])

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

    return buildPaginatedOutlineQuery(opts.matrixId, {
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
      setRows(reconcile([] as WorkspaceRowData[], { key: 'row_id' }))
      return
    }

    const observer: SqlObserver = (result) => {
      if (result) {
        setRows(reconcile(result as unknown as WorkspaceRowData[], { key: 'row_id' }))
      }
    }

    addObserver(sql, observer)

    onCleanup(() => {
      removeObserver(sql, observer)
    })
  })

  const getWindowRows = (windowIndex: number): WorkspaceRowData[] => {
    const range = loadedRange()
    if (!range) return []
    const [minPage] = range
    const localOffset = (windowIndex - minPage) * ROWS_PER_WINDOW
    if (localOffset < 0) return []
    return rows.slice(localOffset, localOffset + ROWS_PER_WINDOW) as WorkspaceRowData[]
  }

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
  }
}
