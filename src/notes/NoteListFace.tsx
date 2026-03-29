import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
  untrack,
  type Component,
} from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'

import { insertRow, deleteRow } from '../core/client/matrix-client'
import { useQuery } from '../sql/useQuery'

import { buildAllNotesQuery } from './notes-plugin'

const EMPTY_DOC_JSON = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })

type NoteRowData = {
  row_id: number
  key: Uint8Array
  title: string
  body: string
}

const extractPreview = (bodyJson: string, maxLen = 100): string => {
  try {
    const doc = JSON.parse(bodyJson) as {
      content?: { content?: { text?: string }[] }[]
    }
    if (!doc.content) return ''
    const text = doc.content
      .flatMap((block) => block.content ?? [])
      .map((node) => node.text ?? '')
      .join('')
    return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
  } catch {
    return ''
  }
}

const copyKey = (key: Uint8Array | undefined): Uint8Array | undefined =>
  key ? new Uint8Array(key) : undefined

type NoteListFaceProps = {
  matrixId: number
  onSelectNote: (noteId: number) => void
}

const NoteListFace: Component<NoteListFaceProps> = (props) => {
  const query = createMemo(() => buildAllNotesQuery(props.matrixId))
  const { result, error } = useQuery(() => query())

  const [rows, setRows] = createStore<NoteRowData[]>([])
  const [focusedIndex, setFocusedIndex] = createSignal(0)

  createEffect(() => {
    const data = result()
    if (!data) return
    setRows(reconcile(data as unknown as NoteRowData[], { key: 'row_id' }))
  })

  const handleAddNote = () => {
    untrack(() => {
      const lastRow = rows[rows.length - 1]
      const matrixId = props.matrixId
      const selectNote = props.onSelectNote
      void insertRow(matrixId, {
        prevKey: copyKey(lastRow?.key),
        values: { title: 'Untitled', body: EMPTY_DOC_JSON },
      }).then(({ rowId }) => {
        selectNote(rowId)
      })
    })
  }

  const handleDeleteNote = (e: MouseEvent, row: NoteRowData) => {
    e.stopPropagation()
    void deleteRow(props.matrixId, row.row_id)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((i) => Math.min(i + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const row = rows[focusedIndex()]
      if (row) props.onSelectNote(row.row_id)
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
      e.preventDefault()
      handleAddNote()
    }
  }

  return (
    <div class="note-list-face" tabIndex={0} onKeyDown={handleKeyDown}>
      <div class="note-list-header">
        <h2 class="note-list-title">Notes</h2>
        <button class="note-list-add" onClick={handleAddNote} title="New note (Cmd/Ctrl+N)">
          +
        </button>
      </div>
      <Show when={error()}>
        <div class="note-list-error">Error: {error()?.message}</div>
      </Show>
      <div class="note-list-items">
        <For each={rows}>
          {(row, index) => (
            <div
              class="note-list-item"
              role="button"
              tabIndex={0}
              data-focused={index() === focusedIndex()}
              onClick={() => props.onSelectNote(row.row_id)}
              onMouseEnter={() => setFocusedIndex(index())}
            >
              <div class="note-list-item-title">{row.title || 'Untitled'}</div>
              <div class="note-list-item-preview">{extractPreview(row.body)}</div>
              <button
                class="note-list-item-delete"
                onClick={(e) => handleDeleteNote(e, row)}
                title="Delete note"
              >
                ×
              </button>
            </div>
          )}
        </For>
        <Show when={rows.length === 0 && !error()}>
          <div class="note-list-empty">
            No notes yet.{' '}
            <button class="note-list-empty-add" onClick={handleAddNote}>
              Create one
            </button>
          </div>
        </Show>
      </div>
    </div>
  )
}

export default NoteListFace
