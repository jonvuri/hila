import { afterEach, describe, expect, test } from 'vitest'
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'

import {
  contentStatePanels,
  denseFocusPanels,
  fiveColumnPanels,
  workspaceTitle,
} from './fixtures'
import WorkspaceShellExploration, {
  ResponsiveWorkspaceExploration,
  resolveRetainedWorkspacePanels,
  resolveResponsiveWorkspacePanels,
  resolveWorkspacePresentation,
} from './WorkspaceShellExploration'

describe('workspace shell exploration', () => {
  let container: HTMLDivElement
  let dispose: (() => void) | undefined

  afterEach(() => {
    dispose?.()
    container?.remove()
  })

  test('keeps environmental width and focused workflow as separate inputs', () => {
    expect(
      resolveWorkspacePresentation({
        focusedWorkflow: false,
        presentation: 'path-rail',
        viewportWidth: 1180,
      }),
    ).toBe('horizontal-rail')
    expect(
      resolveWorkspacePresentation({
        focusedWorkflow: false,
        presentation: 'path-rail',
        viewportWidth: 500,
      }),
    ).toBe('path-rail')
    expect(
      resolveWorkspacePresentation({
        focusedWorkflow: true,
        presentation: 'path-rail',
        viewportWidth: 1180,
      }),
    ).toBe('path-rail')
  })

  test('degrades one focused stack from four wide panels to its active panel', () => {
    expect(resolveResponsiveWorkspacePanels(fiveColumnPanels, 1180, 4)).toEqual(
      fiveColumnPanels.slice(1),
    )
    expect(resolveResponsiveWorkspacePanels(fiveColumnPanels, 500, 4)).toEqual(
      fiveColumnPanels.slice(4),
    )
    expect(resolveResponsiveWorkspacePanels(fiveColumnPanels, 500, 0)).toEqual(
      fiveColumnPanels.slice(0, 1),
    )
    expect(resolveResponsiveWorkspacePanels(fiveColumnPanels, 719, 4)).toEqual(
      fiveColumnPanels.slice(4),
    )
    expect(resolveResponsiveWorkspacePanels(fiveColumnPanels, 720, 4)).toEqual(
      fiveColumnPanels.slice(1),
    )
    expect(resolveRetainedWorkspacePanels(fiveColumnPanels, 4)).toEqual(
      fiveColumnPanels.slice(1),
    )
  })

  test('uses the existing focus panel and ancestry when narrow', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(
      () => (
        <ResponsiveWorkspaceExploration
          panels={fiveColumnPanels}
          viewportWidth={500}
          workspaceTitle={workspaceTitle}
        />
      ),
      container,
    )

    expect(container.querySelectorAll('[data-testid="workspace-column"]')).toHaveLength(4)
    expect(container.querySelectorAll('[data-visible="true"]')).toHaveLength(1)
    expect(
      container.querySelector('[data-visible="true"] .ws-focus-title')?.textContent,
    ).toContain('Comparing B-trees and LSM-trees')
    expect(
      container.querySelector('[data-testid="workspace-ancestry-breadcrumb"]'),
    ).not.toBeNull()
    expect(container.querySelector('.wsx-toolbar')).toBeNull()
  })

  test('routes narrow ancestry actions without adding shell navigation state', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const selected: string[] = []
    dispose = render(
      () => (
        <ResponsiveWorkspaceExploration
          onAncestrySelect={(item) => selected.push(item.id)}
          panels={fiveColumnPanels}
          viewportWidth={500}
          workspaceTitle={workspaceTitle}
        />
      ),
      container,
    )

    container.querySelector<HTMLButtonElement>('[title="hila"]')!.click()
    expect(selected).toEqual(['root'])
    expect(container.querySelector('.wsx-toolbar')).toBeNull()
  })

  test('keeps retained panel state mounted across responsive and focused transitions', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    let setViewportWidth!: (width: number) => void
    let setFocusedWorkflow!: (focused: boolean) => void
    dispose = render(() => {
      const [viewportWidth, updateViewportWidth] = createSignal(1180)
      const [focusedWorkflow, updateFocusedWorkflow] = createSignal(false)
      setViewportWidth = updateViewportWidth
      setFocusedWorkflow = updateFocusedWorkflow

      return (
        <ResponsiveWorkspaceExploration
          focusedWorkflow={focusedWorkflow()}
          panels={denseFocusPanels}
          viewportWidth={viewportWidth()}
          workspaceTitle={workspaceTitle}
        />
      )
    }, container)

    const activePanel = container.querySelector<HTMLElement>(
      '[data-panel-id="dense-comparison"]',
    )!
    const property = activePanel.querySelector<HTMLInputElement>('input')!
    const focusRegion = activePanel.querySelector<HTMLElement>('.ws-focus')!
    const navigation = activePanel.querySelector<HTMLElement>('.ws-navigation-scroll')!
    const disclosure = activePanel.querySelector<HTMLButtonElement>(
      '[aria-label="Collapse Grouped evidence"]',
    )!
    disclosure.click()
    await Promise.resolve()
    property.focus()
    property.setSelectionRange(2, 7)
    focusRegion.scrollTop = 32
    navigation.scrollTop = 48

    setViewportWidth(500)
    expect(container.querySelector('[data-panel-id="dense-comparison"]')).toBe(activePanel)
    expect(document.activeElement).toBe(property)
    expect(property.selectionStart).toBe(2)
    expect(property.selectionEnd).toBe(7)
    expect(focusRegion.scrollTop).toBe(32)
    expect(navigation.scrollTop).toBe(48)
    expect(
      activePanel
        .querySelector('[aria-label="Expand Grouped evidence"]')
        ?.getAttribute('aria-expanded'),
    ).toBe('false')
    expect(container.querySelectorAll('[data-visible="true"]')).toHaveLength(1)

    setViewportWidth(1180)
    setFocusedWorkflow(true)
    expect(container.querySelector('[data-panel-id="dense-comparison"]')).toBe(activePanel)
    expect(container.querySelectorAll('[data-visible="true"]')).toHaveLength(1)

    setFocusedWorkflow(false)
    expect(container.querySelector('[data-panel-id="dense-comparison"]')).toBe(activePanel)
    expect(container.querySelectorAll('[data-visible="true"]')).toHaveLength(4)
  })

  test('moves through one shared stack without changing its panel identities', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(
      () => (
        <WorkspaceShellExploration
          activePanel={4}
          density="wide"
          focusedWorkflow
          panels={fiveColumnPanels}
          presentation="full-width-page"
          viewportWidth={500}
          workspaceTitle={workspaceTitle}
        />
      ),
      container,
    )

    expect(container.querySelector('.wsx-status span')?.textContent).toContain('panel 5 of 5')
    const back = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Back one panel"]',
    )!
    back.click()
    expect(container.querySelector('.wsx-status span')?.textContent).toContain('panel 4 of 5')
    expect(container.querySelectorAll('[data-testid="workspace-column"]')).toHaveLength(1)

    const root = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Root',
    )!
    root.click()
    expect(container.querySelector('.wsx-status span')?.textContent).toContain('panel 1 of 5')
  })

  test('opens the stack switcher as a view over the same panels', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(
      () => (
        <WorkspaceShellExploration
          activePanel={4}
          density="wide"
          focusedWorkflow
          panels={fiveColumnPanels}
          presentation="stack-switcher"
          viewportWidth={500}
          workspaceTitle={workspaceTitle}
        />
      ),
      container,
    )

    const toggle = container.querySelector<HTMLButtonElement>(
      '[aria-controls="workspace-stack-switcher"]',
    )!
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    toggle.click()
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelectorAll('.wsx-switcher li')).toHaveLength(fiveColumnPanels.length)
  })

  test.each(contentStatePanels)('renders the $state.kind state accessibly', (panel) => {
    container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(
      () => (
        <ResponsiveWorkspaceExploration
          panels={[panel]}
          viewportWidth={390}
          workspaceTitle={workspaceTitle}
        />
      ),
      container,
    )

    const state = container.querySelector<HTMLElement>(`[data-state="${panel.state!.kind}"]`)!
    expect(state.textContent).toContain(panel.state!.message)
    expect(state.getAttribute('role')).toBe(panel.state!.kind === 'error' ? 'alert' : 'status')
  })
})
