import { createSignal, onCleanup } from 'solid-js'
import { ProsemirrorAdapterProvider, useNodeViewFactory } from '@prosemirror-adapter/solid'
import { EditorView } from 'prosemirror-view'
import 'prosemirror-view/style/prosemirror.css'

import { createEditorState } from './createEditorState'
import type { OutlineCallbacks } from './keymap'
import { ParagraphView } from './nodeviews/ParagraphView'
import { HeadingView } from './nodeviews/HeadingView'

const EditorInner = () => {
  const nodeViewFactory = useNodeViewFactory()
  const [log, setLog] = createSignal<string[]>([])
  const [docJson, setDocJson] = createSignal('')
  let viewRef: EditorView | undefined

  const appendLog = (msg: string) => {
    setLog((prev) => [...prev.slice(-19), msg])
  }

  const callbacks: OutlineCallbacks = {
    onEnter: () => appendLog('[callback] Enter'),
    onBackspaceAtStart: () => appendLog('[callback] Backspace@start'),
    onIndent: () => appendLog('[callback] Tab (indent)'),
    onOutdent: () => appendLog('[callback] Shift-Tab (outdent)'),
    onArrowUp: () => appendLog('[callback] ArrowUp'),
    onArrowDown: () => appendLog('[callback] ArrowDown'),
    onInsertLink: () => appendLog('[callback] Mod-k (link)'),
    onToggleCollapse: () => appendLog('[callback] Mod-Enter (toggle collapse)'),
  }

  onCleanup(() => {
    viewRef?.destroy()
  })

  const mountEditor = (element: HTMLDivElement) => {
    if (element.firstChild) return

    const state = createEditorState(undefined, callbacks)

    const view = new EditorView(element, {
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
        setDocJson(JSON.stringify(newState.doc.toJSON(), null, 2))
      },
    })

    viewRef = view
    setDocJson(JSON.stringify(state.doc.toJSON(), null, 2))
  }

  return (
    <div style={{ display: 'flex', gap: '20px' }}>
      <div style={{ flex: '1' }}>
        <h3>Editor</h3>
        <div
          ref={mountEditor}
          data-testid="pm-editor"
          style={{
            border: '1px solid #ccc',
            'min-height': '120px',
            padding: '8px',
          }}
        />

        <h3 style={{ 'margin-top': '16px' }}>Callback Log</h3>
        <pre
          data-testid="callback-log"
          style={{
            background: '#f5f5f5',
            padding: '8px',
            'font-size': '12px',
            'max-height': '200px',
            overflow: 'auto',
          }}
        >
          {log().join('\n') || '(no events yet)'}
        </pre>
      </div>

      <div style={{ flex: '1' }}>
        <h3>Document JSON</h3>
        <pre
          data-testid="doc-json"
          style={{
            background: '#f5f5f5',
            padding: '8px',
            'font-size': '11px',
            'max-height': '400px',
            overflow: 'auto',
          }}
        >
          {docJson()}
        </pre>
      </div>
    </div>
  )
}

const EditorHarness = () => {
  return (
    <ProsemirrorAdapterProvider>
      <EditorInner />
    </ProsemirrorAdapterProvider>
  )
}

export default EditorHarness
