import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { ColumnDefinition } from '../core/matrix'
import type { SqlObserver, SqlQuery, SqlResult } from '../core/sql-types'
import type { QueryPlan } from '../sql/query-spec/types'

import DeepPreview from './DeepPreview'

const sqlMocks = vi.hoisted(() => ({
  addObserver: vi.fn(),
  removeObserver: vi.fn(),
}))

vi.mock('../core/client/sql-client', () => sqlMocks)

class TestIntersectionObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
  takeRecords = vi.fn(() => [])
  root = null
  rootMargin = ''
  thresholds = []
}

class TestResizeObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}

const labelColumn: ColumnDefinition = {
  id: 1,
  name: 'label',
  type: 'TEXT',
  displayType: 'text',
  order: 0,
  options: null,
  formula: null,
  constraints: null,
  managedBy: null,
  role: 'label',
}

const statusColumn: ColumnDefinition = {
  ...labelColumn,
  id: 2,
  name: 'status',
  order: 1,
  role: null,
}

const contentColumn: ColumnDefinition = {
  ...labelColumn,
  id: 3,
  name: 'content',
  order: 2,
  role: 'content',
}

const plan = (value = 'open'): QueryPlan => ({
  template: 'SELECT d.* FROM "mx_7_data" AS d WHERE d."status" = ?1 ORDER BY d.id LIMIT ?2',
  bindings: [value, 1_000],
})

const pmLabel = (text: string): string =>
  JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })

type SubscriptionCall = [SqlQuery, SqlObserver]

const calls = (): SubscriptionCall[] =>
  sqlMocks.addObserver.mock.calls as unknown as SubscriptionCall[]

const countCalls = (): SubscriptionCall[] =>
  calls().filter(([request]) => request.sql.includes('COUNT(*) AS row_count'))

const rangeCalls = (): SubscriptionCall[] =>
  calls().filter(([request]) => request.sql.startsWith('SELECT *'))

const publish = async (
  call: SubscriptionCall,
  result: SqlResult | null,
  error: Error | null = null,
): Promise<void> => {
  call[1](result, error)
  await Promise.resolve()
}

