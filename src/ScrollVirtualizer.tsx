import { createSignal, createMemo, createEffect, onMount, onCleanup, For } from 'solid-js'
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
const BLOCK_SIZE = 4 + THRESHOLD_DISTANCE * 2 // Size of window blocks for repositioning

type WindowState = 'GHOST' | 'VISIBLE'

interface WindowRendererProps {
  windowIndex: number
}

export type WindowRendererFunction = (props: WindowRendererProps) => JSX.Element

// Debug Components
function HUD(props: {
  visibleRangeVirtualTop: number
  visibleRangeVirtualBottom: number
  containerVirtualOffset: number
}) {
  const [isOffsetChanging, setIsOffsetChanging] = createSignal(false)
  const [prevOffset, setPrevOffset] = createSignal(props.containerVirtualOffset)

  // Detect offset changes and trigger animation
  createEffect(() => {
    const currentOffset = props.containerVirtualOffset
    const previous = prevOffset()

    if (currentOffset !== previous) {
      console.log(
        `🎨 HUD: Offset changed from ${previous} to ${currentOffset}, triggering animation`,
      )
      setIsOffsetChanging(true)
      setPrevOffset(currentOffset)

      // Reset animation after 1 second
      setTimeout(() => {
        setIsOffsetChanging(false)
      }, 1000)
    }
  })

  return (
    <div
      style={{
        'margin-left': '20px',
        'margin-top': '0px',
        background: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '10px',
        'border-radius': '4px',
        'font-family': 'monospace',
        'font-size': '12px',
        'z-index': 1000,
        'min-width': '300px',
        height: 'fit-content',
        'flex-shrink': 0,
      }}
    >
      <div>Virtual Visible Range:</div>
      <div> Top: {props.visibleRangeVirtualTop.toFixed(0)}px</div>
      <div> Bottom: {props.visibleRangeVirtualBottom.toFixed(0)}px</div>
      <div style={{ 'margin-top': '8px' }}>Container Virtual Offset:</div>
      <div
        style={{
          color: isOffsetChanging() ? 'magenta' : 'white',
          transition: 'color 1s ease-out',
          'font-weight': isOffsetChanging() ? 'bold' : 'normal',
        }}
      >
        {props.containerVirtualOffset.toFixed(0)}px
      </div>
    </div>
  )
}

