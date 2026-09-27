import { afterEach, describe, expect, test } from 'vitest'
import { render } from 'solid-js/web'

import type { ColumnDefinition } from '../core/matrix'

import { PropertyRow } from './PropertyRow'

const col = (
  name: string,
  role: 'label' | 'content' | null = null,
  overrides: Partial<ColumnDefinition> = {},
): ColumnDefinition => ({
  id: 0,
  name,
  type: 'TEXT',
  displayType: 'text',
  order: 0,
  options: null,
  formula: null,
  constraints: null,
  managedBy: null,
  role,
  ...overrides,
})

describe('PropertyRow readOnly mode (Phase 9.3)', () => {
  let dispose: (() => void) | undefined
  let container: HTMLDivElement

  afterEach(() => {
    dispose?.()
    dispose = undefined
  })

  const mount = (readOnly: boolean) => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const columns = [col('label', 'label'), col('status')]
    const data = { label: 'Buy milk', status: 'open' }
    dispose = render(
      () => <PropertyRow columns={columns} data={data} density="wide" readOnly={readOnly} />,
      container,
    )
  }

  test('readOnly renders display spans and no editable inputs', () => {
    mount(true)
    expect(container.querySelector('input')).toBeNull()
    const cells = container.querySelectorAll('[data-testid="property-row-readonly-cell"]')
    const texts = Array.from(cells).map((c) => c.textContent)
    expect(texts).toContain('Buy milk')
    expect(texts).toContain('open')
  })

  test('editable mode renders live inputs', () => {
    mount(false)
    expect(container.querySelectorAll('input').length).toBeGreaterThan(0)
    expect(
      container.querySelectorAll('[data-testid="property-row-readonly-cell"]').length,
    ).toBe(0)
  })

  test('isEditable predicate lights up only matching cells (overrides readOnly)', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const columns = [col('label', 'label'), col('status'), col('age')]
    const data = { label: 'Buy milk', status: 'open', age: '3' }
    // `status` editable; `label` and `age` read-only — even with readOnly omitted.
    dispose = render(
      () => (
        <PropertyRow
          columns={columns}
          data={data}
          density="wide"
          isEditable={(c) => c.name === 'status'}
        />
      ),
      container,
    )
    // Exactly one editable input (status); label + age are read-only spans.
    expect(container.querySelectorAll('input').length).toBe(1)
    const readonly = Array.from(
      container.querySelectorAll('[data-testid="property-row-readonly-cell"]'),
    ).map((c) => c.textContent)
    expect(readonly).toContain('Buy milk')
    expect(readonly).toContain('3')
    expect(readonly).not.toContain('open')
  })

  test('keeps dry and formula values read-only', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const columns = [col('label', 'label'), col('score', null, { formula: '1 + 1' })]
    dispose = render(
      () => <PropertyRow columns={columns} data={null} density="wide" onSave={() => {}} />,
      container,
    )

    expect(
      container.querySelector('[data-testid="property-row"]')?.getAttribute('data-hydrated'),
    ).toBe('false')
    expect(container.querySelector('input')).toBeNull()
    expect(
      container.querySelectorAll('[data-testid="property-row-readonly-cell"]'),
    ).toHaveLength(1)
    expect(container.textContent).toContain('score')
  })

  test('keeps a label-like formula read-only when isEditable allows every column', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const columns = [
      col('title', null, { formula: "'derived title'" }),
      col('heading', 'label'),
      col('status'),
    ]
    const data = { title: 'Derived title', heading: 'Task', status: 'open' }
    dispose = render(
      () => (
        <PropertyRow columns={columns} data={data} density="wide" isEditable={() => true} />
      ),
      container,
    )

    expect(container.querySelectorAll('input')).toHaveLength(2)
    expect(container.querySelectorAll('input')[0]?.value).toBe('Task')
    expect(container.querySelectorAll('input')[1]?.value).toBe('open')
    expect(container.textContent?.match(/Derived title/g)).toHaveLength(1)
    expect(container.textContent).toContain('title')
  })
})
