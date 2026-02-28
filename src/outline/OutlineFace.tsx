import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { Slice } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'

import { debugFlags } from '../debug/debugState'
import MutationLogOverlay from '../debug/MutationLogOverlay'
import PageBoundaryOverlay from '../debug/PageBoundaryOverlay'
import { insertRow, deleteRow, reparentRow } from '../core/client/matrix-client'
import { useQuery } from '../sql/useQuery'
import ScrollVirtualizer from '../virtualizer/ScrollVirtualizer'

import type { OutlineCallbacks } from './keymap'
import { OutlineRow, type OutlineRowHandle } from './OutlineRow'

const MATRIX_ID = 1

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

const keyToHex = (key: Uint8Array): string =>
  Array.from(key)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

// ---------------------------------------------------------------------------
// Flat-list helpers: derive parent/sibling info from the ordered row array
// ---------------------------------------------------------------------------

const findRowIndex = (rows: OutlineRowData[], rowId: number): number =>
  rows.findIndex((r) => r.row_id === rowId)

const findParentRow = (rows: OutlineRowData[], index: number): OutlineRowData | undefined => {
  const depth = rows[index]!.depth
  if (depth === 0) return undefined
  for (let i = index - 1; i >= 0; i--) {
    if (rows[i]!.depth === depth - 1) return rows[i]
  }
  return undefined
}

const findPrevSibling = (rows: OutlineRowData[], index: number): OutlineRowData | undefined => {
  const depth = rows[index]!.depth
  for (let i = index - 1; i >= 0; i--) {
    if (rows[i]!.depth === depth) return rows[i]
    if (rows[i]!.depth < depth) return undefined
  }
  return undefined
}

const findLastDirectChild = (
  rows: OutlineRowData[],
  parentIndex: number,
): OutlineRowData | undefined => {
  const parentDepth = rows[parentIndex]!.depth
  let lastChild: OutlineRowData | undefined
  for (let i = parentIndex + 1; i < rows.length; i++) {
    if (rows[i]!.depth <= parentDepth) break
    if (rows[i]!.depth === parentDepth + 1) lastChild = rows[i]
  }
  return lastChild
}

const findPrevVisibleRow = (
  rows: OutlineRowData[],
  index: number,
): OutlineRowData | undefined => (index > 0 ? rows[index - 1] : undefined)

const findFirstChild = (
  rows: OutlineRowData[],
  parentIndex: number,
): OutlineRowData | undefined => {
  const parentDepth = rows[parentIndex]!.depth
  const next = rows[parentIndex + 1]
  return next && next.depth === parentDepth + 1 ? next : undefined
}

// Solid's store wraps objects in Proxy. Uint8Array values read from the store
// must be copied to plain Uint8Arrays before passing through postMessage to
// the worker, otherwise structured clone may serialize them incorrectly and
// corrupt SQLite BLOB columns.
const copyKey = (key: Uint8Array | undefined): Uint8Array | undefined =>
  key ? new Uint8Array(key) : undefined

// ---------------------------------------------------------------------------

