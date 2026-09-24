import { afterEach, describe, expect, test } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'

import { registerActiveEditor } from '../editor/active-editor'
import { labelSchema } from '../editor/label-schema'

import { captureLauncherInvocation } from './invocation'

describe('launcher invocation capture', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  test('captures the focused subject, label, and exact appearance once', () => {
    const host = document.createElement('div')
    host.dataset.launcherSubject = ''
    host.dataset.launcherMatrixId = '4'
    host.dataset.launcherRowId = '9'
    host.dataset.launcherSubjectLabel = 'Planning'
    host.dataset.launcherProvenance = '010aff'
    const input = document.createElement('input')
    host.appendChild(input)
    document.body.appendChild(host)
    input.focus()

    const invocation = captureLauncherInvocation()
    host.dataset.launcherRowId = '10'

    expect(invocation).toEqual({
      focusElement: input,
      subject: { matrixId: 4, rowId: 9 },
      subjectLabel: 'Planning',
      provenance: { key: Uint8Array.of(1, 10, 255) },
    })
  })

  test('retains focus restoration without inventing a subject on system surfaces', () => {
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    expect(captureLauncherInvocation()).toEqual({ focusElement: button })
  })

  test('includes the registered editor and source node', () => {
    const host = document.createElement('div')
    host.dataset.launcherSubject = ''
    host.dataset.launcherMatrixId = '4'
    host.dataset.launcherRowId = '9'
    document.body.appendChild(host)
    const view = new EditorView(host, {
      state: EditorState.create({ schema: labelSchema }),
    })
    const unregister = registerActiveEditor(view, { matrixId: 4, rowId: 9 })
    view.focus()

    const invocation = captureLauncherInvocation()

    expect(invocation.editor?.view).toBe(view)
    expect(invocation.editor?.source).toEqual({ matrixId: 4, rowId: 9 })
    unregister()
    view.destroy()
  })
})
