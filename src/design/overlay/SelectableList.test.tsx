import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  SelectableList,
  getInitialSelectableListId,
  getSelectableListAction,
  type SelectableListItem,
} from './SelectableList'

const items: readonly SelectableListItem[] = [
  { id: 'one', label: 'One' },
  { id: 'two', label: 'Two', unavailableReason: 'Choose a place first' },
  { id: 'three', label: 'Three', appearance: 'opaque' },
]

describe('SelectableList', () => {
  let container: HTMLDivElement
  let dispose: (() => void) | undefined

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    dispose?.()
    container.remove()
  })

  test('reconciles stable IDs and wraps through every discoverable option', () => {
    expect(getInitialSelectableListId(items, 'three')).toBe('three')
    expect(getInitialSelectableListId(items, 'missing')).toBe('one')
    expect(getInitialSelectableListId([])).toBeNull()
    expect(getSelectableListAction(items, 'three', 'ArrowDown')).toEqual({
      type: 'select',
      id: 'one',
    })
    expect(getSelectableListAction(items, 'one', 'ArrowUp')).toEqual({
      type: 'select',
      id: 'three',
    })
  })

  test('keeps selection controlled and blocks unavailable activation with a stated reason', async () => {
    const [selectedId, setSelectedId] = createSignal<string | null>('one')
    const activate = vi.fn()
    dispose = render(
      () => (
        <SelectableList
          id="commands"
          items={items}
          selectedId={selectedId()}
          ariaLabel="Commands"
          onSelectedIdChange={setSelectedId}
          onActivate={activate}
        />
      ),
      container,
    )

    const list = container.querySelector<HTMLElement>('[role="listbox"]')!
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await Promise.resolve()

    expect(list.getAttribute('aria-activedescendant')).toBe('commands-option-two')
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Unavailable: Choose a place first',
    )

    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(activate).not.toHaveBeenCalled()

    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(activate).toHaveBeenCalledWith(items[2])
  })

  test('makes pointer hover select before pointer activation', () => {
    const [selectedId, setSelectedId] = createSignal<string | null>('one')
    const activate = vi.fn()
    dispose = render(
      () => (
        <SelectableList
          items={items}
          selectedId={selectedId()}
          ariaLabel="Commands"
          onSelectedIdChange={setSelectedId}
          onActivate={activate}
        />
      ),
      container,
    )

    const third = container.querySelectorAll<HTMLElement>('[role="option"]')[2]!
    third.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }))
    expect(third.getAttribute('aria-selected')).toBe('true')
    third.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }))

    expect(activate).toHaveBeenCalledWith(items[2])
  })

  test('connects an external focus owner and restores its previous ARIA contract', async () => {
    const owner = document.createElement('div')
    owner.setAttribute('aria-controls', 'previous-list')
    container.appendChild(owner)
    dispose = render(
      () => (
        <SelectableList
          id="slash-list"
          items={items}
          selectedId="one"
          ariaLabel="Slash commands"
          focusable={false}
          focusOwner={owner}
          onSelectedIdChange={() => {}}
          onActivate={() => {}}
        />
      ),
      container,
    )
    await Promise.resolve()

    expect(owner.getAttribute('aria-controls')).toBe('slash-list')
    expect(owner.getAttribute('aria-expanded')).toBe('true')
    expect(owner.getAttribute('aria-autocomplete')).toBe('list')
    expect(owner.getAttribute('aria-activedescendant')).toBe('slash-list-option-one')

    dispose()
    dispose = undefined
    expect(owner.getAttribute('aria-controls')).toBe('previous-list')
    expect(owner.hasAttribute('aria-expanded')).toBe(false)
    expect(owner.hasAttribute('aria-activedescendant')).toBe(false)
  })

  test('renders explicit empty and invalid states', () => {
    dispose = render(
      () => (
        <SelectableList
          items={[]}
          selectedId={null}
          ariaLabel="Invalid results"
          emptyMessage="Nothing matches"
          invalid
          onSelectedIdChange={() => {}}
          onActivate={() => {}}
        />
      ),
      container,
    )

    const list = container.querySelector('[role="listbox"]')
    expect(list?.getAttribute('aria-invalid')).toBe('true')
    expect(list?.getAttribute('data-empty')).toBe('true')
    expect(container.textContent).toContain('Nothing matches')
  })
})
