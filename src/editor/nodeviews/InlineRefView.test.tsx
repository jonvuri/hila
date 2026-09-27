import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from 'solid-js/web'

import { InlineReferenceBadge } from './InlineRefView'

describe('InlineReferenceBadge', () => {
  let dispose: (() => void) | undefined

  afterEach(() => {
    dispose?.()
    dispose = undefined
    document.body.replaceChildren()
  })

  test('activates a live reference with pointer and keyboard input', () => {
    const onActivate = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(
      () => (
        <InlineReferenceBadge
          kind="ref"
          state="live"
          title="Architecture"
          onActivate={onActivate}
        />
      ),
      container,
    )
    const badge = container.querySelector<HTMLElement>('[role="button"]')!

    badge.click()
    badge.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    badge.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))

    expect(onActivate).toHaveBeenCalledTimes(3)
    expect(badge.tabIndex).toBe(0)
    expect(badge.getAttribute('aria-label')).toBe('Open Architecture')
  })

  test('keeps ghost references named but inert', () => {
    const onActivate = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(
      () => (
        <InlineReferenceBadge
          kind="own"
          state="ghost"
          title="#deleted-task"
          onActivate={onActivate}
        />
      ),
      container,
    )
    const badge = container.querySelector<HTMLElement>('[role="button"]')!

    badge.click()
    badge.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(onActivate).not.toHaveBeenCalled()
    expect(badge.getAttribute('aria-disabled')).toBe('true')
    expect(badge.getAttribute('aria-label')).toBe('Deleted reference: #deleted-task')
  })

  test('keeps loading references busy, disabled, and out of the tab order', () => {
    const onActivate = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(
      () => (
        <InlineReferenceBadge kind="own" state="loading" title="#…" onActivate={onActivate} />
      ),
      container,
    )
    const badge = container.querySelector<HTMLElement>('[role="button"]')!

    badge.click()
    badge.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    badge.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))

    expect(onActivate).not.toHaveBeenCalled()
    expect(badge.tabIndex).toBe(-1)
    expect(badge.getAttribute('tabindex')).toBeNull()
    expect(badge.getAttribute('aria-disabled')).toBe('true')
    expect(badge.getAttribute('aria-busy')).toBe('true')
    expect(badge.getAttribute('aria-label')).toBe('Loading reference: #…')
  })

  test('exposes owned key properties without changing the reference name', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    dispose = render(
      () => (
        <InlineReferenceBadge
          kind="own"
          state="live"
          title="#task"
          keyProps={[{ label: 'status', value: 'doing' }]}
        />
      ),
      container,
    )

    expect(container.textContent).toContain('#task')
    expect(container.textContent).toContain('doing')
    expect(container.querySelector('[title="status"]')).not.toBeNull()
  })
})
