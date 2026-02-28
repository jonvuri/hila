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

const buildOutlineQuery = (focusRootHex: string | null): string => {
  const rangeFilter =
    focusRootHex !== null ?
      `AND r.key >= X'${focusRootHex}' AND r.key < X'${focusRootHex.slice(0, -2)}01'`
    : ''

  return `
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
${rangeFilter}
ORDER BY r.key
`
}

type OutlineRowData = {
  row_id: number
  key: Uint8Array
  content: string
  depth: number
  has_children: number
}

type BreadcrumbData = {
  key: Uint8Array
  row_id: number
  content: string
  depth: number
}

const keyToHex = (key: Uint8Array): string =>
  Array.from(key)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

const extractText = (contentJson: string): string => {
  try {
    const doc = JSON.parse(contentJson) as {
      content?: { content?: { text?: string }[] }[]
    }
    if (!doc.content) return 'Untitled'
    return (
      doc.content
        .flatMap((block) => block.content ?? [])
        .map((node) => node.text ?? '')
        .join('') || 'Untitled'
    )
  } catch {
    return 'Untitled'
  }
}

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
  // Focus view state: rank key of the subtree root, or null for full outline
  const [focusRoot, setFocusRoot] = createSignal<Uint8Array | null>(null)

  const focusRootHex = createMemo(() => {
    const root = focusRoot()
    return root ? keyToHex(root) : null
  })

  const outlineQuery = createMemo(() => buildOutlineQuery(focusRootHex()))

  const { result, error } = useQuery(() => outlineQuery())

  const [rows, setRows] = createStore<OutlineRowData[]>([])

  createEffect(() => {
    const data = result()
    if (!data) return
    setRows(reconcile(data as unknown as OutlineRowData[], { key: 'row_id' }))
  })

  // Breadcrumb query: ancestors of focus root, ordered root-to-parent
  const breadcrumbQuery = createMemo(() => {
    const hex = focusRootHex()
    if (!hex) return ''
    return `
SELECT c.ancestor_key as key, c.depth, d.content, r.row_id
FROM "mx_${MATRIX_ID}_closure" c
JOIN rank r ON r.key = c.ancestor_key AND r.matrix_id = ${MATRIX_ID}
JOIN "mx_${MATRIX_ID}_data" d ON r.row_id = d.id
WHERE c.descendant_key = X'${hex}' AND c.depth > 0
ORDER BY c.depth DESC
`
  })

  const { result: breadcrumbResult } = useQuery(() => breadcrumbQuery())

  const breadcrumbs = createMemo((): BreadcrumbData[] => {
    const data = breadcrumbResult()
    if (!data) return []
    return data as unknown as BreadcrumbData[]
  })

  // The focus root row itself (first row in query results when focused)
  const focusRootRow = createMemo((): OutlineRowData | null => {
    const hex = focusRootHex()
    if (!hex) return null
    for (let i = 0; i < rows.length; i++) {
      if (keyToHex(rows[i]!.key) === hex) return rows[i]!
    }
    return null
  })

  // Depth offset: children of focus root display at depth 0
  const focusDepthOffset = createMemo(() => {
    const rootRow = focusRootRow()
    if (!rootRow) return 0
    return rootRow.depth + 1
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
    const rootHex = focusRootHex()

    const filtered: OutlineRowData[] = []
    let skipBelowDepth: number | null = null

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!
      if (skipBelowDepth !== null && row.depth > skipBelowDepth) continue
      skipBelowDepth = null

      // Skip the focus root row (rendered as a title, not an outline row)
      if (rootHex && keyToHex(row.key) === rootHex) continue

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

  // Resolve parent key with fallback to focus root for top-level rows in focused view
  const resolveParentKey = (vRows: OutlineRowData[], index: number): Uint8Array | undefined => {
    const parentRow = findParentRow(vRows, index)
    if (parentRow) return copyKey(parentRow.key)
    const root = focusRoot()
    return root ? new Uint8Array(root) : undefined
  }

  const makeCallbacks = (rowId: number): OutlineCallbacks => ({
    onEnter: (view: EditorView) => {
      const vRows = visibleRows()
      const index = findRowIndex(vRows, rowId)
      if (index === -1) return
      const row = vRows[index]!
      const parentKey = resolveParentKey(vRows, index)

      const { from, to } = view.state.selection
      const doc = view.state.doc
      const atEnd = from === to && to >= doc.content.size - 1

      if (atEnd) {
        void insertRow(MATRIX_ID, {
          parentKey,
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
          parentKey,
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
      const newParentKey =
        grandparent ? copyKey(grandparent.key) : resolveParentKey(vRows, grandparentIndex)

      void reparentRow(MATRIX_ID, copyKey(row.key)!, {
        newParentKey,
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

    onZoomIn: () => {
      const vRows = visibleRows()
      const index = findRowIndex(vRows, rowId)
      if (index === -1) return
      const row = vRows[index]!
      setFocusRoot(new Uint8Array(row.key))
    },

    onZoomOut: () => {
      const root = focusRoot()
      if (!root) return
      const crumbs = breadcrumbs()
      if (crumbs.length === 0) {
        setFocusRoot(null)
        return
      }
      const parent = crumbs[crumbs.length - 1]!
      setFocusRoot(new Uint8Array(parent.key))
    },
  })

  const depthOffset = focusDepthOffset

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
              depth={row.depth - depthOffset()}
              hasChildren={row.has_children === 1}
              collapsed={isCollapsed(row.key)}
              matrixId={MATRIX_ID}
              pageIndex={props.windowIndex}
              callbacks={callbacks}
              onHandle={(handle) => registerHandle(rowId, handle)}
              onEditorFocus={() => setFocusedRowId(rowId)}
              onToggleCollapse={() => toggleCollapse(row.key)}
              onZoomIn={() => setFocusRoot(new Uint8Array(row.key))}
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
      <Show when={focusRoot()}>
        <div
          class="outline-breadcrumb-bar"
          style={{
            display: 'flex',
            'align-items': 'center',
            gap: '4px',
            padding: '6px 12px',
            'font-size': '13px',
            color: '#888',
            'border-bottom': '1px solid #eee',
            'flex-wrap': 'wrap',
          }}
        >
          <span
            style={{ cursor: 'pointer', color: '#666' }}
            onClick={() => setFocusRoot(null)}
            data-testid="breadcrumb-home"
          >
            Home
          </span>
          <For each={breadcrumbs()}>
            {(crumb) => (
              <>
                <span style={{ color: '#ccc' }}>/</span>
                <span
                  style={{ cursor: 'pointer', color: '#666' }}
                  onClick={() => setFocusRoot(new Uint8Array(crumb.key))}
                  data-testid="breadcrumb-ancestor"
                >
                  {extractText(crumb.content)}
                </span>
              </>
            )}
          </For>
          <Show when={focusRootRow()}>
            {(rootRow) => (
              <>
                <span style={{ color: '#ccc' }}>/</span>
                <span
                  style={{ color: '#333', 'font-weight': 500 }}
                  data-testid="breadcrumb-current"
                >
                  {extractText(rootRow().content)}
                </span>
              </>
            )}
          </Show>
        </div>
        <div
          class="outline-focus-title"
          style={{
            padding: '8px 12px 4px',
            'font-size': '18px',
            'font-weight': 600,
            color: '#222',
          }}
          data-testid="focus-title"
        >
          {focusRootRow() ? extractText(focusRootRow()!.content) : ''}
        </div>
      </Show>
      <ScrollVirtualizer renderWindow={renderWindow} totalWindows={1} minWindowHeight={100} />
      <MutationLogOverlay />
    </div>
  )
}

export default OutlineFace
