import type { FlatRow } from '../outline/types'

export const STICKY_ROW_HEIGHT = 32
export const STICKY_FLOW_GAP = 4
export const STICKY_WIDGET_MAX_ROWS = 7
export const STICKY_WIDGET_MAX_VIEWPORT_RATIO = 0.4

export type StickyWidgetSourceRange = {
  startIndex: number
  endIndex: number
  start: number
  end: number
}

export type StickyWidgetNode = {
  id: string
  rowIndex: number
  stackIndex: number
  position: number
  contentKey: string
  sourceRange: StickyWidgetSourceRange
  sourceRowVisible: boolean
}

export type StickyWidgetState = {
  activeNodeIds: readonly string[]
  firstVisibleRowIndex: number
  nodes: readonly StickyWidgetNode[]
  widgetHeight: number
}

export type StickyWidgetStateInput = {
  rows: readonly FlatRow[]
  scrollTop: number
  viewportHeight: number
  hasTitle: boolean
  renderedRange?: {
    startIndex: number
    endIndex: number
  }
  contentKey?: (row: FlatRow) => string
  maxRows?: number
  maxViewportRatio?: number
}

export type StickyWidgetStateChange = 'none' | 'final-position' | 'content' | 'structure'

export type StickyDockState = {
  id: string
  location: 'chain' | 'flow' | 'top' | 'bottom'
  position: number
  rowIndex: number
}

export const EMPTY_STICKY_WIDGET_STATE: StickyWidgetState = {
  activeNodeIds: [],
  firstVisibleRowIndex: -1,
  nodes: [],
  widgetHeight: 0,
}

export const getStickyParentIndices = (rows: readonly FlatRow[]): number[] => {
  const parents: number[] = []
  const byDepth: number[] = []

  for (let index = 0; index < rows.length; index += 1) {
    const depth = rows[index]!.depth
    parents.push(depth > 0 ? (byDepth[depth - 1] ?? -1) : -1)
    byDepth[depth] = index
    byDepth.length = depth + 1
  }

  return parents
}

export const getStickySubtreeEndIndices = (rows: readonly FlatRow[]): number[] => {
  const ends = Array.from({ length: rows.length }, () => rows.length - 1)
  const open: number[] = []

  for (let index = 0; index < rows.length; index += 1) {
    const depth = rows[index]!.depth
    while (open.length > depth) {
      const completed = open.pop()!
      ends[completed] = index - 1
    }
    open[depth] = index
    open.length = depth + 1
  }

  return ends
}

const isStickyHeading = (row: FlatRow): boolean => row.hasChildren && row.expanded

const getActiveChain = (
  rows: readonly FlatRow[],
  parents: readonly number[],
  rowIndex: number,
): number[] => {
  if (rowIndex < 0) return []

  const chain: number[] = []
  let current = rowIndex
  while (current >= 0) {
    if (isStickyHeading(rows[current]!)) chain.unshift(current)
    current = parents[current] ?? -1
  }
  return chain
}

const getMaximumNodeCount = (input: StickyWidgetStateInput): number => {
  const maxRows = Math.max(1, input.maxRows ?? STICKY_WIDGET_MAX_ROWS)
  if (!Number.isFinite(input.viewportHeight)) return maxRows

  const maxHeight = Math.max(
    STICKY_ROW_HEIGHT,
    input.viewportHeight * (input.maxViewportRatio ?? STICKY_WIDGET_MAX_VIEWPORT_RATIO),
  )
  return Math.min(maxRows, Math.max(1, Math.floor(maxHeight / STICKY_ROW_HEIGHT)))
}

