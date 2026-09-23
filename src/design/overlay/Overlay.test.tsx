import { createSignal, Show } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  AnchoredOverlay,
  CenteredOverlay,
  calculateAnchoredPosition,
  type OverlayDismissReason,
} from './Overlay'

describe('shared overlays', () => {
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

  test('clamps anchored geometry and flips when the lower viewport is too small', () => {
    expect(
      calculateAnchoredPosition(
        { left: 290, right: 300, top: 180, bottom: 196 },
        { width: 120, height: 100 },
        { width: 320, height: 240 },
      ),
    ).toEqual({ left: 192, top: 76, maxHeight: 168, placement: 'above' })

    expect(
      calculateAnchoredPosition(
        { left: -20, right: 0, top: 8, bottom: 24 },
        { width: 120, height: 60 },
        { width: 320, height: 240 },
      ),
    ).toEqual({ left: 8, top: 28, maxHeight: 204, placement: 'below' })
  })

  test('focuses centered content and restores the invoker after Escape', async () => {
    const invoker = document.createElement('button')
    document.body.appendChild(invoker)
    invoker.focus()
    const dismiss = vi.fn<(reason: OverlayDismissReason) => void>()
    const [open, setOpen] = createSignal(true)
    let input: HTMLInputElement | undefined
    dispose = render(
      () => (
        <Show when={open()}>
          <CenteredOverlay
            ariaLabel="Launcher"
            initialFocus={() => input}
            onDismiss={(reason) => {
              dismiss(reason)
              setOpen(false)
            }}
          >
            <input ref={input} />
          </CenteredOverlay>
        </Show>
      ),
      container,
    )
    await Promise.resolve()

    expect(document.activeElement).toBe(input)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await Promise.resolve()

    expect(dismiss).toHaveBeenCalledWith('escape')
    expect(document.activeElement).toBe(invoker)
    invoker.remove()
  })

  test('restores a contenteditable selection after dismissal', async () => {
    const invoker = document.createElement('div')
    invoker.contentEditable = 'true'
    invoker.tabIndex = 0
    invoker.textContent = 'Editable label'
    document.body.appendChild(invoker)
    invoker.focus()
    const range = document.createRange()
    range.setStart(invoker.firstChild!, 8)
    range.collapse(true)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)
    const [open, setOpen] = createSignal(true)
    let input: HTMLInputElement | undefined
    dispose = render(
      () => (
        <Show when={open()}>
          <CenteredOverlay
            ariaLabel="Launcher"
            initialFocus={() => input}
            onDismiss={() => setOpen(false)}
          >
            <input ref={input} />
          </CenteredOverlay>
        </Show>
      ),
      container,
    )
    await Promise.resolve()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await Promise.resolve()

    expect(document.activeElement).toBe(invoker)
    expect(document.getSelection()?.anchorNode).toBe(invoker.firstChild)
    expect(document.getSelection()?.anchorOffset).toBe(8)
    invoker.remove()
  })

  test('dismisses only the top overlay layer for each Escape', async () => {
    const events: string[] = []
    const [parentOpen, setParentOpen] = createSignal(true)
    const [childOpen, setChildOpen] = createSignal(true)
    dispose = render(
      () => (
        <Show when={parentOpen()}>
          <AnchoredOverlay
            anchor={{ left: 10, right: 20, top: 10, bottom: 20 }}
            onDismiss={() => {
              events.push('parent')
              setParentOpen(false)
            }}
          >
            Parent
            <Show when={childOpen()}>
              <AnchoredOverlay
                anchor={{ left: 20, right: 30, top: 20, bottom: 30 }}
                onDismiss={() => {
                  events.push('child')
                  setChildOpen(false)
                }}
              >
                Child
              </AnchoredOverlay>
            </Show>
          </AnchoredOverlay>
        </Show>
      ),
      container,
    )
    await Promise.resolve()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await Promise.resolve()
    expect(events).toEqual(['child'])

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await Promise.resolve()
    expect(events).toEqual(['child', 'parent'])
  })

  test('dismisses only the top overlay when pointer-down lands inside its parent', async () => {
    const events: string[] = []
    const [parentOpen, setParentOpen] = createSignal(true)
    const [childOpen, setChildOpen] = createSignal(false)
    dispose = render(
      () => (
        <Show when={parentOpen()}>
          <AnchoredOverlay
            anchor={{ left: 10, right: 20, top: 10, bottom: 20 }}
            testId="parent"
            onDismiss={() => {
              events.push('parent')
              setParentOpen(false)
            }}
          >
            <span data-testid="parent-content">Parent</span>
            <Show when={childOpen()}>
              <AnchoredOverlay
                anchor={{ left: 20, right: 30, top: 20, bottom: 30 }}
                onDismiss={() => {
                  events.push('child')
                  setChildOpen(false)
                }}
              >
                Child
              </AnchoredOverlay>
            </Show>
          </AnchoredOverlay>
        </Show>
      ),
      container,
    )
    setChildOpen(true)
    await Promise.resolve()

    container
      .querySelector('[data-testid="parent-content"]')!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(events).toEqual(['child'])
    expect(container.querySelector('[data-testid="parent"]')).not.toBeNull()
  })

  test('dismisses an anchored overlay only for pointer input outside its boundary', async () => {
    const dismiss = vi.fn<(reason: OverlayDismissReason) => void>()
    const [open, setOpen] = createSignal(true)
    dispose = render(
      () => (
        <Show when={open()}>
          <AnchoredOverlay
            anchor={{ left: 10, right: 20, top: 10, bottom: 20 }}
            testId="menu"
            onDismiss={(reason) => {
              dismiss(reason)
              setOpen(false)
            }}
          >
            <span data-testid="inside">Inside</span>
          </AnchoredOverlay>
        </Show>
      ),
      container,
    )
    await Promise.resolve()

    container
      .querySelector('[data-testid="inside"]')!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(dismiss).not.toHaveBeenCalled()

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(dismiss).toHaveBeenCalledWith('outside')
  })

  test('lets an outside pointer target take focus when dismissing an anchored overlay', async () => {
    const invoker = document.createElement('input')
    const target = document.createElement('button')
    document.body.append(invoker, target)
    invoker.focus()
    const [open, setOpen] = createSignal(true)
    dispose = render(
      () => (
        <Show when={open()}>
          <AnchoredOverlay
            anchor={{ left: 10, right: 20, top: 10, bottom: 20 }}
            onDismiss={() => setOpen(false)}
          >
            Menu
          </AnchoredOverlay>
        </Show>
      ),
      container,
    )
    target.addEventListener('pointerdown', () => target.focus())
    await Promise.resolve()

    target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await Promise.resolve()

    expect(document.activeElement).toBe(target)
    invoker.remove()
    target.remove()
  })

  test('keeps a synchronous focus handoff after an anchored overlay closes', async () => {
    const invoker = document.createElement('input')
    const handoff = document.createElement('input')
    document.body.append(invoker, handoff)
    invoker.focus()
    const [open, setOpen] = createSignal(true)
    dispose = render(
      () => (
        <Show when={open()}>
          <AnchoredOverlay
            anchor={{ left: 10, right: 20, top: 10, bottom: 20 }}
            onDismiss={() => setOpen(false)}
          >
            <button
              onPointerDown={() => {
                setOpen(false)
                handoff.focus()
              }}
            >
              Open picker
            </button>
          </AnchoredOverlay>
        </Show>
      ),
      container,
    )
    await Promise.resolve()

    container
      .querySelector('button')!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await Promise.resolve()

    expect(document.activeElement).toBe(handoff)
    invoker.remove()
    handoff.remove()
  })

  test('restores an input selection after anchored Escape dismissal', async () => {
    const invoker = document.createElement('input')
    invoker.value = 'Editable label'
    document.body.appendChild(invoker)
    invoker.focus()
    invoker.setSelectionRange(2, 8, 'backward')
    const [open, setOpen] = createSignal(true)
    dispose = render(
      () => (
        <Show when={open()}>
          <AnchoredOverlay
            anchor={{ left: 10, right: 20, top: 10, bottom: 20 }}
            onDismiss={() => setOpen(false)}
          >
            Menu
          </AnchoredOverlay>
        </Show>
      ),
      container,
    )
    await Promise.resolve()
    invoker.setSelectionRange(0, 0)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await Promise.resolve()

    expect(document.activeElement).toBe(invoker)
    expect(invoker.selectionStart).toBe(2)
    expect(invoker.selectionEnd).toBe(8)
    expect(invoker.selectionDirection).toBe('backward')
    invoker.remove()
  })

  test('restores a contenteditable selection after an anchored programmatic dismissal', async () => {
    const invoker = document.createElement('div')
    invoker.contentEditable = 'true'
    invoker.tabIndex = 0
    invoker.textContent = 'Editable label'
    document.body.appendChild(invoker)
    invoker.focus()
    const range = document.createRange()
    range.setStart(invoker.firstChild!, 8)
    range.collapse(true)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)
    const [open, setOpen] = createSignal(true)
    dispose = render(
      () => (
        <Show when={open()}>
          <AnchoredOverlay
            anchor={{ left: 10, right: 20, top: 10, bottom: 20 }}
            onDismiss={() => setOpen(false)}
          >
            <button>Menu action</button>
          </AnchoredOverlay>
        </Show>
      ),
      container,
    )
    await Promise.resolve()
    container.querySelector<HTMLButtonElement>('button')!.focus()

    setOpen(false)
    await Promise.resolve()

    expect(document.activeElement).toBe(invoker)
    expect(document.getSelection()?.anchorNode).toBe(invoker.firstChild)
    expect(document.getSelection()?.anchorOffset).toBe(8)
    invoker.remove()
  })
})
