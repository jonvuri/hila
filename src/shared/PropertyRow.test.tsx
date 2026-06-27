import { afterEach, describe, expect, test } from 'vitest'
import { render } from 'solid-js/web'

import type { ColumnDefinition } from '../core/matrix'

import { PropertyRow } from './PropertyRow'

const col = (name: string, role: 'label' | 'content' | null = null): ColumnDefinition => ({
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
})
