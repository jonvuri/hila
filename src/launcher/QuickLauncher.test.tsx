import { Show, createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { DiscoveryNodeResult, DiscoverySearchOutcome } from '../discovery/types'

import QuickLauncher, { type LauncherDiscoveryService } from './QuickLauncher'

const result = (id: string, label: string): DiscoveryNodeResult => ({
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

  test('applies the selected family suggestion with Tab without activating ordinary results', async () => {
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

    expect(ordinaryTab.defaultPrevented).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
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
