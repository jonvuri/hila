import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from 'solid-js'
import { createStore } from 'solid-js/store'
import { Slice } from 'prosemirror-model'
import { EditorView } from 'prosemirror-view'
import { Selection, TextSelection, type Plugin as StatePlugin } from 'prosemirror-state'
import { ProsemirrorAdapterProvider, useNodeViewFactory } from '@prosemirror-adapter/solid'
import 'prosemirror-view/style/prosemirror.css'

import { debugFlags, logPmMount, logPmUnmount, logPmContentSync } from '../debug/debugState'
import MutationLogOverlay from '../debug/MutationLogOverlay'
import PageBoundaryOverlay from '../debug/PageBoundaryOverlay'
import {
  insertRow,
  deleteRow,
  reparentRow,
  updateRow,
  renameMatrix,
  getColumns,
} from '../core/client/matrix-client'
import type { ColumnDefinition } from '../core/matrix'
import { useQuery } from '../sql/useQuery'
import {
  OutlineRow as DesignOutlineRow,
  outlineThemeClass,
  computeDecorations,
} from '../design/outline/Outline'
import type { FlatRow, OutlineTheme } from '../design/outline/types'
import ScrollVirtualizer from '../virtualizer/ScrollVirtualizer'
import type { OutlineCallbacks } from '../editor/keymap'
import {
  createLabelEditorState,
  createContentEditorState,
  createDebouncedSave,
} from '../editor/editor-setup'
import { extractTextFromPmDoc } from '../editor/pm-text'
import { ParagraphView } from '../editor/nodeviews/ParagraphView'
import { HeadingView } from '../editor/nodeviews/HeadingView'
import { InlineRefView } from '../editor/nodeviews/InlineRefView'
import { createInlinerefPlugin } from '../editor/inlineref-plugin'
import { syncInlineRefs, refreshCachedTitles } from '../editor/inlineref-sync'
import { createTagSearchProvider, handleTagSelection } from '../tags/tag-search-provider'
import { tagColorFromName, tagBadgeBackground } from '../tags/tag-color'
import { buildAspectPreview } from '../shared/property-surface'
import type { AspectPreview } from '../shared/property-surface'

import { computeDropTarget, isNoOpDrop, type DropTargetVisual } from './drag-drop'
import { buildMatrixTitleQuery } from './workspace-plugin'
import {
  usePagedWorkspaceData,
  compositeKey,
  ROWS_PER_WINDOW,
  type WorkspaceRowData,
} from './usePagedWorkspaceData'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DRAG_THRESHOLD_PX = 5
const ESTIMATED_ROW_HEIGHT_PX = 32
const SAVE_DEBOUNCE_MS = 300

const EMPTY_LABEL_JSON = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph' }],
})

const EMPTY_CONTENT_JSON = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph' }],
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NavigationPanelProps = {
  matrixId: number
  rootKey?: Uint8Array
  onOpenFocus: (rowId: number, key: Uint8Array) => void
  focusedRowId?: number
}

type DragState = {
  ck: string
  subtreeCks: Set<string>
  startX: number
  startY: number
  activated: boolean
  originDepth: number
  originParentKey: Uint8Array | undefined
  originPrevSiblingKey: Uint8Array | undefined
}

type EditorHandle = {
  focus: (pos?: number | 'start' | 'end') => void
  getView: () => EditorView | undefined
  flushSave: () => void
}

