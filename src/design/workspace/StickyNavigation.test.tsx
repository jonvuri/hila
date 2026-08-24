import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'solid-js/web'

import { navigationOutlineValues } from '../tokens'

import StickyNavigation from './StickyNavigation'

describe('StickyNavigation', () => {
  let container: HTMLDivElement
  let dispose: (() => void) | undefined
  let frameCallbacks: FrameRequestCallback[]

  beforeEach(() => {
    frameCallbacks = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    dispose?.()
    container.remove()
    vi.unstubAllGlobals()
  })

  const mount = () => {
    dispose = render(
      () => (
        <StickyNavigation
          title="Workspace"
          items={[
            {
              id: 'parent',
              content: 'Parent',
              children: [
                { id: 'child', content: 'Child' },
                { id: 'disabled', content: 'Disabled' },
              ],
            },
            { id: 'drill', content: 'Drill row' },
            ...Array.from({ length: 8 }, (_, index) => ({
              id: `tail-${index}`,
              content: `Tail ${index}`,
            })),
          ]}
          drillId="drill"
          selectedId="child"
          disabledIds={new Set(['disabled'])}
        />
      ),
      container,
    )
  }

  test('coalesces scroll writes and keeps one sticky slot element', () => {
    mount()
    const scroll = container.querySelector<HTMLElement>('.ws-navigation-scroll')!
    const slot = container.querySelector<HTMLElement>('[data-sticky-state="candidate"]')!

    scroll.scrollTop = 3
    scroll.dispatchEvent(new Event('scroll'))
    scroll.scrollTop = 4
    scroll.dispatchEvent(new Event('scroll'))

    expect(frameCallbacks).toHaveLength(1)
    expect(slot.style.transform).toBe('translate3d(0, 36px, 0)')
    frameCallbacks.shift()!(0)
    expect(container.querySelector('[data-sticky-state="active"]')).toBe(slot)
    expect(slot.style.transform).toBe('translate3d(0, 32px, 0)')
  })

  test('preserves row state and collapse behavior', () => {
    mount()

    expect(
      container.querySelector('[data-row-id="child"]')?.getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      container.querySelector('[data-row-id="disabled"]')?.getAttribute('aria-disabled'),
    ).toBe('true')
    expect(
      container.querySelector<HTMLElement>('[data-row-id="parent"] .ws-row-indent')?.style
        .width,
    ).toBe('20px')
    expect(
      container.querySelector<HTMLElement>('[data-row-id="child"] .ws-row-indent')?.style.width,
    ).toBe('36px')

    container.querySelector<HTMLButtonElement>('button[aria-label="Collapse Parent"]')!.click()
    expect(container.querySelector('[data-row-id="child"]')).toBeNull()
    expect(container.querySelector('button[aria-label="Expand Parent"]')).not.toBeNull()
  })

  test('uses instant click-to-scroll under reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    mount()
    const scroll = container.querySelector<HTMLElement>('.ws-navigation-scroll')!
    const scrollTo = vi.fn()
    Object.defineProperty(scroll, 'scrollTo', { configurable: true, value: scrollTo })
    scroll.scrollTop = 4
    scroll.dispatchEvent(new Event('scroll'))
    frameCallbacks.shift()!(0)

    container.querySelector<HTMLButtonElement>('[data-sticky-state="active"]')!.click()
    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'auto', top: 4 })
  })

  test('keeps the drill preview mounted through both edge handoffs', () => {
    mount()
    const scroll = container.querySelector<HTMLElement>('.ws-navigation-scroll')!
    const drill = container.querySelector<HTMLElement>('[data-sticky-location="bottom"]')!

    scroll.scrollTop = 68
    scroll.dispatchEvent(new Event('scroll'))
    frameCallbacks.shift()!(0)
    expect(container.querySelector('[data-sticky-state="candidate"]')).toBe(drill)

    scroll.scrollTop = 69
    scroll.dispatchEvent(new Event('scroll'))
    frameCallbacks.shift()!(0)
    expect(container.querySelector('[data-sticky-location="top"]')).toBe(drill)
  })

  test('keeps behavior and accessible semantics in the Guides row', () => {
    for (const variant of navigationOutlineValues) {
      dispose?.()
      container.replaceChildren()
      dispose = render(
        () => (
          <StickyNavigation
            items={[
              {
                id: 'parent',
                content: 'Parent',
                children: [{ id: 'child', content: 'Child' }],
              },
            ]}
            selectedId="child"
            navigationOutline={variant}
          />
        ),
        container,
      )

      expect(
        container.querySelector('.ws-navigation')?.getAttribute('data-navigation-outline'),
      ).toBe(variant)
      expect(container.querySelector('.ws-navigation')?.getAttribute('data-leaf-bullets')).toBe(
        'false',
      )
      expect(container.querySelectorAll('[role="treeitem"]')).toHaveLength(2)
      expect(container.querySelectorAll('button[aria-label="Collapse Parent"]')).toHaveLength(1)
      expect(
        container.querySelector('[data-row-id="child"]')?.getAttribute('aria-selected'),
      ).toBe('true')
      expect(container.querySelector('[data-row-id="child"]')?.getAttribute('aria-level')).toBe(
        '2',
      )
      expect(
        container
          .querySelector('[data-row-id="parent"]')
          ?.classList.contains('ws-nav-row-selection-path'),
      ).toBe(true)
      expect(
        container.querySelector('.ws-row-decoration-slot')?.getAttribute('aria-hidden'),
      ).toBe('true')
    }
  })

  test('shows optional leaf bullets without changing row indentation', () => {
    dispose = render(
      () => <StickyNavigation items={[{ id: 'leaf', content: 'Leaf' }]} showLeafBullets />,
      container,
    )

    expect(container.querySelector('.ws-navigation')?.getAttribute('data-leaf-bullets')).toBe(
      'true',
    )
    expect(
      container.querySelector<HTMLElement>('[data-row-id="leaf"] .ws-row-indent')?.style.width,
    ).toBe('20px')
  })
})
