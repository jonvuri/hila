import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'solid-js/web'

import type { WorkspaceRowData } from './usePagedWorkspaceData'
import {
  createProductionNavigationHeaderViewModel,
  ProductionNavigationRowHeader,
} from './NavigationRowHeader'

const label = (text: string): string =>
  JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })

const workspaceRow = (overrides: Partial<WorkspaceRowData> = {}): WorkspaceRowData => ({
  rk: 'renderer',
  pk: 'appearance',
  ck: '7:11',
  matrix_id: 7,
  row_id: 11,
  key: new Uint8Array([1]),
  depth: 3,
  has_children: 1,
  is_type_node: 0,
  is_ghost: 0,
  matrix_title: null,
  is_block_row: 0,
  block_data: null,
  label: label('Parent'),
  content: null,
  data: null,
  ...overrides,
})

describe('production navigation row header', () => {
  let container: HTMLDivElement
  let dispose: (() => void) | undefined

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    dispose?.()
    container.remove()
  })

  test('keeps appearance, logical, and renderer identities separate', () => {
    const model = createProductionNavigationHeaderViewModel(workspaceRow(), {
      globalIndex: 104,
      depthOffset: 2,
      collapsedAppearanceIds: new Set(['appearance']),
      selected: true,
      drill: true,
    })

    expect(model).toMatchObject({
      appearanceId: 'appearance',
      logicalId: '7:11',
      rendererId: 'renderer',
      globalIndex: 104,
      depth: 1,
      label: 'Parent',
      hasChildren: true,
      expanded: false,
      selected: true,
      drill: true,
    })
  })

  test('shares fixed content and Guides without duplicating tree ownership', () => {
    const model = createProductionNavigationHeaderViewModel(workspaceRow(), {
      globalIndex: 104,
      depthOffset: 2,
      selected: true,
      drill: true,
    })
    const toggle = vi.fn()
    const scroll = vi.fn()
    const drill = vi.fn()

    dispose = render(
      () => (
        <>
          <ProductionNavigationRowHeader
            model={model}
            decoration={{ continues: [true] }}
            navigationOutline="guides"
            representation="source"
            onToggle={toggle}
            onDrill={drill}
          >
            <span data-testid="source-editor">Editor owner</span>
          </ProductionNavigationRowHeader>
          <ProductionNavigationRowHeader
            model={model}
            decoration={{ continues: [true] }}
            navigationOutline="guides"
            representation="sticky"
            onToggle={toggle}
            onScrollToSource={scroll}
            onDrill={drill}
          />
        </>
      ),
      container,
    )

    const source = container.querySelector<HTMLElement>(
      '[data-navigation-row-representation="source"]',
    )!
    const sticky = container.querySelector<HTMLElement>(
      '[data-navigation-row-representation="sticky"]',
    )!

    expect(source.style.height).toBe('32px')
    expect(sticky.style.height).toBe('32px')
    expect(container.querySelectorAll('[role="treeitem"]')).toHaveLength(1)
    expect(source.getAttribute('aria-selected')).toBe('true')
    expect(source.getAttribute('aria-level')).toBe('2')
    expect(sticky.getAttribute('role')).toBe('presentation')
    expect(source.dataset.navigationOutline).toBe('guides')
    expect(sticky.dataset.navigationOutline).toBe('guides')
    expect(sticky.hasAttribute('aria-selected')).toBe(false)
    expect(sticky.querySelector('[data-testid="source-editor"]')).toBeNull()
    expect(container.querySelectorAll('.ws-outline-guide')).toHaveLength(2)

    sticky
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Collapse Parent from pinned navigation"]',
      )!
      .click()
    sticky.querySelector<HTMLButtonElement>('button[aria-label="Scroll to Parent"]')!.click()
    sticky
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Open Parent from pinned navigation"]',
      )!
      .click()

    expect(toggle).toHaveBeenCalledWith('appearance')
    expect(scroll).toHaveBeenCalledWith('appearance')
    expect(drill).toHaveBeenCalledWith('appearance', '7:11')
  })

  test('disables source and sticky controls for a disabled row', () => {
    const model = createProductionNavigationHeaderViewModel(
      workspaceRow({ is_ghost: 1, label: null }),
      { globalIndex: 0 },
    )

    dispose = render(
      () => (
        <>
          <ProductionNavigationRowHeader
            model={model}
            decoration={{ continues: [] }}
            navigationOutline="guides"
            representation="source"
            onToggle={() => {}}
            onDrill={() => {}}
          />
          <ProductionNavigationRowHeader
            model={model}
            decoration={{ continues: [] }}
            navigationOutline="guides"
            representation="sticky"
            onToggle={() => {}}
            onScrollToSource={() => {}}
            onDrill={() => {}}
          />
        </>
      ),
      container,
    )

    expect(
      container
        .querySelector('[data-navigation-row-representation="source"]')
        ?.getAttribute('aria-disabled'),
    ).toBe('true')
    expect(container.querySelectorAll('button:disabled')).toHaveLength(5)
    expect(container.querySelector('button[aria-label="Scroll to (deleted)"]')).not.toBeNull()
  })
})
