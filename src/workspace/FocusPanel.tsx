import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  Show,
  Suspense,
  lazy,
} from 'solid-js'
import { EditorView } from 'prosemirror-view'
import { Selection, TextSelection, type Plugin as StatePlugin } from 'prosemirror-state'
import { ProsemirrorAdapterProvider, useNodeViewFactory } from '@prosemirror-adapter/solid'
import { keymap } from 'prosemirror-keymap'
import { toggleMark } from 'prosemirror-commands'
import 'prosemirror-view/style/prosemirror.css'

import { deleteViewBlock, updateRow, getColumns } from '../core/client/matrix-client'
import type { ColumnDefinition } from '../core/matrix'
import { useQuery } from '../sql/useQuery'
import { filterIntrinsicOverflowColumns } from '../shared/property-surface'
import {
  createLabelEditorState,
  createContentEditorState,
  createDebouncedSave,
  labelSchema,
} from '../editor/editor-setup'
import { extractTextFromPmDoc } from '../editor/pm-text'
import { ParagraphView } from '../editor/nodeviews/ParagraphView'
import { HeadingView } from '../editor/nodeviews/HeadingView'
import { InlineRefView } from '../editor/nodeviews/InlineRefView'
import { createInlinerefPlugin } from '../editor/inlineref-plugin'
import { createSlashPlugin } from '../editor/slash-plugin'
import { registerActiveEditor } from '../editor/active-editor'
import {
  syncInlineRefs,
  extractInlineRefsFromStored,
  refreshCachedTitles,
  extractInlineRefsFromJson,
} from '../editor/inlineref-sync'
import { createTagSearchProvider, handleTagSelection } from '../tags/tag-search-provider'
import { FieldEditor } from '../shared/FieldEditor'
import type { NavigationOutlineVariant } from '../design/tokens'
import { FaceHostSlot } from '../core/face-runtime'
import type { FaceRecipe, ViewSubject } from '../core/face-types'

import SubstrateRegion from './SubstrateRegion'
import { registerViewCollectionRendering } from './QueryBand'
import {
  buildSingleRowQuery,
  buildBacklinksQuery,
  buildChildCountQuery,
} from './workspace-plugin'
import { buildViewSourceQuery } from './block-marker-queries'
import {
  consumeGeneratedViewNameFocus,
  hasGeneratedViewNameFocusRequest,
} from './pending-view-name-focus'

export { requestGeneratedViewNameFocus } from './pending-view-name-focus'

const NavigationPanel = lazy(() => import('./NavigationPanel'))

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SAVE_DEBOUNCE_MS = 300

const EMPTY_CONTENT_JSON = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph' }],
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FocusPanelProps = {
  rootMatrixId: number
  matrixId: number
  rowId: number
  rowKey: Uint8Array
  navigationOutline?: NavigationOutlineVariant
  // Phase 9.7 Stage C3: this panel was opened by drilling into a folded block
  // row's real position, not a plain boundary hop — shows a small notice so
  // the jump to a (possibly structurally unrelated) real position is legible.
  foldedOrigin?: boolean
  // No live position was found for the row at all — `rowKey` is a placeholder;
  // the children section shows an intentional empty state instead of scoping
  // the nested outline to it.
  unresolvedPosition?: boolean
  // Boundary-hop aware (Phase 9.5): focus callbacks carry the target row's matrix.
  onAppendFocus: (matrixId: number, rowId: number, key: Uint8Array, label?: string) => void
  onReplaceFocus: (matrixId: number, rowId: number, key: Uint8Array, label?: string) => void
  // Drill into a row known only by `(matrixId, rowId)` (no rank key in hand yet):
  // the stack resolves the key and appends a focus panel. Used by the embedded
  // sub-table boundary-hop drill-in.
  onOpenRowRef: (matrixId: number, rowId: number) => void
  // Same shape, but resolves via identity (Stage C3) for a folded child row of
  // this panel's own children section.
  onOpenFoldedFocus: (matrixId: number, rowId: number) => void
  onLabelResolved?: (label: string) => void
  onClose: () => void
  // Every focus panel shows a prominent header. On the active (rightmost) panel
  // the header is an editable title; on non-active panels the whole header is a
  // clickable collapse target (with an integrated chevron) that closes deeper
  // panels and makes this one active. Defaults to active when omitted.
  active?: boolean
  // Collapse everything to the right of this panel, making it the active one.
  onCollapse?: () => void
}

