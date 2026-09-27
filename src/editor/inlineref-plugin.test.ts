import { afterEach, describe, expect, test, vi } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'

import { createInlinerefPlugin } from './inlineref-plugin'
import { labelSchema } from './label-schema'

vi.mock('../core/client/sql-client', () => ({
  execQuery: vi.fn(),
}))

type TestEditor = {
  plugin: ReturnType<typeof createInlinerefPlugin>
  view: EditorView
}

const editors: TestEditor[] = []

const createEditor = (): TestEditor => {
  const mount = document.createElement('div')
  document.body.appendChild(mount)
  const plugin = createInlinerefPlugin({
    matrixId: 7,
    rowIdAccessor: () => 11,
    searchProvider: async () => [
      { id: 13, title: 'Alpha' },
      { id: 17, title: 'Beta' },
    ],
  })
  const doc = labelSchema.node('doc', undefined, [labelSchema.node('paragraph')])
  const view = new EditorView(mount, {
    state: EditorState.create({ doc, plugins: [plugin] }),
  })
  const editor = { plugin, view }
  editors.push(editor)
  return editor
}

const openAutocomplete = async ({ plugin, view }: TestEditor): Promise<void> => {
  view.focus()
  const position = view.state.selection.from
  expect(
    plugin.props.handleTextInput?.call(plugin, view, position, position, '@', () =>
      view.state.tr.insertText('@', position),
    ),
  ).toBe(true)
  await vi.waitFor(() => {
    expect(document.querySelectorAll('[data-option-kind="existing"]')).toHaveLength(2)
  })
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.view.destroy()
  document.body.replaceChildren()
})

describe('inline reference autocomplete accessibility', () => {
  test('updates the editor active descendant and restores its prior attributes on close', async () => {
    const editor = createEditor()
    const owner = editor.view.dom
    owner.setAttribute('aria-activedescendant', 'previous-option')
    owner.setAttribute('aria-controls', 'previous-list')
    owner.setAttribute('aria-expanded', 'false')
    owner.setAttribute('aria-haspopup', 'menu')
    owner.setAttribute('aria-autocomplete', 'none')

    await openAutocomplete(editor)

    const list = document.querySelector<HTMLElement>(
      '[data-testid="inline-reference-autocomplete"]',
    )!
    const options = [...list.querySelectorAll<HTMLElement>('[role="option"]')]
    expect(document.activeElement).toBe(owner)
    expect(list.id).not.toBe('')
    expect(options.every((option) => option.id !== '')).toBe(true)
    expect(owner.getAttribute('aria-controls')).toBe(list.id)
    expect(owner.getAttribute('aria-expanded')).toBe('true')
    expect(owner.getAttribute('aria-haspopup')).toBe('listbox')
    expect(owner.getAttribute('aria-autocomplete')).toBe('list')
    expect(owner.getAttribute('aria-activedescendant')).toBe(options[0]!.id)

    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true })
    expect(editor.plugin.props.handleKeyDown?.call(editor.plugin, editor.view, down)).toBe(true)
    expect(owner.getAttribute('aria-activedescendant')).toBe(options[1]!.id)
    expect(list.querySelector('[aria-selected="true"]')?.id).toBe(options[1]!.id)

    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    expect(editor.plugin.props.handleKeyDown?.call(editor.plugin, editor.view, escape)).toBe(
      true,
    )
    expect(owner.getAttribute('aria-activedescendant')).toBe('previous-option')
    expect(owner.getAttribute('aria-controls')).toBe('previous-list')
    expect(owner.getAttribute('aria-expanded')).toBe('false')
    expect(owner.getAttribute('aria-haspopup')).toBe('menu')
    expect(owner.getAttribute('aria-autocomplete')).toBe('none')
  })

  test('restores the focus owner on destroy and keeps list IDs unique', async () => {
    const first = createEditor()
    const second = createEditor()
    first.view.dom.setAttribute('aria-controls', 'first-previous-list')

    await openAutocomplete(first)
    await openAutocomplete(second)

    const initialIds = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-testid="inline-reference-autocomplete"]',
      ),
    ].map((list) => list.id)
    expect(new Set(initialIds).size).toBe(2)

    first.view.destroy()
    editors.splice(editors.indexOf(first), 1)
    expect(first.view.dom.getAttribute('aria-controls')).toBe('first-previous-list')

    const third = createEditor()
    const thirdId = document.querySelectorAll<HTMLElement>(
      '[data-testid="inline-reference-autocomplete"]',
    )[1]!.id
    expect(initialIds).not.toContain(thirdId)
    third.view.destroy()
    editors.splice(editors.indexOf(third), 1)
  })
})
