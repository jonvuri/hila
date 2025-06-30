import { createSignal, createMemo, createEffect, onMount, onCleanup, For } from 'solid-js'
import { JSX } from 'solid-js/jsx-runtime'

import styles from './ScrollVirtualizer.module.css'

// Configuration
const THRESHOLD_DISTANCE = 2 // windows beyond viewport to keep visible
const CONTAINER_HEIGHT = 500
const BLOCK_SIZE = 4 + THRESHOLD_DISTANCE * 2 // Size of window blocks for repositioning

type WindowState = 'GHOST' | 'VISIBLE'

type WindowRendererProps = {
  windowIndex: number
}

export type WindowRendererFunction = (props: WindowRendererProps) => JSX.Element

type WindowComponentProps = {
  windowIndex: number
  onIntersection: (windowIndex: number, isIntersecting: boolean) => void
  onResize: (windowIndex: number, height: number) => void
  containerRef: HTMLDivElement | undefined
  getPosition: (windowIndex: number) => number
  renderWindow: WindowRendererFunction
  minWindowHeight: number
}

// Window component that manages its own observers
function WindowComponent(props: WindowComponentProps) {
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
        root: props.containerRef,
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
        'min-height': `${props.minWindowHeight}px`,
      }}
    >
      {props.renderWindow({
        windowIndex: props.windowIndex,
      })}
    </div>
  )
}

type ScrollVirtualizerProps = {
  renderWindow: WindowRendererFunction
  minWindowHeight: number
} & JSX.HTMLAttributes<HTMLDivElement>

