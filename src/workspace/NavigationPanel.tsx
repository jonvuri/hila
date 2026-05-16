import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from 'solid-js'
import { Slice } from 'prosemirror-model'
import type { Node as PmNode } from 'prosemirror-model'
import { EditorView } from 'prosemirror-view'
import {
  Selection,
  TextSelection,
  type Plugin as StatePlugin,
  Command,
} from 'prosemirror-state'
import { ProsemirrorAdapterProvider, useNodeViewFactory } from '@prosemirror-adapter/solid'
import { keymap } from 'prosemirror-keymap'
import {
  chainCommands,
  toggleMark,
  newlineInCode,
  createParagraphNear,
} from 'prosemirror-commands'
import 'prosemirror-view/style/prosemirror.css'

import { debugFlags, logPmMount, logPmUnmount, logPmContentSync } from '../debug/debugState'
import MutationLogOverlay from '../debug/MutationLogOverlay'
import PageBoundaryOverlay from '../debug/PageBoundaryOverlay'
import { insertRow, deleteRow, reparentRow, updateRow } from '../core/client/matrix-client'
import { useQuery } from '../sql/useQuery'
import {
  OutlineRow as DesignOutlineRow,
  outlineThemeClass,
  computeDecorations,
} from '../design/outline/Outline'
import type { FlatRow, OutlineTheme } from '../design/outline/types'
import ScrollVirtualizer from '../virtualizer/ScrollVirtualizer'
import type { OutlineCallbacks } from '../editor/keymap'
import { createEditorState } from '../editor/createEditorState'
import { schema } from '../editor/schema'
import { extractTextFromPmDoc } from '../editor/pm-text'
import { ParagraphView } from '../editor/nodeviews/ParagraphView'
import { HeadingView } from '../editor/nodeviews/HeadingView'
import { InlineRefView } from '../editor/nodeviews/InlineRefView'
import { createInlinerefPlugin } from '../editor/inlineref-plugin'
import { syncInlineRefs, refreshCachedTitles } from '../editor/inlineref-sync'
import { createTagSearchProvider, handleTagSelection } from '../tags/tag-search-provider'
import { computeDropTarget, isNoOpDrop, type DropTargetVisual } from '../outline/drag-drop'

