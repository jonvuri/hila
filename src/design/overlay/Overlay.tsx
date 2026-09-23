import { createEffect, createSignal, onCleanup, onMount, type JSX } from 'solid-js'

import styles from './Overlay.module.css'

export type OverlayDismissReason = 'escape' | 'outside'

export type OverlayAnchor = {
  left: number
  right: number
  top: number
  bottom: number
}

export type AnchoredPosition = {
  left: number
  top: number
  maxHeight: number
  placement: 'above' | 'below'
}

type OverlayLayer = {
  boundary: HTMLElement
  onEscape: () => void
  onPointerOutside?: (event: PointerEvent) => void
}

const overlayLayers: OverlayLayer[] = []
const handledPointerEvents = new WeakSet<Event>()

const topLayer = (): OverlayLayer | undefined => overlayLayers[overlayLayers.length - 1]

const handleLayerKeyDown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || !topLayer()) {
    return
  }
  event.preventDefault()
  event.stopPropagation()
  topLayer()!.onEscape()
}

const handleLayerPointerDown = (event: PointerEvent) => {
  const layer = topLayer()
  if (!layer?.onPointerOutside || event.composedPath().includes(layer.boundary)) {
    return
  }
  handledPointerEvents.add(event)
  layer.onPointerOutside(event)
}

const registerOverlayLayer = (layer: OverlayLayer): (() => void) => {
  if (overlayLayers.length === 0) {
    window.addEventListener('keydown', handleLayerKeyDown, true)
    window.addEventListener('pointerdown', handleLayerPointerDown, true)
  }
  overlayLayers.push(layer)
  return () => {
    const index = overlayLayers.lastIndexOf(layer)
    if (index >= 0) overlayLayers.splice(index, 1)
    if (overlayLayers.length === 0) {
      window.removeEventListener('keydown', handleLayerKeyDown, true)
      window.removeEventListener('pointerdown', handleLayerPointerDown, true)
    }
  }
}

const restoreFocus = (element: HTMLElement | null) => {
  if (element?.isConnected) element.focus({ preventScroll: true })
}

export const calculateAnchoredPosition = (
  anchor: OverlayAnchor,
  surface: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 4,
  padding = 8,
): AnchoredPosition => {
  const availableBelow = Math.max(0, viewport.height - padding - anchor.bottom - gap)
  const availableAbove = Math.max(0, anchor.top - gap - padding)
  const placement =
    surface.height <= availableBelow || availableBelow >= availableAbove ? 'below' : 'above'
  const maxHeight = Math.max(0, placement === 'below' ? availableBelow : availableAbove)
  const renderedHeight = Math.min(surface.height, maxHeight)
  const unclampedTop =
    placement === 'below' ? anchor.bottom + gap : anchor.top - gap - renderedHeight
  const maxLeft = Math.max(padding, viewport.width - padding - surface.width)

  return {
    left: Math.min(Math.max(anchor.left, padding), maxLeft),
    top: Math.max(padding, unclampedTop),
    maxHeight,
    placement,
  }
}

export type CenteredOverlayProps = {
  children?: JSX.Element
  ariaLabel: string
  tempo?: 'quick' | 'deep'
  initialFocus?: () => HTMLElement | undefined
  restoreFocusTo?: HTMLElement
  restoreFocus?: boolean
  onDismiss: (reason: OverlayDismissReason) => void
  class?: string
  testId?: string
}