type RowData = Record<string, unknown> & {
  id: number
  label: string | null
  content: string | null
}

type BacklinkData = {
  id: number
  kind: string
  label: string | null
}

type ViewSourceData = {
  marker_matrix_id: number
  marker_row_id: number
  sql: string
}

const SUBSTRATE_COLLECTION_RECIPE: FaceRecipe = {
  faceTypeId: 'hila.substrate',
  slotBindings: {},
  settings: {},
}

registerViewCollectionRendering(SUBSTRATE_COLLECTION_RECIPE.faceTypeId)

// ---------------------------------------------------------------------------
// Focus panel keymaps (Escape to close, schema-aware marks)
// ---------------------------------------------------------------------------

const buildContentKeymap = (onEscape: () => void): StatePlugin =>
  keymap({
    Escape: () => {
      onEscape()
      return true
    },
  })

const buildLabelKeymap = (onEscape: () => void): StatePlugin =>
  keymap({
    Enter: () => true,
    'Mod-b': toggleMark(labelSchema.marks.bold!),
    'Mod-i': toggleMark(labelSchema.marks.italic!),
    'Mod-e': toggleMark(labelSchema.marks.code!),
    Escape: () => {
      onEscape()
      return true
    },
  })

// ---------------------------------------------------------------------------
// Focus panel label editor (large header, single-line PM)
// ---------------------------------------------------------------------------

type FocusLabelEditorProps = {
  rowId: number
  label: string
  matrixId: number
  // The label-role column this header writes to (Phase 9.5 role-adaptive far side):
  // `label` for the workspace matrix, but e.g. `title` for a sub-table.
  column: string
  onEscape: () => void
}

const FocusLabelEditorInner = (props: FocusLabelEditorProps) => {
  const nodeViewFactory = useNodeViewFactory()
  let editorView: EditorView | undefined
  let unregisterActiveEditor: (() => void) | undefined
  let pendingNameFocusFrame: number | undefined

  const saveHandle = createDebouncedSave((doc) => {
    const docJson = doc.toJSON() as Record<string, unknown>
    void refreshCachedTitles(docJson).then((updated) => {
      void updateRow(props.matrixId, props.rowId, { [props.column]: JSON.stringify(updated) })
    })
    void syncInlineRefs(
      doc,
      props.matrixId,
      props.rowId,
      extractInlineRefsFromStored(props.label),
    )
  }, SAVE_DEBOUNCE_MS)

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
      createSlashPlugin({
        matrixId: props.matrixId,
        rowIdAccessor: () => props.rowId,
      }),
      buildLabelKeymap(props.onEscape),
    ]
    const state = createLabelEditorState(docJson, undefined, extraPlugins)

    const view = new EditorView(el, {
      state,
      nodeViews: {
        paragraph: nodeViewFactory({
          component: ParagraphView,
          as: 'div',
          contentAs: 'p',
        }),
        inlineref: nodeViewFactory({
          component: InlineRefView,
          as: 'span',
        }),
      },
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr)
        view.updateState(newState)
        if (tr.docChanged) {
          saveHandle.schedule(newState.doc)
        }
      },
    })

    editorView = view

    const marker = { matrixId: props.matrixId, rowId: props.rowId }
    if (hasGeneratedViewNameFocusRequest(marker)) {
      const focusGeneratedName = (): void => {
        if (view.isDestroyed || !hasGeneratedViewNameFocusRequest(marker)) return
        view.focus()
        view.dispatch(
          view.state.tr.setSelection(
            TextSelection.create(view.state.doc, 1, view.state.doc.content.size - 1),
          ),
        )
        pendingNameFocusFrame = requestAnimationFrame(() => {
          if (view.isDestroyed || !hasGeneratedViewNameFocusRequest(marker)) return
          if (view.hasFocus()) consumeGeneratedViewNameFocus(marker)
          else focusGeneratedName()
        })
      }
      pendingNameFocusFrame = requestAnimationFrame(focusGeneratedName)
    }
    unregisterActiveEditor = registerActiveEditor(view, {
      matrixId: props.matrixId,
      rowId: props.rowId,
    })
  }

  onCleanup(() => {
    saveHandle.destroy()
    if (pendingNameFocusFrame !== undefined) cancelAnimationFrame(pendingNameFocusFrame)
    unregisterActiveEditor?.()
    editorView?.destroy()
  })

  createEffect(
    on(
      () => props.label,
      (newLabel) => {
        if (!editorView) return
        const currentDoc = JSON.stringify(editorView.state.doc.toJSON())
        if (currentDoc !== newLabel && !editorView.hasFocus()) {
          let docJson: unknown | undefined
          if (newLabel) {
            docJson = JSON.parse(newLabel) as unknown
          }
          const newState = createLabelEditorState(docJson, undefined, [
            createInlinerefPlugin({
              matrixId: props.matrixId,
              rowIdAccessor: () => props.rowId,
              searchProvider: createTagSearchProvider(props.matrixId),
              onTagSelect: handleTagSelection,
            }),
            createSlashPlugin({
              matrixId: props.matrixId,
              rowIdAccessor: () => props.rowId,
            }),
            buildLabelKeymap(props.onEscape),
          ])
          editorView.updateState(newState)
        }
      },
      { defer: true },
    ),
  )

  return (
    <div
      class="focus-label-editor label-heading"
      data-testid="focus-label-editor"
      ref={(el) => mountEditor(el)}
    />
  )
}