const OutlineFace = () => {
  const { result, error } = useQuery(() => OUTLINE_QUERY)

  const [rows, setRows] = createStore<OutlineRowData[]>([])

  createEffect(() => {
    const data = result()
    if (!data) return
    setRows(reconcile(data as unknown as OutlineRowData[], { key: 'row_id' }))
  })

  // Collapse state (in-memory; resets on reload)
  const [collapsedKeys, setCollapsedKeys] = createSignal<Set<string>>(new Set())

  const toggleCollapse = (key: Uint8Array) => {
    const k = keyToHex(key)
    setCollapsedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const isCollapsed = (key: Uint8Array): boolean => collapsedKeys().has(keyToHex(key))

  const visibleRows = createMemo((): OutlineRowData[] => {
    const collapsed = collapsedKeys()
    if (collapsed.size === 0) return rows.slice()

    const filtered: OutlineRowData[] = []
    let skipBelowDepth: number | null = null

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!
      if (skipBelowDepth !== null && row.depth > skipBelowDepth) continue
      skipBelowDepth = null
      filtered.push(row)
      if (row.has_children === 1 && collapsed.has(keyToHex(row.key))) {
        skipBelowDepth = row.depth
      }
    }

    return filtered
  })

  // Focus management
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

  // -----------------------------------------------------------------------
  // Keyboard interaction callbacks (per-row, via captured rowId)
  // -----------------------------------------------------------------------

  const makeCallbacks = (rowId: number): OutlineCallbacks => ({
    onEnter: (view: EditorView) => {
      const vRows = visibleRows()
      const index = findRowIndex(vRows, rowId)
      if (index === -1) return
      const row = vRows[index]!
      const parentRow = findParentRow(vRows, index)

      const { from, to } = view.state.selection
      const doc = view.state.doc
      const atEnd = from === to && to >= doc.content.size - 1

      if (atEnd) {
        void insertRow(MATRIX_ID, {
          parentKey: copyKey(parentRow?.key),
          prevKey: copyKey(row.key),
        }).then(({ rowId: newRowId }) => {
          requestFocus(newRowId, 'start')
        })
      } else {
        const pos = from
        const afterDoc = doc.cut(pos)
        const afterJson = JSON.stringify(afterDoc.toJSON())

        const tr = view.state.tr.replace(pos, doc.content.size, Slice.empty)
        view.dispatch(tr)

        const handle = handleMap.get(rowId)
        handle?.flushSave()

        void insertRow(MATRIX_ID, {
          parentKey: copyKey(parentRow?.key),
          prevKey: copyKey(row.key),
          values: { content: afterJson },
        }).then(({ rowId: newRowId }) => {
          requestFocus(newRowId, 'start')
        })
      }
    },

    onBackspaceAtStart: (view: EditorView) => {
      const vRows = visibleRows()
      const index = findRowIndex(vRows, rowId)
      if (index === -1) return
      const row = vRows[index]!

      if (index === 0) return

      const prevRow = findPrevVisibleRow(vRows, index)
      if (!prevRow) return

      const doc = view.state.doc
      const isEmpty = doc.content.size <= 2
      const hasChildren = row.has_children === 1

      if (isEmpty && !hasChildren) {
        const targetRowId = prevRow.row_id
        void deleteRow(MATRIX_ID, copyKey(row.key)!).then(() => {
          requestFocus(targetRowId, 'end')
        })
      } else if (isEmpty && hasChildren) {
        const firstChild = findFirstChild(vRows, index)
        const targetRowId = firstChild?.row_id ?? prevRow.row_id
        void deleteRow(MATRIX_ID, copyKey(row.key)!).then(() => {
          requestFocus(targetRowId, 'start')
        })
      } else {
        const prevHandle = handleMap.get(prevRow.row_id)
        if (!prevHandle) return
        const prevView = prevHandle.getView()
        if (!prevView) return

        const prevDoc = prevView.state.doc
        const mergePoint = prevDoc.content.size - 1

        const tr = prevView.state.tr
        doc.content.forEach((block) => {
          tr.insert(tr.mapping.map(mergePoint), block.content)
        })
        prevView.dispatch(tr)
        prevHandle.flushSave()

        void deleteRow(MATRIX_ID, copyKey(row.key)!).then(() => {
          requestFocus(prevRow.row_id, mergePoint)
        })
      }
    },

    onIndent: () => {
      const vRows = visibleRows()
      const index = findRowIndex(vRows, rowId)
      if (index === -1) return
      const row = vRows[index]!

      const prevSibling = findPrevSibling(vRows, index)
      if (!prevSibling) return

      const prevSiblingIndex = findRowIndex(vRows, prevSibling.row_id)
      const lastChild = findLastDirectChild(vRows, prevSiblingIndex)

      void reparentRow(MATRIX_ID, copyKey(row.key)!, {
        newParentKey: copyKey(prevSibling.key),
        prevSiblingKey: copyKey(lastChild?.key),
      }).then(() => {
        requestFocus(rowId, 'start')
      })
    },

    onOutdent: () => {
      const vRows = visibleRows()
      const index = findRowIndex(vRows, rowId)
      if (index === -1) return
      const row = vRows[index]!

      const parentRow = findParentRow(vRows, index)
      if (!parentRow) return

      const grandparentIndex = findRowIndex(vRows, parentRow.row_id)
      const grandparent = findParentRow(vRows, grandparentIndex)

      void reparentRow(MATRIX_ID, copyKey(row.key)!, {
        newParentKey: copyKey(grandparent?.key),
        prevSiblingKey: copyKey(parentRow.key),
      }).then(() => {
        requestFocus(rowId, 'start')
      })
    },

    onArrowUp: () => {
      const vRows = visibleRows()
      const index = findRowIndex(vRows, rowId)
      if (index <= 0) return
      const prevRow = vRows[index - 1]!
      requestFocus(prevRow.row_id, 'end')
    },

    onArrowDown: () => {
      const vRows = visibleRows()
      const index = findRowIndex(vRows, rowId)
      if (index === -1 || index >= vRows.length - 1) return
      const nextRow = vRows[index + 1]!
      requestFocus(nextRow.row_id, 'start')
    },

    onInsertLink: () => {},

    onToggleCollapse: () => {
      const vRows = visibleRows()
      const index = findRowIndex(vRows, rowId)
      if (index === -1) return
      const row = vRows[index]!
      if (row.has_children === 1) toggleCollapse(row.key)
    },
  })

  const renderWindow = (props: { windowIndex: number }) => (
    <>
      <Show when={debugFlags.pageBoundary()}>
        <PageBoundaryOverlay pageIndex={props.windowIndex} rows={rows} />
      </Show>
      <For each={visibleRows()}>
        {(row) => {
          const rowId = row.row_id
          const callbacks = makeCallbacks(rowId)
          onCleanup(() => unregisterHandle(rowId))
          return (
            <OutlineRow
              rowId={row.row_id}
              rankKey={row.key}
              content={row.content ?? ''}
              depth={row.depth}
              hasChildren={row.has_children === 1}
              collapsed={isCollapsed(row.key)}
              matrixId={MATRIX_ID}
              pageIndex={props.windowIndex}
              callbacks={callbacks}
              onHandle={(handle) => registerHandle(rowId, handle)}
              onEditorFocus={() => setFocusedRowId(rowId)}
              onToggleCollapse={() => toggleCollapse(row.key)}
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