import { buildBreadcrumbQuery } from './workspace-plugin'
import {
  usePagedWorkspaceData,
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

type BreadcrumbData = {
  key: Uint8Array
  row_id: number
  label: string
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

const findRowIndex = (rows: WorkspaceRowData[], rowId: number): number =>
  rows.findIndex((r) => r.row_id === rowId)

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
// Content editor extra keymap (for expanded content preview)
// ---------------------------------------------------------------------------

const hardBreakCmd: Command = (state, dispatch) => {
  const br = schema.nodes.hard_break!
  dispatch?.(state.tr.replaceSelectionWith(br.create()).scrollIntoView())
  return true
}

const contentEditorKeymap: StatePlugin = keymap({
  'Shift-Enter': chainCommands(newlineInCode, createParagraphNear, hardBreakCmd),
  'Mod-b': toggleMark(schema.marks.bold!),
  'Mod-i': toggleMark(schema.marks.italic!),
  'Mod-e': toggleMark(schema.marks.code!),
})

// ---------------------------------------------------------------------------
// Label editor (ProseMirror with outline keybindings)
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
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let pendingDoc: PmNode | undefined

  const saveWithInlineRefs = async (doc: PmNode) => {
    const docJson = await refreshCachedTitles(doc.toJSON() as Record<string, unknown>)
    void updateRow(props.matrixId, props.rowId, { label: JSON.stringify(docJson) })
    void syncInlineRefs(doc, props.matrixId, props.rowId)
  }

  const debouncedSave = (doc: PmNode) => {
    pendingDoc = doc
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (pendingDoc !== undefined) {
        const d = pendingDoc
        pendingDoc = undefined
        void saveWithInlineRefs(d)
      }
    }, SAVE_DEBOUNCE_MS)
  }

  const flushSave = () => {
    clearTimeout(saveTimer)
    if (pendingDoc !== undefined) {
      const d = pendingDoc
      pendingDoc = undefined
      void saveWithInlineRefs(d)
    }
  }

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
    flushSave,
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
    const state = createEditorState(docJson, props.callbacks, extraPlugins)

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
          props.onEditorFocus?.()
          return false
        },
      },
      nodeViews,
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr)
        view.updateState(newState)
        if (tr.docChanged) {
          debouncedSave(newState.doc)
        }
      },
    })

    editorView = view
    logPmMount(props.rowId, props.pageIndex)
    props.onHandle?.(handle)
  }

  onCleanup(() => {
    flushSave()
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
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let pendingDoc: PmNode | undefined

  const saveWithInlineRefs = async (doc: PmNode) => {
    const docJson = await refreshCachedTitles(doc.toJSON() as Record<string, unknown>)
    void updateRow(props.matrixId, props.rowId, { content: JSON.stringify(docJson) })
    void syncInlineRefs(doc, props.matrixId, props.rowId)
  }

  const debouncedSave = (doc: PmNode) => {
    pendingDoc = doc
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (pendingDoc !== undefined) {
        const d = pendingDoc
        pendingDoc = undefined
        void saveWithInlineRefs(d)
      }
    }, SAVE_DEBOUNCE_MS)
  }

  const flushSave = () => {
    clearTimeout(saveTimer)
    if (pendingDoc !== undefined) {
      const d = pendingDoc
      pendingDoc = undefined
      void saveWithInlineRefs(d)
    }
  }

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
    flushSave,
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
      contentEditorKeymap,
    ]
    const state = createEditorState(docJson, undefined, extraPlugins)

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
          debouncedSave(newState.doc)
        }
      },
    })

    editorView = view
    props.onHandle?.(handle)
  }

  onCleanup(() => {
    flushSave()
    editorView?.destroy()
  })

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

  // Focus view state: rank key of the subtree root
  const initialRoot = props.rootKey ? new Uint8Array(props.rootKey) : null // eslint-disable-line solid/reactivity -- stable for component lifetime
  const [focusRoot, setFocusRoot] = createSignal<Uint8Array | null>(initialRoot)

  const focusRootHex = createMemo(() => {
    const root = focusRoot()
    return root ? keyToHex(root) : null
  })

  const [collapsedKeys, setCollapsedKeys] = createSignal<Set<string>>(new Set())

  // Expanded content editors (rows where the content preview has been expanded)
  const [expandedContentRows, setExpandedContentRows] = createSignal<Set<number>>(new Set())

  const matrixId = props.matrixId // eslint-disable-line solid/reactivity -- stable for component lifetime
  const pageData = usePagedWorkspaceData({
    matrixId,
    focusRootHex,
    collapsedKeyHexes: () => Array.from(collapsedKeys()),
  })

  const error = pageData.error
  const rows = pageData.rows

  // Breadcrumb query
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

  const focusRootRow = () => pageData.focusRootRow()

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

  const [focusedRowId, setFocusedRowId] = createSignal<number | null>(null)
  const [pendingFocus, setPendingFocus] = createSignal<{
    rowId: number
    pos?: number | 'start' | 'end'
  } | null>(null)
  const handleMap = new Map<number, EditorHandle>()

  const registerHandle = (rowId: number, handle: EditorHandle) => {
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
    const vRows = visibleRows()
    if (vRows.length > 0 && focusedRowId() === null) {
      requestFocus(vRows[0]!.row_id, 'start')
    }
  })

  // -----------------------------------------------------------------------
  // Content editor focus management
  // -----------------------------------------------------------------------

  const contentHandleMap = new Map<number, ContentEditorHandle>()
  const [pendingContentFocus, setPendingContentFocus] = createSignal<number | null>(null)

  const registerContentHandle = (rowId: number, handle: ContentEditorHandle) => {
    contentHandleMap.set(rowId, handle)
    if (pendingContentFocus() === rowId) {
      setPendingContentFocus(null)
      queueMicrotask(() => handle.focus('start'))
    }
  }

  const unregisterContentHandle = (rowId: number) => {
    contentHandleMap.delete(rowId)
  }

  const expandAndFocusContent = (rowId: number) => {
    setExpandedContentRows((prev) => {
      const next = new Set(prev)
      next.add(rowId)
      return next
    })
    const existing = contentHandleMap.get(rowId)
    if (existing) {
      queueMicrotask(() => existing.focus('start'))
    } else {
      setPendingContentFocus(rowId)
    }
  }

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
  // Keyboard interaction callbacks
  // -----------------------------------------------------------------------

  const resolveParentKey = (
    vRows: WorkspaceRowData[],
    index: number,
  ): Uint8Array | undefined => {
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
        void insertRow(props.matrixId, {
          parentKey,
          prevKey: copyKey(row.key),
          values: { label: EMPTY_LABEL_JSON, content: null },
        }).then(({ rowId: newRowId }) => {
          requestFocus(newRowId, 'start')
        })
      } else {
        const pos = from
        const afterDoc = doc.cut(pos)
        const afterValue = JSON.stringify(afterDoc.toJSON())

        const tr = view.state.tr.replace(pos, doc.content.size, Slice.empty)
        view.dispatch(tr)

        const handle = handleMap.get(rowId)
        handle?.flushSave()

        void insertRow(props.matrixId, {
          parentKey,
          prevKey: copyKey(row.key),
          values: { label: afterValue, content: null },
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
        void deleteRow(props.matrixId, row.row_id).then(() => {
          requestFocus(targetRowId, 'end')
        })
      } else if (isEmpty && hasChildren) {
        const firstChild = findFirstChild(vRows, index)
        const targetRowId = firstChild?.row_id ?? prevRow.row_id
        void deleteRow(props.matrixId, row.row_id).then(() => {
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

        void deleteRow(props.matrixId, row.row_id).then(() => {
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
        setFocusRoot(initialRoot)
        return
      }
      const parent = crumbs[crumbs.length - 1]!
      setFocusRoot(new Uint8Array(parent.key))
    },

    onShiftEnter: () => {
      expandAndFocusContent(rowId)
    },

    onOpenFocus: () => {
      const vRows = visibleRows()
      const index = findRowIndex(vRows, rowId)
      if (index === -1) return
      const row = vRows[index]!
      props.onOpenFocus(row.row_id, new Uint8Array(row.key))
    },
  })

  // Build a lookup from hex key → row for zoom-in from the design row
  const hexToRow = createMemo(() => {
    const map = new Map<string, WorkspaceRowData>()
    for (const row of visibleRows()) {
      map.set(keyToHex(row.key), row)
    }
    return map
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
            const callbacks = makeCallbacks(rowId)
            const isExpanded = () => expandedContentRows().has(rowId)
            const isFocusTarget = () => props.focusedRowId === rowId

            onCleanup(() => {
              unregisterHandle(rowId)
              unregisterContentHandle(rowId)
            })

            return (
              <div
                class="outline-row"
                data-row-id={rowId}
                data-depth={row.depth - depthOffset()}
                style={{
                  display: 'flex',
                  'align-items': 'flex-start',
                  position: 'relative',
                  opacity:
                    dragState()?.subtreeRowIds.has(rowId) && dragState()?.activated ? 0.25 : 1,
                  transition: 'opacity 0.15s',
                  background: isFocusTarget() ? 'rgba(37, 99, 235, 0.06)' : undefined,
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
                    startDrag(rowId, e)
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
                    onZoomIn={(hexKey) => {
                      const r = hexToRow().get(hexKey)
                      if (r) setFocusRoot(new Uint8Array(r.key))
                    }}
                    renderContent={() => (
                      <LabelEditor
                        rowId={rowId}
                        label={row.label ?? ''}
                        matrixId={props.matrixId}
                        pageIndex={wIdx}
                        callbacks={callbacks}
                        onHandle={(handle) => registerHandle(rowId, handle)}
                        onEditorFocus={() => setFocusedRowId(rowId)}
                      />
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
                              color: '#888',
                              cursor: 'pointer',
                              display: '-webkit-box',
                              '-webkit-line-clamp': '2',
                              '-webkit-box-orient': 'vertical',
                              overflow: 'hidden',
                              'padding-bottom': '2px',
                              'line-height': '1.4',
                            }}
                            onClick={() => expandAndFocusContent(rowId)}
                          >
                            {extractTextFromPmDoc(row.content) || '\u00A0'}
                          </div>
                        }
                      >
                        <ContentInlineEditor
                          rowId={rowId}
                          content={row.content ?? EMPTY_CONTENT_JSON}
                          matrixId={props.matrixId}
                          pageIndex={wIdx}
                          onHandle={(handle) => registerContentHandle(rowId, handle)}
                          onFocus={() => setFocusedRowId(rowId)}
                        />
                      </Show>
                    </div>
                  </Show>
                </div>

                {/* Right-arrow button: open focus panel */}
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
                    color: '#bbb',
                    padding: '2px 4px',
                    'border-radius': '3px',
                    opacity: 0,
                    transition: 'opacity 0.15s, color 0.15s',
                  }}
                  onClick={() => props.onOpenFocus(row.row_id, new Uint8Array(row.key))}
                >
                  →
                </button>
              </div>
            )
          }}
        </For>
      </>
    )
  }

  // Home target for breadcrumb: rootKey or null
  const goHome = () => setFocusRoot(initialRoot)

  return (
    <div class="navigation-panel" data-testid="navigation-panel">
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
            onClick={goHome}
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
                  {extractTextFromPmDoc(crumb.label)}
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
                  {extractTextFromPmDoc(rootRow().label)}
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
          {focusRootRow() ? extractTextFromPmDoc(focusRootRow()!.label) : ''}
        </div>
      </Show>
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
          color: #2563eb !important;
        }
        .outline-row:focus-within .nav-row-open-focus {
          opacity: 0.5 !important;
        }
      `}</style>
    </div>
  )
}

export default NavigationPanel
