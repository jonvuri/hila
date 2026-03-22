import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { Slice } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'

import { debugFlags } from '../debug/debugState'
import MutationLogOverlay from '../debug/MutationLogOverlay'
import PageBoundaryOverlay from '../debug/PageBoundaryOverlay'
import { insertRow, deleteRow, reparentRow } from '../core/client/matrix-client'
import { useQuery } from '../sql/useQuery'
import {
  OutlineRow as DesignOutlineRow,
  outlineThemeClass,
  computeDecorations,
} from '../design/outline/Outline'
import type { FlatRow, OutlineTheme } from '../design/outline/types'
import ScrollVirtualizer from '../virtualizer/ScrollVirtualizer'

import { computeDropTarget, isNoOpDrop, type DropTargetVisual } from './drag-drop'
import type { OutlineCallbacks } from './keymap'
import { buildPaginatedOutlineQuery, buildBreadcrumbQuery } from './outline-plugin'
import { OutlineRowContent, type OutlineRowHandle } from './OutlineRow'

const DRAG_THRESHOLD_PX = 5

const ROWS_PER_WINDOW = 100
const ESTIMATED_ROW_HEIGHT_PX = 28

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

type DragState = {
  rowId: number
  subtreeRowIds: Set<number>
  startX: number
  startY: number
  activated: boolean
  originDepth: number
  originParentKey: Uint8Array | undefined
  originPrevSiblingKey: Uint8Array | undefined
}

const keyToHex = (key: Uint8Array): string =>
  Array.from(key)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

