import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
  type Component,
  For,
} from 'solid-js'
import { ProsemirrorAdapterProvider, useNodeViewFactory } from '@prosemirror-adapter/solid'
import { EditorView } from 'prosemirror-view'
import type { Node } from 'prosemirror-model'
import 'prosemirror-view/style/prosemirror.css'

import { updateRow, getColumns, insertRow, createRefJoin } from '../core/client/matrix-client'
import type { ColumnDefinition } from '../core/matrix'
import { useQuery } from '../sql/useQuery'
import { createEditorState } from '../editor/createEditorState'
import { ParagraphView } from '../editor/nodeviews/ParagraphView'
import { HeadingView } from '../editor/nodeviews/HeadingView'
import { createInlinerefPlugin } from '../editor/inlineref-plugin'
import { syncInlineRefs, refreshCachedTitles } from '../editor/inlineref-sync'
import { createTagSearchProvider, handleTagSelection } from '../tags/tag-search-provider'

import { InlineRefView } from './nodeviews/InlineRefView'
import { buildSingleNoteQuery } from './notes-plugin'

const SAVE_DEBOUNCE_MS = 300

type NoteData = {
  id: number
  title: string
  body: string
}

type NoteFaceProps = {
  matrixId: number
  noteId: number
  onBack: () => void
  onNavigateToNote?: (noteId: number) => void
}

const buildBacklinksQuery = (matrixId: number, rowId: number): string => `
SELECT j.source_row_id AS id, j.kind, d.title
FROM joins j
JOIN "mx_${matrixId}_data" d ON j.source_row_id = d.id
WHERE j.target_matrix_id = ${matrixId} AND j.target_row_id = ${rowId}
  AND j.source_matrix_id = ${matrixId}
ORDER BY d.title
`

