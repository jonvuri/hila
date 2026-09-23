import { createSignal, createMemo, createEffect, onMount, onCleanup, For } from 'solid-js'
import { JSX } from 'solid-js/jsx-runtime'

import {
  buildWindowGeometry,
  findVisibleWindowRange,
  getRenderedWindowRange,
  getResizeScrollCompensation,
  RetainedRowGeometryIndex,
} from './geometry'
import type {
  RetainedRowGeometry,
  VirtualRowGeometryInput,
  VirtualWindowGeometry,
  VisibleWindowRange,
} from './geometry'
import styles from './ScrollVirtualizer.module.css'

// Hard invariant: THRESHOLD_DISTANCE >= 2.
// For latch pair [A, B], the rendered range is [A-T, B+T].
// T=2 guarantees one buffer window beyond each candidate (adjacent-to-visible)
// window, so decoration computation always has sufficient forward context.
const THRESHOLD_DISTANCE = 2
const CONTAINER_HEIGHT = 500
const BLOCK_SIZE = 4 + THRESHOLD_DISTANCE * 2 // Size of window blocks for repositioning

export const SCROLL_VIRTUALIZER_MAX_RETAINED_WINDOWS = 2 + THRESHOLD_DISTANCE * 2

type WindowState = 'GHOST' | 'VISIBLE'

export type VirtualizerGeometryState = {
  /** The element that owns scroll input. */
  scrollport: HTMLElement
  /** The viewport start in virtual content coordinates. */
  scrollTop: number
  viewportHeight: number
  windows: readonly VirtualWindowGeometry[]
  visibleRange: VisibleWindowRange | undefined
  renderedRange: ReadonlySet<number>
  rows: readonly RetainedRowGeometry[]
  firstVisibleRow: RetainedRowGeometry | undefined
}

export type ScrollVirtualizerHandle = {
  getScrollport: () => HTMLElement | undefined
  getGeometry: () => VirtualizerGeometryState | undefined
  getRowCoordinates: (
    position: VirtualRowGeometryInput['position'],
  ) => (RetainedRowGeometry & { viewportStart: number }) | undefined
  updateRowGeometry: (windowIndex: number, rows: readonly VirtualRowGeometryInput[]) => void
}

type WindowRendererProps = {
  windowIndex: number
}

export type WindowRendererFunction = (props: WindowRendererProps) => JSX.Element

type WindowComponentProps = {
  windowIndex: number
  onIntersection: (windowIndex: number, isIntersecting: boolean) => void
  onResize: (windowIndex: number, height: number) => void
  /** The element that owns scrolling and is the IntersectionObserver root. */
  scrollport: HTMLElement | undefined
  getPosition: (windowIndex: number) => number
  renderWindow: WindowRendererFunction
}

// Window component that manages its own observers
const WindowComponent = (props: WindowComponentProps) => {
  let elementRef: HTMLDivElement | undefined

  onMount(() => {
    if (!elementRef) return

    // Create intersection observer
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          props.onIntersection(props.windowIndex, entry.isIntersecting)
        })
      },
      {
        root: props.scrollport,
      },
    )

    // Create resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const newHeight = entry.contentRect.height
        props.onResize(props.windowIndex, newHeight)
      })
    })

    // Start observing
    intersectionObserver.observe(elementRef)
    resizeObserver.observe(elementRef)

    // Cleanup on unmount
    onCleanup(() => {
      intersectionObserver.disconnect()
      resizeObserver.disconnect()
    })
  })

  return (
    <div
      ref={elementRef}
      data-window-index={props.windowIndex}
      class={styles.window}
      style={{
        transform: `translateY(${props.getPosition(props.windowIndex)}px)`,
        'min-height': '1px',
      }}
    >
      {props.renderWindow({
        windowIndex: props.windowIndex,
      })}
    </div>
  )
}

export type ScrollVirtualizerProps = {
  renderWindow: WindowRendererFunction
  minWindowHeight: number
  totalWindows?: number
  /** Return an external scrollport. The internal scrollport is the safe default. */
  scrollport?: () => HTMLElement | undefined
  /** Return numeric row geometry for a retained window. Offsets are window-relative. */
  getRowGeometry?: (windowIndex: number) => readonly VirtualRowGeometryInput[]
  virtualizerRef?: (handle: ScrollVirtualizerHandle | undefined) => void
  onGeometryChange?: (state: VirtualizerGeometryState) => void
  onVisibleRangeChange?: (range: Set<number>) => void
} & JSX.HTMLAttributes<HTMLDivElement>