const FocusLabelEditor = (props: FocusLabelEditorProps) => (
  <ProsemirrorAdapterProvider>
    <FocusLabelEditorInner
      rowId={props.rowId}
      label={props.label}
      matrixId={props.matrixId}
      column={props.column}
      onEscape={props.onEscape}
    />
  </ProsemirrorAdapterProvider>
)

// ---------------------------------------------------------------------------
// Focus panel content editor (full multi-paragraph PM)
// ---------------------------------------------------------------------------

type FocusContentEditorProps = {
  rowId: number
  content: string
  matrixId: number
  // The content-role column this body writes to (Phase 9.5 role-adaptive far side).
  column: string
  onEscape: () => void
}

const FocusContentEditorInner = (props: FocusContentEditorProps) => {
  const nodeViewFactory = useNodeViewFactory()
  let editorView: EditorView | undefined
  let unregisterActiveEditor: (() => void) | undefined

  const saveHandle = createDebouncedSave((doc) => {
    const docJson = doc.toJSON() as Record<string, unknown>
    void refreshCachedTitles(docJson).then((updated) => {
      void updateRow(props.matrixId, props.rowId, { [props.column]: JSON.stringify(updated) })
    })
    void syncInlineRefs(
      doc,
      props.matrixId,
      props.rowId,
      extractInlineRefsFromStored(props.content),
    )
  }, SAVE_DEBOUNCE_MS)

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
      createSlashPlugin({
        matrixId: props.matrixId,
        rowIdAccessor: () => props.rowId,
      }),
      buildContentKeymap(props.onEscape),
    ]
    const state = createContentEditorState(docJson, extraPlugins)

    const view = new EditorView(el, {
      state,
      nodeViews: {
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
      },
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr)
        view.updateState(newState)
        if (tr.docChanged) {
          saveHandle.schedule(newState.doc)
        }
      },
    })

    editorView = view
    unregisterActiveEditor = registerActiveEditor(view, {
      matrixId: props.matrixId,
      rowId: props.rowId,
    })

    queueMicrotask(() => {
      view.focus()
      const selection = Selection.atEnd(view.state.doc)
      view.dispatch(view.state.tr.setSelection(selection))
    })
  }

  onCleanup(() => {
    saveHandle.destroy()
    unregisterActiveEditor?.()
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
            createSlashPlugin({
              matrixId: props.matrixId,
              rowIdAccessor: () => props.rowId,
            }),
            buildContentKeymap(props.onEscape),
          ])
          editorView.updateState(newState)
        }
      },
      { defer: true },
    ),
  )

  return (
    <div
      class="focus-content-editor"
      data-testid="focus-content-editor"
      ref={(el) => mountEditor(el)}
      style={{
        'font-size': '15px',
        color: 'var(--text-dim)',
        'line-height': '1.6',
        'min-height': '100px',
      }}
    />
  )
}

const FocusContentEditor = (props: FocusContentEditorProps) => (
  <ProsemirrorAdapterProvider>
    <FocusContentEditorInner
      rowId={props.rowId}
      content={props.content}
      matrixId={props.matrixId}
      column={props.column}
      onEscape={props.onEscape}
    />
  </ProsemirrorAdapterProvider>
)

