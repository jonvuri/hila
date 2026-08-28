import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'solid-js/web'

import type { VirtualizerGeometryState } from '../virtualizer/ScrollVirtualizer'

import ProductionStickyNavigation from './ProductionStickyNavigation'
import { createProductionStickyContext, type ProductionStickyRow } from './production-sticky'

const stickyRow = (): ProductionStickyRow => ({
  identity: { pk: '10', ck: '1:2', rk: null },
  matrixId: 1,
  rowId: 2,
  depth: 0,
  visibleIndex: 0,
  label: 'Parent',
  contentKey: 'parent:open',
  hasChildren: true,
  expanded: true,
  subtreeEnd: { pk: null },
  continuation: 'scope-end',
})

describe('production sticky navigation', () => {
  let container: HTMLDivElement
  let dispose: (() => void) | undefined
  let frames: FrameRequestCallback[]

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    frames = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    dispose?.()
    container.remove()
    vi.unstubAllGlobals()
  })

  const flushFrame = () => {
    for (const callback of frames.splice(0)) callback(0)
  }

  test('renders named presentation controls and routes controller actions', () => {
    const row = stickyRow()
    const context = createProductionStickyContext({
      firstVisiblePk: row.identity.pk,
      ancestry: [],
      retained: [row],
      drill: {
        state: 'resolved',
        ck: row.identity.ck,
        label: 'Parent',
        pk: '10',
        isHome: true,
      },
    })
    const scrollport = document.createElement('div')
    const geometry: VirtualizerGeometryState = {
      scrollport,
      scrollTop: 4,
      viewportHeight: 240,
      windows: [{ windowIndex: 0, start: 0, height: 3200, measured: true }],
      visibleRange: { start: 0, end: 0 },
      renderedRange: new Set([0]),
      rows: [{ position: '10', windowIndex: 0, offset: 36, height: 32, start: 36, end: 68 }],
      firstVisibleRow: undefined,
    }
    const toggle = vi.fn()
    const scroll = vi.fn()
    const drill = vi.fn()

    dispose = render(
      () => (
        <ProductionStickyNavigation
          context={context}
          geometry={geometry}
          depthOffset={0}
          navigationOutline="guides"
          title={<span>Workspace</span>}
          decorationFor={() => ({ continues: [] })}
          onToggle={toggle}
          onScrollToSource={scroll}
          onDrill={drill}
        />
      ),
      container,
    )
    flushFrame()

    expect(container.querySelectorAll('[role="treeitem"]')).toHaveLength(0)
    const widget = container.querySelector<HTMLElement>('[role="group"]')!
    expect(widget.getAttribute('aria-label')).toBe('Pinned navigation')
    expect(widget.dataset.widgetAncestryCount).toBe('0')
    expect(widget.dataset.widgetRetainedCount).toBe('1')
    expect(widget.dataset.widgetPostWindowCount).toBe('0')
    expect(widget.dataset.widgetDrillCount).toBe('1')
    expect(widget.dataset.widgetGeometryRowCount).toBe('1')
    container
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Collapse Parent from pinned navigation"]',
      )!
      .click()
    container.querySelector<HTMLButtonElement>('button[aria-label="Scroll to Parent"]')!.click()
    container
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Open Parent from pinned navigation"]',
      )!
      .click()

    expect(toggle).toHaveBeenCalledWith(row)
    expect(scroll).toHaveBeenCalledWith('10', 0)
    expect(drill).toHaveBeenCalledWith(row)
  })

  test('keeps an unresolved drill target identifiable without a false pk', () => {
    const context = createProductionStickyContext({
      firstVisiblePk: null,
      ancestry: [],
      retained: [],
      drill: { state: 'unresolved', ck: '1:9', label: 'Missing', pk: null },
    })

    dispose = render(
      () => (
        <ProductionStickyNavigation
          context={context}
          geometry={undefined}
          depthOffset={0}
          navigationOutline="guides"
          decorationFor={() => ({ continues: [] })}
          onToggle={() => {}}
          onScrollToSource={() => {}}
          onDrill={() => {}}
        />
      ),
      container,
    )
    flushFrame()

    const dock = container.querySelector<HTMLButtonElement>('.production-sticky-dock')!
    expect(dock.disabled).toBe(true)
    expect(dock.dataset.rowCk).toBe('1:9')
    expect(dock.dataset.rowPk).toBeUndefined()
    expect(dock.getAttribute('aria-label')).toBe('Missing is not placed in navigation')
  })
})
