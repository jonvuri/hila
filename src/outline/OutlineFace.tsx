import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'

import { debugFlags } from '../debug/debugState'
import MutationLogOverlay from '../debug/MutationLogOverlay'
import PageBoundaryOverlay from '../debug/PageBoundaryOverlay'
import { useQuery } from '../sql/useQuery'
import ScrollVirtualizer from '../virtualizer/ScrollVirtualizer'

import type { OutlineCallbacks } from './keymap'
import { OutlineRow, type OutlineRowHandle } from './OutlineRow'

const MATRIX_ID = 1

// Single-page query: all rows from the root matrix with depth and hasChildren.
// No LIMIT -- the ScrollVirtualizer wraps this as a single window (totalWindows=1).
// Keyset pagination boundaries and LIMIT will be added when switching to multi-page.
const OUTLINE_QUERY = `
SELECT r.key, r.row_id, d.content,
       COALESCE(c.depth, 0) as depth,
       CASE WHEN ch.ancestor_key IS NOT NULL THEN 1 ELSE 0 END as has_children
FROM rank r
JOIN "mx_${MATRIX_ID}_data" d ON r.row_id = d.id
LEFT JOIN (
  SELECT descendant_key, MAX(depth) as depth
  FROM "mx_${MATRIX_ID}_closure"
  GROUP BY descendant_key
) c ON r.key = c.descendant_key
LEFT JOIN (
  SELECT DISTINCT ancestor_key
  FROM "mx_${MATRIX_ID}_closure"
  WHERE depth = 1
) ch ON r.key = ch.ancestor_key
WHERE r.matrix_id = ${MATRIX_ID}
ORDER BY r.key
`

type OutlineRowData = {
  row_id: number
  key: Uint8Array
  content: string
  depth: number
  has_children: number
}

const OutlineFace = () => {
  const { result, error } = useQuery(() => OUTLINE_QUERY)

  // Keyed store: reconcile by row_id so <For> reuses OutlineRow instances
  // across reactive query updates instead of destroying/recreating PM editors.
  const [rows, setRows] = createStore<OutlineRowData[]>([])

  createEffect(() => {
    const data = result()
    if (!data) return
    setRows(reconcile(data as unknown as OutlineRowData[], { key: 'row_id' }))
  })

  // Focus management: tracks which row is focused and allows programmatic focus
  // after structural operations (insert, delete, indent/outdent).
  const [focusedRowId, setFocusedRowId] = createSignal<number | null>(null)
  const [pendingFocus, setPendingFocus] = createSignal<{
    rowId: number
    pos?: number | 'start' | 'end'
  } | null>(null)
  const handleMap = new Map<number, OutlineRowHandle>()

  const registerHandle = (rowId: number, handle: OutlineRowHandle) => {
    handleMap.set(rowId, handle)
    const pending = pendingFocus()
    if (pending && pending.rowId === rowId) {
      setPendingFocus(null)
      queueMicrotask(() => {
        handle.focus(pending.pos)
        setFocusedRowId(rowId)
      })
    }
  }

  const unregisterHandle = (rowId: number) => {
    handleMap.delete(rowId)
  }

  const requestFocus = (rowId: number, pos?: number | 'start' | 'end') => {
    const handle = handleMap.get(rowId)
    if (handle) {
      handle.focus(pos)
      setFocusedRowId(rowId)
    } else {
      setPendingFocus({ rowId, pos })
    }
  }

  createEffect(() => {
    if (rows.length > 0 && focusedRowId() === null) {
      requestFocus(rows[0]!.row_id, 'start')
    }
  })

  const callbacks: OutlineCallbacks = {
    onEnter: () => {},
    onBackspaceAtStart: () => {},
    onIndent: () => {},
    onOutdent: () => {},
    onInsertLink: () => {},
  }

  const renderWindow = (props: { windowIndex: number }) => (
    <>
      <Show when={debugFlags.pageBoundary()}>
        <PageBoundaryOverlay pageIndex={props.windowIndex} rows={rows} />
      </Show>
      <For each={rows}>
        {(row) => {
          const rowId = row.row_id
          onCleanup(() => unregisterHandle(rowId))
          return (
            <OutlineRow
              rowId={row.row_id}
              rankKey={row.key}
              content={row.content ?? ''}
              depth={row.depth}
              hasChildren={row.has_children === 1}
              matrixId={MATRIX_ID}
              pageIndex={props.windowIndex}
              callbacks={callbacks}
              onHandle={(handle) => registerHandle(rowId, handle)}
              onEditorFocus={() => setFocusedRowId(rowId)}
            />
          )
        }}
      </For>
    </>
  )

  return (
    <div>
      <Show when={error()}>
        <div style={{ color: 'red', padding: '8px', 'margin-bottom': '8px' }}>
          Query error: {error()?.message}
        </div>
      </Show>
      <ScrollVirtualizer renderWindow={renderWindow} totalWindows={1} minWindowHeight={100} />
      <MutationLogOverlay />
    </div>
  )
}

export default OutlineFace
