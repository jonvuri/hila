import { Show, createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { ColumnDefinition } from '../core/matrix'
import type { DiscoveryNodeResult, DiscoverySearchOutcome } from '../discovery/types'

import QuickLauncher, { type LauncherDiscoveryService } from './QuickLauncher'

const sqlMocks = vi.hoisted(() => ({
  addObserver: vi.fn(),
  removeObserver: vi.fn(),
}))

vi.mock('../core/client/sql-client', () => sqlMocks)

const result = (
  id: string,
  label: string,
  overrides: Partial<DiscoveryNodeResult> = {},
): DiscoveryNodeResult => ({
  id,
  family: 'row',
  node: { matrixId: 2, rowId: Number(id) },
  label,
  detail: '',
  breadcrumb: [{ label: 'Workspace' }],
  navigation: null,
  ownedMatrixIds: [],
  matchTarget: 'label',
  matchQuality: 'exact',
  score: 440,
  structuralDepth: 1,
  structuralOrder: id,
  ...overrides,
})

const column = (
  id: number,
  name: string,
  displayType = 'text',
  role: ColumnDefinition['role'] = null,
): ColumnDefinition => ({
  id,
  name,
  type: displayType === 'number' ? 'REAL' : 'TEXT',
  displayType,
  order: id,
  options: null,
  formula: null,
  constraints: null,
  managedBy: null,
  role,
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('QuickLauncher', () => {
  let container: HTMLDivElement
  let dispose: (() => void) | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    dispose?.()
    container.remove()
    document.body.replaceChildren()
  })

  test('publishes results, selection, and counts only for the latest input', async () => {
    const first = deferred<DiscoverySearchOutcome>()
    const second = deferred<DiscoverySearchOutcome>()
    const search = vi
      .fn<LauncherDiscoveryService['search']>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const service = { search, cancel: vi.fn() }
    const navigate = vi.fn()
    dispose = render(
      () => (
        <QuickLauncher
          rootMatrixId={1}
          visualTheme="ghost"
          invocation={{}}
          discoveryService={service}
          onNavigate={navigate}
          onDismiss={() => {}}
        />
      ),
      container,
    )
    await Promise.resolve()
    const input = container.querySelector<HTMLInputElement>('#quick-launcher-input')!

    input.value = 'old'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    input.value = 'new'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    expect(search).toHaveBeenCalledTimes(2)

    second.resolve({ status: 'current', results: [result('2', 'Latest')] })
    await Promise.resolve()
    await Promise.resolve()
    expect(container.textContent).toContain('Latest')
    expect(
      [...container.querySelectorAll('[role="status"]')].some((status) =>
        status.textContent?.includes('1 result'),
      ),
    ).toBe(true)
    expect(input.getAttribute('aria-activedescendant')).toContain('2')

    first.resolve({ status: 'current', results: [result('1', 'Stale')] })
    await Promise.resolve()
    await Promise.resolve()
    expect(container.textContent).not.toContain('Stale')

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(navigate).toHaveBeenCalledWith({
      type: 'node',
      node: { matrixId: 2, rowId: 2 },
      provenance: undefined,
    })
  })

  test('applies, browses, and removes input-start family tokens outside query text', async () => {
    const search = vi.fn<LauncherDiscoveryService['search']>(async () => ({
      status: 'current',
      results: [],
    }))
    dispose = render(
      () => (
        <QuickLauncher
          rootMatrixId={1}
          visualTheme="null"
          invocation={{}}
          discoveryService={{ search, cancel: vi.fn() }}
          onNavigate={() => {}}
          onDismiss={() => {}}
        />
      ),
      container,
    )
    await Promise.resolve()
    const input = container.querySelector<HTMLInputElement>('#quick-launcher-input')!

    input.value = 'types'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    container
      .querySelector<HTMLElement>('[role="option"]')!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
    expect(container.querySelector('[data-filter="types"]')).not.toBeNull()
    expect(input.value).toBe('')
    input.setSelectionRange(0, 0)
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }),
    )

    input.setSelectionRange(0, 0)
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: '#', bubbles: true, cancelable: true }),
    )
    await Promise.resolve()
    expect(container.querySelector('[data-filter="types"]')).not.toBeNull()
    expect(input.value).toBe('')
    expect(search).toHaveBeenLastCalledWith({
      rootMatrixId: 1,
      query: '',
      filter: 'types',
      limit: 12,
    })

    input.setSelectionRange(0, 0)
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }),
    )
    expect(container.querySelector('[data-filter]')).toBeNull()

    input.value = 'notes#today'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    expect(container.querySelector('[data-filter]')).toBeNull()
    expect(input.value).toBe('notes#today')
  })

  test('uses Tab for family selection and commits an ordinary node as scope', async () => {
    const search = vi.fn<LauncherDiscoveryService['search']>(async () => ({
      status: 'current',
      results: [],
    }))
    dispose = render(
      () => (
        <QuickLauncher
          rootMatrixId={1}
          visualTheme="null"
          invocation={{}}
          discoveryService={{ search, cancel: vi.fn() }}
          onNavigate={() => {}}
          onDismiss={() => {}}
        />
      ),
      container,
    )
    await Promise.resolve()
    const input = container.querySelector<HTMLInputElement>('#quick-launcher-input')!

    input.value = 'types'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    input.dispatchEvent(tab)

    expect(tab.defaultPrevented).toBe(true)
    expect(container.querySelector('[data-filter="types"]')).not.toBeNull()
    expect(input.value).toBe('')

    const navigate = vi.fn()
    dispose?.()
    container.replaceChildren()
    dispose = render(
      () => (
        <QuickLauncher
          rootMatrixId={1}
          visualTheme="null"
          invocation={{}}
          discoveryService={{
            search: async () => ({ status: 'current', results: [result('1', 'Ordinary')] }),
            cancel: vi.fn(),
          }}
          onNavigate={navigate}
          onDismiss={() => {}}
        />
      ),
      container,
    )
    await Promise.resolve()
    const ordinaryInput = container.querySelector<HTMLInputElement>('#quick-launcher-input')!
    ordinaryInput.value = 'Ordinary'
    ordinaryInput.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await Promise.resolve()
    const ordinaryTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    })
    ordinaryInput.dispatchEvent(ordinaryTab)

    expect(ordinaryTab.defaultPrevented).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
    expect(container.querySelector('[data-launcher-tempo="deep"]')).not.toBeNull()
    expect(container.querySelector('[data-chip-type="scope"]')?.textContent).toContain(
      'Ordinary',
    )
  })

  test('commits a kind, authors a typed predicate, and removes chips back to Quick', async () => {
    const typeResult = result('7', 'Projects', {
      family: 'type',
      node: undefined,
      subjectMatrixId: 7,
    })
    const loadColumns = () =>
      Promise.resolve([column(1, 'label', 'text', 'label'), column(2, 'status')])
    dispose = render(
      () => (
        <QuickLauncher
          rootMatrixId={1}
          visualTheme="ghost"
          invocation={{}}
          discoveryService={{
            search: async () => ({ status: 'current', results: [typeResult] }),
            cancel: vi.fn(),
          }}
          loadColumns={loadColumns}
          onNavigate={() => {}}
          onDismiss={() => {}}
        />
      ),
      container,
    )
    await Promise.resolve()
    const input = container.querySelector<HTMLInputElement>('#quick-launcher-input')!

    input.value = 'Projects'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await Promise.resolve()
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    )
    await Promise.resolve()
    await Promise.resolve()

    expect(container.querySelector('[data-launcher-tempo="deep"]')).not.toBeNull()
    expect(container.querySelector('[data-chip-type="kind"]')?.textContent).toBe('#Projects')
    await vi.waitFor(() => expect(sqlMocks.addObserver).toHaveBeenCalled())

    input.value = 'status = open'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await Promise.resolve()
    expect(container.querySelector('[data-chip-type="predicate"]')?.textContent).toContain(
      'status = open',
    )

    const kindBeforeEdit = container.querySelector<HTMLButtonElement>(
      '[data-chip-type="kind"]',
    )!
    kindBeforeEdit.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    expect(container.querySelector('[data-filter="types"]')).not.toBeNull()
    expect(container.querySelector('[data-chip-type="predicate"]')).toBeNull()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await Promise.resolve()
    expect(container.querySelector('[data-chip-type="kind"]')?.textContent).toBe('#Projects')
    expect(container.querySelector('[data-chip-type="predicate"]')?.textContent).toContain(
      'status = open',
    )

    const predicate = container.querySelector<HTMLButtonElement>(
      '[data-chip-type="predicate"]',
    )!
    predicate.focus()
    predicate.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }),
    )
    expect(container.querySelector('[data-chip-type="predicate"]')).toBeNull()
    const kind = container.querySelector<HTMLButtonElement>('[data-chip-type="kind"]')!
    kind.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }),
    )
    expect(container.querySelector('[data-launcher-tempo="quick"]')).not.toBeNull()
  })

  test('pointer-replaces edited objects and preserves clauses only for the same kind', async () => {
    const projects = result('7', 'Projects', {
      family: 'type',
      node: undefined,
      subjectMatrixId: 7,
    })
    const archive = result('8', 'Archive', {
      family: 'type',
      node: undefined,
      subjectMatrixId: 8,
    })
    const navigate = vi.fn()
    const dismiss = vi.fn()
    dispose = render(
      () => (
        <QuickLauncher
          rootMatrixId={1}
          visualTheme="ghost"
          invocation={{}}
          discoveryService={{
            search: async ({ query }) => ({
              status: 'current',
              results: [projects, archive].filter((item) =>
                item.label.toLowerCase().includes(query.toLowerCase()),
              ),
            }),
            cancel: vi.fn(),
          }}
          loadColumns={() =>
            Promise.resolve([column(1, 'label', 'text', 'label'), column(2, 'status')])
          }
          onNavigate={navigate}
          onDismiss={dismiss}
        />
      ),
      container,
    )
    await Promise.resolve()
    const input = container.querySelector<HTMLInputElement>('#quick-launcher-input')!
    input.value = 'Projects'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await vi.waitFor(() => expect(container.textContent).toContain('Projects'))
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() => expect(sqlMocks.addObserver).toHaveBeenCalled())

    input.value = 'status = open'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    input.value = 'label desc'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    expect(container.querySelector('[data-chip-type="predicate"]')?.textContent).toContain(
      'status = open',
    )
    expect(container.querySelector('[data-chip-type="order"]')?.textContent).toContain(
      '↓ label',
    )

    container.querySelector<HTMLButtonElement>('[data-chip-type="kind"]')!.click()
    await vi.waitFor(() =>
      expect(
        [...container.querySelectorAll<HTMLElement>('[role="option"]')].some((option) =>
          option.textContent?.includes('Projects'),
        ),
      ).toBe(true),
    )
    ;[...container.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((option) => option.textContent?.includes('Projects'))!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }))

    expect(container.querySelector('[data-chip-type="predicate"]')?.textContent).toContain(
      'status = open',
    )
    expect(container.querySelector('[data-chip-type="order"]')?.textContent).toContain(
      '↓ label',
    )
    expect(navigate).not.toHaveBeenCalled()
    expect(dismiss).not.toHaveBeenCalled()

    container.querySelector<HTMLButtonElement>('[data-chip-type="kind"]')!.click()
    input.value = 'Archive'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await vi.waitFor(() =>
      expect(
        [...container.querySelectorAll<HTMLElement>('[role="option"]')].some((option) =>
          option.textContent?.includes('Archive'),
        ),
      ).toBe(true),
    )
    ;[...container.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((option) => option.textContent?.includes('Archive'))!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }))

    expect(container.querySelector('[data-chip-type="kind"]')?.textContent).toContain('Archive')
    expect(container.querySelector('[data-chip-type="predicate"]')).toBeNull()
    expect(container.querySelector('[data-chip-type="order"]')).toBeNull()
    expect(navigate).not.toHaveBeenCalled()
    expect(dismiss).not.toHaveBeenCalled()
  })

  test('pointer-replaces an edited scope without navigating', async () => {
    const alpha = result('1', 'Alpha')
    const beta = result('2', 'Beta')
    const navigate = vi.fn()
    const dismiss = vi.fn()
    dispose = render(
      () => (
        <QuickLauncher
          rootMatrixId={1}
          visualTheme="null"
          invocation={{}}
          discoveryService={{
            search: async ({ query }) => ({
              status: 'current',
              results: [alpha, beta].filter((item) =>
                item.label.toLowerCase().includes(query.toLowerCase()),
              ),
            }),
            cancel: vi.fn(),
          }}
          onNavigate={navigate}
          onDismiss={dismiss}
        />
      ),
      container,
    )
    await Promise.resolve()
    const input = container.querySelector<HTMLInputElement>('#quick-launcher-input')!
    input.value = 'Alpha'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await vi.waitFor(() => expect(container.textContent).toContain('Alpha'))
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    )

    container.querySelector<HTMLButtonElement>('[data-chip-type="scope"]')!.click()
    input.value = 'Beta'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await vi.waitFor(() =>
      expect(
        [...container.querySelectorAll<HTMLElement>('[role="option"]')].some((option) =>
          option.textContent?.includes('Beta'),
        ),
      ).toBe(true),
    )
    ;[...container.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((option) => option.textContent?.includes('Beta'))!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }))

    expect(container.querySelector('[data-chip-type="scope"]')?.textContent).toContain('Beta')
    expect(navigate).not.toHaveBeenCalled()
    expect(dismiss).not.toHaveBeenCalled()
  })

  test('reparses a fluent expression when its columns finish loading', async () => {
    const columns = deferred<ColumnDefinition[]>()
    const typeResult = result('7', 'Projects', {
      family: 'type',
      node: undefined,
      subjectMatrixId: 7,
    })
    dispose = render(
      () => (
        <QuickLauncher
          rootMatrixId={1}
          visualTheme="ghost"
          invocation={{}}
          discoveryService={{
            search: async () => ({ status: 'current', results: [typeResult] }),
            cancel: vi.fn(),
          }}
          loadColumns={() => columns.promise}
          onNavigate={() => {}}
          onDismiss={() => {}}
        />
      ),
      container,
    )
    await Promise.resolve()
    const input = container.querySelector<HTMLInputElement>('#quick-launcher-input')!
    input.value = 'Projects'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await Promise.resolve()
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    )

    input.value = 'status = open'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    expect(container.querySelector('[data-chip-type="predicate"]')).toBeNull()

    columns.resolve([column(1, 'label', 'text', 'label'), column(2, 'status')])
    await vi.waitFor(() =>
      expect(container.querySelector('[data-chip-type="predicate"]')?.textContent).toContain(
        'status = open',
      ),
    )
    expect(container.querySelectorAll('[data-chip-type="predicate"]')).toHaveLength(1)
    expect(input.value).toBe('')
  })

  test('Backspace exits an emptied popped-chip draft with the chip deleted', async () => {
    const typeResult = result('7', 'Projects', {
      family: 'type',
      node: undefined,
      subjectMatrixId: 7,
    })
    dispose = render(
      () => (
        <QuickLauncher
          rootMatrixId={1}
          visualTheme="ghost"
          invocation={{}}
          discoveryService={{
            search: async () => ({ status: 'current', results: [typeResult] }),
            cancel: vi.fn(),
          }}
          loadColumns={() =>
            Promise.resolve([column(1, 'label', 'text', 'label'), column(2, 'status')])
          }
          onNavigate={() => {}}
          onDismiss={() => {}}
        />
      ),
      container,
    )
    await Promise.resolve()
    const input = container.querySelector<HTMLInputElement>('#quick-launcher-input')!
    input.value = 'Projects'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await Promise.resolve()
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() => expect(sqlMocks.addObserver).toHaveBeenCalled())
    input.value = 'status = open'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))

    input.setSelectionRange(0, 0)
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }),
    )
    expect(input.value).toBe('open')
    expect(container.querySelector('[data-chip-type="predicate"]')).toBeNull()

    input.value = ''
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    input.setSelectionRange(0, 0)
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }),
    )

    expect(container.querySelector('[data-testid="launcher-authoring-list"]')).toBeNull()
    expect(container.querySelector('[data-chip-type="predicate"]')).toBeNull()
    expect(container.querySelector('[data-chip-type="kind"]')?.textContent).toContain(
      'Projects',
    )
  })

  test('rebinds valid draft values without committing and retires the plan when invalid', async () => {
    const typeResult = result('7', 'Projects', {
      family: 'type',
      node: undefined,
      subjectMatrixId: 7,
    })
    dispose = render(
      () => (
        <QuickLauncher
          rootMatrixId={1}
          visualTheme="ghost"
          invocation={{}}
          discoveryService={{
            search: async () => ({ status: 'current', results: [typeResult] }),
            cancel: vi.fn(),
          }}
          loadColumns={() =>
            Promise.resolve([
              column(1, 'label', 'text', 'label'),
              column(2, 'points', 'number'),
            ])
          }
          onNavigate={() => {}}
          onDismiss={() => {}}
        />
      ),
      container,
    )
    await Promise.resolve()
    const input = container.querySelector<HTMLInputElement>('#quick-launcher-input')!
    input.value = 'Projects'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await Promise.resolve()
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() => expect(sqlMocks.addObserver).toHaveBeenCalled())

    input.value = 'points'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await Promise.resolve()
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    )
    await Promise.resolve()
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    )
    await Promise.resolve()
    expect(input.placeholder).toBe('Enter a value…')

    sqlMocks.addObserver.mockClear()
    input.value = '12'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await Promise.resolve()
    input.value = '13'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await Promise.resolve()

    const countRequests = sqlMocks.addObserver.mock.calls
      .map(
        ([request]) =>
          request as { readonly sql: string; readonly bindings: readonly unknown[] },
      )
      .filter((request) => request.sql.includes('COUNT(*) AS row_count'))
    expect(countRequests).toHaveLength(2)
    expect(countRequests[1]!.sql).toBe(countRequests[0]!.sql)
    expect(countRequests[0]!.bindings).toEqual([12, 1_000])
    expect(countRequests[1]!.bindings).toEqual([13, 1_000])
    expect(container.querySelector('[data-chip-type="predicate"]')).toBeNull()

    sqlMocks.removeObserver.mockClear()
    input.value = 'nope'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await Promise.resolve()
    expect(sqlMocks.addObserver.mock.calls).toHaveLength(2)
    expect(sqlMocks.removeObserver).toHaveBeenCalledWith(countRequests[1], expect.any(Function))
    expect(container.querySelector('[data-preview-state="invalid"]')?.textContent).toContain(
      'nope is not a finite number.',
    )
    expect(container.querySelector('[data-chip-type="predicate"]')).toBeNull()

    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(container.querySelector('[data-preview-state="invalid"]')?.textContent).toContain(
      'nope is not a finite number.',
    )
    expect(container.querySelector('[data-chip-type="predicate"]')).toBeNull()
  })

  test('converges pointer menu authoring on the same predicate and states invalid values', async () => {
    const typeResult = result('7', 'Projects', {
      family: 'type',
      node: undefined,
      subjectMatrixId: 7,
    })
    const loadColumns = () =>
      Promise.resolve([
        column(1, 'label', 'text', 'label'),
        column(2, 'status'),
        column(3, 'points', 'number'),
      ])
    dispose = render(
      () => (
        <QuickLauncher
          rootMatrixId={1}
          visualTheme="null"
          invocation={{}}
          discoveryService={{
            search: async () => ({ status: 'current', results: [typeResult] }),
            cancel: vi.fn(),
          }}
          loadColumns={loadColumns}
          onNavigate={() => {}}
          onDismiss={() => {}}
        />
      ),
      container,
    )
    await Promise.resolve()
    const input = container.querySelector<HTMLInputElement>('#quick-launcher-input')!
    input.value = 'Projects'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await Promise.resolve()
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    )
    await Promise.resolve()
    await Promise.resolve()
    await vi.waitFor(() => expect(sqlMocks.addObserver).toHaveBeenCalled())

    input.value = 'status'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await Promise.resolve()
    ;[...container.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((option) => option.textContent?.includes('status'))!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
    await Promise.resolve()
    ;[...container.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((option) => option.textContent?.includes('equals'))!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
    input.value = 'open'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    expect(container.querySelector('[data-chip-type="predicate"]')?.textContent).toContain(
      'status = open',
    )

    input.value = 'status empty'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    const predicateChips = container.querySelectorAll<HTMLButtonElement>(
      '[data-chip-type="predicate"]',
    )
    const emptyChip = predicateChips[predicateChips.length - 1]!
    expect(emptyChip.textContent).toContain('status ∅')
    emptyChip.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    expect(input.placeholder).toBe('Choose or type an operator…')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await Promise.resolve()
    expect(container.textContent).toContain('status ∅')

    input.value = 'points = nope'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(container.textContent).toContain('nope is not a finite number.')
  })

  test('keeps focus and states a reason when Tab targets a formula field', async () => {
    const typeResult = result('7', 'Projects', {
      family: 'type',
      node: undefined,
      subjectMatrixId: 7,
    })
    const formula = { ...column(4, 'remaining', 'number'), formula: '{{3}} - 1' }
    dispose = render(
      () => (
        <QuickLauncher
          rootMatrixId={1}
          visualTheme="ghost"
          invocation={{}}
          discoveryService={{
            search: async () => ({ status: 'current', results: [typeResult] }),
            cancel: vi.fn(),
          }}
          loadColumns={() => Promise.resolve([column(1, 'label', 'text', 'label'), formula])}
          onNavigate={() => {}}
          onDismiss={() => {}}
        />
      ),
      container,
    )
    await Promise.resolve()
    const input = container.querySelector<HTMLInputElement>('#quick-launcher-input')!
    input.value = 'Projects'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await Promise.resolve()
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() => expect(sqlMocks.addObserver).toHaveBeenCalled())

    input.value = 'remaining'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await Promise.resolve()
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    input.dispatchEvent(tab)

    expect(tab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(input)
    expect(input.getAttribute('aria-describedby')).toBe('quick-launcher-notice')
    expect(container.textContent).toContain(
      'Formula columns cannot filter or sort in this version.',
    )

    sqlMocks.addObserver.mockClear()
    input.value = 'remaining > 2'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await Promise.resolve()

    expect(input.getAttribute('aria-describedby')).toBe('quick-launcher-notice')
    expect(container.textContent).toContain(
      'Formula columns cannot filter or sort in this version.',
    )
    const latestRequest = sqlMocks.addObserver.mock.calls.at(-1)?.[0] as
      | { readonly sql: string }
      | undefined
    expect(latestRequest).toBeDefined()
    expect(latestRequest?.sql).not.toContain('LIKE')
  })

  test('does not publish distinct values from a retired select request', async () => {
    const typeResult = result('7', 'Projects', {
      family: 'type',
      node: undefined,
      subjectMatrixId: 7,
    })
    dispose = render(
      () => (
        <QuickLauncher
          rootMatrixId={1}
          visualTheme="ghost"
          invocation={{}}
          discoveryService={{
            search: async () => ({ status: 'current', results: [typeResult] }),
            cancel: vi.fn(),
          }}
          loadColumns={() =>
            Promise.resolve([
              column(1, 'label', 'text', 'label'),
              column(2, 'status', 'select'),
              column(3, 'category', 'select'),
            ])
          }
          onNavigate={() => {}}
          onDismiss={() => {}}
        />
      ),
      container,
    )
    await Promise.resolve()
    const input = container.querySelector<HTMLInputElement>('#quick-launcher-input')!
    input.value = 'Projects'
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await Promise.resolve()
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() => expect(sqlMocks.addObserver).toHaveBeenCalled())

    const beginSelectValue = async (name: string) => {
      input.value = name
      input.dispatchEvent(new InputEvent('input', { bubbles: true }))
      await Promise.resolve()
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
    }
    const distinctCalls = () =>
      sqlMocks.addObserver.mock.calls.filter(
        ([request]) => typeof request === 'object' && request.sql.startsWith('SELECT DISTINCT'),
      ) as unknown as Array<
        [
          { readonly sql: string },
          (result: Array<Record<string, unknown>>, error: Error | null) => void,
        ]
      >

    await beginSelectValue('status')
    const retired = distinctCalls().at(-1)!
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await Promise.resolve()
    await beginSelectValue('category')
    const current = distinctCalls().at(-1)!

    retired[1]([{ value: 'stale' }], null)
    await Promise.resolve()
    expect(container.textContent).not.toContain('stale')
    current[1]([{ value: 'fresh' }], null)
    await Promise.resolve()
    expect(container.textContent).toContain('fresh')
  })

  test('opens the generated guide and restores the exact invoker on dismissal', async () => {
    const invoker = document.createElement('button')
    document.body.appendChild(invoker)
    invoker.focus()
    const [open, setOpen] = createSignal(true)
    dispose = render(
      () => (
        <Show when={open()}>
          <QuickLauncher
            rootMatrixId={1}
            visualTheme="ghost"
            invocation={{ focusElement: invoker }}
            discoveryService={{
              search: async () => ({ status: 'current', results: [] }),
              cancel: () => {},
            }}
            onNavigate={() => {}}
            onDismiss={() => setOpen(false)}
          />
        </Show>
      ),
      container,
    )
    await Promise.resolve()
    const input = container.querySelector<HTMLInputElement>('#quick-launcher-input')!
    expect(document.activeElement).toBe(input)

    input.setSelectionRange(0, 0)
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true }),
    )
    expect(container.querySelector('[data-testid="launcher-guide"]')?.textContent).toContain(
      'Show launcher guide',
    )

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await Promise.resolve()
    expect(document.activeElement).toBe(invoker)
  })
})