export const CenteredOverlay = (props: CenteredOverlayProps) => {
  let dialog: HTMLDialogElement | undefined
  let dismissed = false
  let removeLayer: (() => void) | undefined
  let previousFocus: HTMLElement | null = null

  const dismiss = (reason: OverlayDismissReason) => {
    if (dismissed) return
    dismissed = true
    props.onDismiss(reason)
  }

  onMount(() => {
    if (!dialog) return
    previousFocus = props.restoreFocusTo ?? (document.activeElement as HTMLElement | null)
    removeLayer = registerOverlayLayer({
      boundary: dialog,
      onEscape: () => dismiss('escape'),
    })
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')

    queueMicrotask(() => {
      const target =
        props.initialFocus?.() ??
        dialog?.querySelector<HTMLElement>('input, [role="listbox"], button, [tabindex="0"]')
      target?.focus({ preventScroll: true })
    })
  })

  onCleanup(() => {
    removeLayer?.()
    if (dialog?.open && typeof dialog.close === 'function') dialog.close()
    if (props.restoreFocus !== false) restoreFocus(previousFocus)
  })

  const handleBackdropPointerDown = (event: PointerEvent) => {
    if (!dialog || event.target !== dialog || handledPointerEvents.has(event)) return
    const rect = dialog.getBoundingClientRect()
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    if (!inside) dismiss('outside')
  }

  return (
    <dialog
      ref={dialog}
      class={`${styles.dialog} ${props.tempo === 'deep' ? styles.deep : styles.quick} ${props.class ?? ''}`}
      aria-label={props.ariaLabel}
      data-testid={props.testId}
      onCancel={(event) => {
        event.preventDefault()
        dismiss('escape')
      }}
      onPointerDown={handleBackdropPointerDown}
    >
      {props.children}
    </dialog>
  )
}

export type AnchoredOverlayProps = {
  anchor: OverlayAnchor
  children?: JSX.Element
  restoreFocusTo?: HTMLElement
  restoreFocus?: boolean
  onDismiss: (reason: OverlayDismissReason) => void
  class?: string
  testId?: string
}

export const AnchoredOverlay = (props: AnchoredOverlayProps) => {
  let surface: HTMLDivElement | undefined
  let removeLayer: (() => void) | undefined
  let dismissed = false
  let previousFocus: HTMLElement | null = null
  const [position, setPosition] = createSignal<AnchoredPosition>({
    left: 0,
    top: 0,
    maxHeight: Math.max(0, window.innerHeight - 12),
    placement: 'below',
  })

  const updatePosition = () => {
    if (!surface) return
    const bounds = surface.getBoundingClientRect()
    const viewport = window.visualViewport
    setPosition(
      calculateAnchoredPosition(
        props.anchor,
        { width: bounds.width, height: bounds.height },
        {
          width: viewport?.width ?? window.innerWidth,
          height: viewport?.height ?? window.innerHeight,
        },
      ),
    )
  }

  const dismiss = (reason: OverlayDismissReason) => {
    if (dismissed) return
    dismissed = true
    props.onDismiss(reason)
  }

  createEffect(() => {
    void props.anchor.left
    void props.anchor.right
    void props.anchor.top
    void props.anchor.bottom
    queueMicrotask(updatePosition)
  })

  onMount(() => {
    if (!surface) return
    previousFocus = props.restoreFocusTo ?? (document.activeElement as HTMLElement | null)
    removeLayer = registerOverlayLayer({
      boundary: surface,
      onEscape: () => dismiss('escape'),
      onPointerOutside: () => dismiss('outside'),
    })
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    window.visualViewport?.addEventListener('resize', updatePosition)
    window.visualViewport?.addEventListener('scroll', updatePosition)
    updatePosition()
  })

  onCleanup(() => {
    removeLayer?.()
    window.removeEventListener('resize', updatePosition)
    window.removeEventListener('scroll', updatePosition, true)
    window.visualViewport?.removeEventListener('resize', updatePosition)
    window.visualViewport?.removeEventListener('scroll', updatePosition)
    if (props.restoreFocus !== false) restoreFocus(previousFocus)
  })

  return (
    <div
      ref={surface}
      class={`${styles.anchored} ${props.class ?? ''}`}
      role="presentation"
      data-placement={position().placement}
      data-testid={props.testId}
      style={{
        left: `${position().left}px`,
        top: `${position().top}px`,
        'max-height': `${position().maxHeight}px`,
      }}
    >
      {props.children}
    </div>
  )
}
