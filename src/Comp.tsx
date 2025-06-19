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

interface ListItem {
  id: number
  height: number
  top: number
}

export default function ScrollingVirtualizer() {
  const [scrollTop, setScrollTop] = createSignal(0)
  const [renderedRange, setRenderedRange] = createSignal({ start: 0, end: 50 })

  let containerRef: HTMLDivElement | undefined

  // 4 possible heights for items
  const ITEM_HEIGHTS = [80, 110, 150, 175] as const
  const CONTAINER_HEIGHT = 500
  const BUFFER_SIZE = 1000 // Always maintain 1000px buffer below viewport

  const getItemHeight = (index: number): number => {
    const rng = splitmix32(index)
    return ITEM_HEIGHTS[Math.floor(rng() * ITEM_HEIGHTS.length)]!
  }

  // Calculate cumulative positions for items
  const getItemPosition = createMemo(() => {
    const positions = new Map<number, { height: number; top: number }>()
    let currentTop = 0

    for (let i = 0; i <= renderedRange().end + 50; i++) {
      const height = getItemHeight(i)
      positions.set(i, { height, top: currentTop })
      currentTop += height
    }

    return positions
  })

  // Get items to render based on current scroll position and range
  const visibleItems = createMemo(() => {
    const items: ListItem[] = []
    const range = renderedRange()
    const positions = getItemPosition()

    for (let i = range.start; i <= range.end; i++) {
      const pos = positions.get(i)
      if (pos) {
        items.push({
          id: i,
          height: pos.height,
          top: pos.top,
        })
      }
    }

    return items
  })

  // Calculate total content height
  const totalContentHeight = createMemo(() => {
    const range = renderedRange()
    const positions = getItemPosition()
    const lastPos = positions.get(range.end)
    return lastPos ? lastPos.top + lastPos.height : 0
  })

  // Handle scroll events
  const handleScroll = (e: Event) => {
    const target = e.target as HTMLDivElement
    const scrollTop = target.scrollTop
    setScrollTop(scrollTop)

    const positions = getItemPosition()
    const range = renderedRange()

    // Find visible range based on scroll position
    let newStart = 0
    let newEnd = range.end

    // Find first visible item
    for (let i = 0; i <= range.end; i++) {
      const pos = positions.get(i)
      if (pos && pos.top + pos.height > scrollTop) {
        newStart = Math.max(0, i - 5) // Add some buffer above
        break
      }
    }

    // Check if we need to load more items
    const lastPos = positions.get(range.end)
    const distanceFromEnd =
      lastPos ? lastPos.top + lastPos.height - (scrollTop + CONTAINER_HEIGHT) : 0

    if (distanceFromEnd < BUFFER_SIZE) {
      // Load more items - add at least 1000px worth
      let additionalHeight = 0
      let additionalItems = 0

      while (additionalHeight < BUFFER_SIZE) {
        additionalHeight += getItemHeight(range.end + additionalItems + 1)
        additionalItems++
      }

      newEnd = range.end + additionalItems
    }

    // Update range if changed
    if (newStart !== range.start || newEnd !== range.end) {
      setRenderedRange({ start: newStart, end: newEnd })
    }
  }

  onMount(() => {
    // Initial load - ensure we have enough items for the buffer
    let initialHeight = 0
    let initialEnd = 0

    while (initialHeight < CONTAINER_HEIGHT + BUFFER_SIZE) {
      initialHeight += getItemHeight(initialEnd)
      initialEnd++
    }

    setRenderedRange({ start: 0, end: initialEnd })

    // Add passive scroll listener for better performance
    if (containerRef) {
      containerRef.addEventListener('scroll', handleScroll, { passive: true })

      // Clean up event listener on component unmount
      onCleanup(() => {
        containerRef?.removeEventListener('scroll', handleScroll)
      })
    }
  })

  return (
    <div class={styles.container}>
      <div ref={containerRef} class={styles.scrollContainer}>
        <div class={styles.content} style={{ height: `${totalContentHeight()}px` }}>
          <For each={visibleItems()}>
            {(item) => (
              <div
                class={styles.item}
                style={{
                  height: `${item.height}px`,
                  transform: `translateY(${item.top}px)`,
                }}
              >
                <div class={styles.itemContent}>
                  <div class={styles.itemId}>Item #{item.id}</div>
                  <div class={styles.itemHeight}>Height: {item.height}px</div>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}
