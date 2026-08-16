import { afterEach, describe, expect, test } from 'vitest'
import { render } from 'solid-js/web'

import Workspace from './Workspace'
import { rootShiftedPanels, rootVisiblePanels, workspaceTitle } from './fixtures'

describe('Workspace ancestry breadcrumb', () => {
  let dispose: (() => void) | undefined
  let container: HTMLDivElement

  afterEach(() => {
    dispose?.()
    container?.remove()
  })

  const mount = (panels: typeof rootVisiblePanels) => {
    container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(
      () => <Workspace panels={panels} workspaceTitle={workspaceTitle} />,
      container,
    )
  }

  test('shows one breadcrumb only when the first visible panel is focus', () => {
    mount(rootVisiblePanels)
    expect(
      container.querySelectorAll('[data-testid="workspace-ancestry-breadcrumb"]'),
    ).toHaveLength(0)

    dispose?.()
    container.replaceChildren()
    dispose = render(
      () => <Workspace panels={rootShiftedPanels} workspaceTitle={workspaceTitle} />,
      container,
    )

    const breadcrumbs = container.querySelectorAll(
      '[data-testid="workspace-ancestry-breadcrumb"]',
    )
    expect(breadcrumbs).toHaveLength(1)
    expect(breadcrumbs[0]?.closest('[data-testid="workspace-column"]')).toBe(
      container.querySelector('[data-testid="workspace-column"]'),
    )
    expect(breadcrumbs[0]?.getAttribute('data-source')).toBe('provenance')
  })
})
