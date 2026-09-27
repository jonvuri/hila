import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'solid-js/web'

import type { ColumnDefinition } from '../core/matrix'

import { FieldEditor } from './FieldEditor'

const column = (overrides: Partial<ColumnDefinition> = {}): ColumnDefinition => ({
  id: 1,
  name: 'status',
  type: 'TEXT',
  displayType: 'text',
  order: 0,
  options: null,
  formula: null,
  constraints: null,
  managedBy: null,
  role: null,
  ...overrides,
})

describe('FieldEditor', () => {
  let dispose: (() => void) | undefined

  afterEach(() => {
    dispose?.()
    dispose = undefined
    document.body.replaceChildren()
  })

  test('associates its visible label with the control', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(
      () => <FieldEditor column={column()} value="todo" onSave={() => {}} />,
      container,
    )

    const input = container.querySelector<HTMLInputElement>('input')!
    expect(input.labels?.[0]?.textContent).toBe('status')
  })

  test('keeps a name when a host owns label placement', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(
      () => <FieldEditor column={column()} value="todo" showLabel={false} onSave={() => {}} />,
      container,
    )

    expect(container.querySelector('input')?.getAttribute('aria-label')).toBe('status')
  })

  test('reports invalid state and its message accessibly', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(
      () => (
        <FieldEditor
          column={column()}
          value="unknown"
          invalid
          validationMessage="Choose a known status."
          onSave={() => {}}
        />
      ),
      container,
    )

    const input = container.querySelector('input')!
    const messageId = input.getAttribute('aria-describedby')!
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(container.querySelector(`#${messageId}`)?.textContent).toBe('Choose a known status.')
  })

  test('commits on Enter and restores on Escape', () => {
    const onSave = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(
      () => <FieldEditor column={column()} value="todo" onSave={onSave} />,
      container,
    )
    const input = container.querySelector<HTMLInputElement>('input')!

    input.value = 'doing'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onSave).toHaveBeenCalledWith('doing')

    input.value = 'done'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(input.value).toBe('todo')
  })
})
