import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'

import type { ComponentVariantConfig, VisualTheme } from '../design/tokens'

const mocks = vi.hoisted(() => ({
  execQuery: vi.fn(),
  nextFocusInstance: 0,
  resolveDrillInPosition: vi.fn(),
}))

vi.mock('../core/client/sql-client', () => ({
  execQuery: mocks.execQuery,
}))

vi.mock('../core/client/matrix-client', () => ({
  resolveDrillInPosition: mocks.resolveDrillInPosition,
}))

vi.mock('../sql/useQuery', () => ({
  useQuery: () => ({
    result: () => null,
    error: () => null,
  }),
}))

type MockNavigationPanelProps = {
  navigationOutline?: string
  onOpenFocus: (matrixId: number, rowId: number, key: Uint8Array) => void
  onOpenFoldedFocus: (matrixId: number, rowId: number) => void
}

vi.mock('./NavigationPanel', () => ({
  default: (props: MockNavigationPanelProps) => (
    <div data-navigation-outline={props.navigationOutline}>
      <button onClick={() => props.onOpenFocus(10, 101, Uint8Array.of(1))}>Append focus</button>
      <button onClick={() => props.onOpenFoldedFocus(10, 102)}>Open folded focus</button>
    </div>
  ),
}))

type MockFocusPanelProps = {
  matrixId: number
  rowId: number
  foldedOrigin?: boolean
  unresolvedPosition?: boolean
  onAppendFocus: (matrixId: number, rowId: number, key: Uint8Array) => void
  onReplaceFocus: (matrixId: number, rowId: number, key: Uint8Array) => void
  onOpenRowRef: (matrixId: number, rowId: number) => void
  onCollapse: () => void
  onClose: () => void
}

vi.mock('./FocusPanel', () => ({
  default: (props: MockFocusPanelProps) => {
    const instanceId = `focus-instance-${mocks.nextFocusInstance++}`
    return (
      <div
        data-folded-origin={props.foldedOrigin ? 'true' : undefined}
        data-instance-id={instanceId}
        data-matrix-id={props.matrixId}
        data-row-id={props.rowId}
        data-testid="mock-focus-panel"
        data-unresolved-position={props.unresolvedPosition ? 'true' : undefined}
      >
        <button
          onClick={() =>
            props.onAppendFocus(props.matrixId, props.rowId + 1, Uint8Array.of(props.rowId + 1))
          }
        >
          Append child
        </button>
        <button
          onClick={() =>
            props.onReplaceFocus(props.matrixId, props.rowId + 100, Uint8Array.of(props.rowId))
          }
        >
          Replace focus
        </button>
        <button onClick={() => props.onOpenRowRef(20, props.rowId + 200)}>
          Open boundary row
        </button>
        <button onClick={() => props.onCollapse()}>Collapse here</button>
        <button onClick={() => props.onClose()}>Close focus</button>
      </div>
    )
  },
}))

const { default: StreamView } = await import('./StreamView')

const panelElements = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>('[data-testid="workspace-shell-column"]'),
]

const panelIdentity = (container: HTMLElement) =>
  panelElements(container).map((panel) => {
    if (panel.dataset.panelKind === 'navigation') return 'navigation'
    const focus = panel.querySelector<HTMLElement>('[data-testid="mock-focus-panel"]')
    return `${focus?.dataset.matrixId}:${focus?.dataset.rowId}`
  })

const stablePanelIds = (container: HTMLElement) =>
  panelElements(container).map((panel) => panel.dataset.panelId)

