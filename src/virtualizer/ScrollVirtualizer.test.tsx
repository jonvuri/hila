import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'solid-js/web'

import ScrollVirtualizer from './ScrollVirtualizer'
import type { ScrollVirtualizerHandle, VirtualizerGeometryState } from './ScrollVirtualizer'

class TestIntersectionObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
  takeRecords = vi.fn(() => [])
  root = null
  rootMargin = ''
  thresholds = []
}

class TestResizeObserver {
  static instances: TestResizeObserver[] = []

  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()

  constructor(readonly callback: ResizeObserverCallback) {
    TestResizeObserver.instances.push(this)
  }

  static resize = (element: Element, height: number) => {
    const observer = TestResizeObserver.instances.find(({ observe }) =>
      observe.mock.calls.some(([target]) => target === element),
    )
    observer?.callback(
      [{ target: element, contentRect: { height } } as ResizeObserverEntry],
      observer as unknown as ResizeObserver,
    )
  }
}

describe('ScrollVirtualizer contract', () => {
  let container: HTMLDivElement
  let dispose: (() => void) | undefined
  let clientHeightDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    TestResizeObserver.instances = []
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver)
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    clientHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientHeight',
    )
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      value: 96,
    })
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    dispose?.()
    container.remove()
    vi.unstubAllGlobals()
    if (clientHeightDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor)
    }
  })

  test('uses its own scrollport as the standalone default', () => {
    let handle: ScrollVirtualizerHandle | undefined
    dispose = render(
      () => (
        <ScrollVirtualizer
          minWindowHeight={64}
          totalWindows={3}
          renderWindow={() => <div>Window</div>}
          virtualizerRef={(next) => (handle = next)}
        />
      ),
      container,
    )

    expect(handle?.getScrollport()).toBe(container.querySelector('[class*="scrollContainer"]'))
    expect(handle?.getGeometry()?.viewportHeight).toBe(96)
    expect([...handle!.getGeometry()!.renderedRange]).toEqual([0, 1, 2])
  })

  test('does not add a synthetic tail to short bounded content', () => {
    let handle: ScrollVirtualizerHandle | undefined
    dispose = render(
      () => (
        <ScrollVirtualizer
          minWindowHeight={64}
          totalWindows={1}
          renderWindow={() => <div>Window</div>}
          virtualizerRef={(next) => (handle = next)}
        />
      ),
      container,
    )

    const content = handle!.getScrollport()!.firstElementChild as HTMLElement
    expect(content.style.height).toBe('64px')
  })

  test('keeps the safety tail for open-ended content', () => {
    let handle: ScrollVirtualizerHandle | undefined
    dispose = render(
      () => (
        <ScrollVirtualizer
          minWindowHeight={64}
          renderWindow={() => <div>Window</div>}
          virtualizerRef={(next) => (handle = next)}
        />
      ),
      container,
    )

    const content = handle!.getScrollport()!.firstElementChild as HTMLElement
    expect(content.style.height).toBe('1000px')
  })

  test('uses a measured partial final window in bounded content height', () => {
    let handle: ScrollVirtualizerHandle | undefined
    dispose = render(
      () => (
        <ScrollVirtualizer
          minWindowHeight={64}
          totalWindows={2}
          renderWindow={({ windowIndex }) => <div>Window {windowIndex}</div>}
          virtualizerRef={(next) => (handle = next)}
        />
      ),
      container,
    )

    const content = handle!.getScrollport()!.firstElementChild as HTMLElement
    const finalWindow = content.querySelector('[data-window-index="1"]')!
    expect(content.style.height).toBe('128px')

    TestResizeObserver.resize(finalWindow, 32)

    expect(content.style.height).toBe('96px')
  })

  test('shares an external scrollport and keeps row indexing outside scroll events', () => {
    const scrollport = document.createElement('div')
    container.appendChild(scrollport)
    let handle: ScrollVirtualizerHandle | undefined
    let state: VirtualizerGeometryState | undefined
    const getRowGeometry = vi.fn((windowIndex: number) =>
      windowIndex === 0 ?
        [
          { position: 'a', offset: 0, height: 32 },
          { position: 'b', offset: 32, height: 32 },
        ]
      : [],
    )

    dispose = render(
      () => (
        <ScrollVirtualizer
          minWindowHeight={64}
          totalWindows={3}
          scrollport={() => scrollport}
          getRowGeometry={getRowGeometry}
          onGeometryChange={(next) => (state = next)}
          renderWindow={() => <div>Window</div>}
          virtualizerRef={(next) => (handle = next)}
        />
      ),
      scrollport,
    )

    expect(handle?.getScrollport()).toBe(scrollport)
    expect(state?.firstVisibleRow?.position).toBe('a')
    const geometryReads = getRowGeometry.mock.calls.length

    scrollport.scrollTop = 32
    scrollport.dispatchEvent(new Event('scroll'))

    expect(state?.scrollTop).toBe(32)
    expect(state?.visibleRange).toEqual({ start: 0, end: 1 })
    expect(state?.firstVisibleRow?.position).toBe('b')
    expect(handle?.getRowCoordinates('b')?.viewportStart).toBe(0)
    expect(getRowGeometry).toHaveBeenCalledTimes(geometryReads)
  })

  test('accepts retained row geometry through the imperative handle', () => {
    let handle: ScrollVirtualizerHandle | undefined
    dispose = render(
      () => (
        <ScrollVirtualizer
          minWindowHeight={64}
          totalWindows={2}
          renderWindow={() => <div>Window</div>}
          virtualizerRef={(next) => (handle = next)}
        />
      ),
      container,
    )

    handle!.updateRowGeometry(1, [{ position: 'c', offset: 0, height: 32 }])
    expect(handle?.getRowCoordinates('c')?.start).toBe(64)
  })

  test('reconciles retained windows after a numeric scroll jump', () => {
    const scrollport = document.createElement('div')
    container.appendChild(scrollport)
    let handle: ScrollVirtualizerHandle | undefined

    dispose = render(
      () => (
        <ScrollVirtualizer
          minWindowHeight={64}
          totalWindows={10}
          scrollport={() => scrollport}
          renderWindow={() => <div>Window</div>}
          virtualizerRef={(next) => (handle = next)}
        />
      ),
      scrollport,
    )

    scrollport.scrollTop = 512
    scrollport.dispatchEvent(new Event('scroll'))

    expect(handle?.getGeometry()?.visibleRange).toEqual({ start: 8, end: 9 })
    expect([...handle!.getGeometry()!.renderedRange]).toEqual([6, 7, 8, 9])
  })
})
