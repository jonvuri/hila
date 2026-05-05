import { createEffect, on, onCleanup } from 'solid-js'
import { ProsemirrorAdapterProvider, useNodeViewFactory } from '@prosemirror-adapter/solid'
import { EditorView } from 'prosemirror-view'
import { Selection, TextSelection } from 'prosemirror-state'
import type { Node } from 'prosemirror-model'
import 'prosemirror-view/style/prosemirror.css'

import { updateRow } from '../core/client/matrix-client'
import { logPmMount, logPmUnmount, logPmContentSync } from '../debug/debugState'
import { createEditorState } from '../editor/createEditorState'
import type { OutlineCallbacks } from '../editor/keymap'
import { ParagraphView } from '../editor/nodeviews/ParagraphView'
import { HeadingView } from '../editor/nodeviews/HeadingView'
import { createInlinerefPlugin } from '../editor/inlineref-plugin'
import { syncInlineRefs, refreshCachedTitles } from '../editor/inlineref-sync'
import { extractTextFromPmDoc } from '../editor/pm-text'
import { InlineRefView } from '../editor/nodeviews/InlineRefView'
import { createTagSearchProvider, handleTagSelection } from '../tags/tag-search-provider'

const SAVE_DEBOUNCE_MS = 300

const wrapPlainText = (text: string): string =>
  JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: text ? [{ type: 'text', text }] : [],
      },
    ],
  })

const unwrapPlainText = (docJson: unknown): string => extractTextFromPmDoc(docJson)

export type OutlineRowHandle = {
  focus: (pos?: number | 'start' | 'end') => void
  getView: () => EditorView | undefined
  flushSave: () => void
}

export type OutlineRowContentProps = {
  rowId: number
  content: string
  matrixId: number
  pageIndex: number
  callbacks: OutlineCallbacks
  contentColumn?: string
  contentIsPlainText?: boolean
  onHandle?: (handle: OutlineRowHandle) => void
  onEditorFocus?: () => void
}

const OutlineRowEditorInner = (props: OutlineRowContentProps) => {
  const nodeViewFactory = useNodeViewFactory()
  let editorView: EditorView | undefined
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let pendingDoc: Node | undefined

  const colName = () => props.contentColumn ?? 'content'
  const isPlain = () => props.contentIsPlainText ?? false

  const saveWithInlineRefs = async (doc: Node) => {
    const docJson = await refreshCachedTitles(doc.toJSON() as Record<string, unknown>)
    void updateRow(props.matrixId, props.rowId, { [colName()]: JSON.stringify(docJson) })
    void syncInlineRefs(doc, props.matrixId, props.rowId)
  }

  const savePlain = (docJson: unknown) => {
    const value = unwrapPlainText(docJson)
    void updateRow(props.matrixId, props.rowId, { [colName()]: value })
  }

  const debouncedSave = (doc: Node) => {
    pendingDoc = doc
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (pendingDoc !== undefined) {
        const d = pendingDoc
        pendingDoc = undefined
        if (isPlain()) {
          savePlain(d.toJSON())
        } else {
          void saveWithInlineRefs(d)
        }
      }
    }, SAVE_DEBOUNCE_MS)
  }

  const flushSave = () => {
    clearTimeout(saveTimer)
    if (pendingDoc !== undefined) {
      const d = pendingDoc
      pendingDoc = undefined
      if (isPlain()) {
        savePlain(d.toJSON())
      } else {
        void saveWithInlineRefs(d)
      }
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
    let docJson: unknown | undefined
    if (props.content) {
      if (isPlain()) {
        docJson = JSON.parse(wrapPlainText(props.content)) as unknown
      } else {
        docJson = JSON.parse(props.content) as unknown
      }
    }

    const extraPlugins =
      isPlain() ?
        []
      : [
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
    }
    if (!isPlain()) {
      nodeViews.inlineref = nodeViewFactory({
        component: InlineRefView,
        as: 'span',
      })
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
    <div
      class="outline-row-editor"
      ref={(el) => mountEditor(el)}
      style={{ flex: 1, 'min-width': 0 }}
    />
  )
}

export const OutlineRowContent = (props: OutlineRowContentProps) => (
  <ProsemirrorAdapterProvider>
    <OutlineRowEditorInner
      rowId={props.rowId}
      content={props.content}
      matrixId={props.matrixId}
      pageIndex={props.pageIndex}
      callbacks={props.callbacks}
      contentColumn={props.contentColumn}
      contentIsPlainText={props.contentIsPlainText}
      onHandle={props.onHandle}
      onEditorFocus={props.onEditorFocus}
    />
  </ProsemirrorAdapterProvider>
)
