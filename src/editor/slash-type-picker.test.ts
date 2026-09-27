import { afterEach, describe, expect, test, vi } from 'vitest'
import type { EditorView } from 'prosemirror-view'

import { createDependentRow } from '../core/client/matrix-client'
import { searchTagTypes } from '../tags/tag-search-provider'

import { openSlashTypePicker } from './slash-type-picker'

vi.mock('../core/client/matrix-client', () => ({
  createDependentRow: vi.fn(),
}))

vi.mock('../tags/tag-search-provider', () => ({
  searchTagTypes: vi.fn(),
}))

const createView = () =>
  ({
    coordsAtPos: () => ({ left: 10, right: 10, top: 10, bottom: 20 }),
    focus: vi.fn(),
    state: { selection: { head: 1 } },
  }) as unknown as EditorView

const closePicker = (input: HTMLInputElement) => {
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

afterEach(() => {
  document
    .querySelectorAll<HTMLInputElement>('[data-testid="slash-type-picker-input"]')
    .forEach(closePicker)
  document.body.replaceChildren()
  vi.clearAllMocks()
})

describe('slash type picker accessibility', () => {
  test('updates the input active descendant and removes its ARIA contract on close', async () => {
    vi.mocked(searchTagTypes).mockResolvedValue([
      { id: 1, matrixId: 101, title: 'Person' },
      { id: 2, matrixId: 103, title: 'Project' },
    ])
    const view = createView()

    openSlashTypePicker(view, { matrixId: 7, rowId: 11 })
    const input = document.querySelector<HTMLInputElement>(
      '[data-testid="slash-type-picker-input"]',
    )!
    const list = document.querySelector<HTMLElement>('[role="listbox"]')!
    await vi.waitFor(() => expect(list.querySelectorAll('[role="option"]')).toHaveLength(2))
    const options = [...list.querySelectorAll<HTMLElement>('[role="option"]')]

    expect(document.activeElement).toBe(input)
    expect(input.getAttribute('aria-controls')).toBe(list.id)
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(input.getAttribute('aria-haspopup')).toBe('listbox')
    expect(input.getAttribute('aria-autocomplete')).toBe('list')
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]!.id)

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1]!.id)
    expect(list.querySelector('[aria-selected="true"]')?.id).toBe(options[1]!.id)

    closePicker(input)
    expect(input.isConnected).toBe(false)
    expect(input.hasAttribute('aria-controls')).toBe(false)
    expect(input.hasAttribute('aria-expanded')).toBe(false)
    expect(input.hasAttribute('aria-haspopup')).toBe(false)
    expect(input.hasAttribute('aria-autocomplete')).toBe(false)
    expect(input.hasAttribute('aria-activedescendant')).toBe(false)
    expect(view.focus).toHaveBeenCalledOnce()
    expect(createDependentRow).not.toHaveBeenCalled()
  })

  test('uses unique list and option IDs across concurrent and serial pickers', async () => {
    vi.mocked(searchTagTypes).mockResolvedValue([{ id: 1, matrixId: 101, title: 'Person' }])
    const view = createView()

    openSlashTypePicker(view, { matrixId: 7, rowId: 11 })
    openSlashTypePicker(view, { matrixId: 7, rowId: 13 })
    await vi.waitFor(() => {
      expect(
        document.querySelectorAll('[data-testid="slash-type-picker"] [role="option"]'),
      ).toHaveLength(2)
    })
    const initialLists = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-testid="slash-type-picker"] [role="listbox"]',
      ),
    ]
    expect(new Set(initialLists.map((list) => list.id)).size).toBe(2)
    expect(
      new Set(
        initialLists.map((list) => list.querySelector<HTMLElement>('[role="option"]')!.id),
      ).size,
    ).toBe(2)

    const firstId = initialLists[0]!.id
    closePicker(
      initialLists[0]!.parentElement!.querySelector<HTMLInputElement>(
        '[data-testid="slash-type-picker-input"]',
      )!,
    )
    openSlashTypePicker(view, { matrixId: 7, rowId: 17 })
    await vi.waitFor(() => {
      expect(
        document.querySelectorAll('[data-testid="slash-type-picker"] [role="option"]'),
      ).toHaveLength(2)
    })
    const currentIds = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-testid="slash-type-picker"] [role="listbox"]',
      ),
    ].map((list) => list.id)
    expect(currentIds).not.toContain(firstId)
  })
})
