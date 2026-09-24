import type { Node as ProseMirrorNode } from 'prosemirror-model'
import type { Selection, SelectionBookmark } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'

import type { NodeRef } from '../core/tree'

import { buildInlineRefInsertion, type InlineRefTarget } from './inlineref-insert'

type RegisteredEditor = {
  readonly view: EditorView
  readonly source: NodeRef
  active: boolean
}

export type ActiveEditorInvocation = {
  readonly view: EditorView
  readonly source: NodeRef
  readonly doc: ProseMirrorNode
  readonly selection: Selection
  readonly bookmark: SelectionBookmark
  readonly registration: RegisteredEditor
}

export type InlineRefInsertionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'editor-unmounted' | 'editor-changed' }

const editors = new WeakMap<HTMLElement, RegisteredEditor>()

export const registerActiveEditor = (view: EditorView, source: NodeRef): (() => void) => {
  const registration: RegisteredEditor = { view, source, active: true }
  editors.set(view.dom, registration)

  return () => {
    registration.active = false
    if (editors.get(view.dom) === registration) editors.delete(view.dom)
  }
}

const registeredEditorForElement = (element: Element | null): RegisteredEditor | undefined => {
  let current = element
  while (current instanceof HTMLElement) {
    const registered = editors.get(current)
    if (registered) return registered
    current = current.parentElement
  }
  return undefined
}

/** Capture the editor state before focus moves into the launcher overlay. */
export const captureActiveEditorInvocation = (
  activeElement: Element | null,
): ActiveEditorInvocation | undefined => {
  const registration = registeredEditorForElement(activeElement)
  if (!registration?.active || registration.view.isDestroyed) return undefined
  const { doc, selection } = registration.view.state
  return {
    view: registration.view,
    source: registration.source,
    doc,
    selection,
    bookmark: selection.getBookmark(),
    registration,
  }
}

export const activeEditorInvocationStatus = (
  invocation: ActiveEditorInvocation,
): 'live' | 'editor-unmounted' | 'editor-changed' => {
  const { registration, view } = invocation
  if (!registration.active || view.isDestroyed || editors.get(view.dom) !== registration) {
    return 'editor-unmounted'
  }
  if (view.state.doc !== invocation.doc || view.state.selection !== invocation.selection) {
    return 'editor-changed'
  }
  return 'live'
}

/** Insert at the invoking selection only while that exact editor state remains live. */
export const insertInlineRefFromInvocation = (
  invocation: ActiveEditorInvocation,
  target: InlineRefTarget,
): InlineRefInsertionResult => {
  const state = activeEditorInvocationStatus(invocation)
  if (state !== 'live') return { ok: false, reason: state }

  const selection = invocation.bookmark.resolve(invocation.view.state.doc)
  const tr = buildInlineRefInsertion(invocation.view, target, { kind: 'ref', selection })
  invocation.view.dispatch(tr)
  invocation.view.focus()
  return { ok: true }
}
