import type { FlatRow } from '../outline/types'

export const STICKY_ROW_HEIGHT = 32
export const STICKY_FLOW_GAP = 4

export type StickySlotState = 'active' | 'candidate' | 'inactive'

export type StickySlot = {
  id: string
  rowIndex: number
  state: StickySlotState
  y: number
}

export type StickyDrillSlot = {
  id: string
  location: 'chain' | 'flow' | 'top' | 'bottom'
  rowIndex: number
  y: number
}

export type StickyLayoutInput = {
  rows: readonly FlatRow[]
  scrollTop: number
  viewHeight: number
  hasTitle: boolean
  drillId?: string
}

export type StickyLayout = {
  activeAncestorChain: readonly number[]
  drill: StickyDrillSlot | null
  nextBoundary: number | null
  padding: number
  slots: readonly StickySlot[]
  transitionProgress: number
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value))

export const getParentIndices = (rows: readonly FlatRow[]): number[] => {
  const parents: number[] = []
  const byDepth: number[] = []

  for (let index = 0; index < rows.length; index++) {
    const depth = rows[index]!.depth
    parents.push(depth > 0 ? (byDepth[depth - 1] ?? -1) : -1)
    byDepth[depth] = index
    byDepth.length = depth + 1
  }

  return parents
}

const getAncestorChain = (
  rows: readonly FlatRow[],
  parents: readonly number[],
  rowIndex: number,
): number[] => {
  if (rowIndex < 0) return []

  const chain: number[] = []
  let ancestor = parents[rowIndex] ?? -1
  while (ancestor >= 0) {
    chain.unshift(ancestor)
    ancestor = parents[ancestor] ?? -1
  }

  const row = rows[rowIndex]
  if (row?.hasChildren === true && row.expanded) chain.push(rowIndex)
  return chain
}

const getCommonPrefixLength = (left: readonly number[], right: readonly number[]): number => {
  let length = 0
  while (length < left.length && left[length] === right[length]) length++
  return length
}

const isStickyHeader = (row: FlatRow): boolean => row.hasChildren && row.expanded

const getNextStickyBoundary = (rows: readonly FlatRow[], rowIndex: number): number | null => {
  const depth = rows[rowIndex]!.depth
  for (let index = rowIndex + 1; index < rows.length; index++) {
    if (isStickyHeader(rows[index]!) && rows[index]!.depth <= depth) return index
  }
  return null
}

export const calculateStickyLayout = (input: StickyLayoutInput): StickyLayout => {
  const rowHeight = STICKY_ROW_HEIGHT
  const titleHeight = input.hasTitle ? rowHeight : 0
  const padding = titleHeight + STICKY_FLOW_GAP
  const parents = getParentIndices(input.rows)
  const stickyRowIndices = input.rows.flatMap((row, index) =>
    isStickyHeader(row) ? [index] : [],
  )
  const thresholds = stickyRowIndices.map((rowIndex) => {
    const row = input.rows[rowIndex]!
    return padding + rowIndex * rowHeight - titleHeight - row.depth * rowHeight
  })

  let activeStickyIndex = -1
  for (let index = 0; index < thresholds.length; index++) {
    if (thresholds[index]! > input.scrollTop) break
    activeStickyIndex = index
  }

  const activeRowIndex = stickyRowIndices[activeStickyIndex] ?? -1
  const activeAncestorChain = getAncestorChain(input.rows, parents, activeRowIndex)
  let nextStickyIndex = activeStickyIndex + 1
  while (
    nextStickyIndex < thresholds.length &&
    thresholds[nextStickyIndex] === thresholds[activeStickyIndex]
  ) {
    nextStickyIndex++
  }

  const nextBoundary = thresholds[nextStickyIndex] ?? null
  if (nextBoundary != null) {
    while (
      nextStickyIndex + 1 < thresholds.length &&
      thresholds[nextStickyIndex + 1] === nextBoundary
    ) {
      nextStickyIndex++
    }
  }
  const nextRowIndex = stickyRowIndices[nextStickyIndex] ?? -1
  const nextChain = getAncestorChain(input.rows, parents, nextRowIndex)
  const activeSet = new Set(activeAncestorChain)
  const candidateSet = new Set(nextChain.filter((index) => !activeSet.has(index)))

  const slots = input.rows.flatMap((row, rowIndex): StickySlot[] => {
    if (!isStickyHeader(row)) return []

    const naturalY = padding + rowIndex * rowHeight - input.scrollTop
    const slotY = titleHeight + row.depth * rowHeight
    const boundaryIndex = getNextStickyBoundary(input.rows, rowIndex)
    const boundaryY =
      boundaryIndex == null ?
        Number.POSITIVE_INFINITY
      : padding + boundaryIndex * rowHeight - input.scrollTop
    const y = Math.max(naturalY, Math.min(slotY, boundaryY - rowHeight))
    const state: StickySlotState =
      activeSet.has(rowIndex) ? 'active'
      : candidateSet.has(rowIndex) ? 'candidate'
      : 'inactive'

    return [{ id: row.id, rowIndex, state, y }]
  })

  let transitionProgress = 1
  if (nextBoundary != null) {
    const commonPrefix = getCommonPrefixLength(activeAncestorChain, nextChain)
    const changedSlots = Math.max(
      1,
      activeAncestorChain.length - commonPrefix,
      nextChain.length - commonPrefix,
    )
    const transitionStart = nextBoundary - changedSlots * rowHeight
    transitionProgress = clamp(
      (input.scrollTop - transitionStart) / (nextBoundary - transitionStart),
      0,
      1,
    )
  }

  const drillIndex =
    input.drillId == null ? -1 : input.rows.findIndex((row) => row.id === input.drillId)
  let drill: StickyDrillSlot | null = null
  if (input.drillId != null) {
    const chainSlot = slots.find(
      (slot) => slot.rowIndex === drillIndex && slot.state === 'active',
    )
    if (chainSlot) {
      drill = {
        id: `drill:${input.drillId}`,
        location: 'chain',
        rowIndex: drillIndex,
        y: chainSlot.y,
      }
    } else if (drillIndex < 0) {
      drill = {
        id: `drill:${input.drillId}`,
        location: 'top',
        rowIndex: -1,
        y: titleHeight + activeAncestorChain.length * rowHeight,
      }
    } else {
      const naturalY = padding + drillIndex * rowHeight - input.scrollTop
      const topY = titleHeight + activeAncestorChain.length * rowHeight
      const bottomY = Math.max(topY, input.viewHeight - rowHeight)
      const location =
        naturalY < topY ? 'top'
        : naturalY > bottomY ? 'bottom'
        : 'flow'
      drill = {
        id: `drill:${input.drillId}`,
        location,
        rowIndex: drillIndex,
        y: clamp(naturalY, topY, bottomY),
      }
    }
  }

  return {
    activeAncestorChain,
    drill,
    nextBoundary,
    padding,
    slots,
    transitionProgress,
  }
}
