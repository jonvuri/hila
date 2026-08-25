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

  test('coalesces scroll writes and moves only the final sticky row', () => {
    mount()
    const scroll = container.querySelector<HTMLElement>('.ws-navigation-scroll')!

    scroll.scrollTop = 4
    scroll.dispatchEvent(new Event('scroll'))
    expect(frameCallbacks).toHaveLength(1)
    frameCallbacks.shift()!(0)
    const slot = container.querySelector<HTMLElement>('[data-sticky-state="active"]')!
    expect(slot.style.transform).toBe('translate3d(0, 32px, 0)')
    expect(slot.classList.contains('ws-sticky-row-selection-path')).toBe(true)

    scroll.scrollTop = 68
    scroll.dispatchEvent(new Event('scroll'))
    scroll.scrollTop = 69
    scroll.dispatchEvent(new Event('scroll'))

    expect(frameCallbacks).toHaveLength(1)
    frameCallbacks.shift()!(0)
    expect(container.querySelector('[data-sticky-state="active"]')).toBe(slot)
    expect(slot.style.transform).toBe('translate3d(0, 31px, 0)')
    expect(
      container
        .querySelector('[data-sticky-widget]')
        ?.getAttribute('data-widget-position-updates'),
    ).toBe('1')
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

  test('collapses from a sticky copy and returns focus to the source tree', async () => {
    mount()
    const scroll = container.querySelector<HTMLElement>('.ws-navigation-scroll')!
    scroll.scrollTop = 4
    scroll.dispatchEvent(new Event('scroll'))
    frameCallbacks.shift()!(0)

    container
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Collapse Parent from pinned navigation"]',
      )!
      .click()
    await Promise.resolve()

    expect(container.querySelectorAll('.ws-sticky-row')).toHaveLength(0)
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Expand Parent')
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

    container
      .querySelector<HTMLButtonElement>('[data-sticky-state="active"] .ws-sticky-label')!
      .click()
    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'auto', top: 4 })
  })

  test('keeps the drill preview mounted through both edge handoffs', async () => {
    mount()
    await Promise.resolve()
    const scroll = container.querySelector<HTMLElement>('.ws-navigation-scroll')!
    const drill = container.querySelector<HTMLElement>('[data-sticky-location="bottom"]')!

    scroll.scrollTop = 100
    scroll.dispatchEvent(new Event('scroll'))
    frameCallbacks.shift()!(0)
    expect(container.querySelector('[data-sticky-location="flow"]')).toBe(drill)

    scroll.scrollTop = 101
    scroll.dispatchEvent(new Event('scroll'))
    frameCallbacks.shift()!(0)
    expect(container.querySelector('[data-sticky-location="top"]')).toBe(drill)
  })

  test('hands a pushed drill heading to the top dock without a gap', async () => {
    dispose = render(
      () => (
        <StickyNavigation
          title="Workspace"
          items={[
            {
              id: 'drill',
              content: 'Drill row',
              children: [{ id: 'child', content: 'Child' }],
            },
            { id: 'tail', content: 'Tail' },
          ]}
          drillId="drill"
        />
      ),
      container,
    )
    await Promise.resolve()
    const scroll = container.querySelector<HTMLElement>('.ws-navigation-scroll')!

    scroll.scrollTop = 36
    scroll.dispatchEvent(new Event('scroll'))
    frameCallbacks.shift()!(0)
    const drill = container.querySelector<HTMLElement>('[data-sticky-location="chain"]')!

    scroll.scrollTop = 37
    scroll.dispatchEvent(new Event('scroll'))
    frameCallbacks.shift()!(0)

    expect(container.querySelector('[data-sticky-location="top"]')).toBe(drill)
    expect(drill.style.transform).toBe('translate3d(0, 32px, 0)')
    expect(
      container.querySelector<HTMLElement>('[data-sticky-row-id="drill"]')?.style.transform,
    ).toBe('translate3d(0, 31px, 0)')
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
      expect(container.querySelector('[data-sticky-widget]')?.getAttribute('role')).toBe(
        'group',
      )
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
