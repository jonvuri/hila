import { afterEach, describe, expect, test } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'

import { labelSchema } from './label-schema'
import {
  activeEditorInvocationStatus,
  captureActiveEditorInvocation,
  insertInlineRefFromInvocation,
  registerActiveEditor,
} from './active-editor'

type TestEditor = {
  view: EditorView
  unregister: () => void
}

const editors: TestEditor[] = []

const createEditor = (text = 'hello'): TestEditor => {
  const mount = document.createElement('div')
  document.body.appendChild(mount)
  const doc = labelSchema.node('doc', undefined, [
    labelSchema.node('paragraph', undefined, text ? [labelSchema.text(text)] : undefined),
  ])
  const view = new EditorView(mount, { state: EditorState.create({ doc }) })
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)))
  const unregister = registerActiveEditor(view, { matrixId: 7, rowId: 11 })
  const editor = { view, unregister }
  editors.push(editor)
  return editor
}

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.unregister()
    editor.view.destroy()
  }
  document.body.replaceChildren()
})

describe('active editor launcher bridge', () => {
  test('retains the exact selection while focus moves and inserts a cross-matrix ref', () => {
    const { view } = createEditor()
    view.focus()
    const invocation = captureActiveEditorInvocation(document.activeElement)!

    const launcherInput = document.createElement('input')
    document.body.appendChild(launcherInput)
    launcherInput.focus()

    expect(invocation.source).toEqual({ matrixId: 7, rowId: 11 })
    expect(activeEditorInvocationStatus(invocation)).toBe('live')
    expect(
      insertInlineRefFromInvocation(invocation, {
        targetMatrixId: 19,
        targetRowId: 23,
        cachedTitle: 'Elsewhere',
      }),
    ).toEqual({ ok: true })

    let inserted = view.state.doc.nodeAt(2)
    view.state.doc.descendants((node) => {
      if (node.type.name === 'inlineref') inserted = node
    })
    expect(inserted).toBeDefined()
    expect(inserted!.type.name).toBe('inlineref')
    expect(inserted!.attrs).toMatchObject({
      targetMatrixId: 19,
      targetRowId: 23,
      kind: 'ref',
      cachedTitle: 'Elsewhere',
    })
    expect(view.hasFocus()).toBe(true)
  })

  test('refuses insertion after the selection changes', () => {
    const { view } = createEditor()
    view.focus()
    const invocation = captureActiveEditorInvocation(document.activeElement)!
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 5)))

    expect(activeEditorInvocationStatus(invocation)).toBe('editor-changed')
    expect(
      insertInlineRefFromInvocation(invocation, {
        targetMatrixId: 19,
        targetRowId: 23,
      }),
    ).toEqual({ ok: false, reason: 'editor-changed' })
    let inlineRefCount = 0
    view.state.doc.descendants((node) => {
      if (node.type.name === 'inlineref') inlineRefCount++
    })
    expect(inlineRefCount).toBe(0)
  })

  test('refuses insertion after the document changes', () => {
    const { view } = createEditor()
    view.focus()
    const invocation = captureActiveEditorInvocation(document.activeElement)!
    view.dispatch(view.state.tr.insertText('!', 2))

    expect(activeEditorInvocationStatus(invocation)).toBe('editor-changed')
    expect(
      insertInlineRefFromInvocation(invocation, {
        targetMatrixId: 19,
        targetRowId: 23,
      }),
    ).toEqual({ ok: false, reason: 'editor-changed' })
  })

  test('refuses insertion after the editor unregisters', () => {
    const editor = createEditor()
    editor.view.focus()
    const invocation = captureActiveEditorInvocation(document.activeElement)!
    editor.unregister()

    expect(activeEditorInvocationStatus(invocation)).toBe('editor-unmounted')
    expect(
      insertInlineRefFromInvocation(invocation, {
        targetMatrixId: 19,
        targetRowId: 23,
      }),
    ).toEqual({ ok: false, reason: 'editor-unmounted' })
  })
})