const extractText = (contentJson: string, plainText = false): string => {
  if (plainText) return contentJson || 'Untitled'
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

type OutlineFaceProps = {
  matrixId: number
  contentColumn?: string
  contentIsPlainText?: boolean
  defaultRowValues?: Record<string, unknown>
}

const OutlineFace = (props: OutlineFaceProps) => {
  const contentCol = () => props.contentColumn ?? 'content'
  const isPlainText = () => props.contentIsPlainText ?? false

  // Theme selection (hardcoded default; will be wired to user preference)
  const [theme] = createSignal<OutlineTheme>('workflowy-clone')

  // Focus view state: rank key of the subtree root, or null for full outline
  const [focusRoot, setFocusRoot] = createSignal<Uint8Array | null>(null)

  const focusRootHex = createMemo(() => {
    const root = focusRoot()
    return root ? keyToHex(root) : null
  })

  // Collapse state (in-memory; resets on reload)
  // Declared before outlineQuery since it's a dependency of the query memo.
  const [collapsedKeys, setCollapsedKeys] = createSignal<Set<string>>(new Set())

  const outlineQuery = createMemo(() =>
    buildPaginatedOutlineQuery(props.matrixId, {
      focusRootHex: focusRootHex(),
      collapsedKeyHexes: Array.from(collapsedKeys()),
      contentColumn: contentCol(),
    }),
  )

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
    return buildBreadcrumbQuery(props.matrixId, hex)
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

  const toggleCollapse = (key: Uint8Array) => {
    const k = keyToHex(key)
    setCollapsedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const toggleCollapseByHex = (hexKey: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(hexKey)) next.delete(hexKey)
      else next.add(hexKey)
      return next
    })
  }

  // Collapse filtering is SQL-side (via collapsedKeyHexes in the query).
  // The only client-side filter is excluding the focus root row, which is
  // rendered as a title above the outline rather than as an outline row.
  const visibleRows = createMemo((): OutlineRowData[] => {
    const rootHex = focusRootHex()
    if (!rootHex) return [...rows]

    const filtered: OutlineRowData[] = []
    for (let i = 0; i < rows.length; i++) {
      if (keyToHex(rows[i]!.key) !== rootHex) {
        filtered.push(rows[i]!)
      }
    }
    return filtered
  })

  // Map visible rows to the design system's FlatRow interface
  const flatRows = createMemo((): FlatRow[] => {
    const vRows = visibleRows()
    const offset = focusDepthOffset()
    const collapsed = collapsedKeys()
    return vRows.map((row) => ({
      id: keyToHex(row.key),
      content: row.content ?? '',
      depth: row.depth - offset,
      hasChildren: row.has_children === 1,
      expanded: row.has_children === 1 && !collapsed.has(keyToHex(row.key)),
    }))
  })

  // Precompute decorations (guide continuations, isVisualLast, vector slots)
  // Computed on the full flatRows() array so buffer windows provide forward
  // context for visible windows' decoration computation.
  const decorations = createMemo(() => computeDecorations(theme(), flatRows()))

  const totalWindows = createMemo(() => {
    const len = visibleRows().length
    return len === 0 ? 0 : Math.ceil(len / ROWS_PER_WINDOW)
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
  // Drag-and-drop reordering
  // -----------------------------------------------------------------------

  const [dragState, setDragState] = createSignal<DragState | null>(null)
  const [dropTarget, setDropTarget] = createSignal<DropTargetVisual | null>(null)

  const getRowElements = (): Map<number, HTMLElement> => {
    const map = new Map<number, HTMLElement>()
    document.querySelectorAll<HTMLElement>('[data-row-id]').forEach((el) => {
      map.set(Number(el.dataset.rowId), el)
    })
    return map
  }

  const handleDragMove = (e: PointerEvent) => {
    const drag = dragState()
    if (!drag) return

    if (!drag.activated) {
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD_PX) return
      setDragState({ ...drag, activated: true })
      document.body.style.cursor = 'grabbing'
      document.body.style.userSelect = 'none'
    }

    const vRows = visibleRows()
    const nonDragged = vRows.filter((r) => !drag.subtreeRowIds.has(r.row_id))
    const rowEls = getRowElements()

    const target = computeDropTarget(
      e.clientX,
      e.clientY,
      nonDragged,
      rowEls,
      focusDepthOffset(),
      focusRoot(),
    )
    if (
      target &&
      isNoOpDrop(target, drag.originDepth, drag.originParentKey, drag.originPrevSiblingKey)
    ) {
      setDropTarget(null)
    } else {
      setDropTarget(target)
    }
  }

  const handleDragEnd = () => {
    const drag = dragState()
    const target = dropTarget()

    if (drag?.activated && target) {
      const vRows = visibleRows()
      const index = findRowIndex(vRows, drag.rowId)
      if (index !== -1) {
        const row = vRows[index]!
        void reparentRow(props.matrixId, copyKey(row.key)!, {
          newParentKey: copyKey(target.parentKey),
          prevSiblingKey: copyKey(target.prevSiblingKey),
          nextSiblingKey: copyKey(target.nextSiblingKey),
        })
      }
    }

    setDragState(null)
    setDropTarget(null)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    document.removeEventListener('pointermove', handleDragMove)
    document.removeEventListener('pointerup', handleDragEnd)
  }

  const startDrag = (rowId: number, e: PointerEvent) => {
    const vRows = visibleRows()
    const index = findRowIndex(vRows, rowId)
    if (index === -1) return

    const row = vRows[index]!
    const subtreeRowIds = new Set<number>([rowId])
    for (let i = index + 1; i < vRows.length; i++) {
      if (vRows[i]!.depth <= row.depth) break
      subtreeRowIds.add(vRows[i]!.row_id)
    }

    const originParentRow = findParentRow(vRows, index)
    const originPrevSib = findPrevSibling(vRows, index)

    setDragState({
      rowId,
      subtreeRowIds,
      startX: e.clientX,
      startY: e.clientY,
      activated: false,
      originDepth: row.depth,
      originParentKey:
        copyKey(originParentRow?.key) ??
        (focusRoot() ? new Uint8Array(focusRoot()!) : undefined),
      originPrevSiblingKey: copyKey(originPrevSib?.key),
    })

    document.addEventListener('pointermove', handleDragMove)
    document.addEventListener('pointerup', handleDragEnd)
  }

  onCleanup(() => {
    document.removeEventListener('pointermove', handleDragMove)
    document.removeEventListener('pointerup', handleDragEnd)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
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

      const buildValues = (contentValue?: string): Record<string, unknown> => {
        const base = { ...(props.defaultRowValues ?? {}) }
        if (contentValue !== undefined) {
          base[contentCol()] = contentValue
        } else if (isPlainText()) {
          base[contentCol()] = ''
        }
        return base
      }

      if (atEnd) {
        void insertRow(props.matrixId, {
          parentKey,
          prevKey: copyKey(row.key),
          values: buildValues(),
        }).then(({ rowId: newRowId }) => {
          requestFocus(newRowId, 'start')
        })
      } else {
        const pos = from
        const afterDoc = doc.cut(pos)

        const afterValue =
          isPlainText() ? afterDoc.textContent : JSON.stringify(afterDoc.toJSON())

        const tr = view.state.tr.replace(pos, doc.content.size, Slice.empty)
        view.dispatch(tr)

        const handle = handleMap.get(rowId)
        handle?.flushSave()

        void insertRow(props.matrixId, {
          parentKey,
          prevKey: copyKey(row.key),
          values: buildValues(afterValue),
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
        void deleteRow(props.matrixId, copyKey(row.key)!).then(() => {
          requestFocus(targetRowId, 'end')
        })
      } else if (isEmpty && hasChildren) {
        const firstChild = findFirstChild(vRows, index)
        const targetRowId = firstChild?.row_id ?? prevRow.row_id
        void deleteRow(props.matrixId, copyKey(row.key)!).then(() => {
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

        void deleteRow(props.matrixId, copyKey(row.key)!).then(() => {
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

      void reparentRow(props.matrixId, copyKey(row.key)!, {
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

      void reparentRow(props.matrixId, copyKey(row.key)!, {
        newParentKey,
        prevSiblingKey: copyKey(parentRow.key),
      })
        .then(() => {
          requestFocus(rowId, 'start')
        })
        .catch((err: unknown) => {
          console.error('onOutdent reparentRow failed:', err)
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

  // Build a lookup from hex key → row for zoom-in from the design row
  const hexToRow = createMemo(() => {
    const map = new Map<string, OutlineRowData>()
    for (const row of visibleRows()) {
      map.set(keyToHex(row.key), row)
    }
    return map
  })

  const depthOffset = focusDepthOffset

  const renderWindow = (windowProps: { windowIndex: number }) => {
    // eslint-disable-next-line solid/reactivity -- windowIndex is a static number from WindowComponent, not a reactive prop
    const wIdx = windowProps.windowIndex
    const startIdx = wIdx * ROWS_PER_WINDOW

    const windowRows = createMemo(() =>
      visibleRows().slice(startIdx, startIdx + ROWS_PER_WINDOW),
    )

    return (
      <>
        <Show when={debugFlags.pageBoundary()}>
          <PageBoundaryOverlay pageIndex={wIdx} rows={windowRows()} />
        </Show>
        <For each={windowRows()}>
          {(row, localI) => {
            const globalIdx = () => startIdx + localI()
            const rowId = row.row_id
            const callbacks = makeCallbacks(rowId)
            onCleanup(() => unregisterHandle(rowId))
            return (
              <div
                class="outline-row"
                data-row-id={rowId}
                data-depth={row.depth - depthOffset()}
                style={{
                  display: 'flex',
                  'align-items': 'flex-start',
                  opacity:
                    dragState()?.subtreeRowIds.has(rowId) && dragState()?.activated ? 0.25 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                <div
                  class="outline-row-handle"
                  style={{
                    width: '20px',
                    'flex-shrink': 0,
                    cursor: 'grab',
                    display: 'flex',
                    'align-items': 'center',
                    'justify-content': 'center',
                    'user-select': 'none',
                    opacity: 0.4,
                    'padding-top': '2px',
                  }}
                  onPointerDown={(e: PointerEvent) => {
                    e.preventDefault()
                    startDrag(rowId, e)
                  }}
                >
                  ⠿
                </div>
                <div style={{ flex: 1, 'min-width': 0 }}>
                  <DesignOutlineRow
                    theme={theme()}
                    row={flatRows()[globalIdx()]!}
                    decoration={decorations()[globalIdx()]!}
                    onToggle={toggleCollapseByHex}
                    onZoomIn={(hexKey) => {
                      const r = hexToRow().get(hexKey)
                      if (r) setFocusRoot(new Uint8Array(r.key))
                    }}
                    renderContent={() => (
                      <OutlineRowContent
                        rowId={rowId}
                        content={row.content ?? ''}
                        matrixId={props.matrixId}
                        pageIndex={wIdx}
                        callbacks={callbacks}
                        contentColumn={contentCol()}
                        contentIsPlainText={isPlainText()}
                        onHandle={(handle) => registerHandle(rowId, handle)}
                        onEditorFocus={() => setFocusedRowId(rowId)}
                      />
                    )}
                  />
                </div>
              </div>
            )
          }}
        </For>
      </>
    )
  }

  return (
    <div class="outline-face">
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
                  {extractText(crumb.content, isPlainText())}
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
                  {extractText(rootRow().content, isPlainText())}
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
          {focusRootRow() ? extractText(focusRootRow()!.content, isPlainText()) : ''}
        </div>
      </Show>
      <div class={outlineThemeClass(theme())} style={{ padding: 0, border: 'none' }}>
        <ScrollVirtualizer
          renderWindow={renderWindow}
          totalWindows={totalWindows()}
          minWindowHeight={ROWS_PER_WINDOW * ESTIMATED_ROW_HEIGHT_PX}
        />
      </div>
      <Show when={dropTarget()}>
        {(target) => (
          <div
            class="outline-drop-indicator"
            style={{
              position: 'fixed',
              top: `${target().indicatorY - 1}px`,
              left: `${target().indicatorLeft}px`,
              width: `${target().indicatorRight - target().indicatorLeft}px`,
              height: '2px',
              background: '#2563eb',
              'border-radius': '1px',
              'pointer-events': 'none',
              'z-index': 1000,
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: '-3px',
                top: '-3px',
                width: '8px',
                height: '8px',
                'border-radius': '50%',
                background: '#2563eb',
              }}
            />
          </div>
        )}
      </Show>
      <MutationLogOverlay />
    </div>
  )
}

export default OutlineFace