export default function ScrollVirtualizer(props: ScrollVirtualizerProps) {
  // Track window states: 'VISIBLE' or 'GHOST' (previously visible but unrendered now)
  const [windowStates, setWindowStates] = createSignal<WindowState[]>([])

  // Track current content height for each window
  const [windowHeights, setWindowHeights] = createSignal<number[]>([])

  // Track which windows are actually visible in viewport, based on intersection observers
  const [actuallyVisible, setActuallyVisible] = createSignal<Set<number>>(new Set())

  // Track stable pair of windows that defines the visible range.
  const [latchPair, setLatchPair] = createSignal<[number, number]>([0, 1])

  // Virtual positioning: offset from virtual origin (0) to physical container origin
  const [containerVirtualOffset, setContainerVirtualOffset] = createSignal(0)

  let containerRef: HTMLDivElement | undefined

  // Getter for window content height that ensures minimum window height
  const getTotalHeight = (windowIndex: number): number => {
    const height = windowHeights()[windowIndex] ?? 0
    return Math.max(height, props.minWindowHeight)
  }

  // Calculate virtual positions of all windows (cumulative from virtual origin 0)
  const virtualPositions = createMemo(() => {
    const heights = windowHeights()
    const positions: number[] = []

    if (heights.length === 0) return positions

    // Calculate cumulative positions from virtual origin
    let cumulativePosition = 0
    for (let i = 0; i < heights.length; i++) {
      positions[i] = cumulativePosition
      cumulativePosition += getTotalHeight(i)
    }

    return positions
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
    const [min, max] = pair

    // Extend threshold distance around the latch pair
    const rangeStart = Math.max(0, min - THRESHOLD_DISTANCE)
    const rangeEnd = max + THRESHOLD_DISTANCE

    const visibleRange = new Set<number>()
    for (let i = rangeStart; i <= rangeEnd; i++) {
      visibleRange.add(i)
    }

    return visibleRange
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

    if (newOffset !== currentOffset && containerRef) {
      const currentScrollTop = containerRef.scrollTop
      const offsetDelta = newOffset - currentOffset

      // Apply changes in same animation frame
      requestAnimationFrame(() => {
        // Update virtual offset
        setContainerVirtualOffset(newOffset)

        // Compensate scroll position
        if (containerRef) {
          containerRef.scrollTop = currentScrollTop - offsetDelta
        }
      })
    }
  })

  // Handle window resize changes
  const handleWindowResize = (windowIndex: number, newHeight: number) => {
    // Ignore 0-height measurements during initial mount/layout
    if (newHeight === 0) {
      return
    }

    if (newHeight < props.minWindowHeight) {
      console.error(
        `RESIZE: Window ${windowIndex} height ${newHeight}px is less than minimum ${props.minWindowHeight}px`,
      )
    }

    // Enforce minimum height constraint
    const constrainedHeight = Math.max(newHeight, props.minWindowHeight)

    setWindowHeights((prev) => {
      const current = prev[windowIndex]
      if (current !== constrainedHeight) {
        const newHeights = [...prev]
        newHeights[windowIndex] = constrainedHeight
        return newHeights
      }
      return prev
    })
  }

  // Handle window intersection changes - update the actually visible set and latch pair
  const handleWindowIntersection = (windowIndex: number, isIntersecting: boolean) => {
    const currentActuallyVisible = new Set(actuallyVisible())
    const currentPair = latchPair()

    if (isIntersecting) {
      // Window became actually visible
      if (!currentActuallyVisible.has(windowIndex)) {
        currentActuallyVisible.add(windowIndex)
      } else {
        // Actually visible set didn't change, return early
        return
      }
    } else {
      // Window left actual visibility
      if (currentActuallyVisible.has(windowIndex)) {
        currentActuallyVisible.delete(windowIndex)
      } else {
        // Actually visible set didn't change, return early
        return
      }
    }

    setActuallyVisible(currentActuallyVisible)

    // Update latch pair based on new actually visible state
    let newPair = currentPair

    if (currentActuallyVisible.size > 2) {
      console.error(
        `LATCH_PAIR: ${currentActuallyVisible.size} windows visible, max 2 expected`,
      )

      // More than two windows visible - update pair to min/max of visible
      const visibleArray = Array.from(currentActuallyVisible).sort((a, b) => a - b)
      newPair = [visibleArray[0]!, visibleArray[visibleArray.length - 1]!]
    } else if (currentActuallyVisible.size === 2) {
      // Two windows visible - set them as the latch pair
      const visibleIter = currentActuallyVisible.values()
      const window1 = visibleIter.next().value!
      const window2 = visibleIter.next().value!

      newPair = [Math.min(window1, window2), Math.max(window1, window2)]
    } else if (currentActuallyVisible.size === 1) {
      // Only one window visible
      const visibleWindow = currentActuallyVisible.values().next().value!

      if (currentPair[0] === visibleWindow || currentPair[1] === visibleWindow) {
        // If the current pair still contains the visible window, keep the same pair (retaining the one that just left)
        newPair = [...currentPair]
      } else {
        // Otherwise, fill in the missing window based on position of the visible window

        if (visibleWindow <= 1) {
          newPair = [0, 1]
        } else if (visibleWindow <= currentPair[0]) {
          newPair = [visibleWindow, visibleWindow + 1]
        } else if (visibleWindow >= currentPair[1]) {
          newPair = [visibleWindow - 1, visibleWindow]
        }
      }
    } else if (currentActuallyVisible.size === 0) {
      // If 0 windows visible, keep existing latch pair
      console.error('LATCH_PAIR: 0 windows visible, min 1 expected')
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

  // Computed windows for rendering
  const visibleWindows = createMemo(() => {
    const range = currentVisibleRange()
    const states = windowStates()

    return Array.from(range).filter((windowIndex) => states[windowIndex] === 'VISIBLE')
  })

  // Calculate total physical content height based on visible windows
  const totalContentHeight = createMemo(() => {
    const positions = virtualPositions()
    const offset = containerVirtualOffset()

    if (positions.length === 0) return CONTAINER_HEIGHT * 2

    // Find max virtual position and add height of that window
    const maxIndex = positions.length - 1
    const maxVirtualPos = positions[maxIndex] ?? 0
    const totalVirtual = maxVirtualPos + getTotalHeight(maxIndex)

    // Physical height is virtual range that's visible in container
    const physicalHeight = totalVirtual - offset

    return Math.max(physicalHeight + CONTAINER_HEIGHT, CONTAINER_HEIGHT * 2)
  })

  onMount(() => {
    // Initialize with initial latch pair [0, 1]
    const initialRange = computeVisibleRange([0, 1])
    updateWindowStates(initialRange)
  })

  return (
    <div class={styles.container} style={{ position: 'relative', display: 'flex' }}>
      <div ref={containerRef} class={styles.scrollContainer}>
        <div class={styles.content} style={{ height: `${totalContentHeight()}px` }}>
          <For each={visibleWindows()}>
            {(windowIndex) => (
              <WindowComponent
                windowIndex={windowIndex}
                onIntersection={handleWindowIntersection}
                onResize={handleWindowResize}
                containerRef={containerRef}
                getPosition={getPhysicalPosition}
                renderWindow={props.renderWindow}
                minWindowHeight={props.minWindowHeight}
              />
            )}
          </For>
        </div>
      </div>
    </div>
  )
}
