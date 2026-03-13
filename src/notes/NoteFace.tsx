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
import 'prosemirror-view/style/prosemirror.css'

import { updateRow, getColumns } from '../core/client/matrix-client'
import type { ColumnDefinition } from '../core/matrix'
import { useQuery } from '../sql/useQuery'
import { createEditorState } from '../outline/createEditorState'
import { ParagraphView } from '../outline/nodeviews/ParagraphView'
import { HeadingView } from '../outline/nodeviews/HeadingView'

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
}

const NoteEditor: Component<NoteFaceProps> = (props) => {
  const nodeViewFactory = useNodeViewFactory()

  const query = createMemo(() => buildSingleNoteQuery(props.matrixId, props.noteId))
  const { result } = useQuery(() => query())

  const [title, setTitle] = createSignal('')
  const [overflowColumns, setOverflowColumns] = createSignal<ColumnDefinition[]>([])
  const [overflowValues, setOverflowValues] = createSignal<Record<string, string>>({})

  let editorView: EditorView | undefined
  let editorMounted = false
  let editorContainer: HTMLDivElement | undefined
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let pendingBodyJson: unknown | undefined
  let titleSaveTimer: ReturnType<typeof setTimeout> | undefined

  const flushSave = () => {
    clearTimeout(saveTimer)
    clearTimeout(titleSaveTimer)
    if (pendingBodyJson !== undefined) {
      void updateRow(props.matrixId, props.noteId, { body: JSON.stringify(pendingBodyJson) })
      pendingBodyJson = undefined
    }
  }

  const debouncedSaveBody = (docJson: unknown) => {
    pendingBodyJson = docJson
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (pendingBodyJson !== undefined) {
        void updateRow(props.matrixId, props.noteId, { body: JSON.stringify(pendingBodyJson) })
        pendingBodyJson = undefined
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

    const state = createEditorState(docJson)
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
      },
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr)
        view.updateState(newState)
        if (tr.docChanged) {
          debouncedSaveBody(newState.doc.toJSON())
        }
      },
    })

    editorView = view
  }

  // Mount editor once both the container element and query data are available
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

  return (
    <div class="note-face">
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
    </div>
  )
}

const NoteFace: Component<NoteFaceProps> = (props) => (
  <ProsemirrorAdapterProvider>
    <NoteEditor matrixId={props.matrixId} noteId={props.noteId} onBack={props.onBack} />
  </ProsemirrorAdapterProvider>
)

export default NoteFace