describe('DeepPreview', () => {
  let container: HTMLDivElement
  let mount: HTMLDivElement
  let input: HTMLInputElement
  let dispose: (() => void) | undefined
  let clientHeightDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver)
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    clientHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientHeight',
    )
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      value: 160,
    })

    container = document.createElement('div')
    input = document.createElement('input')
    mount = document.createElement('div')
    container.append(input, mount)
    document.body.appendChild(container)
  })

  afterEach(() => {
    dispose?.()
    container.remove()
    vi.unstubAllGlobals()
    if (clientHeightDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor)
    }
  })

  const renderPreview = (overrides: Partial<Parameters<typeof DeepPreview>[0]> = {}): void => {
    dispose = render(
      () => (
        <DeepPreview
          plan={plan()}
          matrixId={7}
          columns={[labelColumn, statusColumn]}
          presentationColumns={[labelColumn, statusColumn]}
          focusOwner={input}
          active
          onNavigate={() => {}}
          {...overrides}
        />
      ),
      mount,
    )
  }

  test('shows stable loading, empty, and error states', async () => {
    renderPreview()
    expect(mount.querySelector('[role="listbox"]')?.getAttribute('aria-busy')).toBe('true')
    expect(mount.textContent).toContain('Loading preview…')

    await publish(countCalls()[0]!, [{ row_count: 0 }])
    expect(mount.querySelector('[data-preview-state="empty"]')).not.toBeNull()
    expect(mount.textContent).toContain('No matching rows.')

    dispose?.()
    dispose = undefined
    vi.clearAllMocks()
    renderPreview()
    await publish(countCalls()[0]!, null, new Error('query exploded'))

    expect(mount.querySelector('[data-preview-state="error"]')).not.toBeNull()
    expect(mount.querySelector('[role="alert"]')?.textContent).toContain('query exploded')
  })

  test('states invalid and external loading reasons without starting query work', () => {
    renderPreview({ invalidReason: 'Choose a valid value.' })
    expect(mount.querySelector('[aria-invalid="true"]')).not.toBeNull()
    expect(mount.textContent).toContain('Choose a valid value.')
    expect(sqlMocks.addObserver).not.toHaveBeenCalled()

    dispose?.()
    dispose = undefined
    renderPreview({ loadingReason: 'Loading the matrix catalog.' })
    expect(mount.textContent).toContain('Loading the matrix catalog.')
    expect(sqlMocks.addObserver).not.toHaveBeenCalled()
  })

  test('keeps querying while suspension releases input ownership', async () => {
    renderPreview({ suspended: true })
    expect(countCalls()).toHaveLength(1)
    expect(input.hasAttribute('aria-controls')).toBe(false)

    await publish(countCalls()[0]!, [{ row_count: 0 }])
    expect(mount.textContent).toContain('No matching rows.')
  })

  test('restores prior input ARIA ownership when authoring suspends preview control', async () => {
    input.setAttribute('aria-controls', 'authoring-list')
    input.setAttribute('aria-activedescendant', 'authoring-option')
    let setSuspended!: (value: boolean) => void
    dispose = render(() => {
      const [suspended, updateSuspended] = createSignal(false)
      setSuspended = updateSuspended
      return (
        <DeepPreview
          plan={plan()}
          matrixId={7}
          columns={[labelColumn]}
          presentationColumns={[labelColumn]}
          focusOwner={input}
          active
          suspended={suspended()}
          onNavigate={() => {}}
        />
      )
    }, mount)

    expect(input.getAttribute('aria-controls')).toContain('deep-preview')
    setSuspended(true)
    await Promise.resolve()
    expect(input.getAttribute('aria-controls')).toBe('authoring-list')
    expect(input.getAttribute('aria-activedescendant')).toBe('authoring-option')
  })

  test('ignores retired count and range outcomes after a plan change', async () => {
    let setPlan!: (next: QueryPlan) => void
    dispose = render(() => {
      const [queryPlan, updatePlan] = createSignal(plan('old'))
      setPlan = updatePlan
      return (
        <DeepPreview
          plan={queryPlan()}
          matrixId={7}
          columns={[labelColumn]}
          presentationColumns={[labelColumn]}
          focusOwner={input}
          active
          onNavigate={() => {}}
        />
      )
    }, mount)

    const oldCount = countCalls()[0]!
    await publish(oldCount, [{ row_count: 1 }])
    const oldRange = rangeCalls().at(-1)!

    setPlan(plan('new'))
    await Promise.resolve()
    const newCount = countCalls().at(-1)!
    await publish(newCount, [{ row_count: 1 }])
    const newRange = rangeCalls().at(-1)!

    await publish(oldRange, [{ id: 11, label: pmLabel('Retired row') }])
    expect(mount.textContent).not.toContain('Retired row')

    await publish(newRange, [{ id: 12, label: pmLabel('Current row') }])
    expect(mount.textContent).toContain('Current row')
    expect(sqlMocks.removeObserver).toHaveBeenCalled()
  })

  test('keeps focus on the owner while arrows select and Enter navigates', async () => {
    const navigate = vi.fn()
    renderPreview({ onNavigate: navigate })
    input.focus()
    await publish(countCalls()[0]!, [{ row_count: 2 }])
    await publish(rangeCalls().at(-1)!, [
      { id: 11, label: pmLabel('First row'), status: 'open' },
      { id: 12, label: pmLabel('Second row'), status: 'closed' },
    ])

    expect(input.getAttribute('aria-activedescendant')).toContain('-7-11')
    expect(mount.textContent).toContain('First row')
    expect(mount.querySelector('[data-preview-column="status"]')?.textContent).toContain('open')

    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    )
    await Promise.resolve()
    expect(input.getAttribute('aria-activedescendant')).toContain('-7-12')
    expect(document.activeElement).toBe(input)

    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    expect(navigate).toHaveBeenCalledWith({
      type: 'node',
      node: { matrixId: 7, rowId: 12 },
    })
  })

  test('inserts the selected preview row with Mod-Enter', async () => {
    const insertRef = vi.fn()
    const navigate = vi.fn()
    renderPreview({ onNavigate: navigate, onInsertRef: insertRef })
    input.focus()
    await publish(countCalls()[0]!, [{ row_count: 1 }])
    await publish(rangeCalls().at(-1)!, [{ id: 11, label: pmLabel('Referenced row') }])

    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )

    expect(insertRef).toHaveBeenCalledWith({
      matrixId: 7,
      rowId: 11,
      cachedTitle: 'Referenced row',
    })
    expect(navigate).not.toHaveBeenCalled()
  })

  test('does not consume preview navigation while a replacement range is loading', async () => {
    renderPreview()
    await publish(countCalls()[0]!, [{ row_count: 2 }])
    const key = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    })
    input.dispatchEvent(key)

    expect(key.defaultPrevented).toBe(false)
  })

  test('extracts rich-text detail cells instead of exposing document JSON', async () => {
    renderPreview({
      columns: [labelColumn, contentColumn],
      presentationColumns: [labelColumn, contentColumn],
    })
    await publish(countCalls()[0]!, [{ row_count: 1 }])
    await publish(rangeCalls().at(-1)!, [
      { id: 11, label: pmLabel('Row'), content: pmLabel('Readable details') },
    ])

    const detail = mount.querySelector('[data-preview-column="content"]')
    expect(detail?.textContent).toContain('Readable details')
    expect(detail?.textContent).not.toContain('"type":"doc"')
  })

  test('mounts only the retained bounded range and exposes no editing affordances', async () => {
    renderPreview()
    await publish(countCalls()[0]!, [{ row_count: 1_000 }])
    const range = rangeCalls().at(-1)!
    const limit = Number(range[0].bindings?.at(-2))
    const rows = Array.from({ length: limit + 200 }, (_, index) => ({
      id: index + 1,
      label: pmLabel(`Row ${index + 1}`),
      status: 'open',
    }))
    await publish(range, rows)

    const mounted = mount.querySelectorAll('[role="option"]')
    expect(limit).toBeLessThanOrEqual(600)
    expect(mounted.length).toBe(limit)
    expect(mounted.length).toBeLessThanOrEqual(600)
    expect(mount.querySelector('input, button, [contenteditable="true"]')).toBeNull()
  })
})