export const calculateStickyWidgetState = (
  input: StickyWidgetStateInput,
): StickyWidgetState => {
  if (input.rows.length === 0) return EMPTY_STICKY_WIDGET_STATE

  const titleHeight = input.hasTitle ? STICKY_ROW_HEIGHT : 0
  const padding = titleHeight + STICKY_FLOW_GAP
  const parents = getStickyParentIndices(input.rows)
  const subtreeEnds = getStickySubtreeEndIndices(input.rows)
  const firstVisibleRowIndex = Math.max(
    0,
    Math.min(
      input.rows.length - 1,
      Math.floor((input.scrollTop + titleHeight - padding) / STICKY_ROW_HEIGHT),
    ),
  )

  let activeHeadingIndex = -1
  for (let rowIndex = 0; rowIndex < input.rows.length; rowIndex += 1) {
    const row = input.rows[rowIndex]!
    if (!isStickyHeading(row)) continue

    const threshold =
      padding + rowIndex * STICKY_ROW_HEIGHT - titleHeight - row.depth * STICKY_ROW_HEIGHT
    if (threshold > input.scrollTop) break
    activeHeadingIndex = rowIndex
  }

  const activeIndices = getActiveChain(input.rows, parents, activeHeadingIndex).slice(
    0,
    getMaximumNodeCount(input),
  )
  const renderedRange = input.renderedRange ?? {
    startIndex: 0,
    endIndex: input.rows.length,
  }

  const nodes = activeIndices
    .map((rowIndex, stackIndex): StickyWidgetNode => {
      const row = input.rows[rowIndex]!
      const sourceStart = padding + rowIndex * STICKY_ROW_HEIGHT
      const sourceEnd = padding + (subtreeEnds[rowIndex]! + 1) * STICKY_ROW_HEIGHT
      const stackPosition = stackIndex * STICKY_ROW_HEIGHT
      const position = Math.min(
        stackPosition,
        sourceEnd - input.scrollTop - titleHeight - STICKY_ROW_HEIGHT,
      )
      const naturalStart = sourceStart - input.scrollTop
      const stickyStart = titleHeight + position
      const sourceRowRendered =
        rowIndex >= renderedRange.startIndex && rowIndex < renderedRange.endIndex
      const sourceRowVisible =
        sourceRowRendered &&
        naturalStart + STICKY_ROW_HEIGHT > 0 &&
        naturalStart < input.viewportHeight &&
        (naturalStart + STICKY_ROW_HEIGHT <= stickyStart ||
          naturalStart >= stickyStart + STICKY_ROW_HEIGHT)

      return {
        id: row.id,
        rowIndex,
        stackIndex,
        position,
        contentKey: input.contentKey?.(row) ?? `${row.content}:${row.expanded}`,
        sourceRange: {
          startIndex: rowIndex,
          endIndex: subtreeEnds[rowIndex]!,
          start: sourceStart,
          end: sourceEnd,
        },
        sourceRowVisible,
      }
    })
    .filter((node) => node.position > -STICKY_ROW_HEIGHT)

  return {
    activeNodeIds: nodes.map((node) => node.id),
    firstVisibleRowIndex,
    nodes,
    widgetHeight: Math.max(0, ...nodes.map((node) => node.position + STICKY_ROW_HEIGHT)),
  }
}

const sameStructure = (left: StickyWidgetNode, right: StickyWidgetNode): boolean =>
  left.id === right.id &&
  left.rowIndex === right.rowIndex &&
  left.stackIndex === right.stackIndex &&
  left.sourceRange.startIndex === right.sourceRange.startIndex &&
  left.sourceRange.endIndex === right.sourceRange.endIndex &&
  left.sourceRange.start === right.sourceRange.start &&
  left.sourceRange.end === right.sourceRange.end

export const classifyStickyWidgetStateChange = (
  previous: StickyWidgetState,
  next: StickyWidgetState,
): StickyWidgetStateChange => {
  if (
    previous.nodes.length !== next.nodes.length ||
    previous.nodes.some((node, index) => !sameStructure(node, next.nodes[index]!))
  ) {
    return 'structure'
  }

  if (previous.nodes.some((node, index) => node.contentKey !== next.nodes[index]!.contentKey)) {
    return 'content'
  }

  const changedIndices = previous.nodes.flatMap((node, index) => {
    const nextNode = next.nodes[index]!
    return (
        node.position !== nextNode.position ||
          node.sourceRowVisible !== nextNode.sourceRowVisible
      ) ?
        [index]
      : []
  })
  if (
    changedIndices.length > 0 &&
    changedIndices.every((index) => index === next.nodes.length - 1)
  ) {
    return 'final-position'
  }

  if (changedIndices.length === 0 && previous.widgetHeight === next.widgetHeight) {
    return 'none'
  }

  return 'structure'
}

export const calculateStickyDockState = (
  input: StickyWidgetStateInput & { drillId?: string },
  widget: StickyWidgetState,
): StickyDockState | null => {
  if (input.drillId == null) return null

  const rowIndex = input.rows.findIndex((row) => row.id === input.drillId)
  const chainNode = widget.nodes.find((node) => node.rowIndex === rowIndex)
  if (chainNode && chainNode.position === chainNode.stackIndex * STICKY_ROW_HEIGHT) {
    return {
      id: `drill:${input.drillId}`,
      location: 'chain',
      position: chainNode.position,
      rowIndex,
    }
  }

  const titleHeight = input.hasTitle ? STICKY_ROW_HEIGHT : 0
  const top =
    chainNode == null ?
      titleHeight + widget.widgetHeight
    : titleHeight + chainNode.stackIndex * STICKY_ROW_HEIGHT
  if (rowIndex < 0) {
    return { id: `drill:${input.drillId}`, location: 'top', position: top, rowIndex }
  }

  const naturalPosition =
    titleHeight + STICKY_FLOW_GAP + rowIndex * STICKY_ROW_HEIGHT - input.scrollTop
  const viewportHeight =
    Number.isFinite(input.viewportHeight) ? input.viewportHeight : STICKY_ROW_HEIGHT * 4
  const bottom = Math.max(top, viewportHeight - STICKY_ROW_HEIGHT)
  const location =
    naturalPosition < top ? 'top'
    : naturalPosition > bottom ? 'bottom'
    : 'flow'

  return {
    id: `drill:${input.drillId}`,
    location,
    position:
      location === 'top' ? top
      : location === 'bottom' ? bottom
      : naturalPosition,
    rowIndex,
  }
}