const NoteEditor: Component<NoteFaceProps> = (props) => {
  const nodeViewFactory = useNodeViewFactory()

  const query = createMemo(() => buildSingleNoteQuery(props.matrixId, props.noteId))
  const { result } = useQuery(() => query())

  const backlinksQuery = createMemo(() => buildBacklinksQuery(props.matrixId, props.noteId))
  const { result: backlinksResult } = useQuery(() => backlinksQuery())

  const backlinks = createMemo(() => {
    const data = backlinksResult()
    if (!data || data.length === 0) return []
    return data as { id: number; title: string; kind: string }[]
  })

  const [title, setTitle] = createSignal('')
  const [overflowColumns, setOverflowColumns] = createSignal<ColumnDefinition[]>([])
  const [overflowValues, setOverflowValues] = createSignal<Record<string, string>>({})
  const [backlinksOpen, setBacklinksOpen] = createSignal(true)

  let editorView: EditorView | undefined
  let editorMounted = false
  let editorContainer: HTMLDivElement | undefined
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let pendingDoc: Node | undefined
  let titleSaveTimer: ReturnType<typeof setTimeout> | undefined

  const flushSave = () => {
    clearTimeout(saveTimer)
    clearTimeout(titleSaveTimer)
    if (pendingDoc !== undefined) {
      const doc = pendingDoc
      pendingDoc = undefined
      void (async () => {
        const docJson = await refreshCachedTitles(doc.toJSON() as Record<string, unknown>)
        void updateRow(props.matrixId, props.noteId, {
          body: JSON.stringify(docJson),
        })
        void syncInlineRefs(doc, props.matrixId, props.noteId)
      })()
    }
  }

  const debouncedSaveBody = (doc: Node) => {
    pendingDoc = doc
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (pendingDoc !== undefined) {
        const d = pendingDoc
        pendingDoc = undefined
        void (async () => {
          const docJson = await refreshCachedTitles(d.toJSON() as Record<string, unknown>)
          void updateRow(props.matrixId, props.noteId, {
            body: JSON.stringify(docJson),
          })
          void syncInlineRefs(d, props.matrixId, props.noteId)
        })()
      }
    }, SAVE_DEBOUNCE_MS)
  }

  const debouncedSaveTitle = (newTitle: string) => {
    clearTimeout(titleSaveTimer)
    titleSaveTimer = setTimeout(() => {
      void updateRow(props.matrixId, props.noteId, { title: newTitle })
    }, SAVE_DEBOUNCE_MS)
  }

  createEffect(() => {
    void getColumns(props.matrixId).then((cols) => {
      const coreNames = new Set(['title', 'body'])
      const overflow = cols.filter((c) => !coreNames.has(c.name))
      setOverflowColumns(overflow)
    })
  })

  createEffect(() => {
    const data = result()
    if (!data || data.length === 0) return
    const note = data[0] as unknown as NoteData

    setTitle(note.title ?? '')

    const vals: Record<string, string> = {}
    for (const col of overflowColumns()) {
      vals[col.name] = String((note as unknown as Record<string, unknown>)[col.name] ?? '')
    }
    setOverflowValues(vals)
  })

  const mountEditor = (el: HTMLDivElement, bodyJson: string | undefined) => {
    if (editorMounted) return
    editorMounted = true

    let docJson: unknown | undefined
    if (bodyJson) {
      try {
        docJson = JSON.parse(bodyJson)
      } catch {
        /* use default */
      }
    }

    const inlinerefPlugin = createInlinerefPlugin({
      matrixId: props.matrixId,
      rowIdAccessor: () => props.noteId,
      searchProvider: createTagSearchProvider(props.matrixId),
      onTagSelect: handleTagSelection,
    })
    const state = createEditorState(docJson, undefined, [inlinerefPlugin])
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
          debouncedSaveBody(newState.doc)
        }
      },
    })

    editorView = view
  }

  createEffect(() => {
    const data = result()
    if (!editorMounted && editorContainer && data && data.length > 0) {
      const note = data[0] as unknown as NoteData
      mountEditor(editorContainer, note.body)
    }
  })

  onCleanup(() => {
    flushSave()
    editorView?.destroy()
  })

  const handleTitleInput = (e: InputEvent) => {
    const value = (e.target as HTMLInputElement).value
    setTitle(value)
    debouncedSaveTitle(value)
  }

  const handleTitleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      editorView?.focus()
    }
  }

  const handleOverflowChange = (colName: string, value: string) => {
    setOverflowValues((prev) => ({ ...prev, [colName]: value }))
    void updateRow(props.matrixId, props.noteId, { [colName]: value })
  }

  const handleInlinerefNavigate = (e: Event) => {
    const detail = (e as CustomEvent<{ rowId: number }>).detail
    if (detail?.rowId != null && props.onNavigateToNote) {
      props.onNavigateToNote(detail.rowId)
    }
  }

  const EMPTY_BODY_JSON = '{"type":"doc","content":[{"type":"paragraph"}]}'

  const handleInlinerefCreate = async (e: Event) => {
    const detail = (e as CustomEvent<{ cachedTitle: string; pos: number | undefined }>).detail
    if (!detail?.cachedTitle) return

    try {
      const result = await insertRow(props.matrixId, {
        values: { title: detail.cachedTitle, body: EMPTY_BODY_JSON },
      })

      await createRefJoin(props.matrixId, props.noteId, props.matrixId, result.rowId)

      if (editorView && detail.pos != null) {
        const node = editorView.state.doc.nodeAt(detail.pos)
        if (node?.type.name === 'inlineref' && node.attrs.targetMatrixId == null) {
          const tr = editorView.state.tr.setNodeMarkup(detail.pos, null, {
            ...node.attrs,
            targetMatrixId: props.matrixId,
            targetRowId: result.rowId,
          })
          editorView.dispatch(tr)
        }
      }

      props.onNavigateToNote?.(result.rowId)
    } catch {
      /* creation failed */
    }
  }

  const setFaceRef = (el: HTMLDivElement) => {
    el.addEventListener('inlineref-navigate', handleInlinerefNavigate)
    el.addEventListener('inlineref-create', handleInlinerefCreate)
    onCleanup(() => {
      el.removeEventListener('inlineref-navigate', handleInlinerefNavigate)
      el.removeEventListener('inlineref-create', handleInlinerefCreate)
    })
  }

  return (
    <div class="note-face" ref={setFaceRef}>
      <div class="note-face-toolbar">
        <button class="note-face-back" onClick={() => props.onBack()}>
          ← Back
        </button>
      </div>

      <Show when={overflowColumns().length > 0}>
        <div class="note-property-panel">
          <For each={overflowColumns()}>
            {(col) => (
              <div class="note-property-row">
                <span class="note-property-label">{col.name}</span>
                <input
                  class="note-property-input"
                  value={overflowValues()[col.name] ?? ''}
                  onInput={(e) => handleOverflowChange(col.name, e.currentTarget.value)}
                />
              </div>
            )}
          </For>
        </div>
      </Show>

      <input
        class="note-title-input"
        value={title()}
        onInput={handleTitleInput}
        onKeyDown={handleTitleKeyDown}
        placeholder="Untitled"
      />

      <div
        class="note-body-editor"
        ref={(el) => {
          editorContainer = el
        }}
      />

      <Show when={backlinks().length > 0}>
        <div class="note-backlinks">
          <button class="note-backlinks-toggle" onClick={() => setBacklinksOpen((o) => !o)}>
            {backlinksOpen() ? '▾' : '▸'} Backlinks ({backlinks().length})
          </button>
          <Show when={backlinksOpen()}>
            <div class="note-backlinks-list">
              <For each={backlinks()}>
                {(bl) => (
                  <button
                    class={
                      'note-backlinks-item' +
                      (bl.kind === 'own' ? ' note-backlinks-item-own' : '')
                    }
                    onClick={() => props.onNavigateToNote?.(bl.id)}
                  >
                    <span class="note-backlinks-kind">{bl.kind === 'own' ? '⊙' : '↗'}</span>
                    {bl.title || 'Untitled'}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}

const NoteFace: Component<NoteFaceProps> = (props) => (
  <ProsemirrorAdapterProvider>
    <NoteEditor
      matrixId={props.matrixId}
      noteId={props.noteId}
      onBack={props.onBack}
      onNavigateToNote={props.onNavigateToNote}
    />
  </ProsemirrorAdapterProvider>
)

export default NoteFace