type ContentEditorHandle = {
  focus: (pos?: 'start' | 'end') => void
  getView: () => EditorView | undefined
  flushSave: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const keyToHex = (key: Uint8Array): string =>
  Array.from(key)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

const copyKey = (key: Uint8Array | undefined): Uint8Array | undefined =>
  key ? new Uint8Array(key) : undefined

const findRowIndex = (rows: WorkspaceRowData[], ck: string): number =>
  rows.findIndex((r) => r.ck === ck)

const findParentRow = (
  rows: WorkspaceRowData[],
  index: number,
): WorkspaceRowData | undefined => {
  const depth = rows[index]!.depth
  if (depth === 0) return undefined
  for (let i = index - 1; i >= 0; i--) {
    if (rows[i]!.depth === depth - 1) return rows[i]
  }
  return undefined
}

const findPrevSibling = (
  rows: WorkspaceRowData[],
  index: number,
): WorkspaceRowData | undefined => {
  const depth = rows[index]!.depth
  for (let i = index - 1; i >= 0; i--) {
    if (rows[i]!.depth === depth) return rows[i]
    if (rows[i]!.depth < depth) return undefined
  }
  return undefined
}

const findLastDirectChild = (
  rows: WorkspaceRowData[],
  parentIndex: number,
): WorkspaceRowData | undefined => {
  const parentDepth = rows[parentIndex]!.depth
  let lastChild: WorkspaceRowData | undefined
  for (let i = parentIndex + 1; i < rows.length; i++) {
    if (rows[i]!.depth <= parentDepth) break
    if (rows[i]!.depth === parentDepth + 1) lastChild = rows[i]
  }
  return lastChild
}

const findPrevVisibleRow = (
  rows: WorkspaceRowData[],
  index: number,
): WorkspaceRowData | undefined => (index > 0 ? rows[index - 1] : undefined)

const findFirstChild = (
  rows: WorkspaceRowData[],
  parentIndex: number,
): WorkspaceRowData | undefined => {
  const parentDepth = rows[parentIndex]!.depth
  const next = rows[parentIndex + 1]
  return next && next.depth === parentDepth + 1 ? next : undefined
}

// ---------------------------------------------------------------------------
// Label editor (ProseMirror with outline keybindings, single-paragraph schema)
// ---------------------------------------------------------------------------

type LabelEditorProps = {
  rowId: number
  label: string
  matrixId: number
  pageIndex: number
  callbacks: OutlineCallbacks
  onHandle?: (handle: EditorHandle) => void
  onEditorFocus?: () => void
}

const LabelEditorInner = (props: LabelEditorProps) => {
  const nodeViewFactory = useNodeViewFactory()
  let editorView: EditorView | undefined

  const saveHandle = createDebouncedSave((doc) => {
    const docJson = doc.toJSON() as Record<string, unknown>
    void refreshCachedTitles(docJson).then((updated) => {
      void updateRow(props.matrixId, props.rowId, { label: JSON.stringify(updated) })
    })
    void syncInlineRefs(doc, props.matrixId, props.rowId)
  }, SAVE_DEBOUNCE_MS)

  const handle: EditorHandle = {
    focus: (pos) => {
      if (!editorView) return
      editorView.focus()
      let selection: Selection
      if (pos === 'end') {
        selection = Selection.atEnd(editorView.state.doc)
      } else if (pos === undefined || pos === 'start') {
        selection = Selection.atStart(editorView.state.doc)
      } else {
        selection = TextSelection.create(editorView.state.doc, pos)
      }
      editorView.dispatch(editorView.state.tr.setSelection(selection))
    },
    getView: () => editorView,
    flushSave: () => saveHandle.flush(),
  }

  const mountEditor = (el: HTMLDivElement) => {
    let docJson: unknown | undefined
    if (props.label) {
      docJson = JSON.parse(props.label) as unknown
    }

    const extraPlugins: StatePlugin[] = [
      createInlinerefPlugin({
        matrixId: props.matrixId,
        rowIdAccessor: () => props.rowId,
        searchProvider: createTagSearchProvider(props.matrixId),
        onTagSelect: handleTagSelection,
      }),
    ]
    const state = createLabelEditorState(docJson, props.callbacks, extraPlugins)

    const nodeViews: Record<string, ReturnType<typeof nodeViewFactory>> = {
      paragraph: nodeViewFactory({
        component: ParagraphView,
        as: 'div',
        contentAs: 'p',
      }),
      inlineref: nodeViewFactory({
        component: InlineRefView,
        as: 'span',
      }),
    }

    const view = new EditorView(el, {
      state,
      handleDOMEvents: {
        focus: () => {
          props.onEditorFocus?.()
          return false
        },
      },
      nodeViews,
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr)
        view.updateState(newState)
        if (tr.docChanged) {
          saveHandle.schedule(newState.doc)
        }
      },
    })

    editorView = view
    logPmMount(props.rowId, props.pageIndex)
    props.onHandle?.(handle)
  }

  onCleanup(() => {
    saveHandle.destroy()
    logPmUnmount(props.rowId, props.pageIndex)
    editorView?.destroy()
  })

  createEffect(
    on(
      () => props.label,
      (newLabel) => {
        if (!editorView) return
        const currentDoc = JSON.stringify(editorView.state.doc.toJSON())
        logPmContentSync(props.rowId, currentDoc !== newLabel)
        // Normally we skip syncing into a focused editor to avoid clobbering an
        // in-progress edit. But with the Phase 9.1 two-phase gather the label
        // arrives a frame after the (auto-focused) editor mounts empty, so an
        // *empty* focused editor must still accept its initial hydrated content.
        const docIsEmpty = editorView.state.doc.content.size <= 2
        if (currentDoc !== newLabel && (!editorView.hasFocus() || docIsEmpty)) {
          const hadFocus = editorView.hasFocus()
          let docJson: unknown | undefined
          if (newLabel) {
            docJson = JSON.parse(newLabel) as unknown
          }
          const newState = createLabelEditorState(docJson, props.callbacks, [
            createInlinerefPlugin({
              matrixId: props.matrixId,
              rowIdAccessor: () => props.rowId,
              searchProvider: createTagSearchProvider(props.matrixId),
              onTagSelect: handleTagSelection,
            }),
          ])
          editorView.updateState(newState)
          if (hadFocus) {
            editorView.focus()
            editorView.dispatch(
              editorView.state.tr.setSelection(Selection.atStart(editorView.state.doc)),
            )
          }
        }
      },
      { defer: true },
    ),
  )

  return (
    <div
      class="nav-label-editor"
      ref={(el) => mountEditor(el)}
      style={{ flex: 1, 'min-width': 0 }}
    />
  )
}

