import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, describe, expect, test } from 'vitest'

import type { VisualTheme } from '../design/tokens'

import WorkspaceShell, { type WorkspaceShellPanel } from './WorkspaceShell'

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
    ancestry: [],
  },
]

describe('WorkspaceShell', () => {
  let dispose: (() => void) | undefined
  let container: HTMLDivElement

  afterEach(() => {
    dispose?.()
    container?.remove()
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
})
