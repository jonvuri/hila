import { createEffect, on, onCleanup } from 'solid-js'
import { ProsemirrorAdapterProvider, useNodeViewFactory } from '@prosemirror-adapter/solid'
import { EditorView } from 'prosemirror-view'
import { Selection, TextSelection } from 'prosemirror-state'
import 'prosemirror-view/style/prosemirror.css'

import { updateRow } from '../core/client/matrix-client'
import { logPmMount, logPmUnmount, logPmContentSync } from '../debug/debugState'

import { createEditorState } from './createEditorState'
import type { OutlineCallbacks } from './keymap'
import { ParagraphView } from './nodeviews/ParagraphView'
import { HeadingView } from './nodeviews/HeadingView'

const INDENT_PX = 24
const SAVE_DEBOUNCE_MS = 300

export type OutlineRowHandle = {
  focus: (pos?: number | 'start' | 'end') => void
  getView: () => EditorView | undefined
  flushSave: () => void
}

export type OutlineRowProps = {
  rowId: number
  rankKey: Uint8Array
  content: string
  depth: number
  hasChildren: boolean
  collapsed?: boolean
  matrixId: number
  pageIndex: number
  callbacks: OutlineCallbacks
  onHandle?: (handle: OutlineRowHandle) => void
  onEditorFocus?: () => void
  onToggleCollapse?: () => void
}

const OutlineRowEditor = (props: OutlineRowProps) => {
  const nodeViewFactory = useNodeViewFactory()
  let editorView: EditorView | undefined
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let pendingDoc: unknown | undefined

  const debouncedSave = (docJson: unknown) => {
    pendingDoc = docJson
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (pendingDoc !== undefined) {
        void updateRow(props.matrixId, props.rowId, { content: JSON.stringify(pendingDoc) })
        pendingDoc = undefined
      }
    }, SAVE_DEBOUNCE_MS)
  }

  const flushSave = () => {
    clearTimeout(saveTimer)
    if (pendingDoc !== undefined) {
      void updateRow(props.matrixId, props.rowId, { content: JSON.stringify(pendingDoc) })
      pendingDoc = undefined
    }
  }

  const handle: OutlineRowHandle = {
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
    const docJson = props.content ? (JSON.parse(props.content) as unknown) : undefined
    const state = createEditorState(docJson, props.callbacks)

    const view = new EditorView(el, {
      state,
      handleDOMEvents: {
        focus: () => {
          props.onEditorFocus?.()
          return false
        },
      },
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
          debouncedSave(newState.doc.toJSON())
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
      () => props.content,
      (newContent) => {
        if (!editorView) return
        const currentDoc = JSON.stringify(editorView.state.doc.toJSON())
        logPmContentSync(props.rowId, currentDoc !== newContent)
      },
      { defer: true },
    ),
  )

  return (
    <div class="outline-row" style={{ display: 'flex', 'align-items': 'flex-start' }}>
      <div
        class="outline-row-indent"
        style={{ width: `${props.depth * INDENT_PX}px`, 'flex-shrink': 0 }}
      />
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
      >
        ⠿
      </div>
      <div
        class="outline-row-bullet"
        role={props.hasChildren ? 'button' : undefined}
        aria-label={
          props.hasChildren ?
            props.collapsed ?
              'Expand'
            : 'Collapse'
          : 'Bullet'
        }
        style={{
          width: '20px',
          'flex-shrink': 0,
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          'user-select': 'none',
          'padding-top': '2px',
          cursor: props.hasChildren ? 'pointer' : 'default',
          'font-size': props.hasChildren ? '10px' : '16px',
          opacity: props.hasChildren ? 0.7 : 0.35,
        }}
        onClick={() => {
          if (props.hasChildren) props.onToggleCollapse?.()
        }}
        data-testid="outline-bullet"
      >
        {props.hasChildren ?
          props.collapsed ?
            '▶'
          : '▼'
        : '•'}
      </div>
      <div
        class="outline-row-editor"
        ref={(el) => mountEditor(el)}
        style={{ flex: 1, 'min-width': 0 }}
      />
    </div>
  )
}

export const OutlineRow = (props: OutlineRowProps) => (
  <ProsemirrorAdapterProvider>
    <OutlineRowEditor
      rowId={props.rowId}
      rankKey={props.rankKey}
      content={props.content}
      depth={props.depth}
      hasChildren={props.hasChildren}
      collapsed={props.collapsed}
      matrixId={props.matrixId}
      pageIndex={props.pageIndex}
      callbacks={props.callbacks}
      onHandle={props.onHandle}
      onEditorFocus={props.onEditorFocus}
      onToggleCollapse={props.onToggleCollapse}
    />
  </ProsemirrorAdapterProvider>
)