const LabelEditor = (props: LabelEditorProps) => (
  <ProsemirrorAdapterProvider>
    <LabelEditorInner
      rowId={props.rowId}
      label={props.label}
      matrixId={props.matrixId}
      pageIndex={props.pageIndex}
      callbacks={props.callbacks}
      onHandle={props.onHandle}
      onEditorFocus={props.onEditorFocus}
    />
  </ProsemirrorAdapterProvider>
)

// ---------------------------------------------------------------------------
// Content inline editor (full ProseMirror, no outline keybindings)
// ---------------------------------------------------------------------------

type ContentEditorProps = {
  rowId: number
  content: string
  matrixId: number
  pageIndex: number
  onHandle?: (handle: ContentEditorHandle) => void
  onFocus?: () => void
}

const ContentEditorInner = (props: ContentEditorProps) => {
  const nodeViewFactory = useNodeViewFactory()
  let editorView: EditorView | undefined

  const saveHandle = createDebouncedSave((doc) => {
    const docJson = doc.toJSON() as Record<string, unknown>
    void refreshCachedTitles(docJson).then((updated) => {
      void updateRow(props.matrixId, props.rowId, { content: JSON.stringify(updated) })
    })
    void syncInlineRefs(doc, props.matrixId, props.rowId)
  }, SAVE_DEBOUNCE_MS)

  const handle: ContentEditorHandle = {
    focus: (pos) => {
      if (!editorView) return
      editorView.focus()
      const selection =
        pos === 'end' ?
          Selection.atEnd(editorView.state.doc)
        : Selection.atStart(editorView.state.doc)
      editorView.dispatch(editorView.state.tr.setSelection(selection))
    },
    getView: () => editorView,
    flushSave: () => saveHandle.flush(),
  }

  const mountEditor = (el: HTMLDivElement) => {
    let docJson: unknown | undefined
    if (props.content) {
      docJson = JSON.parse(props.content) as unknown
    }

    const extraPlugins: StatePlugin[] = [
      createInlinerefPlugin({
        matrixId: props.matrixId,
        rowIdAccessor: () => props.rowId,
        searchProvider: createTagSearchProvider(props.matrixId),
        onTagSelect: handleTagSelection,
      }),
    ]
    const state = createContentEditorState(docJson, extraPlugins)

    const nodeViews: Record<string, ReturnType<typeof nodeViewFactory>> = {
      paragraph: nodeViewFactory({
        component: ParagraphView,
        as: 'div',
        contentAs: 'p',
      }),
      heading: nodeViewFactory({
        component: HeadingView,
      }),
      inlineref: nodeViewFactory({
        component: InlineRefView,
        as: 'span',
      }),
    }

    const view = new EditorView(el, {
      state,
      handleDOMEvents: {
        focus: () => {
          props.onFocus?.()
          return false
        },
      },
      nodeViews,
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr)
        view.updateState(newState)
        if (tr.docChanged) {
          saveHandle.schedule(newState.doc)
        }
      },
    })

    editorView = view
    props.onHandle?.(handle)
  }

  onCleanup(() => {
    saveHandle.destroy()
    editorView?.destroy()
  })

  createEffect(
    on(
      () => props.content,
      (newContent) => {
        if (!editorView) return
        const currentDoc = JSON.stringify(editorView.state.doc.toJSON())
        if (currentDoc !== newContent && !editorView.hasFocus()) {
          let docJson: unknown | undefined
          if (newContent) {
            docJson = JSON.parse(newContent) as unknown
          }
          const newState = createContentEditorState(docJson, [
            createInlinerefPlugin({
              matrixId: props.matrixId,
              rowIdAccessor: () => props.rowId,
              searchProvider: createTagSearchProvider(props.matrixId),
              onTagSelect: handleTagSelection,
            }),
          ])
          editorView.updateState(newState)
        }
      },
      { defer: true },
    ),
  )

  return (
    <div
      class="nav-content-editor"
      ref={(el) => mountEditor(el)}
      style={{
        flex: 1,
        'min-width': 0,
        'font-size': '13px',
        color: '#555',
        'padding-top': '2px',
      }}
    />
  )
}

const ContentInlineEditor = (props: ContentEditorProps) => (
  <ProsemirrorAdapterProvider>
    <ContentEditorInner
      rowId={props.rowId}
      content={props.content}
      matrixId={props.matrixId}
      pageIndex={props.pageIndex}
      onHandle={props.onHandle}
      onFocus={props.onFocus}
    />
  </ProsemirrorAdapterProvider>
)

// ---------------------------------------------------------------------------
// NavigationPanel
// ---------------------------------------------------------------------------

