import { createSignal, createMemo, onMount, onCleanup, For } from 'solid-js'

import styles from './Comp.module.css'

// Deterministic pseudo-random number generator
function splitmix32(a: number) {
  return function () {
    a |= 0
    a = (a + 0x9e3779b9) | 0
    let t = a ^ (a >>> 16)
    t = Math.imul(t, 0x21f0aaad)
    t = t ^ (t >>> 15)
    t = Math.imul(t, 0x735a2d97)
    return ((t = t ^ (t >>> 15)) >>> 0) / 4294967296
  }
}

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
const WINDOW_SIZE = 50 // items per window
const THRESHOLD_DISTANCE = 2 // windows beyond viewport to keep visible
const ITEM_HEIGHTS = [80, 110, 150, 175] as const
const CONTAINER_HEIGHT = 500

type WindowState = 'SKELETON' | 'GHOST' | 'VISIBLE'

interface WindowData {
  index: number
  state: WindowState
  totalHeight?: number
  itemHeights?: number[]
  topPosition: number
  element?: HTMLDivElement
  observer?: IntersectionObserver
}

interface ListItem {
  id: number
  height: number
  top: number
  windowIndex: number
}

export default function ScrollingVirtualizer() {
  const [windows, setWindows] = createSignal<Map<number, WindowData>>(new Map())
  // Track which windows are actually visible in viewport (pure intersection state)
  const [actuallyVisible, setActuallyVisible] = createSignal<Set<number>>(new Set())
  // Track stable pair of windows that defines the visible range
  const [latchPair, setLatchPair] = createSignal<[number, number]>([0, 1])

  let containerRef: HTMLDivElement | undefined

  // Calculate item height deterministically
  const getItemHeight = (index: number): number => {
    const rng = splitmix32(index)
    return ITEM_HEIGHTS[Math.floor(rng() * ITEM_HEIGHTS.length)]!
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

  // Calculate which items belong to a window
  const getWindowItems = (windowIndex: number): number[] => {
    const start = windowIndex * WINDOW_SIZE
    return Array.from({ length: WINDOW_SIZE }, (_, i) => start + i)
  }

  // Calculate window height and item positions
  const calculateWindowHeights = (
    windowIndex: number,
  ): { totalHeight: number; itemHeights: number[] } => {
    const items = getWindowItems(windowIndex)
    const itemHeights = items.map(getItemHeight)
    const totalHeight = itemHeights.reduce((sum, height) => sum + height, 0)

    // Development warning: ensure window height is sufficient
    if (totalHeight < CONTAINER_HEIGHT) {
      console.warn(
        `Window ${windowIndex} height (${totalHeight}px) is less than viewport height (${CONTAINER_HEIGHT}px)`,
      )
    }

    return { totalHeight, itemHeights }
  }

  // Calculate cumulative position for a window
  const calculateWindowPosition = (
    windowIndex: number,
    windowsMapOverride?: Map<number, WindowData>,
  ): number => {
    const windowsMap = windowsMapOverride || windows()
    let position = 0

    for (let i = 0; i < windowIndex; i++) {
      const window = windowsMap.get(i)
      if (window && (window.state === 'GHOST' || window.state === 'VISIBLE')) {
        position += window.totalHeight ?? 0
      } else {
        // For SKELETON windows, we need to calculate on-demand
        const { totalHeight } = calculateWindowHeights(i)
        position += totalHeight
      }
    }

    return position
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
      // One window visible - keep the same pair as before (retaining the one that just left)
      newPair = [...currentPair]

      const visibleWindow = Array.from(currentActuallyVisible)[0]!
      const otherWindow = currentPair[0] === visibleWindow ? currentPair[1] : currentPair[0]
      console.log(
        `🔄 LATCH_PAIR: 1 window visible, keeping previous window ${otherWindow} in pair [${newPair[0]}, ${newPair[1]}]`,
      )
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

  // Create intersection observer for a window
  const createWindowObserver = (windowIndex: number): IntersectionObserver => {
    console.log(`👁️ OBSERVER: Creating observer for window ${windowIndex}`)

    return new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const windowIndex = parseInt(entry.target.getAttribute('data-window-index')!)
          console.log(
            `👁️ OBSERVER: Entry for window ${windowIndex}, intersecting: ${entry.isIntersecting}, ratio: ${entry.intersectionRatio}`,
          )
          handleWindowIntersection(windowIndex, entry.isIntersecting)
        })
      },
      {
        root: containerRef,
      },
    )
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
          // Create new window in SKELETON state
          console.log(`🆕 Creating new SKELETON window ${windowIndex}`)
          const topPosition = calculateWindowPosition(windowIndex, newWindows)

          window = {
            index: windowIndex,
            state: 'SKELETON',
            topPosition,
          }
          newWindows.set(windowIndex, window)
        }

        if (window.state === 'SKELETON') {
          // Transition SKELETON → VISIBLE
          console.log(`🟢 SKELETON → VISIBLE: Window ${windowIndex}`)
          const { totalHeight, itemHeights } = calculateWindowHeights(windowIndex)
          window.state = 'VISIBLE'
          window.totalHeight = totalHeight
          window.itemHeights = itemHeights
          window.topPosition = calculateWindowPosition(windowIndex, newWindows)
        } else if (window.state === 'GHOST') {
          // Transition GHOST → VISIBLE (restore from cache)
          console.log(
            `👻 GHOST → VISIBLE: Window ${windowIndex} (observer: ${!!window.observer})`,
          )
          window.state = 'VISIBLE'
          // Observer will be recreated in ref callback since we cleared it during GHOST transition
        }
      })

      // Handle windows that should become GHOST
      newWindows.forEach((window, windowIndex) => {
        if (window.state === 'VISIBLE' && !visibleRange.has(windowIndex)) {
          // Transition VISIBLE → GHOST
          console.log(`💀 VISIBLE → GHOST: Window ${windowIndex}`)

          // Clean up intersection observer when becoming GHOST
          if (window.observer) {
            console.log(`🧹 Cleaning up observer for GHOST window ${windowIndex}`)
            window.observer.disconnect()
            window.observer = undefined
          }

          // Clear element reference since it will be unmounted
          window.element = undefined

          window.state = 'GHOST'
          // Heights are already cached
        }
      })

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

  // Get all visible items across all visible windows
  const visibleItems = createMemo(() => {
    const items: ListItem[] = []
    const windowsMap = windows()
    const visibleRange = currentVisibleRange()

    visibleRange.forEach((windowIndex) => {
      const window = windowsMap.get(windowIndex)
      if (window && window.state === 'VISIBLE' && window.itemHeights) {
        const windowItems = getWindowItems(windowIndex)
        let itemTop = window.topPosition

        windowItems.forEach((itemId, itemIndex) => {
          const height = window.itemHeights![itemIndex]!
          items.push({
            id: itemId,
            height,
            top: itemTop,
            windowIndex,
          })
          itemTop += height
        })
      }
    })

    return items.sort((a, b) => a.id - b.id)
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
        // For SKELETON windows, estimate height
        const { totalHeight: estimatedHeight } = calculateWindowHeights(i)
        totalHeight += estimatedHeight
      }
    }

    // Add some buffer for infinite scrolling
    return totalHeight + CONTAINER_HEIGHT * 2
  })

  // Create window element
  const createWindowElement = (windowIndex: number) => {
    const windowsMap = windows()
    const window = windowsMap.get(windowIndex)

    if (!window || window.state !== 'VISIBLE') {
      return null
    }

    return (
      <div
        ref={(el) => {
          if (el) {
            console.log(
              `🔗 REF: Element attached for window ${windowIndex}, has observer: ${!!window.observer}`,
            )

            // Set up intersection observer for this window
            if (!window.observer) {
              console.log(`🆕 REF: Creating new observer for window ${windowIndex}`)
              const observer = createWindowObserver(windowIndex)
              observer.observe(el)
              window.observer = observer
            } else {
              console.log(`♻️ REF: Reusing existing observer for window ${windowIndex}`)
            }
            window.element = el
          }
        }}
        data-window-index={windowIndex}
        class={styles.window}
        style={{
          transform: `translateY(${window.topPosition}px)`,
          height: `${window.totalHeight}px`,
        }}
      >
        <For each={visibleItems().filter((item) => item.windowIndex === windowIndex)}>
          {(item) => (
            <div
              class={styles.item}
              style={{
                height: `${item.height}px`,
                transform: `translateY(${item.top - window.topPosition}px)`,
              }}
            >
              <div class={styles.itemContent}>
                <div class={styles.itemId}>Item #{item.id}</div>
                <div class={styles.itemHeight}>Height: {item.height}px</div>
                <div class={styles.windowInfo}>Window: {windowIndex}</div>
              </div>
            </div>
          )}
        </For>
      </div>
    )
  }

  onMount(() => {
    console.log(`🚀 MOUNT: Initializing virtualizer`)

    // Initialize with initial latch pair [0, 1]
    const initialRange = computeVisibleRange([0, 1])
    console.log(`🚀 MOUNT: Initial range:`, Array.from(initialRange))
    updateWindowStates(initialRange)
  })

  onCleanup(() => {
    // Clean up all intersection observers
    windows().forEach((window) => {
      if (window.observer) {
        window.observer.disconnect()
      }
    })
  })

  return (
    <div class={styles.container}>
      <div ref={containerRef} class={styles.scrollContainer}>
        <div class={styles.content} style={{ height: `${totalContentHeight()}px` }}>
          <For
            each={Array.from(currentVisibleRange()).filter((windowIndex) => {
              const window = windows().get(windowIndex)
              return window && window.state === 'VISIBLE'
            })}
          >
            {(windowIndex) => createWindowElement(windowIndex)}
          </For>
        </div>
      </div>
    </div>
  )
}