// ---------------------------------------------------------------------------
// FocusPanel
// ---------------------------------------------------------------------------

const FocusPanel = (props: FocusPanelProps) => {
  // Data loading: single-row query
  const rowQuery = createMemo(() => buildSingleRowQuery(props.matrixId, props.rowId))
  const { result: rowResult } = useQuery(() => rowQuery())

  const rowData = createMemo((): RowData | null => {
    const data = rowResult()
    if (!data || data.length === 0) return null
    return data[0] as unknown as RowData
  })

  const viewSourceQuery = createMemo(() => buildViewSourceQuery(props.matrixId, props.rowId))
  const { result: viewSourceResult } = useQuery(() => viewSourceQuery())
  const viewSource = createMemo((): ViewSourceData | null => {
    const data = viewSourceResult()
    return data?.[0] ? (data[0] as unknown as ViewSourceData) : null
  })
  const viewSubject = createMemo((): ViewSubject | null => {
    const source = viewSource()
    if (!source) return null
    return {
      mode: 'view',
      matrixId: source.marker_matrix_id,
      rowId: source.marker_row_id,
      sql: source.sql,
    }
  })

  // Backlinks query
  const backlinksQuery = createMemo(() => buildBacklinksQuery(props.matrixId, props.rowId))
  const { result: backlinksResult } = useQuery(() => backlinksQuery())

  const backlinks = createMemo((): BacklinkData[] => {
    const data = backlinksResult()
    if (!data || data.length === 0) return []
    return data as unknown as BacklinkData[]
  })

  const [backlinksOpen, setBacklinksOpen] = createSignal(false)

  // Columns: the full set (for role-adaptive label/content) and the intrinsic
  // overflow subset (the Properties strip).
  const [allColumns, setAllColumns] = createSignal<ColumnDefinition[]>([])
  const [columnsLoaded, setColumnsLoaded] = createSignal(false)
  const [overflowValues, setOverflowValues] = createSignal<Record<string, string>>({})

  createEffect(() => {
    setColumnsLoaded(false)
    void getColumns(props.matrixId).then((cols) => {
      setAllColumns(cols)
      setColumnsLoaded(true)
    })
  })

  const overflowColumns = createMemo(() => filterIntrinsicOverflowColumns(allColumns()))

  // Role-adaptive far side (Phase 9.5): resolve the label/content columns by role,
  // falling back to conventional names, so a foreign matrix (e.g. a sub-table `title`
  // column, or one with neither) renders and never writes to a nonexistent column.
  const labelCol = createMemo((): string | null => {
    const cols = allColumns()
    return (
      (cols.find((c) => c.role === 'label') ?? cols.find((c) => c.name === 'label'))?.name ??
      null
    )
  })
  const contentCol = createMemo((): string | null => {
    const cols = allColumns()
    return (
      (cols.find((c) => c.role === 'content') ?? cols.find((c) => c.name === 'content'))
        ?.name ?? null
    )
  })

  const labelValue = createMemo((): string => {
    const col = labelCol()
    const data = rowData()
    if (!col || !data) return ''
    return (data[col] as string | null) ?? ''
  })
  createEffect(() => {
    if (!rowData() || !columnsLoaded()) return
    props.onLabelResolved?.(extractTextFromPmDoc(labelValue()) || 'Untitled')
  })
  const contentValue = createMemo((): string | null => {
    const col = contentCol()
    const data = rowData()
    if (!col || !data) return null
    return (data[col] as string | null) ?? null
  })

  createEffect(
    on(
      () => rowData(),
      (data) => {
        if (!data) return
        const vals: Record<string, string> = {}
        for (const col of overflowColumns()) {
          vals[col.name] = String(data[col.name] ?? '')
        }
        setOverflowValues(vals)
      },
    ),
  )

  const handleOverflowChange = (colName: string, value: string) => {
    setOverflowValues((prev) => ({ ...prev, [colName]: value }))
    void updateRow(props.matrixId, props.rowId, { [colName]: value })
  }

  // Owned aspects render as an aspect band (Phase 9.2; see context/Phase-9.2.md).
  // Aspects whose `own`-join is materialized from an inline `#`-ref in this node's
  // prose are content-anchored: collect their keys from the label + content so the
  // band can tether them to their badge.
  const contentAnchoredKeys = createMemo((): Set<string> => {
    const keys = new Set<string>()
    if (!rowData()) return keys
    for (const field of [labelValue(), contentValue()]) {
      if (!field) continue
      let json: unknown
      try {
        json = JSON.parse(field)
      } catch {
        continue
      }
      for (const ref of extractInlineRefsFromJson(json)) {
        if (ref.kind === 'own') keys.add(`${ref.targetMatrixId}:${ref.targetRowId}`)
      }
    }
    return keys
  })

  // Children: check if the row has own-children (outline subtree). Counts across
  // matrixes (Phase 9.5) so a boundary-hop row's foreign-matrix children aren't missed.
  const childCountQuery = createMemo(() => buildChildCountQuery(props.matrixId, props.rowId))
  const { result: childCountResult } = useQuery(() => childCountQuery())
  const hasChildren = createMemo(() => {
    const data = childCountResult()
    if (!data || data.length === 0) return false
    return (data[0] as { cnt: number }).cnt > 0
  })

  return (
    <div
      class="focus-panel"
      data-testid="focus-panel"
      data-launcher-subject
      data-launcher-matrix-id={props.matrixId}
      data-launcher-row-id={props.rowId}
      data-launcher-provenance={Array.from(props.rowKey)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')}
      data-launcher-subject-label={extractTextFromPmDoc(labelValue()) || 'Untitled'}
      style={{
        display: 'flex',
        'flex-direction': 'column',
        height: '100%',
        overflow: 'hidden',
        'min-width': '360px',
        'background-color': 'var(--color-surface)',
      }}
    >
      <div
        style={{
          display: 'flex',
          'flex-direction': 'column',
          flex: 1,
          'min-height': 0,
          padding: '16px 24px',
          overflow: 'auto',
        }}
      >
        <Show
          when={rowData()}
          fallback={
            <div
              data-testid={rowResult() === null ? 'focus-loading' : 'focus-place-unavailable'}
              style={{ padding: '16px', color: 'var(--color-text-muted)' }}
            >
              {rowResult() === null ? 'Loading…' : 'This place is no longer available.'}
            </div>
          }
        >
          {
            <>
              {/* Phase 9.7 Stage C3: this panel was opened by drilling into a
                  folded block row — its real position may be structurally
                  unrelated to where it was rendered as folded, so flag the jump
                  (no existing breadcrumb mechanism tracks this discontinuity;
                  a fuller teleport-aware breadcrumb is a possible future
                  evolution if this notice proves insufficient). */}
              <Show when={props.foldedOrigin}>
                <div
                  data-testid="focus-panel-folded-origin"
                  style={{
                    'font-size': '11px',
                    color: 'var(--text-muted)',
                    'font-style': 'italic',
                    'padding-bottom': '6px',
                  }}
                >
                  Opened from a folded view — showing this row's real position.
                </div>
              </Show>

              {/* Label header. Active (rightmost) panel: an editable title.
                  Non-active panels: the same-looking header is a clickable
                  collapse target (with an integrated chevron) that closes deeper
                  panels and makes this one active. The collapse click does not
                  start editing; a later click (once active) does. */}
              <Show
                when={props.active !== false}
                fallback={
                  <button
                    type="button"
                    class="focus-panel-label focus-panel-label-collapse"
                    data-testid="focus-panel-label"
                    aria-label="Collapse to this panel"
                    onClick={() => props.onCollapse?.()}
                  >
                    <span class="label-heading focus-panel-collapse-title">
                      {extractTextFromPmDoc(labelValue()) || 'Untitled'}
                    </span>
                    <span class="focus-panel-collapse-chevron" aria-hidden="true">
                      ‹
                    </span>
                  </button>
                }
              >
                <div class="focus-panel-label" data-testid="focus-panel-label">
                  {/* Active panel: an editable title when the matrix has a label
                      column; otherwise a read-only identity header (Phase 9.5
                      role-adaptive far side — never write to a missing column). */}
                  <Show
                    when={labelCol()}
                    fallback={
                      <span class="label-heading focus-panel-collapse-title">
                        {extractTextFromPmDoc(labelValue()) || `Untitled (#${props.rowId})`}
                      </span>
                    }
                  >
                    {(col) => (
                      <FocusLabelEditor
                        rowId={props.rowId}
                        label={labelValue()}
                        matrixId={props.matrixId}
                        column={col()}
                        onEscape={props.onClose}
                      />
                    )}
                  </Show>
                </div>
              </Show>

              <Show when={viewSource()}>
                <section
                  aria-label="View collection"
                  data-testid="view-place-collection"
                  onKeyDown={(event) => {
                    if (event.defaultPrevented || event.key !== 'Escape') return
                    event.preventDefault()
                    props.onClose()
                  }}
                  style={{
                    display: 'flex',
                    'flex-direction': 'column',
                    gap: 'var(--space-control-gap)',
                    'margin-bottom': 'var(--space-section-gap)',
                  }}
                >
                  <div
                    data-testid="view-collection-host-chrome"
                    style={{
                      display: 'flex',
                      'align-items': 'center',
                      'justify-content': 'space-between',
                      gap: '8px',
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)', 'font-size': '12px' }}>
                      Collection
                    </span>
                    <button
                      type="button"
                      data-testid="query-band-delete"
                      aria-label="Delete view"
                      onClick={() => {
                        void deleteViewBlock(props.matrixId, props.rowId).then(props.onClose)
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--color-danger)',
                        'font-size': '13px',
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <FaceHostSlot
                    host="focus-panel"
                    kind="collection"
                    subject={viewSubject()!}
                    recipe={SUBSTRATE_COLLECTION_RECIPE}
                    rootMatrixId={props.rootMatrixId}
                    fidelity="substrate"
                    fallback={<div data-testid="view-collection-unavailable" />}
                  />
                </section>
              </Show>

              {/* Content section: only when the matrix has a content column. */}
              <Show when={!viewSource() && contentCol()}>
                {(col) => (
                  <div
                    class="focus-panel-content"
                    data-testid="focus-panel-content"
                    style={{
                      'margin-bottom': '16px',
                      'border-top': '1px solid hsl(230, 15%, 18%)',
                      'padding-top': '12px',
                      position: 'relative',
                    }}
                  >
                    <Show
                      when={contentValue()}
                      fallback={
                        <ContentPlaceholder
                          rowId={props.rowId}
                          matrixId={props.matrixId}
                          column={col()}
                          onEscape={props.onClose}
                        />
                      }
                    >
                      <FocusContentEditor
                        rowId={props.rowId}
                        content={contentValue()!}
                        matrixId={props.matrixId}
                        column={col()}
                        onEscape={props.onClose}
                      />
                    </Show>
                  </div>
                )}
              </Show>

              {/* Properties section: intrinsic overflow columns. The owned-aspect
                  half of the property surface renders as an aspect band (Phase 9.2). */}
              <Show when={!viewSource() && overflowColumns().length > 0}>
                <div
                  class="focus-panel-overflow"
                  data-testid="focus-panel-overflow"
                  style={{
                    'margin-bottom': '16px',
                    'border-top': '1px solid hsl(230, 15%, 18%)',
                    'padding-top': '12px',
                  }}
                >
                  <div
                    style={{
                      'font-size': '12px',
                      'font-weight': 600,
                      color: 'var(--text-muted)',
                      'text-transform': 'uppercase',
                      'letter-spacing': '0.5px',
                      'margin-bottom': '8px',
                    }}
                  >
                    Properties
                  </div>
                  <For each={overflowColumns()}>
                    {(col) => (
                      <FieldEditor
                        column={col}
                        value={overflowValues()[col.name] ?? ''}
                        onSave={(value) => handleOverflowChange(col.name, value)}
                      />
                    )}
                  </For>
                </div>
              </Show>

              {/* Substrate region (Phase 9.7 Stage C): the three former bands
                  (aspect / query / sub-table) unified into one mode-dispatching
                  region — loose owned aspects (per-cell editable, grid-coalesced,
                  with the portal / move-owner / two-tier-delete gestures), view
                  blocks, and dedicated containers. */}
              <Show when={!viewSource()}>
                <SubstrateRegion
                  rootMatrixId={props.rootMatrixId}
                  focalMatrixId={props.matrixId}
                  focalRowId={props.rowId}
                  contentAnchoredKeys={contentAnchoredKeys()}
                  onOpenRowRef={props.onOpenRowRef}
                />
              </Show>

              {/* Backlinks section */}
              <Show when={backlinks().length > 0}>
                <div
                  class="focus-panel-backlinks"
                  data-testid="focus-panel-backlinks"
                  style={{
                    'margin-bottom': '16px',
                    'border-top': '1px solid hsl(230, 15%, 18%)',
                    'padding-top': '12px',
                  }}
                >
                  <button
                    class="focus-backlinks-toggle"
                    data-testid="focus-backlinks-toggle"
                    onClick={() => setBacklinksOpen((o) => !o)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      'font-size': '13px',
                      color: 'var(--text-dim)',
                      padding: '4px 0',
                      display: 'flex',
                      'align-items': 'center',
                      gap: '4px',
                    }}
                  >
                    {backlinksOpen() ? '▾' : '▸'} Backlinks ({backlinks().length})
                  </button>
                  <Show when={backlinksOpen()}>
                    <div
                      class="focus-backlinks-list"
                      data-testid="focus-backlinks-list"
                      style={{ 'padding-left': '8px', 'margin-top': '4px' }}
                    >
                      <For each={backlinks()}>
                        {(bl) => (
                          <button
                            class="focus-backlink-item"
                            style={{
                              display: 'block',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              'font-size': '13px',
                              color: 'var(--accent)',
                              padding: '2px 0',
                              'text-align': 'left',
                              width: '100%',
                            }}
                            onClick={() =>
                              props.onReplaceFocus(
                                props.matrixId,
                                bl.id,
                                new Uint8Array(),
                                extractTextFromPmDoc(bl.label) || 'Untitled',
                              )
                            }
                          >
                            <span style={{ color: 'var(--text-muted)', 'margin-right': '4px' }}>
                              {bl.kind === 'own' ? '⊙' : '↗'}
                            </span>
                            {extractTextFromPmDoc(bl.label) || 'Untitled'}
                          </button>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </Show>

              {/* Children section */}
              <Show when={!viewSource()}>
                <div
                  class="focus-panel-children"
                  data-testid="focus-panel-children"
                  style={{
                    'border-top': '1px solid hsl(230, 15%, 18%)',
                    'padding-top': '12px',
                    flex: 1,
                    'min-height': '120px',
                    overflow: 'hidden',
                  }}
                >
                  <Show
                    when={!props.unresolvedPosition}
                    fallback={
                      <div
                        data-testid="focus-no-position"
                        style={{
                          color: 'var(--text-muted)',
                          'font-size': '13px',
                          'font-style': 'italic',
                          padding: '8px 0',
                        }}
                      >
                        This row isn't placed in the outline, so it has no separate children
                        view here.
                      </div>
                    }
                  >
                    <Show
                      when={hasChildren()}
                      fallback={
                        <div
                          data-testid="focus-no-children"
                          style={{
                            color: 'var(--text-muted)',
                            'font-size': '13px',
                            'font-style': 'italic',
                            padding: '8px 0',
                          }}
                        >
                          No children. Press Enter in the outline to add items.
                        </div>
                      }
                    >
                      <Suspense
                        fallback={
                          <div style={{ color: 'var(--text-muted)', padding: '8px' }}>
                            Loading children...
                          </div>
                        }
                      >
                        <NavigationPanel
                          matrixId={props.matrixId}
                          navigationOutline={props.navigationOutline}
                          rootKey={props.rowKey}
                          onOpenFocus={props.onAppendFocus}
                          onOpenFoldedFocus={props.onOpenFoldedFocus}
                        />
                      </Suspense>
                    </Show>
                  </Show>
                </div>
              </Show>
            </>
          }
        </Show>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Content placeholder (shown when content is null)
// ---------------------------------------------------------------------------

type ContentPlaceholderProps = {
  rowId: number
  matrixId: number
  column: string
  onEscape: () => void
}

const ContentPlaceholder = (props: ContentPlaceholderProps) => {
  const [editing, setEditing] = createSignal(false)

  return (
    <Show
      when={editing()}
      fallback={
        <div
          data-testid="focus-content-placeholder"
          style={{
            color: 'var(--text-muted)',
            'font-size': '15px',
            'font-style': 'italic',
            cursor: 'text',
            padding: '4px 0',
            'min-height': '24px',
          }}
          onClick={() => {
            void updateRow(props.matrixId, props.rowId, { [props.column]: EMPTY_CONTENT_JSON })
            setEditing(true)
          }}
        >
          Start writing...
        </div>
      }
    >
      <FocusContentEditor
        rowId={props.rowId}
        content={EMPTY_CONTENT_JSON}
        matrixId={props.matrixId}
        column={props.column}
        onEscape={props.onEscape}
      />
    </Show>
  )
}

export default FocusPanel