const NavigationPanel = (props: NavigationPanelProps) => {
  const [theme] = createSignal<OutlineTheme>('workflowy-clone')

  // Panel data root: rank key of the subtree this panel renders. Fixed for the
  // component's lifetime -- the root panel has no root (null); embedded panels
  // are locked to their focus panel's row. Intra-panel zoom was removed; all
  // outline navigation goes through top-level focus + ancestry interactions.
  const focusRoot = props.rootKey ? new Uint8Array(props.rootKey) : null // eslint-disable-line solid/reactivity -- stable for component lifetime
  const focusRootHex = focusRoot ? keyToHex(focusRoot) : null

  const [collapsedKeys, setCollapsedKeys] = createSignal<Set<string>>(new Set())

  // Expanded content editors (composite keys whose content preview is expanded)
  const [expandedContentRows, setExpandedContentRows] = createSignal<Set<string>>(new Set())

  const matrixId = props.matrixId // eslint-disable-line solid/reactivity -- stable for component lifetime
  const pageData = usePagedWorkspaceData({
    matrixId,
    focusRootHex: () => focusRootHex,
    collapsedKeyHexes: () => Array.from(collapsedKeys()),
  })

  const error = pageData.error
  const rows = pageData.rows
  // Aspect gather spine (Phase 9.2): the owned-aspect attachments per host row,
  // plus the batched hydration lookup. Consumed below for the compact navigation-
  // row property preview — the nav-panel tier of the property surface, sharing the
  // key-field logic (`buildAspectPreview`) with the focus-panel aspect band.
  const aspectsByHostCk = pageData.aspectsByHostCk
  const getHydratedData = pageData.getHydratedData

  // Column definitions for aspect matrixes, loaded lazily as their rows enter the
  // visible window (aspect rows render as own-children, so they are hydrated by
  // the main gather and resolvable via getHydratedData).
  const [colCache, setColCache] = createStore<Record<number, ColumnDefinition[]>>({})

  createEffect(() => {
    const seenMatrixIds = new Set<number>()
    for (const row of rows) {
      for (const a of aspectsByHostCk[row.ck] ?? []) {
        seenMatrixIds.add(a.target_matrix_id)
      }
    }
    for (const mid of seenMatrixIds) {
      if (!colCache[mid]) {
        void getColumns(mid).then((cols) => setColCache(mid, cols))
      }
    }
  })

  const focusRootRow = () => pageData.focusRootRow()

  // Matrix title query (for the root-level editable workspace name)
  const isRootPanel = !props.rootKey // eslint-disable-line solid/reactivity -- stable for component lifetime
  const matrixTitleQuery = createMemo(() =>
    isRootPanel ? buildMatrixTitleQuery(props.matrixId) : '',
  )
  const { result: matrixTitleResult } = useQuery(() => matrixTitleQuery())
  const matrixTitle = createMemo(
    () => (matrixTitleResult()?.[0] as { title: string } | undefined)?.title ?? '',
  )

  // The chip shown on a heterogeneous row, or null for a plain workspace bullet.
  // An aspect row from another matrix shows that matrix's title (carried inline
  // on the row); a type-node shows a distinct "type" chip.
  const chipFor = (row: WorkspaceRowData): { text: string; color: string } | null => {
    if (row.is_type_node === 1) {
      return { text: 'type', color: tagColorFromName('type') }
    }
    if (row.matrix_id !== props.matrixId) {
      const title = row.matrix_title ?? `matrix ${row.matrix_id}`
      return { text: title, color: tagColorFromName(title) }
    }
    return null
  }

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

  const visibleRows = createMemo((): WorkspaceRowData[] => [...rows])

  const flatRows = createMemo((): FlatRow[] => {
    const vRows = visibleRows()
    const offset = focusDepthOffset()
    const collapsed = collapsedKeys()
    return vRows.map((row) => ({
      id: keyToHex(row.key),
      content: row.label ?? '',
      depth: row.depth - offset,
      hasChildren: row.has_children === 1,
      expanded: row.has_children === 1 && !collapsed.has(keyToHex(row.key)),
    }))
  })

  const decorations = createMemo(() => computeDecorations(theme(), flatRows()))

  const totalWindows = () => pageData.totalWindows()

  // -----------------------------------------------------------------------
  // Label focus management
  // -----------------------------------------------------------------------

  const [focusedCk, setFocusedCk] = createSignal<string | null>(null)
  const [pendingFocus, setPendingFocus] = createSignal<{
    ck: string
    pos?: number | 'start' | 'end'
  } | null>(null)
  const handleMap = new Map<string, EditorHandle>()

  const registerHandle = (ck: string, handle: EditorHandle) => {
    handleMap.set(ck, handle)
    const pending = pendingFocus()
    if (pending && pending.ck === ck) {
      setPendingFocus(null)
      queueMicrotask(() => {
        handle.focus(pending.pos)
        setFocusedCk(ck)
      })
    }
  }

  const unregisterHandle = (ck: string) => {
    handleMap.delete(ck)
  }

  const requestFocus = (ck: string, pos?: number | 'start' | 'end') => {
    const handle = handleMap.get(ck)
    if (handle) {
      handle.focus(pos)
      setFocusedCk(ck)
    } else {
      setPendingFocus({ ck, pos })
    }
  }

  createEffect(() => {
    const vRows = visibleRows()
    if (vRows.length > 0 && focusedCk() === null) {
      requestFocus(vRows[0]!.ck, 'start')
    }
  })

  // -----------------------------------------------------------------------
  // Content editor focus management
  // -----------------------------------------------------------------------

  const contentHandleMap = new Map<string, ContentEditorHandle>()
  const [pendingContentFocus, setPendingContentFocus] = createSignal<string | null>(null)

  const registerContentHandle = (ck: string, handle: ContentEditorHandle) => {
    contentHandleMap.set(ck, handle)
    if (pendingContentFocus() === ck) {
      setPendingContentFocus(null)
      queueMicrotask(() => handle.focus('start'))
    }
  }

  const unregisterContentHandle = (ck: string) => {
    contentHandleMap.delete(ck)
  }

  const expandAndFocusContent = (ck: string) => {
    setExpandedContentRows((prev) => {
      const next = new Set(prev)
      next.add(ck)
      return next
    })
    const existing = contentHandleMap.get(ck)
    if (existing) {
      queueMicrotask(() => existing.focus('start'))
    } else {
      setPendingContentFocus(ck)
    }
  }

  // -----------------------------------------------------------------------
  // Drag-and-drop reordering
  // -----------------------------------------------------------------------

  const [dragState, setDragState] = createSignal<DragState | null>(null)
  const [dropTarget, setDropTarget] = createSignal<DropTargetVisual | null>(null)

  const getRowElements = (): Map<string, HTMLElement> => {
    const map = new Map<string, HTMLElement>()
    document.querySelectorAll<HTMLElement>('[data-row-ck]').forEach((el) => {
      const ck = el.dataset.rowCk
      if (ck) map.set(ck, el)
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
    const nonDragged = vRows.filter((r) => !drag.subtreeCks.has(r.ck))
    const rowEls = getRowElements()

    const target = computeDropTarget(
      e.clientX,
      e.clientY,
      nonDragged,
      rowEls,
      focusDepthOffset(),
      focusRoot,
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
      const index = findRowIndex(vRows, drag.ck)
      if (index !== -1) {
        const row = vRows[index]!
        void reparentRow(row.matrix_id, copyKey(row.key)!, {
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

  const startDrag = (ck: string, e: PointerEvent) => {
    const vRows = visibleRows()
    const index = findRowIndex(vRows, ck)
    if (index === -1) return

    const row = vRows[index]!
    if (!isPlainWorkspaceRow(row)) return
    const subtreeCks = new Set<string>([ck])
    for (let i = index + 1; i < vRows.length; i++) {
      if (vRows[i]!.depth <= row.depth) break
      subtreeCks.add(vRows[i]!.ck)
    }

    const originParentRow = findParentRow(vRows, index)
    const originPrevSib = findPrevSibling(vRows, index)

    setDragState({
      ck,
      subtreeCks,
      startX: e.clientX,
      startY: e.clientY,
      activated: false,
      originDepth: row.depth,
      originParentKey:
        copyKey(originParentRow?.key) ?? (focusRoot ? new Uint8Array(focusRoot) : undefined),
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
  // Keyboard interaction callbacks
  // -----------------------------------------------------------------------

  const resolveParentKey = (
    vRows: WorkspaceRowData[],
    index: number,
  ): Uint8Array | undefined => {
    const parentRow = findParentRow(vRows, index)
    if (parentRow) return copyKey(parentRow.key)
    return focusRoot ? new Uint8Array(focusRoot) : undefined
  }

  // A "plain workspace row" is one that lives in this panel's workspace matrix
  // and is not a tag type-node. Structural gestures (create/move/merge/expand
  // content) are scoped to these for now; cross-matrix aspect rows are render +
  // inline-label-edit only in 9.1 (creation gestures land in 9.6).
  const isPlainWorkspaceRow = (row: WorkspaceRowData): boolean =>
    row.matrix_id === props.matrixId && row.is_type_node !== 1

  const makeCallbacks = (ck: string): OutlineCallbacks => ({
    onEnter: (view: EditorView) => {
      const vRows = visibleRows()
      const index = findRowIndex(vRows, ck)
      if (index === -1) return
      const row = vRows[index]!
      if (!isPlainWorkspaceRow(row)) return
      const parentKey = resolveParentKey(vRows, index)

      const { from, to } = view.state.selection
      const doc = view.state.doc
      const atEnd = from === to && to >= doc.content.size - 1

      if (atEnd) {
        void insertRow(props.matrixId, {
          parentKey,
          prevKey: copyKey(row.key),
          values: { label: EMPTY_LABEL_JSON, content: null },
        }).then(({ rowId: newRowId }) => {
          requestFocus(compositeKey(props.matrixId, newRowId), 'start')
        })
      } else {
        const pos = from
        const afterDoc = doc.cut(pos)
        const afterValue = JSON.stringify(afterDoc.toJSON())

        const tr = view.state.tr.replace(pos, doc.content.size, Slice.empty)
        view.dispatch(tr)

        const handle = handleMap.get(ck)
        handle?.flushSave()

        void insertRow(props.matrixId, {
          parentKey,
          prevKey: copyKey(row.key),
          values: { label: afterValue, content: null },
        }).then(({ rowId: newRowId }) => {
          requestFocus(compositeKey(props.matrixId, newRowId), 'start')
        })
      }
    },

    onBackspaceAtStart: (view: EditorView) => {
      const vRows = visibleRows()
      const index = findRowIndex(vRows, ck)
      if (index === -1) return
      const row = vRows[index]!
      if (!isPlainWorkspaceRow(row)) return

      if (index === 0) {
        const doc = view.state.doc
        const isEmpty = doc.content.size <= 2
        if (isEmpty && row.has_children !== 1 && vRows.length === 1) {
          void deleteRow(props.matrixId, row.row_id)
        }
        return
      }

      const prevRow = findPrevVisibleRow(vRows, index)
      if (!prevRow) return

      const doc = view.state.doc
      const isEmpty = doc.content.size <= 2
      const hasChildren = row.has_children === 1

      if (isEmpty && !hasChildren) {
        const targetCk = prevRow.ck
        void deleteRow(props.matrixId, row.row_id).then(() => {
          requestFocus(targetCk, 'end')
        })
      } else if (isEmpty && hasChildren) {
        const firstChild = findFirstChild(vRows, index)
        const targetCk = firstChild?.ck ?? prevRow.ck
        void deleteRow(props.matrixId, row.row_id).then(() => {
          requestFocus(targetCk, 'start')
        })
      } else {
        const prevHandle = handleMap.get(prevRow.ck)
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

        void deleteRow(props.matrixId, row.row_id).then(() => {
          requestFocus(prevRow.ck, mergePoint)
        })
      }
    },

    onIndent: () => {
      const vRows = visibleRows()
      const index = findRowIndex(vRows, ck)
      if (index === -1) return
      const row = vRows[index]!
      if (!isPlainWorkspaceRow(row)) return

      const prevSibling = findPrevSibling(vRows, index)
      if (!prevSibling) return

      const prevSiblingIndex = findRowIndex(vRows, prevSibling.ck)
      const lastChild = findLastDirectChild(vRows, prevSiblingIndex)

      void reparentRow(props.matrixId, copyKey(row.key)!, {
        newParentKey: copyKey(prevSibling.key),
        prevSiblingKey: copyKey(lastChild?.key),
      }).then(() => {
        requestFocus(ck, 'start')
      })
    },

    onOutdent: () => {
      const vRows = visibleRows()
      const index = findRowIndex(vRows, ck)
      if (index === -1) return
      const row = vRows[index]!
      if (!isPlainWorkspaceRow(row)) return

      const parentRow = findParentRow(vRows, index)
      if (!parentRow) return

      const grandparentIndex = findRowIndex(vRows, parentRow.ck)
      const grandparent = findParentRow(vRows, grandparentIndex)
      const newParentKey =
        grandparent ? copyKey(grandparent.key) : resolveParentKey(vRows, grandparentIndex)

      void reparentRow(props.matrixId, copyKey(row.key)!, {
        newParentKey,
        prevSiblingKey: copyKey(parentRow.key),
      })
        .then(() => {
          requestFocus(ck, 'start')
        })
        .catch((err: unknown) => {
          console.error('onOutdent reparentRow failed:', err)
        })
    },

    onArrowUp: () => {
      const vRows = visibleRows()
      const index = findRowIndex(vRows, ck)
      if (index <= 0) return
      const prevRow = vRows[index - 1]!
      requestFocus(prevRow.ck, 'end')
    },

    onArrowDown: () => {
      const vRows = visibleRows()
      const index = findRowIndex(vRows, ck)
      if (index === -1 || index >= vRows.length - 1) return
      const nextRow = vRows[index + 1]!
      requestFocus(nextRow.ck, 'start')
    },

    onInsertLink: () => {},

    onToggleCollapse: () => {
      const vRows = visibleRows()
      const index = findRowIndex(vRows, ck)
      if (index === -1) return
      const row = vRows[index]!
      if (row.has_children === 1) toggleCollapse(row.key)
    },

    onShiftEnter: () => {
      const vRows = visibleRows()
      const index = findRowIndex(vRows, ck)
      if (index === -1) return
      if (!isPlainWorkspaceRow(vRows[index]!)) return
      expandAndFocusContent(ck)
    },

    onOpenFocus: () => {
      const vRows = visibleRows()
      const index = findRowIndex(vRows, ck)
      if (index === -1) return
      const row = vRows[index]!
      if (!isPlainWorkspaceRow(row)) return
      props.onOpenFocus(row.row_id, new Uint8Array(row.key))
    },
  })

  const depthOffset = focusDepthOffset

  const renderWindow = (windowProps: { windowIndex: number }) => {
    // eslint-disable-next-line solid/reactivity -- windowIndex is a static number from WindowComponent, not a reactive prop
    const wIdx = windowProps.windowIndex

    const startIdx = createMemo(() => {
      const range = pageData.loadedRange()
      const minPage = range ? range[0] : 0
      return (wIdx - minPage) * ROWS_PER_WINDOW
    })

    const windowRows = createMemo(() =>
      visibleRows().slice(startIdx(), startIdx() + ROWS_PER_WINDOW),
    )

    return (
      <>
        <Show when={debugFlags.pageBoundary()}>
          <PageBoundaryOverlay pageIndex={wIdx} rows={windowRows()} />
        </Show>
        <For each={windowRows()}>
          {(row, localI) => {
            const globalIdx = () => startIdx() + localI()
            const rowId = row.row_id
            const rowMatrixId = row.matrix_id
            const rowCk = row.ck
            const callbacks = makeCallbacks(rowCk)
            const isExpanded = () => expandedContentRows().has(rowCk)
            const isFocusTarget = () =>
              rowMatrixId === props.matrixId && props.focusedRowId === rowId
            const chip = chipFor(row)

            // Compact owned-aspect previews for host workspace rows (Phase 9.2):
            // key-field values per owned aspect, type-colored, click → focus.
            const previews = createMemo((): AspectPreview[] => {
              if (!isPlainWorkspaceRow(row)) return []
              const attachments = aspectsByHostCk[row.ck] ?? []
              return attachments.flatMap((a) => {
                const cols = colCache[a.target_matrix_id]
                if (!cols) return []
                const data = getHydratedData(a.target_matrix_id, a.target_row_id)
                const preview = buildAspectPreview(a.tag_type_name, cols, data)
                return preview.fields.length > 0 ? [preview] : []
              })
            })

            onCleanup(() => {
              unregisterHandle(rowCk)
              unregisterContentHandle(rowCk)
            })

            return (
              <div
                class="outline-row"
                data-row-id={rowId}
                data-row-ck={rowCk}
                data-depth={row.depth - depthOffset()}
                style={{
                  display: 'flex',
                  'align-items': 'flex-start',
                  position: 'relative',
                  opacity:
                    dragState()?.subtreeCks.has(rowCk) && dragState()?.activated ? 0.25 : 1,
                  transition: 'opacity 0.15s',
                  background: isFocusTarget() ? 'hsla(225, 60%, 50%, 0.08)' : undefined,
                }}
              >
                {/* Drag handle */}
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
                    startDrag(rowCk, e)
                  }}
                >
                  ⠿
                </div>

                {/* Row content: bullet + label + content preview */}
                <div style={{ flex: 1, 'min-width': 0 }}>
                  <DesignOutlineRow
                    theme={theme()}
                    row={flatRows()[globalIdx()]!}
                    decoration={decorations()[globalIdx()]!}
                    onToggle={toggleCollapseByHex}
                    renderContent={() => (
                      <div
                        style={{
                          display: 'flex',
                          'align-items': 'baseline',
                          gap: '6px',
                          flex: 1,
                          'min-width': 0,
                        }}
                      >
                        <Show when={chip}>
                          {(c) => (
                            <span
                              class="nav-row-type-chip"
                              data-testid="row-type-chip"
                              style={{
                                'flex-shrink': 0,
                                'font-size': '11px',
                                'font-weight': '600',
                                'line-height': '1.4',
                                padding: '0 6px',
                                'border-radius': '4px',
                                color: c().color,
                                background: tagBadgeBackground(c().color),
                              }}
                            >
                              {c().text}
                            </span>
                          )}
                        </Show>
                        <LabelEditor
                          rowId={rowId}
                          label={row.label ?? ''}
                          matrixId={rowMatrixId}
                          pageIndex={wIdx}
                          callbacks={callbacks}
                          onHandle={(handle) => registerHandle(rowCk, handle)}
                          onEditorFocus={() => setFocusedCk(rowCk)}
                        />
                        {/* Compact aspect preview chips (host workspace rows only) */}
                        <For each={previews()}>
                          {(preview) => (
                            <For each={preview.fields}>
                              {(f) => (
                                <span
                                  class="nav-row-property-chip"
                                  data-testid="nav-row-property-chip"
                                  title={`#${preview.tagName} · ${f.name}`}
                                  style={{
                                    'flex-shrink': 0,
                                    'font-size': '11px',
                                    'font-weight': '500',
                                    'line-height': '1.4',
                                    padding: '0 5px',
                                    'border-radius': '3px',
                                    color: preview.color,
                                    background: tagBadgeBackground(preview.color),
                                    cursor: 'pointer',
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    props.onOpenFocus(row.row_id, new Uint8Array(row.key))
                                  }}
                                >
                                  {f.value}
                                </span>
                              )}
                            </For>
                          )}
                        </For>
                      </div>
                    )}
                  />

                  {/* Content area: preview or expanded editor */}
                  <Show when={row.content || isExpanded()}>
                    <div
                      style={{
                        'padding-left': '20px',
                        'padding-right': '28px',
                      }}
                    >
                      <Show
                        when={isExpanded()}
                        fallback={
                          <div
                            class="nav-content-preview"
                            data-testid="content-preview"
                            style={{
                              'font-size': '13px',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              display: '-webkit-box',
                              '-webkit-line-clamp': '2',
                              '-webkit-box-orient': 'vertical',
                              overflow: 'hidden',
                              'padding-bottom': '2px',
                              'line-height': '1.4',
                            }}
                            onClick={() => expandAndFocusContent(rowCk)}
                          >
                            {extractTextFromPmDoc(row.content) || '\u00A0'}
                          </div>
                        }
                      >
                        <ContentInlineEditor
                          rowId={rowId}
                          content={row.content ?? EMPTY_CONTENT_JSON}
                          matrixId={rowMatrixId}
                          pageIndex={wIdx}
                          onHandle={(handle) => registerContentHandle(rowCk, handle)}
                          onFocus={() => setFocusedCk(rowCk)}
                        />
                      </Show>
                    </div>
                  </Show>
                </div>

                {/* Right-arrow button: open focus panel (workspace rows only;
                    boundary-hop drill-in for aspect rows is Phase 9.5) */}
                <Show when={isPlainWorkspaceRow(row)}>
                  <button
                    class="nav-row-open-focus"
                    data-testid="open-focus-btn"
                    aria-label="Open focus panel"
                    style={{
                      position: 'absolute',
                      right: '4px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      'font-size': '14px',
                      color: 'var(--text-muted)',
                      padding: '2px 4px',
                      'border-radius': '3px',
                      opacity: 0,
                      transition: 'opacity 0.15s, color 0.15s',
                    }}
                    onClick={() => props.onOpenFocus(row.row_id, new Uint8Array(row.key))}
                  >
                    →
                  </button>
                </Show>
              </div>
            )
          }}
        </For>
      </>
    )
  }

  return (
    <div class="navigation-panel" data-testid="navigation-panel">
      <Show when={error()}>
        <div style={{ color: '#f87171', padding: '8px', 'margin-bottom': '8px' }}>
          Query error: {error()?.message}
        </div>
      </Show>
      {/* Only the root panel carries a header (the editable workspace title).
          Embedded panels are locked to their focus panel's children and rely on
          the FocusPanel header + ancestry tabs for their title/context. */}
      <Show when={isRootPanel}>
        <div
          class="workspace-title-header"
          style={{ padding: '8px 12px 4px' }}
          data-testid="workspace-title"
        >
          <span
            class="label-heading workspace-title-editor"
            contentEditable={true}
            data-testid="workspace-title-editor"
            onBlur={(e) => {
              const newTitle = (e.currentTarget as HTMLSpanElement).textContent?.trim() ?? ''
              if (newTitle && newTitle !== matrixTitle()) {
                void renameMatrix(props.matrixId, newTitle)
              } else if (!newTitle) {
                ;(e.currentTarget as HTMLSpanElement).textContent = matrixTitle() || 'Workspace'
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                ;(e.currentTarget as HTMLSpanElement).blur()
              } else if (e.key === 'Escape') {
                ;(e.currentTarget as HTMLSpanElement).textContent = matrixTitle() || 'Workspace'
                ;(e.currentTarget as HTMLSpanElement).blur()
              }
            }}
          >
            {matrixTitle() || 'Workspace'}
          </span>
        </div>
      </Show>
      <Show
        when={visibleRows().length > 0}
        fallback={
          <div
            class="navigation-panel-empty"
            data-testid="navigation-panel-empty"
            tabindex="0"
            style={{
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center',
              'min-height': '200px',
              color: 'var(--text-muted)',
              'font-size': '15px',
              'font-style': 'italic',
              outline: 'none',
              cursor: 'text',
            }}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void insertRow(props.matrixId, {
                  values: { label: EMPTY_LABEL_JSON, content: null },
                }).then(({ rowId: newRowId }) => {
                  requestFocus(compositeKey(props.matrixId, newRowId), 'start')
                })
              }
            }}
            ref={(el) => queueMicrotask(() => el.focus())}
          >
            Press Enter to create your first row.
          </div>
        }
      >
        <div class={outlineThemeClass(theme())} style={{ padding: 0, border: 'none' }}>
          <ScrollVirtualizer
            renderWindow={renderWindow}
            totalWindows={totalWindows()}
            minWindowHeight={ROWS_PER_WINDOW * ESTIMATED_ROW_HEIGHT_PX}
            onVisibleRangeChange={(range) => {
              if (range.size > 0) pageData.setNeededWindows(range)
            }}
          />
        </div>
      </Show>
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

      {/* Hover styles for right-arrow button */}
      <style>{`
        .outline-row:hover .nav-row-open-focus {
          opacity: 0.5 !important;
        }
        .outline-row:hover .nav-row-open-focus:hover {
          opacity: 1 !important;
          color: var(--accent) !important;
        }
        .outline-row:focus-within .nav-row-open-focus {
          opacity: 0.5 !important;
        }
      `}</style>
    </div>
  )
}

export default NavigationPanel