const ScrollVirtualizer = (props: ScrollVirtualizerProps) => {
  // Clamp a latch pair so neither index exceeds the known window count.
  // No-op when totalWindows is unset (open-ended growth mode).
  const clampPair = (pair: [number, number]): [number, number] => {
    if (props.totalWindows === undefined) return pair
    const maxIdx = Math.max(0, props.totalWindows - 1)
    return [Math.min(pair[0], maxIdx), Math.min(pair[1], maxIdx)]
  }

  // Track window states: 'VISIBLE' or 'GHOST' (previously visible but unrendered now)
  const [windowStates, setWindowStates] = createSignal<WindowState[]>([])

  // Track current content height for each window
  const [windowHeights, setWindowHeights] = createSignal<number[]>([])
  const [measuredWindows, setMeasuredWindows] = createSignal<Set<number>>(new Set())

  const [physicalScrollTop, setPhysicalScrollTop] = createSignal(0)
  const [viewportHeight, setViewportHeight] = createSignal(0)

  // Track which windows are actually visible in viewport, based on intersection observers
  const [actuallyVisible, setActuallyVisible] = createSignal<Set<number>>(new Set())

  // Track stable pair of windows that defines the visible range.
  // When totalWindows=1 the pair degenerates to [0, 0].
  const [latchPair, setLatchPair] = createSignal<[number, number]>(clampPair([0, 1]))

  // Virtual positioning: offset from virtual origin (0) to physical container origin
  const [containerVirtualOffset, setContainerVirtualOffset] = createSignal(0)

  let containerRef: HTMLDivElement | undefined
  let latestGeometry: VirtualizerGeometryState | undefined
  const rowGeometry = new RetainedRowGeometryIndex()
  const rowGeometryInputs = new Map<number, readonly VirtualRowGeometryInput[]>()
  const [rowGeometryRevision, setRowGeometryRevision] = createSignal(0)
  const [retainedRows, setRetainedRows] = createSignal<readonly RetainedRowGeometry[]>([])

  // Use one explicit owner for scroll input and geometry. Standalone callers
  // use the internal scrollport without parent-style discovery.
  const getScrollport = (): HTMLElement | undefined => props.scrollport?.() ?? containerRef

  // Calculate virtual positions of all windows (cumulative from virtual origin 0).
  // Iterates up to totalWindows so unmeasured windows contribute their estimated
  // height to the scroll area, preventing an undersized scroll region.
  const windowGeometry = createMemo(() => {
    const heights = windowHeights()
    const total = props.totalWindows ?? heights.length
    const count = Math.max(heights.length, total)
    return buildWindowGeometry(heights, count, props.minWindowHeight, measuredWindows())
  })

  const virtualPositions = createMemo(() => {
    return windowGeometry().map((window) => window.start)
  })

  // Convert virtual position to physical position within container
  const getPhysicalPosition = (windowIndex: number): number => {
    const virtualPos = virtualPositions()[windowIndex] ?? 0
    const offset = containerVirtualOffset()
    const physicalPos = virtualPos - offset

    return physicalPos
  }

  // Pure function to compute full visible range from latch pair
  const computeVisibleRange = (pair: [number, number]): Set<number> => {
    return getRenderedWindowRange(pair, props.totalWindows, THRESHOLD_DISTANCE)
  }

  // Find the appropriate container offset based on window states
  const computeContainerOffset = createMemo(() => {
    const positions = virtualPositions()
    const currentPair = latchPair()
    const currentRange = computeVisibleRange(currentPair)

    if (currentRange.size === 0) return 0

    // Get the minimum index of the visible range
    const minVisibleIndex = Math.min(...currentRange)

    // Calculate how many complete blocks are before the visible range
    const blocksToSkip = Math.floor(minVisibleIndex / BLOCK_SIZE)
    const newStartIndex = blocksToSkip * BLOCK_SIZE

    if (blocksToSkip > 0) {
      // Find virtual position of the new start
      const newStartPosition = positions[newStartIndex] ?? 0
      return newStartPosition
    }

    // No repositioning needed
    return 0
  })

  // Apply container repositioning when offset changes
  createEffect(() => {
    const newOffset = computeContainerOffset()
    const currentOffset = containerVirtualOffset()
    const scrollport = getScrollport()

    if (newOffset !== currentOffset && scrollport) {
      const currentScrollTop = scrollport.scrollTop
      const offsetDelta = newOffset - currentOffset

      // Apply changes in same animation frame
      requestAnimationFrame(() => {
        // Update virtual offset
        setContainerVirtualOffset(newOffset)

        // Compensate scroll position
        scrollport.scrollTop = currentScrollTop - offsetDelta
        setPhysicalScrollTop(scrollport.scrollTop)
      })
    }
  })

  const handleWindowResize = (windowIndex: number, newHeight: number) => {
    if (newHeight === 0) return

    const scrollport = getScrollport()
    const contentScrollTop =
      (scrollport?.scrollTop ?? physicalScrollTop()) + containerVirtualOffset()
    const compensation = getResizeScrollCompensation(
      windowGeometry()[windowIndex],
      newHeight,
      contentScrollTop,
    )

    setWindowHeights((prev) => {
      const current = prev[windowIndex]
      if (current !== newHeight) {
        const newHeights = [...prev]
        newHeights[windowIndex] = newHeight
        return newHeights
      }
      return prev
    })
    setMeasuredWindows((prev) => {
      if (prev.has(windowIndex)) return prev
      const next = new Set(prev)
      next.add(windowIndex)
      return next
    })

    if (compensation !== 0 && scrollport) {
      scrollport.scrollTop += compensation
      setPhysicalScrollTop(scrollport.scrollTop)
    }
  }

  const visiblePairAt = (scrollTop: number, height: number): [number, number] | undefined => {
    const visible = findVisibleWindowRange(windowGeometry(), scrollTop, height)
    if (!visible) return undefined
    return clampPair([visible.start, Math.min(visible.end, visible.start + 1)])
  }

  const visiblePairForScrollport = (): [number, number] | undefined => {
    const scrollport = getScrollport()
    return visiblePairAt(
      (scrollport?.scrollTop ?? physicalScrollTop()) + containerVirtualOffset(),
      viewportHeight(),
    )
  }

  const syncActuallyVisibleToPair = (pair: readonly [number, number]): void => {
    setActuallyVisible((current) => {
      const next = new Set(pair)
      if (
        current.size === next.size &&
        [...next].every((windowIndex) => current.has(windowIndex))
      ) {
        return current
      }
      return next
    })
  }

  // Handle window intersection changes - update the actually visible set and latch pair
  const handleWindowIntersection = (windowIndex: number, isIntersecting: boolean) => {
    const currentActuallyVisible = new Set(actuallyVisible())
    const currentPair = latchPair()
    let actuallyVisibleChanged = false
    let reconcileFromGeometry = false

    if (isIntersecting) {
      // Window became actually visible
      if (!currentActuallyVisible.has(windowIndex)) {
        currentActuallyVisible.add(windowIndex)
        actuallyVisibleChanged = true
      } else {
        // A repeated enter can be a delayed record after scroll or layout work.
        // Reconcile it against current numeric geometry instead of suppressing it.
        reconcileFromGeometry = true
      }
    } else {
      // Window left actual visibility
      if (currentActuallyVisible.has(windowIndex)) {
        currentActuallyVisible.delete(windowIndex)
        actuallyVisibleChanged = true
      } else {
        // Actually visible set didn't change, return early
        return
      }
    }

    // Update latch pair based on new actually visible state
    let newPair = currentPair

    if (currentActuallyVisible.size > 2) {
      // A fast jump can report entering windows before the old exit records arrive.
      // Reconcile from numeric geometry so a transient observer set cannot widen
      // the retained range beyond the two-window latch contract.
      reconcileFromGeometry = true
    } else if (currentActuallyVisible.size === 2) {
      const visibleArray = Array.from(currentActuallyVisible).sort((a, b) => a - b)
      const first = visibleArray[0]!
      const last = visibleArray[1]!
      if (last - first <= 1) newPair = [first, last]
      else reconcileFromGeometry = true
    } else if (currentActuallyVisible.size === 1) {
      // Only one window visible
      const visibleWindow = currentActuallyVisible.values().next().value!

      if (currentPair[0] === visibleWindow || currentPair[1] === visibleWindow) {
        // If the current pair still contains the visible window, keep the same pair (retaining the one that just left)
        newPair = [...currentPair]
      } else {
        // Otherwise, fill in the missing window based on position of the visible window

        if (visibleWindow <= 1) {
          newPair = clampPair([0, 1])
        } else if (visibleWindow <= currentPair[0]) {
          newPair = clampPair([visibleWindow, visibleWindow + 1])
        } else if (visibleWindow >= currentPair[1]) {
          newPair = [visibleWindow - 1, visibleWindow]
        }
      }
    }
    // size === 0: transient during mount or fast scroll. Keep existing pair.

    if (reconcileFromGeometry) {
      const geometryPair = visiblePairForScrollport()
      if (geometryPair) {
        newPair = geometryPair
        syncActuallyVisibleToPair(geometryPair)
      } else if (actuallyVisibleChanged) {
        setActuallyVisible(currentActuallyVisible)
      }
    } else if (actuallyVisibleChanged) {
      setActuallyVisible(currentActuallyVisible)
    }

    if (newPair[0] === currentPair[0] && newPair[1] === currentPair[1]) {
      // Pair didn't change, return early
      return
    }

    setLatchPair(newPair)

    // Compute full visible range and apply state changes
    const visibleRange = computeVisibleRange(newPair)
    updateWindowStates(visibleRange)
  }

  // Update window states based on computed visible range
  const updateWindowStates = (visibleRange: Set<number>) => {
    setWindowStates((prevStates) => {
      const newStates = [...prevStates]
      let hasChanges = false

      // Handle all windows in visible range
      visibleRange.forEach((windowIndex) => {
        const currentState = newStates[windowIndex]

        if (!currentState) {
          // Create new window directly as VISIBLE
          newStates[windowIndex] = 'VISIBLE'
          hasChanges = true
        } else if (currentState === 'GHOST') {
          // Transition GHOST → VISIBLE (restore from cache)
          newStates[windowIndex] = 'VISIBLE'
          hasChanges = true
        }
        // VISIBLE windows in range stay VISIBLE (no change needed)
      })

      // Handle windows that should become GHOST
      for (let i = 0; i < newStates.length; i++) {
        const state = newStates[i]
        if (state === 'VISIBLE' && !visibleRange.has(i)) {
          // Transition VISIBLE → GHOST
          newStates[i] = 'GHOST'
          hasChanges = true
        }
      }

      return hasChanges ? newStates : prevStates
    })

    // Initialize heights for new VISIBLE windows
    setWindowHeights((prevHeights) => {
      const newHeights = [...prevHeights]
      let hasChanges = false

      visibleRange.forEach((windowIndex) => {
        if (!newHeights[windowIndex]) {
          newHeights[windowIndex] = props.minWindowHeight
          hasChanges = true
        }
      })

      return hasChanges ? newHeights : prevHeights
    })
  }

  // Computed visible range based on current state
  const currentVisibleRange = createMemo(() => {
    return computeVisibleRange(latchPair())
  })

  const reconcileVisibleRangeFromScroll = (scrollTop: number, height: number) => {
    const nextPair = visiblePairAt(scrollTop, height)
    if (!nextPair) return
    syncActuallyVisibleToPair(nextPair)
    const currentPair = latchPair()
    if (nextPair[0] === currentPair[0] && nextPair[1] === currentPair[1]) return
    setLatchPair(nextPair)
    updateWindowStates(computeVisibleRange(nextPair))
  }

  // Computed windows for rendering
  const visibleWindows = createMemo(() => {
    const range = currentVisibleRange()
    const states = windowStates()

    return Array.from(range).filter((windowIndex) => states[windowIndex] === 'VISIBLE')
  })

  // Calculate the physical content height from the virtual window geometry.
  const totalContentHeight = createMemo(() => {
    const positions = virtualPositions()
    const offset = containerVirtualOffset()

    // Bounded outlines have complete estimated geometry. Do not add an empty
    // safety tail after their final window.
    if (props.totalWindows !== undefined) {
      const lastWindow = windowGeometry().at(-1)
      const totalVirtual = lastWindow ? lastWindow.start + lastWindow.height : 0
      return Math.max(totalVirtual - offset, 0)
    }

    if (positions.length === 0) return CONTAINER_HEIGHT * 2

    // Find max virtual position and add height of that window
    const maxIndex = positions.length - 1
    const lastWindow = windowGeometry()[maxIndex]
    const totalVirtual = lastWindow ? lastWindow.start + lastWindow.height : 0

    // Physical height is virtual range that's visible in container
    const physicalHeight = totalVirtual - offset

    return Math.max(physicalHeight + CONTAINER_HEIGHT, CONTAINER_HEIGHT * 2)
  })

  createEffect(() => {
    props.onVisibleRangeChange?.(currentVisibleRange())
  })

  createEffect(() => {
    rowGeometryRevision()
    const retainedRange = currentVisibleRange()
    const windows = windowGeometry()
    for (const windowIndex of rowGeometryInputs.keys()) {
      if (!retainedRange.has(windowIndex)) rowGeometryInputs.delete(windowIndex)
    }
    rowGeometry.retainWindows(retainedRange)
    for (const windowIndex of retainedRange) {
      const window = windows[windowIndex]
      if (window) {
        rowGeometry.updateWindow(
          window,
          rowGeometryInputs.get(windowIndex) ?? props.getRowGeometry?.(windowIndex) ?? [],
        )
      }
    }
    setRetainedRows(rowGeometry.rows())
  })

  createEffect(() => {
    const windows = windowGeometry()
    const scrollport = getScrollport()
    if (!scrollport) return
    const scrollTop = physicalScrollTop() + containerVirtualOffset()
    const height = viewportHeight()
    const rows = retainedRows()
    latestGeometry = {
      scrollport,
      scrollTop,
      viewportHeight: height,
      windows,
      visibleRange: findVisibleWindowRange(windows, scrollTop, height),
      renderedRange: new Set(currentVisibleRange()),
      rows,
      firstVisibleRow: rows.find((row) => row.end > scrollTop),
    }
    props.onGeometryChange?.(latestGeometry)
  })

  onMount(() => {
    const handle: ScrollVirtualizerHandle = {
      getScrollport,
      getGeometry: () => latestGeometry,
      getRowCoordinates: (position) =>
        rowGeometry.sourceCoordinates(position, latestGeometry?.scrollTop ?? 0),
      updateRowGeometry: (windowIndex, rows) => {
        rowGeometryInputs.set(windowIndex, rows)
        setRowGeometryRevision((revision) => revision + 1)
      },
    }
    props.virtualizerRef?.(handle)
    onCleanup(() => props.virtualizerRef?.(undefined))

    const scrollport = getScrollport()
    if (scrollport) {
      const updateScrollTop = () => {
        setPhysicalScrollTop(scrollport.scrollTop)
        reconcileVisibleRangeFromScroll(
          scrollport.scrollTop + containerVirtualOffset(),
          viewportHeight(),
        )
      }
      const updateViewportHeight = () => setViewportHeight(scrollport.clientHeight)
      const resizeObserver = new ResizeObserver(updateViewportHeight)

      updateViewportHeight()
      updateScrollTop()
      scrollport.addEventListener('scroll', updateScrollTop, { passive: true })
      resizeObserver.observe(scrollport)
      onCleanup(() => {
        scrollport.removeEventListener('scroll', updateScrollTop)
        resizeObserver.disconnect()
      })
    }

    const initialRange = computeVisibleRange(latchPair())
    updateWindowStates(initialRange)
  })

  // When totalWindows decreases, trim windows and latch pair beyond the new boundary
  createEffect(() => {
    const total = props.totalWindows
    if (total === undefined) return

    setWindowStates((prev) => (prev.length > total ? prev.slice(0, total) : prev))
    setWindowHeights((prev) => (prev.length > total ? prev.slice(0, total) : prev))
    setMeasuredWindows((prev) => {
      const next = new Set([...prev].filter((windowIndex) => windowIndex < total))
      return next.size === prev.size ? prev : next
    })
    setActuallyVisible((prev) => {
      const next = new Set([...prev].filter((windowIndex) => windowIndex < total))
      return next.size === prev.size ? prev : next
    })
    setLatchPair((prev) => {
      const clamped = clampPair(prev)
      return clamped[0] !== prev[0] || clamped[1] !== prev[1] ? clamped : prev
    })

    const visibleRange = computeVisibleRange(latchPair())
    updateWindowStates(visibleRange)
  })

  return (
    <div
      class={styles.container}
      classList={{ [styles.externalContainer!]: props.scrollport != null }}
    >
      <div
        ref={containerRef}
        class={styles.scrollContainer}
        data-virtualizer-scrollport
        classList={{ [styles.externalScrollContent!]: props.scrollport != null }}
      >
        <div class={styles.content} style={{ height: `${totalContentHeight()}px` }}>
          <For each={visibleWindows()}>
            {(windowIndex) => (
              <WindowComponent
                windowIndex={windowIndex}
                onIntersection={handleWindowIntersection}
                onResize={handleWindowResize}
                scrollport={getScrollport()}
                getPosition={getPhysicalPosition}
                renderWindow={props.renderWindow}
              />
            )}
          </For>
        </div>
      </div>
    </div>
  )
}

export default ScrollVirtualizer