const click = (container: HTMLElement, label: string, index = 0) => {
  const buttons = [...container.querySelectorAll<HTMLButtonElement>('button')].filter(
    (button) => button.textContent?.trim() === label,
  )
  const button = buttons[index]
  if (!button) throw new Error(`Cannot find button ${label} at index ${index}`)
  button.click()
}

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('StreamView controller contract', () => {
  let container: HTMLDivElement
  let dispose: (() => void) | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.nextFocusInstance = 0
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    dispose?.()
    container.remove()
  })

  const mount = (props?: { navigateToRowId?: number | null; onNavigated?: () => void }) => {
    dispose = render(
      () => (
        <StreamView
          matrixId={10}
          navigateToRowId={props?.navigateToRowId}
          onNavigated={props?.onNavigated}
        />
      ),
      container,
    )
  }

  test('starts at root and supports append, replace, collapse, and close', () => {
    mount()
    expect(panelIdentity(container)).toEqual(['navigation'])

    click(container, 'Append focus')
    expect(panelIdentity(container)).toEqual(['navigation', '10:101'])
    const firstIds = stablePanelIds(container)
    const firstFocusInstance = container.querySelector<HTMLElement>(
      '[data-testid="mock-focus-panel"]',
    )?.dataset.instanceId

    click(container, 'Append child')
    expect(panelIdentity(container)).toEqual(['navigation', '10:101', '10:102'])
    expect(stablePanelIds(container).slice(0, 2)).toEqual(firstIds)
    expect(
      container.querySelector<HTMLElement>('[data-testid="mock-focus-panel"]')?.dataset
        .instanceId,
    ).toBe(firstFocusInstance)
    expect(panelElements(container).map((panel) => panel.dataset.active)).toEqual([
      'false',
      'false',
      'true',
    ])

    click(container, 'Replace focus', 1)
    expect(panelIdentity(container)).toEqual(['navigation', '10:101', '10:202'])

    click(container, 'Collapse here')
    expect(panelIdentity(container)).toEqual(['navigation', '10:101'])

    click(container, 'Close focus')
    expect(panelIdentity(container)).toEqual(['navigation'])
  })

  test('resolves navigation outline configuration independently of theme and polarity', () => {
    let setComponentConfig!: (config: ComponentVariantConfig) => void
    let setTheme!: (theme: VisualTheme) => void
    let setPolarity!: (polarity: 'dark' | 'light') => void

    dispose = render(() => {
      const [componentConfig, updateComponentConfig] = createSignal<ComponentVariantConfig>({})
      const [theme, updateTheme] = createSignal<VisualTheme>('ghost')
      const [polarity, updatePolarity] = createSignal<'dark' | 'light'>('dark')
      setComponentConfig = updateComponentConfig
      setTheme = updateTheme
      setPolarity = updatePolarity
      return (
        <div data-theme={polarity()} data-visual-theme={theme()}>
          <StreamView matrixId={10} componentConfig={componentConfig()} />
        </div>
      )
    }, container)

    const outline = () =>
      container.querySelector<HTMLElement>('[data-navigation-outline]')?.dataset
        .navigationOutline

    expect(outline()).toBe('guides')
    setComponentConfig({ navigationOutline: 'guides' })
    setTheme('wipeout')
    setPolarity('light')
    expect(outline()).toBe('guides')
  })

  test('evicts the oldest panel when append exceeds four visible columns', () => {
    mount()
    click(container, 'Append focus')
    click(container, 'Append child')
    click(container, 'Append child', 1)
    click(container, 'Append child', 2)

    expect(panelIdentity(container)).toEqual(['10:101', '10:102', '10:103', '10:104'])
  })

  test('shows the simple breadcrumb only after root leaves the visible columns', () => {
    mount()
    click(container, 'Append focus')
    click(container, 'Append child')
    click(container, 'Append child', 1)

    expect(container.querySelector('[data-testid="workspace-shell-breadcrumb"]')).toBeNull()

    click(container, 'Append child', 2)

    const breadcrumb = container.querySelector<HTMLElement>(
      '[data-testid="workspace-shell-breadcrumb"]',
    )
    expect(breadcrumb?.textContent).toContain('Workspace')

    click(container, 'Workspace')
    expect(panelIdentity(container)).toEqual(['navigation'])
  })

  test('Meta+ArrowLeft closes only the rightmost focus panel', () => {
    mount()
    click(container, 'Append focus')
    click(container, 'Append child')

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowLeft',
      metaKey: true,
    })
    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(panelIdentity(container)).toEqual(['navigation', '10:101'])
  })

  test('external row navigation resolves a key and replaces panels after root', async () => {
    mocks.resolveDrillInPosition.mockResolvedValue({ key: Uint8Array.of(30), isHome: true })
    const onNavigated = vi.fn()
    let setNavigateToRowId!: (rowId: number | null) => void

    dispose = render(() => {
      const [navigateToRowId, setRowId] = createSignal<number | null>(null)
      setNavigateToRowId = setRowId
      return (
        <StreamView
          matrixId={10}
          navigateToRowId={navigateToRowId()}
          onNavigated={onNavigated}
        />
      )
    }, container)
    click(container, 'Append focus')
    click(container, 'Append child')

    setNavigateToRowId(300)
    await flushPromises()

    expect(onNavigated).toHaveBeenCalledOnce()
    expect(mocks.resolveDrillInPosition).toHaveBeenCalledWith(10, 300)
    expect(panelIdentity(container)).toEqual(['navigation', '10:300'])
  })

  test('inline-reference navigation uses the root navigation path', async () => {
    mocks.resolveDrillInPosition.mockResolvedValue({ key: Uint8Array.of(40), isHome: true })
    mount()
    click(container, 'Append focus')
    click(container, 'Append child')

    const source = document.createElement('span')
    container.appendChild(source)
    source.dispatchEvent(
      new CustomEvent('inlineref-navigate', {
        bubbles: true,
        detail: { matrixId: 20, rowId: 400 },
      }),
    )
    await flushPromises()

    expect(mocks.resolveDrillInPosition).toHaveBeenCalledWith(20, 400)
    expect(panelIdentity(container)).toEqual(['navigation', '20:400'])
  })

  test('folded focus preserves resolved and unresolved position states', async () => {
    mocks.resolveDrillInPosition.mockResolvedValueOnce({ key: Uint8Array.of(50) })
    mount()

    click(container, 'Open folded focus')
    await flushPromises()

    let focus = container.querySelector<HTMLElement>('[data-testid="mock-focus-panel"]')!
    expect(focus.dataset.foldedOrigin).toBe('true')
    expect(focus.dataset.unresolvedPosition).toBeUndefined()

    click(container, 'Close focus')
    mocks.resolveDrillInPosition.mockResolvedValueOnce(null)
    click(container, 'Open folded focus')
    await flushPromises()

    focus = container.querySelector<HTMLElement>('[data-testid="mock-focus-panel"]')!
    expect(focus.dataset.foldedOrigin).toBe('true')
    expect(focus.dataset.unresolvedPosition).toBe('true')
  })

  test('cross-matrix boundary hops keep the target matrix identity', async () => {
    mocks.resolveDrillInPosition.mockResolvedValue({ key: Uint8Array.of(60), isHome: true })
    mount()
    click(container, 'Append focus')

    click(container, 'Open boundary row')
    await flushPromises()

    expect(panelIdentity(container)).toEqual(['navigation', '10:101', '20:301'])
  })
})
