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
import { Selection, type Plugin as StatePlugin } from 'prosemirror-state'
import { ProsemirrorAdapterProvider, useNodeViewFactory } from '@prosemirror-adapter/solid'
import { keymap } from 'prosemirror-keymap'
import { toggleMark } from 'prosemirror-commands'
import 'prosemirror-view/style/prosemirror.css'

import { updateRow, getColumns } from '../core/client/matrix-client'
import type { ColumnDefinition } from '../core/matrix'
import { useQuery } from '../sql/useQuery'
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
import { syncInlineRefs, refreshCachedTitles } from '../editor/inlineref-sync'
import { createTagSearchProvider, handleTagSelection } from '../tags/tag-search-provider'
import { FieldEditor } from '../shared/FieldEditor'

import { buildSingleRowQuery, buildBacklinksQuery } from './workspace-plugin'

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
  matrixId: number
  rowId: number
  rowKey: Uint8Array
  onAppendFocus: (rowId: number, key: Uint8Array) => void
  onReplaceFocus: (rowId: number, key: Uint8Array) => void
  onClose: () => void
}

type RowData = Record<string, unknown> & {
  id: number
  label: string | null
  content: string | null
  row_kind?: number
}

type BacklinkData = {
  id: number
  kind: string
  label: string | null
}

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
  onEscape: () => void
}

const FocusLabelEditorInner = (props: FocusLabelEditorProps) => {
  const nodeViewFactory = useNodeViewFactory()
  let editorView: EditorView | undefined

  const saveHandle = createDebouncedSave((doc) => {
    const docJson = doc.toJSON() as Record<string, unknown>
    void refreshCachedTitles(docJson).then((updated) => {
      void updateRow(props.matrixId, props.rowId, { label: JSON.stringify(updated) })
    })
    void syncInlineRefs(doc, props.matrixId, props.rowId)
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
  }

  onCleanup(() => {
    saveHandle.destroy()
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
      class="focus-label-editor"
      data-testid="focus-label-editor"
      ref={(el) => mountEditor(el)}
      style={{
        'font-size': '24px',
        'font-weight': 600,
        color: 'var(--text-primary)',
        'line-height': '1.3',
        'padding-bottom': '4px',
      }}
    />
  )
}

const FocusLabelEditor = (props: FocusLabelEditorProps) => (
  <ProsemirrorAdapterProvider>
    <FocusLabelEditorInner
      rowId={props.rowId}
      label={props.label}
      matrixId={props.matrixId}
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
  onEscape: () => void
}

const FocusContentEditorInner = (props: FocusContentEditorProps) => {
  const nodeViewFactory = useNodeViewFactory()
  let editorView: EditorView | undefined

  const saveHandle = createDebouncedSave((doc) => {
    const docJson = doc.toJSON() as Record<string, unknown>
    void refreshCachedTitles(docJson).then((updated) => {
      void updateRow(props.matrixId, props.rowId, { content: JSON.stringify(updated) })
    })
    void syncInlineRefs(doc, props.matrixId, props.rowId)
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

    queueMicrotask(() => {
      view.focus()
      const selection = Selection.atEnd(view.state.doc)
      view.dispatch(view.state.tr.setSelection(selection))
    })
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

  // Backlinks query
  const backlinksQuery = createMemo(() => buildBacklinksQuery(props.matrixId, props.rowId))
  const { result: backlinksResult } = useQuery(() => backlinksQuery())

  const backlinks = createMemo((): BacklinkData[] => {
    const data = backlinksResult()
    if (!data || data.length === 0) return []
    return data as unknown as BacklinkData[]
  })

  const [backlinksOpen, setBacklinksOpen] = createSignal(false)

  // Overflow columns
  const [overflowColumns, setOverflowColumns] = createSignal<ColumnDefinition[]>([])
  const [overflowValues, setOverflowValues] = createSignal<Record<string, string>>({})

  createEffect(() => {
    void getColumns(props.matrixId).then((cols) => {
      const coreNames = new Set(['label', 'content'])
      setOverflowColumns(cols.filter((c) => !coreNames.has(c.name)))
    })
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

  // Children: check if the row has children via closure
  const childCountQuery = createMemo(() => {
    return `SELECT COUNT(*) as cnt FROM "mx_${props.matrixId}_closure" WHERE ancestor_key = (SELECT key FROM rank WHERE matrix_id = ${props.matrixId} AND row_id = ${props.rowId}) AND depth = 1`
  })
  const { result: childCountResult } = useQuery(() => childCountQuery())
  const hasChildren = createMemo(() => {
    const data = childCountResult()
    if (!data || data.length === 0) return false
    return (data[0] as { cnt: number }).cnt > 0
  })

  const isChildMatrixRef = createMemo(() => {
    const data = rowData()
    return data?.row_kind === 1
  })

  return (
    <div
      class="focus-panel"
      data-testid="focus-panel"
      style={{
        display: 'flex',
        'flex-direction': 'column',
        height: '100%',
        overflow: 'auto',
        'min-width': '360px',
        'background-color': 'var(--card-focused-bg)',
      }}
    >
      <div style={{ padding: '16px 24px', flex: 1, overflow: 'auto' }}>
        <Show
          when={rowData()}
          fallback={
            <div style={{ padding: '16px', color: 'var(--text-muted)' }}>Loading...</div>
          }
        >
          {(data) => (
            <Show
              when={!isChildMatrixRef()}
              fallback={
                <div data-testid="focus-child-matrix-ref" style={{ padding: '8px' }}>
                  <div
                    style={{
                      color: 'var(--text-muted)',
                      'font-size': '13px',
                      'margin-bottom': '8px',
                    }}
                  >
                    Child matrix reference (row_kind=1). Table face would render here.
                  </div>
                </div>
              }
            >
              {/* Label section */}
              <div
                class="focus-panel-label"
                data-testid="focus-panel-label"
                style={{ 'margin-bottom': '12px' }}
              >
                <FocusLabelEditor
                  rowId={props.rowId}
                  label={data().label ?? ''}
                  matrixId={props.matrixId}
                  onEscape={props.onClose}
                />
              </div>

              {/* Content section */}
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
                  when={data().content}
                  fallback={
                    <ContentPlaceholder
                      rowId={props.rowId}
                      matrixId={props.matrixId}
                      onEscape={props.onClose}
                    />
                  }
                >
                  <FocusContentEditor
                    rowId={props.rowId}
                    content={data().content!}
                    matrixId={props.matrixId}
                    onEscape={props.onClose}
                  />
                </Show>
              </div>

              {/* Overflow columns section */}
              <Show when={overflowColumns().length > 0}>
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
                            onClick={() => props.onReplaceFocus(bl.id, new Uint8Array())}
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
              <div
                class="focus-panel-children"
                data-testid="focus-panel-children"
                style={{
                  'border-top': '1px solid hsl(230, 15%, 18%)',
                  'padding-top': '12px',
                  flex: 1,
                  'min-height': '120px',
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
                  Children
                </div>
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
                      rootKey={props.rowKey}
                      onOpenFocus={props.onAppendFocus}
                    />
                  </Suspense>
                </Show>
              </div>
            </Show>
          )}
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
            void updateRow(props.matrixId, props.rowId, { content: EMPTY_CONTENT_JSON })
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
        onEscape={props.onEscape}
      />
    </Show>
  )
}

export default FocusPanel
