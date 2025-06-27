import { createSignal, createMemo, onMount, onCleanup, For } from 'solid-js'
import { JSX } from 'solid-js/jsx-runtime'

import styles from './ScrollVirtualizer.module.css'

function areSetsEqual(set1: Set<number>, set2: Set<number>): boolean {
  if (set1.size !== set2.size) {
    return false
  }

  for (const value of set1) {
    if (!set2.has(value)) {
      return false
    }
  }

  return true
}

function areArraysEqual<T>(arr1: T[], arr2: T[]): boolean {
  if (arr1.length !== arr2.length) {
    return false
  }

  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) {
      return false
    }
  }

  return true
}

// Configuration
const THRESHOLD_DISTANCE = 2 // windows beyond viewport to keep visible
const CONTAINER_HEIGHT = 500

type WindowState = 'GHOST' | 'VISIBLE'

interface WindowRendererProps {
  windowIndex: number
}

export type WindowRendererFunction = (props: WindowRendererProps) => JSX.Element

// ItemComponent moved to WindowRenderer module

interface WindowComponentProps {
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

    console.log(`🔧 WINDOW_COMPONENT: Setting up observers for window ${props.windowIndex}`)

    // Create intersection observer
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          console.log(
            `👁️ WINDOW_INTERSECTION: Window ${props.windowIndex}, intersecting: ${entry.isIntersecting}, ratio: ${entry.intersectionRatio}`,
          )
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
        console.log(`📏 WINDOW_RESIZE: Window ${props.windowIndex} height: ${newHeight}px`)
        props.onResize(props.windowIndex, newHeight)
      })
    })

    // Start observing
    intersectionObserver.observe(elementRef)
    resizeObserver.observe(elementRef)

    // Cleanup on unmount
    onCleanup(() => {
      console.log(`🧹 WINDOW_COMPONENT: Cleaning up observers for window ${props.windowIndex}`)
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

interface ScrollVirtualizerProps {
  renderWindow: WindowRendererFunction
  minWindowHeight: number
}

export default function ScrollVirtualizer(props: ScrollVirtualizerProps) {
  // Track window states: 'VISIBLE' or 'GHOST' (previously visible but unrendered now)
  const [windowStates, setWindowStates] = createSignal<Map<number, WindowState>>(new Map())

  // Track current content height for each window
  const [windowHeights, setWindowHeights] = createSignal<Map<number, number>>(new Map())

  // Track which windows are actually visible in viewport, based on intersection observers
  const [actuallyVisible, setActuallyVisible] = createSignal<Set<number>>(new Set())

  // Track stable pair of windows that defines the visible range.
  // When 2 or more windows are visible (though windows should be larger than the viewport,
  // so we expect at most 2, we're pessimistic), this is the outer bound of the visible range,
  // inclusive. When only one window is visible, this is that window plus the last window
  // that was visible on either side of it - this is the "latching" behavior.
  const [latchPair, setLatchPair] = createSignal<[number, number]>([0, 1])

  let containerRef: HTMLDivElement | undefined

  // Getter for window content height that ensures minimum window height
  const getTotalHeight = (windowIndex: number): number => {
    const height = windowHeights().get(windowIndex) ?? 0
    return Math.max(height, props.minWindowHeight)
  }

  // Memoized positions based on heights
  const windowPositions = createMemo(
    (previousPositions: Map<number, number> | undefined): Map<number, number> => {
      const heights = windowHeights()
      const newPositions = new Map<number, number>()

      // Get all window indices from heights and sort them
      const sortedIndices = Array.from(heights.keys()).sort((a, b) => a - b)

      let hasChanges = false

      let cumulativePosition = 0
      for (const index of sortedIndices) {
        const previousPosition = previousPositions?.get(index) ?? 0
        if (previousPosition !== cumulativePosition) {
          hasChanges = true
        }

        newPositions.set(index, cumulativePosition)
        cumulativePosition += getTotalHeight(index)
      }

      if (!previousPositions || hasChanges) {
        console.log(
          `📐 POSITIONS_UPDATE: Recalculated positions for windows [${sortedIndices.join(',')}]`,
        )
        return newPositions
      } else {
        console.log(
          `📐 POSITIONS_UPDATE: No changes to positions for windows [${sortedIndices.join(',')}]`,
        )
        return previousPositions
      }
    },
  )

  // Pure function to compute full visible range from latch pair
  const computeVisibleRange = (pair: [number, number]): Set<number> => {
    const [min, max] = pair

    console.log(`🧮 COMPUTE_RANGE: latchPair=[${min}, ${max}]`)

    // Extend threshold distance around the latch pair
    const rangeStart = Math.max(0, min - THRESHOLD_DISTANCE)
    const rangeEnd = max + THRESHOLD_DISTANCE

    const visibleRange = new Set<number>()
    for (let i = rangeStart; i <= rangeEnd; i++) {
      visibleRange.add(i)
    }

    console.log(
      `🧮 COMPUTE_RANGE: Final range: [${Array.from(visibleRange)
        .sort((a, b) => a - b)
        .join(',')}] (${rangeStart} to ${rangeEnd})`,
    )

    return visibleRange
  }

  // Handle window resize changes
  const handleWindowResize = (windowIndex: number, newHeight: number) => {
    // Ignore 0-height measurements during initial mount/layout
    if (newHeight === 0) {
      console.error(`📏 RESIZE: Unexpected 0px height for window ${windowIndex}`)
      return
    }

    if (newHeight < props.minWindowHeight) {
      console.error(
        `📏 RESIZE: Window ${windowIndex} height ${newHeight}px is less than minimum ${props.minWindowHeight}px`,
      )
    }

    // Enforce minimum height constraint
    const constrainedHeight = Math.max(newHeight, props.minWindowHeight)
    console.log(`📏 RESIZE: Window ${windowIndex} height changed to ${newHeight}px`)

    setWindowHeights((prev) => {
      const current = prev.get(windowIndex)
      if (current !== constrainedHeight) {
        console.log(`📏 RESIZE: Updated window ${windowIndex} height: ${constrainedHeight}px`)
        const newHeights = new Map(prev)
        newHeights.set(windowIndex, constrainedHeight)
        return newHeights
      }
      return prev
    })
  }

  // Handle window intersection changes - update the actually visible set and latch pair
  const handleWindowIntersection = (windowIndex: number, isIntersecting: boolean) => {
    console.log(`🔍 INTERSECTION: Window ${windowIndex} isIntersecting=${isIntersecting}`)

    const currentActuallyVisible = new Set(actuallyVisible())
    const currentPair = latchPair()

    if (isIntersecting) {
      // Window became actually visible
      currentActuallyVisible.add(windowIndex)
      console.log(`✅ Window ${windowIndex} became actually visible`)
    } else {
      // Window left actual visibility
      currentActuallyVisible.delete(windowIndex)
      console.log(`➖ Window ${windowIndex} left actual visibility`)
    }

    // Return early if actually visible set didn't change
    if (areSetsEqual(currentActuallyVisible, actuallyVisible())) {
      console.log(`🔄 LATCH_PAIR: Actually visible set didn't change, returning early`)
      return
    }

    setActuallyVisible(currentActuallyVisible)

    // Update latch pair based on new actually visible state
    let newPair = currentPair

    if (currentActuallyVisible.size > 2) {
      console.error(
        `🔄 LATCH_PAIR: ${currentActuallyVisible.size} windows visible, max 2 expected`,
      )

      // More than two windows visible - update pair to min/max of visible
      const visibleArray = Array.from(currentActuallyVisible).sort((a, b) => a - b)
      newPair = [visibleArray[0]!, visibleArray[visibleArray.length - 1]!]
    } else if (currentActuallyVisible.size === 2) {
      // Two windows visible - set them as the latch pair
      const window1 = currentActuallyVisible.values().next().value!
      const window2 = currentActuallyVisible.values().next().value!
      newPair = [Math.min(window1, window2), Math.max(window1, window2)]

      console.log(
        `🔄 LATCH_PAIR: ${currentActuallyVisible.size} windows visible, updating pair to [${newPair[0]}, ${newPair[1]}]`,
      )
    } else if (currentActuallyVisible.size === 1) {
      // Only one window visible
      const visibleWindow = currentActuallyVisible.values().next().value!

      if (currentPair[0] === visibleWindow || currentPair[1] === visibleWindow) {
        // If the current pair still contains the visible window, keep the same pair (retaining the one that just left)
        newPair = [...currentPair]

        console.log(
          `🔄 LATCH_PAIR: 1 window visible, keeping previous pair [${newPair[0]}, ${newPair[1]}]`,
        )
      } else {
        // Otherwise, fill in the missing window based on position of the visible window

        if (visibleWindow <= 1) {
          newPair = [0, 1]

          console.log(`🔄 LATCH_PAIR: 1 window visible at start, filling in window [0, 1]`)
        } else if (visibleWindow <= currentPair[0]) {
          newPair = [visibleWindow, visibleWindow + 1]

          console.log(
            `🔄 LATCH_PAIR: 1 window visible before current pair [${currentPair[0]}, ${currentPair[1]}], filling in window [${newPair[0]}, ${newPair[1]}]`,
          )
        } else if (visibleWindow >= currentPair[1]) {
          newPair = [visibleWindow - 1, visibleWindow]

          console.log(
            `🔄 LATCH_PAIR: 1 window visible after current pair [${currentPair[0]}, ${currentPair[1]}], filling in window [${newPair[0]}, ${newPair[1]}]`,
          )
        }
      }
    } else if (currentActuallyVisible.size === 0) {
      // If 0 windows visible, keep existing latch pair
      console.error('🔄 LATCH_PAIR: 0 windows visible, min 1 expected')
    }

    if (areArraysEqual(newPair, currentPair)) {
      console.log(`🔄 LATCH_PAIR: Pair didn't change, returning early`)
      return
    }

    setLatchPair(newPair)

    // Compute full visible range and apply state changes
    const visibleRange = computeVisibleRange(newPair)
    console.log(`📊 Computed visible range:`, Array.from(visibleRange))
    updateWindowStates(visibleRange)
  }

  // Update window states based on computed visible range
  const updateWindowStates = (visibleRange: Set<number>) => {
    console.log(`🔄 UPDATE_STATES: Processing visible range:`, Array.from(visibleRange))

    setWindowStates((prevStates) => {
      const newStates = new Map(prevStates)
      let hasChanges = false

      // Handle all windows in visible range
      visibleRange.forEach((windowIndex) => {
        const currentState = newStates.get(windowIndex)

        if (!currentState) {
          // Create new window directly as VISIBLE
          console.log(`🆕 Creating new VISIBLE window ${windowIndex}`)
          newStates.set(windowIndex, 'VISIBLE')
          hasChanges = true
        } else if (currentState === 'GHOST') {
          // Transition GHOST → VISIBLE (restore from cache)
          console.log(`👻 GHOST → VISIBLE: Window ${windowIndex}`)
          newStates.set(windowIndex, 'VISIBLE')
          hasChanges = true
        }
        // VISIBLE windows in range stay VISIBLE (no change needed)
      })

      // Handle windows that should become GHOST
      newStates.forEach((state, windowIndex) => {
        if (state === 'VISIBLE' && !visibleRange.has(windowIndex)) {
          // Transition VISIBLE → GHOST
          console.log(`💀 VISIBLE → GHOST: Window ${windowIndex}`)
          newStates.set(windowIndex, 'GHOST')
          hasChanges = true
        }
      })

      if (hasChanges) {
        // Debug summary
        const ghostWindows = Array.from(newStates.entries())
          .filter(([, state]) => state === 'GHOST')
          .map(([i]) => i)
        const visibleWindows = Array.from(newStates.entries())
          .filter(([, state]) => state === 'VISIBLE')
          .map(([i]) => i)

        console.log(
          `📊 STATE_SUMMARY: GHOST[${ghostWindows.join(',')}] VISIBLE[${visibleWindows.join(',')}]`,
        )
      }

      return hasChanges ? newStates : prevStates
    })

    // Initialize heights for new VISIBLE windows
    setWindowHeights((prevHeights) => {
      const newHeights = new Map(prevHeights)
      let hasChanges = false

      visibleRange.forEach((windowIndex) => {
        if (!newHeights.has(windowIndex)) {
          console.log(
            `🆕 Initializing height for window ${windowIndex} to min height ${props.minWindowHeight}px`,
          )
          newHeights.set(windowIndex, props.minWindowHeight)
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

  // Simplified reactive function to get window position
  const getWindowPosition = (windowIndex: number): number => {
    const previousPosition = windowIndex > 0 ? (windowPositions().get(windowIndex - 1) ?? 0) : 0
    const position =
      windowPositions().get(windowIndex) ?? previousPosition + getTotalHeight(windowIndex)
    console.log(`🔄 GET_POSITION: Window ${windowIndex} position: ${position}`)
    return position
  }

  // Computed windows for rendering
  const visibleWindows = createMemo(() => {
    const range = currentVisibleRange()
    const states = windowStates()

    return Array.from(range)
      .filter((windowIndex) => states.get(windowIndex) === 'VISIBLE')
      .map((windowIndex) => windowIndex)
  })

  // Calculate total content height
  const totalContentHeight = createMemo(() => {
    const heights = windowHeights()

    // Find the highest window index from heights
    const maxWindowIndex = heights.size > 0 ? Math.max(...heights.keys()) : 0

    // Calculate total height up to the last window
    let totalHeight = 0
    for (let i = 0; i <= maxWindowIndex; i++) {
      totalHeight += getTotalHeight(i)
    }

    // Add some buffer for infinite scrolling
    return totalHeight + CONTAINER_HEIGHT * 2
  })

  onMount(() => {
    console.log(`🚀 MOUNT: Initializing virtualizer`)

    // Initialize with initial latch pair [0, 1]
    const initialRange = computeVisibleRange([0, 1])
    console.log(`🚀 MOUNT: Initial range:`, Array.from(initialRange))
    updateWindowStates(initialRange)
  })

  onCleanup(() => {
    console.log(`🧹 CLEANUP: Virtualizer cleanup`)
  })

  return (
    <div class={styles.container}>
      <div ref={containerRef} class={styles.scrollContainer}>
        <div class={styles.content} style={{ height: `${totalContentHeight()}px` }}>
          <For each={visibleWindows()}>
            {(windowIndex) => (
              <WindowComponent
                windowIndex={windowIndex}
                onIntersection={handleWindowIntersection}
                onResize={handleWindowResize}
                containerRef={containerRef}
                getPosition={getWindowPosition}
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
