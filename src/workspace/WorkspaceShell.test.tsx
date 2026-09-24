import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { VisualTheme } from '../design/tokens'

import WorkspaceShell, { type WorkspaceShellPanel } from './WorkspaceShell'

class TestResizeObserver {
  static instances: TestResizeObserver[] = []

  readonly observe = vi.fn()
  readonly disconnect = vi.fn()

  constructor(readonly callback: ResizeObserverCallback) {
    TestResizeObserver.instances.push(this)
  }

  static resize = (target: Element, width: number): void => {
    const observer = TestResizeObserver.instances.find(({ observe }) =>
      observe.mock.calls.some(([observed]) => observed === target),
    )
    if (!observer) throw new Error('No ResizeObserver is observing the workspace shell')
    observer.callback(
      [{ target, contentRect: { width } } as ResizeObserverEntry],
      observer as unknown as ResizeObserver,
    )
  }
}

const panels: readonly WorkspaceShellPanel[] = [
  {
    id: 'focus-1',
    kind: 'focus',
    active: false,
    title: 'First focus',
    ancestry: [{ id: 'ancestor-1', label: 'Workspace', matrixId: 10, rowId: 1 }],
  },
  {
    id: 'focus-2',
    kind: 'focus',
    active: true,
    title: 'Second focus',
    ancestry: [{ id: 'ancestor-2', label: 'Workspace', matrixId: 10, rowId: 1 }],
  },
]

