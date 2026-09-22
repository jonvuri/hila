import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'

import type { ComponentVariantConfig, VisualTheme } from '../design/tokens'
import type { PlaceNavigationTarget, ResolvedPlaceNavigation } from '../core/place-navigation'

const mocks = vi.hoisted(() => ({
  execQuery: vi.fn(),
  nextFocusInstance: 0,
  resolvePlaceNavigation: vi.fn(),
}))

vi.mock('../core/client/sql-client', () => ({
  execQuery: mocks.execQuery,
}))

vi.mock('../core/client/matrix-client', () => ({
  resolvePlaceNavigation: mocks.resolvePlaceNavigation,
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

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const positionResolution = (
  matrixId: number,
  rowId: number,
  key: Uint8Array,
  source: 'provenance' | 'home' = 'home',
): ResolvedPlaceNavigation => ({
  type: 'position',
  node: { matrixId, rowId },
  source,
  appearance: { key, depth: 0 },
  alternativeAppearances: [],
  liveAppearanceCount: 1,
})

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

  const mount = (props?: {
    navigateToPlace?: PlaceNavigationTarget | null
    onNavigated?: () => void
  }) => {
    dispose = render(
      () => (
        <StreamView
          matrixId={10}
          navigateToPlace={props?.navigateToPlace}
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

  test('external position navigation replaces panels from a fresh root', async () => {
    mocks.resolvePlaceNavigation.mockResolvedValue(
      positionResolution(20, 300, Uint8Array.of(30)),
    )
    const onNavigated = vi.fn()
    let setNavigateToPlace!: (target: PlaceNavigationTarget | null) => void

    dispose = render(() => {
      const [navigateToPlace, setTarget] = createSignal<PlaceNavigationTarget | null>(null)
      setNavigateToPlace = setTarget
      return (
        <StreamView
          matrixId={10}
          navigateToPlace={navigateToPlace()}
          onNavigated={onNavigated}
        />
      )
    }, container)
    click(container, 'Append focus')
    click(container, 'Append child')
    click(container, 'Append child', 1)
    click(container, 'Append child', 2)
    expect(panelIdentity(container)).toEqual(['10:101', '10:102', '10:103', '10:104'])

    setNavigateToPlace({ type: 'node', node: { matrixId: 20, rowId: 300 } })
    await flushPromises()

    expect(onNavigated).toHaveBeenCalledOnce()
    expect(mocks.resolvePlaceNavigation).toHaveBeenCalledWith(
      10,
      { matrixId: 20, rowId: 300 },
      undefined,
    )
    expect(panelIdentity(container)).toEqual(['navigation', '20:300'])
  })

  test('external membership navigation rebuilds context from a fresh root', async () => {
    mocks.resolvePlaceNavigation.mockResolvedValue({
      type: 'membership',
      node: { matrixId: 30, rowId: 500 },
      matrixId: 30,
      containers: [
        { node: { matrixId: 10, rowId: 201 }, key: Uint8Array.of(21) },
        { node: { matrixId: 20, rowId: 301 }, key: null },
      ],
      alternativeAppearances: [],
      liveAppearanceCount: 0,
    })
    let setNavigateToPlace!: (target: PlaceNavigationTarget | null) => void

    dispose = render(() => {
      const [navigateToPlace, setTarget] = createSignal<PlaceNavigationTarget | null>(null)
      setNavigateToPlace = setTarget
      return <StreamView matrixId={10} navigateToPlace={navigateToPlace()} />
    }, container)
    click(container, 'Append focus')
    click(container, 'Append child')
    click(container, 'Append child', 1)
    click(container, 'Append child', 2)
    expect(panelIdentity(container)).toEqual(['10:101', '10:102', '10:103', '10:104'])

    setNavigateToPlace({ type: 'node', node: { matrixId: 30, rowId: 500 } })
    await flushPromises()

    expect(panelIdentity(container)).toEqual(['navigation', '10:201', '20:301', '30:500'])
  })

  test('preserves explicit appearance provenance for external navigation', async () => {
    const provenance = { key: Uint8Array.of(9, 0) }
    mocks.resolvePlaceNavigation.mockResolvedValue(
      positionResolution(20, 300, provenance.key, 'provenance'),
    )
    mount({
      navigateToPlace: {
        type: 'node',
        node: { matrixId: 20, rowId: 300 },
        provenance,
      },
    })
    await flushPromises()

    expect(mocks.resolvePlaceNavigation).toHaveBeenCalledWith(
      10,
      { matrixId: 20, rowId: 300 },
      provenance,
    )
    expect(panelIdentity(container)).toEqual(['navigation', '20:300'])
  })

  test('ignores an older external navigation completion', async () => {
    const first = deferred<ResolvedPlaceNavigation | null>()
    const second = deferred<ResolvedPlaceNavigation | null>()
    mocks.resolvePlaceNavigation
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const onNavigated = vi.fn()
    let setNavigateToPlace!: (target: PlaceNavigationTarget | null) => void

    dispose = render(() => {
      const [navigateToPlace, setTarget] = createSignal<PlaceNavigationTarget | null>(null)
      setNavigateToPlace = setTarget
      return (
        <StreamView
          matrixId={10}
          navigateToPlace={navigateToPlace()}
          onNavigated={onNavigated}
        />
      )
    }, container)

    setNavigateToPlace({ type: 'node', node: { matrixId: 20, rowId: 1 } })
    await flushPromises()
    setNavigateToPlace({ type: 'node', node: { matrixId: 20, rowId: 2 } })
    second.resolve(positionResolution(20, 2, Uint8Array.of(2)))
    await flushPromises()
    expect(panelIdentity(container)).toEqual(['navigation', '20:2'])
    expect(onNavigated).toHaveBeenCalledOnce()

    first.resolve(positionResolution(20, 1, Uint8Array.of(1)))
    await flushPromises()
    expect(panelIdentity(container)).toEqual(['navigation', '20:2'])
    expect(onNavigated).toHaveBeenCalledOnce()
  })

  test('cancels pending external navigation when the target is cleared', async () => {
    const pending = deferred<ResolvedPlaceNavigation | null>()
    mocks.resolvePlaceNavigation.mockReturnValueOnce(pending.promise)
    const onNavigated = vi.fn()
    let setNavigateToPlace!: (target: PlaceNavigationTarget | null) => void

    dispose = render(() => {
      const [navigateToPlace, setTarget] = createSignal<PlaceNavigationTarget | null>(null)
      setNavigateToPlace = setTarget
      return (
        <StreamView
          matrixId={10}
          navigateToPlace={navigateToPlace()}
          onNavigated={onNavigated}
        />
      )
    }, container)

    setNavigateToPlace({ type: 'node', node: { matrixId: 20, rowId: 1 } })
    await flushPromises()
    setNavigateToPlace(null)
    click(container, 'Append focus')

    pending.resolve(positionResolution(20, 1, Uint8Array.of(1)))
    await flushPromises()

    expect(panelIdentity(container)).toEqual(['navigation', '10:101'])
    expect(onNavigated).not.toHaveBeenCalled()
  })

  test('cancels pending external navigation when the view is disposed', async () => {
    const pending = deferred<ResolvedPlaceNavigation | null>()
    mocks.resolvePlaceNavigation.mockReturnValueOnce(pending.promise)
    const onNavigated = vi.fn()

    mount({
      navigateToPlace: { type: 'node', node: { matrixId: 20, rowId: 1 } },
      onNavigated,
    })
    await flushPromises()
    dispose?.()
    dispose = undefined

    pending.resolve(positionResolution(20, 1, Uint8Array.of(1)))
    await flushPromises()

    expect(onNavigated).not.toHaveBeenCalled()
  })

  test('opens the workspace root without resolving a row identity', async () => {
    let setNavigateToPlace!: (target: PlaceNavigationTarget | null) => void
    dispose = render(() => {
      const [navigateToPlace, setTarget] = createSignal<PlaceNavigationTarget | null>(null)
      setNavigateToPlace = setTarget
      return <StreamView matrixId={10} navigateToPlace={navigateToPlace()} />
    }, container)
    click(container, 'Append focus')
    setNavigateToPlace({ type: 'root', matrixId: 10 })
    await flushPromises()
    expect(panelIdentity(container)).toEqual(['navigation'])
    expect(mocks.resolvePlaceNavigation).not.toHaveBeenCalled()
  })

  test('inline-reference navigation uses the root navigation path', async () => {
    mocks.resolvePlaceNavigation.mockResolvedValue(
      positionResolution(20, 400, Uint8Array.of(40)),
    )
    mount()
    click(container, 'Append focus')
    click(container, 'Append child')
    click(container, 'Append child', 1)
    click(container, 'Append child', 2)
    expect(panelIdentity(container)).toEqual(['10:101', '10:102', '10:103', '10:104'])

    const source = document.createElement('span')
    container.appendChild(source)
    source.dispatchEvent(
      new CustomEvent('inlineref-navigate', {
        bubbles: true,
        detail: { matrixId: 20, rowId: 400 },
      }),
    )
    await flushPromises()

    expect(mocks.resolvePlaceNavigation).toHaveBeenCalledWith(
      10,
      { matrixId: 20, rowId: 400 },
      undefined,
    )
    expect(panelIdentity(container)).toEqual(['navigation', '20:400'])
  })

  test('folded focus preserves resolved and unresolved position states', async () => {
    mocks.resolvePlaceNavigation.mockResolvedValueOnce(
      positionResolution(10, 102, Uint8Array.of(50)),
    )
    mount()

    click(container, 'Open folded focus')
    await flushPromises()

    let focus = container.querySelector<HTMLElement>('[data-testid="mock-focus-panel"]')!
    expect(focus.dataset.foldedOrigin).toBe('true')
    expect(focus.dataset.unresolvedPosition).toBeUndefined()

    click(container, 'Close focus')
    mocks.resolvePlaceNavigation.mockResolvedValueOnce({
      type: 'membership',
      node: { matrixId: 10, rowId: 102 },
      matrixId: 10,
      containers: [],
      alternativeAppearances: [],
      liveAppearanceCount: 0,
    })
    click(container, 'Open folded focus')
    await flushPromises()

    focus = container.querySelector<HTMLElement>('[data-testid="mock-focus-panel"]')!
    expect(focus.dataset.foldedOrigin).toBe('true')
    expect(focus.dataset.unresolvedPosition).toBe('true')
  })

  test('cross-matrix boundary hops keep the target matrix identity', async () => {
    mocks.resolvePlaceNavigation.mockResolvedValue(
      positionResolution(20, 301, Uint8Array.of(60)),
    )
    mount()
    click(container, 'Append focus')

    click(container, 'Open boundary row')
    await flushPromises()

    expect(panelIdentity(container)).toEqual(['navigation', '10:101', '20:301'])
  })
})