function MileMarker(props: {
  distance: number
  color: string
  label: string
  isVirtual: boolean
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: `${props.distance}px`,
        left: '0',
        right: '0',
        height: '4px',
        background: props.color,
        opacity: '0.7',
        'z-index': props.isVirtual ? 3 : 2,
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: '4px',
          top: '4px',
          'font-size': '10px',
          'font-family': 'monospace',
          color: props.color,
          background: 'rgba(255, 255, 255, 0.9)',
          padding: '1px 3px',
          'border-radius': '2px',
          'font-weight': 'bold',
        }}
      >
        {props.label}: {props.distance}px
      </div>
    </div>
  )
}

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
    for (const index of heights) {
      positions[index] = cumulativePosition
      cumulativePosition += getTotalHeight(index)
    }

    console.log(`📐 VIRTUAL_POSITIONS: Calculated for windows [${heights.join(',')}]`)
    return positions
  })

  // Convert virtual position to physical position within container
  const getPhysicalPosition = (windowIndex: number): number => {
    const virtualPos = virtualPositions()[windowIndex] ?? 0
    const offset = containerVirtualOffset()
    const physicalPos = virtualPos - offset

    console.log(
      `🔄 GET_POSITION: Window ${windowIndex} virtual: ${virtualPos}, physical: ${physicalPos}`,
    )
    return physicalPos
  }

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

  // Find the appropriate container offset based on window states
  const computeContainerOffset = createMemo(() => {
    const positions = virtualPositions()
    const currentPair = latchPair()
    const currentRange = computeVisibleRange(currentPair)

    if (currentRange.size === 0) return 0

    // Get the minimum index of the visible range
    const minVisibleIndex = Math.min(...currentRange)

    console.log(`🧮 CONTAINER_OFFSET: Latch pair [${currentPair[0]}, ${currentPair[1]}]`)
    console.log(
      `🧮 CONTAINER_OFFSET: Visible range [${Array.from(currentRange)
        .sort((a, b) => a - b)
        .join(',')}]`,
    )
    console.log(`🧮 CONTAINER_OFFSET: Min visible index: ${minVisibleIndex}`)

    // Calculate how many complete blocks are before the visible range
    const blocksToSkip = Math.floor(minVisibleIndex / BLOCK_SIZE)
    const newStartIndex = blocksToSkip * BLOCK_SIZE

    console.log(
      `🧮 CONTAINER_OFFSET: Blocks to skip: ${blocksToSkip}, new start index: ${newStartIndex}`,
    )

    if (blocksToSkip > 0) {
      // Find virtual position of the new start
      const newStartPosition = positions[newStartIndex] ?? 0

      console.log(`🧮 CONTAINER_OFFSET: New container offset: ${newStartPosition}px`)
      return newStartPosition
    }

    // No repositioning needed
    console.log(`🧮 CONTAINER_OFFSET: No repositioning needed, offset: 0px`)
    return 0
  })

  // Apply container repositioning when offset changes
  createEffect(() => {
    const newOffset = computeContainerOffset()
    const currentOffset = containerVirtualOffset()

    if (newOffset !== currentOffset && containerRef) {
      console.log(`🔄 REPOSITIONING: Changing offset from ${currentOffset} to ${newOffset}`)

      const currentScrollTop = containerRef.scrollTop
      const offsetDelta = newOffset - currentOffset

      // Apply changes in same animation frame
      requestAnimationFrame(() => {
        // Update virtual offset
        setContainerVirtualOffset(newOffset)

        // Compensate scroll position
        if (containerRef) {
          containerRef.scrollTop = currentScrollTop - offsetDelta
          console.log(
            `🔄 REPOSITIONING: Adjusted scrollTop from ${currentScrollTop} to ${containerRef.scrollTop}`,
          )
        }
      })
    }
  })

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
      const current = prev[windowIndex]
      if (current !== constrainedHeight) {
        console.log(`📏 RESIZE: Updated window ${windowIndex} height: ${constrainedHeight}px`)
        const newHeights = [...prev]
        newHeights[windowIndex] = constrainedHeight
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
      const newStates = [...prevStates]
      let hasChanges = false

      // Handle all windows in visible range
      visibleRange.forEach((windowIndex) => {
        const currentState = newStates[windowIndex]

        if (!currentState) {
          // Create new window directly as VISIBLE
          console.log(`🆕 Creating new VISIBLE window ${windowIndex}`)
          newStates[windowIndex] = 'VISIBLE'
          hasChanges = true
        } else if (currentState === 'GHOST') {
          // Transition GHOST → VISIBLE (restore from cache)
          console.log(`👻 GHOST → VISIBLE: Window ${windowIndex}`)
          newStates[windowIndex] = 'VISIBLE'
          hasChanges = true
        }
        // VISIBLE windows in range stay VISIBLE (no change needed)
      })

      // Handle windows that should become GHOST
      newStates.forEach((state, windowIndex) => {
        if (state === 'VISIBLE' && !visibleRange.has(windowIndex)) {
          // Transition VISIBLE → GHOST
          console.log(`💀 VISIBLE → GHOST: Window ${windowIndex}`)
          newStates[windowIndex] = 'GHOST'
          hasChanges = true
        }
      })

      if (hasChanges) {
        // Debug summary
        const ghostWindows = newStates.filter((state) => state === 'GHOST')
        const visibleWindows = newStates.filter((state) => state === 'VISIBLE')

        console.log(
          `📊 STATE_SUMMARY: GHOST[${ghostWindows.join(',')}] VISIBLE[${visibleWindows.join(',')}]`,
        )
      }

      return hasChanges ? newStates : prevStates
    })

    // Initialize heights for new VISIBLE windows
    setWindowHeights((prevHeights) => {
      const newHeights = [...prevHeights]
      let hasChanges = false

      visibleRange.forEach((windowIndex) => {
        if (!newHeights[windowIndex]) {
          console.log(
            `🆕 Initializing height for window ${windowIndex} to min height ${props.minWindowHeight}px`,
          )
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
    const maxIndex = Math.max(...positions)
    const maxVirtualPos = positions[maxIndex] ?? 0
    const totalVirtual = maxVirtualPos + getTotalHeight(maxIndex)

    // Physical height is virtual range that's visible in container
    const physicalHeight = totalVirtual - offset

    return Math.max(physicalHeight + CONTAINER_HEIGHT, CONTAINER_HEIGHT * 2)
  })

  // Debug info for HUD
  const visibleRangeVirtualTop = createMemo(() => {
    const range = currentVisibleRange()
    const positions = virtualPositions()

    if (range.size === 0) return 0

    const minIndex = Math.min(...range)
    return positions[minIndex] ?? 0
  })

  const visibleRangeVirtualBottom = createMemo(() => {
    const range = currentVisibleRange()
    const positions = virtualPositions()

    if (range.size === 0) return 0

    const maxIndex = Math.max(...range)
    const maxPos = positions[maxIndex] ?? 0
    return maxPos + getTotalHeight(maxIndex)
  })

  // Generate mile markers
  const mileMarkers = createMemo(() => {
    const markers: JSX.Element[] = []
    const contentHeight = totalContentHeight()
    const offset = containerVirtualOffset()

    // Virtual markers (green) - show virtual coordinates for currently visible physical positions
    // Every 500px in physical space, but labeled with their virtual coordinates
    for (let physicalPos = 0; physicalPos <= contentHeight; physicalPos += 500) {
      const virtualPos = physicalPos + offset // Convert physical position to virtual coordinate
      markers.push(
        <MileMarker
          distance={physicalPos}
          color="green"
          label={`V${virtualPos}`}
          isVirtual={true}
        />,
      )
    }

    // Physical markers (blue) - every 500px in container starting at 250px
    // Labeled with their actual physical coordinates
    for (let physicalPos = 250; physicalPos <= contentHeight; physicalPos += 500) {
      markers.push(
        <MileMarker
          distance={physicalPos}
          color="blue"
          label={`P${physicalPos}`}
          isVirtual={false}
        />,
      )
    }

    return markers
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
    <>
      <div class={styles.container} style={{ position: 'relative', display: 'flex' }}>
        <div ref={containerRef} class={styles.scrollContainer}>
          <div class={styles.content} style={{ height: `${totalContentHeight()}px` }}>
            {mileMarkers()}
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
        <HUD
          visibleRangeVirtualTop={visibleRangeVirtualTop()}
          visibleRangeVirtualBottom={visibleRangeVirtualBottom()}
          containerVirtualOffset={containerVirtualOffset()}
        />
      </div>
    </>
  )
}
