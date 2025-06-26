import { createSignal, createMemo, onMount, onCleanup, For } from 'solid-js'
import { debounce } from '@solid-primitives/scheduled'
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
const RESIZE_THROTTLE_MS = 50

type WindowState = 'SKELETON' | 'GHOST' | 'VISIBLE'

interface WindowData {
  index: number
  state: WindowState
  totalHeight?: number
  topPosition: number
}

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
  const [windows, setWindows] = createSignal<Map<number, WindowData>>(new Map())
  // Track which windows are actually visible in viewport (pure intersection state)
  const [actuallyVisible, setActuallyVisible] = createSignal<Set<number>>(new Set())
  // Track stable pair of windows that defines the visible range
  const [latchPair, setLatchPair] = createSignal<[number, number]>([0, 1])

  let containerRef: HTMLDivElement | undefined

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

  // Batch update all window positions - debounced
  const updateAllWindowPositions = debounce((minHeight: number) => {
    console.log(`📐 BATCH_UPDATE: Recalculating all window positions`)

    setWindows((prev) => {
      const newWindows = new Map(prev)
      let cumulativePosition = 0

      // Sort windows by index to ensure correct position calculation
      const sortedWindows = Array.from(newWindows.entries()).sort(([a], [b]) => a - b)

      let hasChanges = false

      for (const [windowIndex, window] of sortedWindows) {
        const newTopPosition = cumulativePosition

        console.log(
          `🔄 BATCH_UPDATE: Window ${windowIndex} newTopPosition: ${newTopPosition}, oldTopPosition: ${window.topPosition}`,
        )

        // Only update if position actually changed
        if (window.topPosition !== newTopPosition) {
          console.log(
            `📐 POSITION_UPDATE: Window ${windowIndex}: ${window.topPosition} → ${newTopPosition}`,
          )
          // Mutate in place to keep window object stable
          window.topPosition = newTopPosition
          hasChanges = true
        }

        // Add this window's height to cumulative position
        if (window.totalHeight) {
          cumulativePosition += window.totalHeight
        } else {
          // Use estimated height for SKELETON windows
          cumulativePosition += minHeight
        }
      }

      return hasChanges ? newWindows : prev
    })
  }, RESIZE_THROTTLE_MS)

  // Handle window resize changes
  const handleWindowResize = (windowIndex: number, newHeight: number) => {
    // Ignore 0-height measurements during initial mount/layout
    if (newHeight === 0) {
      console.log(`📏 RESIZE: Ignoring 0px height for window ${windowIndex} (initial layout)`)
      return
    }

    // Enforce minimum height constraint
    const constrainedHeight = Math.max(newHeight, props.minWindowHeight)
    console.log(
      `📏 RESIZE: Window ${windowIndex} height changed to ${newHeight}px (constrained to ${constrainedHeight}px)`,
    )

    setWindows((prev) => {
      const newWindows = new Map(prev)
      const window = newWindows.get(windowIndex)

      if (window && window.totalHeight !== constrainedHeight) {
        console.log(`📏 RESIZE: Updated window ${windowIndex} height: ${constrainedHeight}px`)

        // Mutate in place to keep window object stable
        window.totalHeight = constrainedHeight

        // Trigger batched position update
        updateAllWindowPositions(props.minWindowHeight)

        return newWindows
      }

      return prev
    })
  }

  // Handle window intersection changes - pure visibility tracking
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
      // Two windows visible - keep the pair
      const [window1, window2] = Array.from(currentActuallyVisible) as [number, number]
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
      console.error('🔄 LATCH_PAIR: 0 windows visible, min 1 expected')
    }
    // If 0 windows visible, keep existing latch pair

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

    setWindows((prev) => {
      const newWindows = new Map(prev)

      // Handle all windows in visible range
      visibleRange.forEach((windowIndex) => {
        let window = newWindows.get(windowIndex)

        if (!window) {
          // Create new window in SKELETON state with minimum height
          console.log(`🆕 Creating new SKELETON window ${windowIndex}`)

          window = {
            index: windowIndex,
            state: 'SKELETON',
            topPosition: props.minWindowHeight * windowIndex, // Start with expected minimum position
            totalHeight: props.minWindowHeight, // Start with minimum height to prevent 0-height issues
          }
          newWindows.set(windowIndex, window)
        }

        if (window.state === 'SKELETON') {
          // Transition SKELETON → VISIBLE
          console.log(`🟢 SKELETON → VISIBLE: Window ${windowIndex}`)
          window.state = 'VISIBLE'
          // Height will be refined by ResizeObserver when element is rendered
        } else if (window.state === 'GHOST') {
          // Transition GHOST → VISIBLE (restore from cache)
          console.log(`👻 GHOST → VISIBLE: Window ${windowIndex}`)
          window.state = 'VISIBLE'
          // Observers will be recreated in ref callback
        }
      })

      // Handle windows that should become GHOST
      newWindows.forEach((window, windowIndex) => {
        if (window.state === 'VISIBLE' && !visibleRange.has(windowIndex)) {
          // Transition VISIBLE → GHOST
          console.log(`💀 VISIBLE → GHOST: Window ${windowIndex}`)
          window.state = 'GHOST'
          // Height remains cached for position calculations
        }
      })

      // Update all window positions after state changes
      updateAllWindowPositions(props.minWindowHeight)

      // Debug summary
      const skeletonWindows = Array.from(newWindows.entries())
        .filter(([, w]) => w.state === 'SKELETON')
        .map(([i]) => i)
      const ghostWindows = Array.from(newWindows.entries())
        .filter(([, w]) => w.state === 'GHOST')
        .map(([i]) => i)
      const visibleWindows = Array.from(newWindows.entries())
        .filter(([, w]) => w.state === 'VISIBLE')
        .map(([i]) => i)

      console.log(
        `📊 STATE_SUMMARY: SKELETON[${skeletonWindows.join(',')}] GHOST[${ghostWindows.join(',')}] VISIBLE[${visibleWindows.join(',')}]`,
      )

      return newWindows
    })
  }

  // Computed visible range based on current state
  const currentVisibleRange = createMemo(() => {
    return computeVisibleRange(latchPair())
  })

  // Reactive function to get window position (triggers re-render of style only)
  const getWindowPosition = (windowIndex: number): number => {
    const windowsMap = windows()
    const window = windowsMap.get(windowIndex)

    const windowValues = Array.from(windowsMap.values())
      .filter((w) => w.index < windowIndex)
      .sort((a, b) => a.index - b.index)

    const maxWindow =
      windowValues.length > 0 ? windowValues[windowValues.length - 1] : undefined

    const minTopPosition =
      maxWindow ?
        maxWindow.topPosition + Math.max(maxWindow.totalHeight ?? 0, props.minWindowHeight)
      : windowIndex * props.minWindowHeight

    console.log(
      `🔄 GET_POSITION: Window ${windowIndex} position: ${window?.topPosition ?? 0}, minTopPosition: ${minTopPosition}`,
    )

    return Math.max(window?.topPosition ?? 0, minTopPosition)
  }

  // Computed windows with stable objects for reactivity
  const visibleWindows = createMemo(() => {
    const range = currentVisibleRange()
    const windowsMap = windows()

    return Array.from(range)
      .map((windowIndex) => windowsMap.get(windowIndex))
      .filter(
        (window): window is WindowData => window !== undefined && window.state === 'VISIBLE',
      )
  })

  // Calculate total content height
  const totalContentHeight = createMemo(() => {
    const windowsMap = windows()
    let maxWindowIndex = 0

    // Find the highest window index
    windowsMap.forEach((_, index) => {
      maxWindowIndex = Math.max(maxWindowIndex, index)
    })

    // Calculate total height up to the last window
    let totalHeight = 0
    for (let i = 0; i <= maxWindowIndex; i++) {
      const window = windowsMap.get(i)
      if (window && window.totalHeight) {
        totalHeight += window.totalHeight
      } else {
        // For SKELETON windows, just assume the minimum height
        totalHeight += props.minWindowHeight
      }
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
            {(window) => (
              <WindowComponent
                windowIndex={window.index}
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