describe('WorkspaceShell', () => {
  let dispose: (() => void) | undefined
  let container: HTMLDivElement

  beforeEach(() => {
    TestResizeObserver.instances = []
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
  })

  afterEach(() => {
    dispose?.()
    container?.remove()
    vi.unstubAllGlobals()
  })

  test('renders the typed column contract and the first-focus breadcrumb', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(
      () => (
        <WorkspaceShell
          panels={panels}
          renderPanel={(panel) => <div data-content-id={panel.id}>{panel.title}</div>}
        />
      ),
      container,
    )

    const columns = [...container.querySelectorAll<HTMLElement>('[data-panel-id]')]
    expect(columns.map((column) => column.dataset.panelId)).toEqual(['focus-1', 'focus-2'])
    expect(columns.map((column) => column.dataset.active)).toEqual(['false', 'true'])
    expect(
      container.querySelectorAll('[data-testid="workspace-shell-breadcrumb"]'),
    ).toHaveLength(1)
    expect(container.querySelector('[data-content-id="focus-2"]')?.textContent).toBe(
      'Second focus',
    )
  })

  test('keeps one structure when the inherited visual theme changes', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    let setTheme!: (theme: VisualTheme) => void
    dispose = render(() => {
      const [theme, updateTheme] = createSignal<VisualTheme>('ghost')
      setTheme = updateTheme
      return (
        <div data-visual-theme={theme()}>
          <WorkspaceShell panels={panels} renderPanel={(panel) => <div>{panel.title}</div>} />
        </div>
      )
    }, container)

    const structure = () =>
      [...container.querySelectorAll<HTMLElement>('[data-testid]')].map(
        (element) => element.dataset.testid,
      )
    const ghostStructure = structure()
    setTheme('null')
    expect(structure()).toEqual(ghostStructure)
    setTheme('wipeout')
    expect(structure()).toEqual(ghostStructure)
  })

  test('projects the host at the authoritative 719/720 boundary without remounting', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const [contentState, setContentState] = createSignal<'loading' | 'empty' | 'error'>(
      'loading',
    )
    dispose = render(
      () => (
        <WorkspaceShell
          panels={panels}
          renderPanel={(panel) => (
            <button data-content-id={panel.id} data-content-state={contentState()}>
              {panel.title}: {contentState()}
            </button>
          )}
        />
      ),
      container,
    )

    const shell = container.querySelector<HTMLElement>('[data-testid="workspace-shell"]')!
    const columns = [
      ...container.querySelectorAll<HTMLElement>('[data-testid="workspace-shell-column"]'),
    ]
    const content = columns.map((column) => column.querySelector('[data-content-id]'))

    TestResizeObserver.resize(shell, 719)
    expect(shell.dataset.shellPresentation).toBe('single-panel')
    expect(columns[0]?.hidden).toBe(true)
    expect(columns[0]?.getAttribute('aria-hidden')).toBe('true')
    expect(columns[0]?.hasAttribute('inert')).toBe(true)
    expect(columns[1]?.hidden).toBe(false)
    expect(columns[1]?.dataset.visible).toBe('true')
    expect(columns[1]?.querySelector('[data-testid="workspace-shell-breadcrumb"]')).toBeTruthy()
    const activeContent = columns[1]?.querySelector<HTMLElement>('[data-content-id]')
    expect(activeContent?.dataset.contentState).toBe('loading')
    setContentState('empty')
    expect(activeContent?.dataset.contentState).toBe('empty')
    setContentState('error')
    expect(activeContent?.dataset.contentState).toBe('error')

    TestResizeObserver.resize(shell, 720)
    expect(shell.dataset.shellPresentation).toBe('bounded-rail')
    expect(columns.every((column) => !column.hidden)).toBe(true)
    expect(columns.map((column) => column.querySelector('[data-content-id]'))).toEqual(content)
    expect(columns[1]?.querySelector('[data-content-id]')).toBe(activeContent)
  })

  test('moves focus from a hidden panel to the active landmark and announces it', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(
      () => (
        <WorkspaceShell
          panels={panels}
          renderPanel={(panel) => <button data-content-id={panel.id}>{panel.title}</button>}
        />
      ),
      container,
    )

    const shell = container.querySelector<HTMLElement>('[data-testid="workspace-shell"]')!
    const hiddenButton = container.querySelector<HTMLButtonElement>(
      '[data-content-id="focus-1"]',
    )!
    const activeColumn = container.querySelector<HTMLElement>('[data-panel-id="focus-2"]')!
    hiddenButton.focus()

    TestResizeObserver.resize(shell, 719)
    await Promise.resolve()

    expect(document.activeElement).toBe(activeColumn)
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Focus moved to Second focus',
    )
  })

  test('re-announces repeated hidden-focus transfers and clears the rail status', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(
      () => (
        <WorkspaceShell
          panels={panels}
          renderPanel={(panel) => <button data-content-id={panel.id}>{panel.title}</button>}
        />
      ),
      container,
    )

    const shell = container.querySelector<HTMLElement>('[data-testid="workspace-shell"]')!
    const hiddenButton = container.querySelector<HTMLButtonElement>(
      '[data-content-id="focus-1"]',
    )!
    const activeColumn = container.querySelector<HTMLElement>('[data-panel-id="focus-2"]')!
    const status = container.querySelector<HTMLElement>('[role="status"]')!

    hiddenButton.focus()
    TestResizeObserver.resize(shell, 719)
    await Promise.resolve()
    expect(document.activeElement).toBe(activeColumn)
    expect(status.textContent).toContain('Focus moved to Second focus')

    TestResizeObserver.resize(shell, 720)
    expect(status.textContent).toBe('')

    hiddenButton.focus()
    TestResizeObserver.resize(shell, 719)
    await Promise.resolve()
    expect(document.activeElement).toBe(activeColumn)
    expect(status.textContent).toContain('Focus moved to Second focus')

    TestResizeObserver.resize(shell, 720)
    expect(status.textContent).toBe('')
  })

  test('does not steal focus or selection from the active panel during resize', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(
      () => (
        <WorkspaceShell
          panels={panels}
          renderPanel={(panel) =>
            panel.active ? <input data-content-id={panel.id} value="selection" /> : <div />
          }
        />
      ),
      container,
    )

    const shell = container.querySelector<HTMLElement>('[data-testid="workspace-shell"]')!
    const input = container.querySelector<HTMLInputElement>('[data-content-id="focus-2"]')!
    input.focus()
    input.setSelectionRange(2, 6)

    TestResizeObserver.resize(shell, 719)
    await Promise.resolve()
    TestResizeObserver.resize(shell, 720)

    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(2)
    expect(input.selectionEnd).toBe(6)
  })

  test('preserves panel content when an earlier column leaves the retained stack', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    let setPanels!: (panels: readonly WorkspaceShellPanel[]) => void
    dispose = render(() => {
      const [visiblePanels, updatePanels] = createSignal(panels)
      setPanels = updatePanels
      return (
        <WorkspaceShell
          panels={visiblePanels()}
          renderPanel={(panel) => <div data-content-id={panel.id}>{panel.title}</div>}
        />
      )
    }, container)

    const retained = container.querySelector('[data-content-id="focus-2"]')
    expect(retained).toBeTruthy()
    setPanels([panels[1]!])
    expect(container.querySelector('[data-content-id="focus-2"]')).toBe(retained)
  })
})
