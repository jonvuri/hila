export type VirtualWindowGeometry = {
  windowIndex: number
  start: number
  height: number
  measured: boolean
}

export type VirtualRowPosition = string | number

export type VirtualRowGeometryInput = {
  position: VirtualRowPosition
  offset: number
  height: number
}

export type RetainedRowGeometry = VirtualRowGeometryInput & {
  windowIndex: number
  start: number
  end: number
}

export type VisibleWindowRange = {
  start: number
  end: number
}

export const buildWindowGeometry = (
  heights: readonly (number | undefined)[],
  totalWindows: number,
  estimatedHeight: number,
  measuredWindows?: ReadonlySet<number>,
): VirtualWindowGeometry[] => {
  const windows: VirtualWindowGeometry[] = []
  let start = 0

  for (let windowIndex = 0; windowIndex < totalWindows; windowIndex += 1) {
    const measuredHeight = heights[windowIndex]
    const measured =
      measuredHeight != null &&
      measuredHeight > 0 &&
      (measuredWindows === undefined || measuredWindows.has(windowIndex))
    const height = measured ? measuredHeight : estimatedHeight
    windows.push({ windowIndex, start, height, measured })
    start += height
  }

  return windows
}

export const getRenderedWindowRange = (
  pair: readonly [number, number],
  totalWindows: number | undefined,
  thresholdDistance: number,
): Set<number> => {
  const rangeStart = Math.max(0, pair[0] - thresholdDistance)
  const rangeEnd =
    totalWindows === undefined ?
      pair[1] + thresholdDistance
    : Math.min(pair[1] + thresholdDistance, totalWindows - 1)
  const range = new Set<number>()
  for (let windowIndex = rangeStart; windowIndex <= rangeEnd; windowIndex += 1) {
    range.add(windowIndex)
  }
  return range
}

export const findVisibleWindowRange = (
  windows: readonly VirtualWindowGeometry[],
  scrollTop: number,
  viewportHeight: number,
): VisibleWindowRange | undefined => {
  if (windows.length === 0 || viewportHeight <= 0) return undefined

  const viewportEnd = scrollTop + viewportHeight
  let low = 0
  let high = windows.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    const window = windows[middle]!
    if (window.start + window.height <= scrollTop) low = middle + 1
    else high = middle
  }
  const first = windows[low]
  if (!first || first.start >= viewportEnd) return undefined

  let lastIndex = low
  while (lastIndex + 1 < windows.length && windows[lastIndex + 1]!.start < viewportEnd) {
    lastIndex += 1
  }
  return {
    start: first.windowIndex,
    end: windows[lastIndex]!.windowIndex,
  }
}

export const getResizeScrollCompensation = (
  window: VirtualWindowGeometry | undefined,
  nextHeight: number,
  scrollTop: number,
): number => {
  if (!window || nextHeight <= 0 || window.start + window.height > scrollTop) return 0
  return nextHeight - window.height
}

/**
 * Retain numeric row geometry for the current loaded window range.
 * Row offsets are relative to their virtual window.
 */
export class RetainedRowGeometryIndex {
  readonly #rowsByWindow = new Map<number, RetainedRowGeometry[]>()
  readonly #rowsByPosition = new Map<VirtualRowPosition, RetainedRowGeometry>()

  retainWindows = (windowIndexes: ReadonlySet<number>): void => {
    for (const windowIndex of this.#rowsByWindow.keys()) {
      if (!windowIndexes.has(windowIndex)) this.#rowsByWindow.delete(windowIndex)
    }
    this.#rebuildPositions()
  }

  updateWindow = (
    window: VirtualWindowGeometry,
    rows: readonly VirtualRowGeometryInput[],
  ): void => {
    const retainedRows = rows
      .filter(
        (row) =>
          Number.isFinite(row.offset) &&
          Number.isFinite(row.height) &&
          row.offset >= 0 &&
          row.height > 0,
      )
      .map((row): RetainedRowGeometry => {
        const start = window.start + row.offset
        return { ...row, windowIndex: window.windowIndex, start, end: start + row.height }
      })
      .sort((left, right) => left.start - right.start)

    this.#rowsByWindow.set(window.windowIndex, retainedRows)
    this.#rebuildPositions()
  }

  rows = (): RetainedRowGeometry[] =>
    Array.from(this.#rowsByWindow.values())
      .flat()
      .sort((left, right) => left.start - right.start)

  firstVisible = (scrollTop: number): RetainedRowGeometry | undefined =>
    this.rows().find((row) => row.end > scrollTop)

  sourceCoordinates = (
    position: VirtualRowPosition,
    scrollTop: number,
  ): (RetainedRowGeometry & { viewportStart: number }) | undefined => {
    const row = this.#rowsByPosition.get(position)
    return row ? { ...row, viewportStart: row.start - scrollTop } : undefined
  }

  #rebuildPositions = (): void => {
    this.#rowsByPosition.clear()
    for (const rows of this.#rowsByWindow.values()) {
      for (const row of rows) this.#rowsByPosition.set(row.position, row)
    }
  }
}
