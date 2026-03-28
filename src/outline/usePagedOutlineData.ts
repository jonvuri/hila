import { createSignal, createEffect, createMemo, onCleanup, type Accessor } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'

import { addObserver, removeObserver } from '../core/client/sql-client'
import type { SqlObserver } from '../core/sql-types'
import { useQuery } from '../sql/useQuery'

import { buildPaginatedOutlineQuery, buildOutlineCountQuery } from './outline-plugin'

export const ROWS_PER_WINDOW = 100

export type OutlineRowData = {
  row_id: number
  key: Uint8Array
  content: string
  depth: number
  has_children: number
}

export type UsePagedOutlineDataOpts = {
  matrixId: number
  focusRootHex: Accessor<string | null>
  collapsedKeyHexes: Accessor<string[]>
  contentColumn: Accessor<string>
}

const INITIAL_NEEDED_WINDOWS = new Set([0, 1, 2, 3])

export const usePagedOutlineData = (opts: UsePagedOutlineDataOpts) => {
  // -------------------------------------------------------------------
  // Count query → totalWindows
  //
  // Known limitation: the count subscription may not re-fire on table
  // changes if node-sql-parser cannot parse the SQL for table tracking.
  // The alias uses a quoted identifier to work around the parser
  // treating certain words as reserved. If re-firing fails, totalWindows
  // is correct at mount time but won't update for mutations that change
  // the row count significantly (e.g., bulk inserts that cross a 100-row
  // page boundary). Individual mutations (insert/delete one row) rarely
  // cross page boundaries, so this is acceptable for typical use.
  // -------------------------------------------------------------------

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

  // -------------------------------------------------------------------
  // Focus root row (separate query when in focus mode)
  // -------------------------------------------------------------------

  const focusRootQuery = createMemo(() => {
    const hex = opts.focusRootHex()
    if (!hex) return ''
    return buildPaginatedOutlineQuery(opts.matrixId, {
      focusRootHex: hex,
      contentColumn: opts.contentColumn(),
      limit: 1,
    })
  })

  const { result: focusRootResult } = useQuery(() => focusRootQuery())

  const focusRootRow = createMemo((): OutlineRowData | null => {
    const data = focusRootResult()
    if (!data || data.length === 0) return null
    return data[0] as unknown as OutlineRowData
  })

  // -------------------------------------------------------------------
  // Page data (single range query for all needed windows)
  // -------------------------------------------------------------------

  const [neededWindows, setNeededWindows] = createSignal<Set<number>>(INITIAL_NEEDED_WINDOWS)
  const [rows, setRows] = createStore<OutlineRowData[]>([])

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
      contentColumn: opts.contentColumn(),
      afterKeyHex: opts.focusRootHex(),
      limit,
      offset,
    })
  })

  createEffect(() => {
    const sql = rangeQuery()
    if (!sql) {
      setRows(reconcile([] as OutlineRowData[], { key: 'row_id' }))
      return
    }

    const observer: SqlObserver = (result) => {
      if (result) {
        setRows(reconcile(result as unknown as OutlineRowData[], { key: 'row_id' }))
      }
    }

    addObserver(sql, observer)

    onCleanup(() => {
      removeObserver(sql, observer)
    })
  })

  // -------------------------------------------------------------------
  // Data accessors
  // -------------------------------------------------------------------

  const getWindowRows = (windowIndex: number): OutlineRowData[] => {
    const range = loadedRange()
    if (!range) return []
    const [minPage] = range
    const localOffset = (windowIndex - minPage) * ROWS_PER_WINDOW
    if (localOffset < 0) return []
    return rows.slice(localOffset, localOffset + ROWS_PER_WINDOW) as OutlineRowData[]
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
