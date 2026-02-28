const INDENT_PX = 24

export type RowInfo = {
  row_id: number
  key: Uint8Array
  depth: number
}

export type DropPosition = {
  depth: number
  parentKey: Uint8Array | undefined
  prevSiblingKey: Uint8Array | undefined
  nextSiblingKey: Uint8Array | undefined
}

/**
 * Given a flat ordered list of (non-dragged) rows and a target gap+depth,
 * compute the tree-structural parent/sibling keys for a reparent operation.
 *
 * @param rows       Visible rows excluding the dragged subtree, in display order
 * @param gapIndex   Drop between rows[gapIndex-1] and rows[gapIndex] (0 = before first)
 * @param targetDepth  Real depth (including focus offset) for the drop
 * @param depthOffset  Focus depth offset (0 when not focused)
 * @param focusRootKey Focus root rank key (null when not focused)
 */
export const computeDropPosition = (
  rows: RowInfo[],
  gapIndex: number,
  targetDepth: number,
  depthOffset: number,
  focusRootKey: Uint8Array | null,
): DropPosition => {
  let parentKey: Uint8Array | undefined
  if (targetDepth > 0) {
    for (let i = gapIndex - 1; i >= 0; i--) {
      if (rows[i]!.depth === targetDepth - 1) {
        parentKey = rows[i]!.key
        break
      }
      if (rows[i]!.depth < targetDepth - 1) break
    }
  }
  if (!parentKey && targetDepth > 0 && focusRootKey) {
    const focusDepth = depthOffset - 1
    if (focusDepth === targetDepth - 1) parentKey = focusRootKey
  }

  let prevSiblingKey: Uint8Array | undefined
  for (let i = gapIndex - 1; i >= 0; i--) {
    if (rows[i]!.depth === targetDepth) {
      prevSiblingKey = rows[i]!.key
      break
    }
    if (rows[i]!.depth < targetDepth) break
  }

  const belowRow = gapIndex < rows.length ? rows[gapIndex] : undefined
  let nextSiblingKey: Uint8Array | undefined
  if (belowRow && belowRow.depth === targetDepth) {
    nextSiblingKey = belowRow.key
  }

  return { depth: targetDepth, parentKey, prevSiblingKey, nextSiblingKey }
}

/**
 * Clamp a target depth to the valid range for a given gap position.
 */
export const clampDropDepth = (
  rows: RowInfo[],
  gapIndex: number,
  desiredRealDepth: number,
  depthOffset: number,
): number => {
  const aboveRow = gapIndex > 0 ? rows[gapIndex - 1] : undefined
  const belowRow = gapIndex < rows.length ? rows[gapIndex] : undefined

  const maxRealDepth = (aboveRow ? aboveRow.depth : depthOffset - 1) + 1
  const minRealDepth = belowRow ? belowRow.depth : depthOffset

  return Math.max(minRealDepth, Math.min(maxRealDepth, desiredRealDepth))
}

const keysEqual = (a: Uint8Array | undefined, b: Uint8Array | undefined): boolean => {
  if (a === undefined && b === undefined) return true
  if (a === undefined || b === undefined) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * Returns true when the drop target describes the same logical position
 * the dragged row already occupies (same parent and same prev sibling).
 */
export const isNoOpDrop = (
  target: DropPosition,
  originDepth: number,
  originParentKey: Uint8Array | undefined,
  originPrevSiblingKey: Uint8Array | undefined,
): boolean =>
  target.depth === originDepth &&
  keysEqual(target.parentKey, originParentKey) &&
  keysEqual(target.prevSiblingKey, originPrevSiblingKey)

export type DropTargetVisual = DropPosition & {
  indicatorY: number
  indicatorLeft: number
  indicatorRight: number
}

/**
 * Full drop target computation with DOM measurement.
 * Combines cursor→gap mapping, depth clamping, structural computation, and indicator positioning.
 */
export const computeDropTarget = (
  cursorX: number,
  cursorY: number,
  nonDraggedRows: RowInfo[],
  rowElements: Map<number, HTMLElement>,
  depthOffset: number,
  focusRootKey: Uint8Array | null,
): DropTargetVisual | null => {
  if (nonDraggedRows.length === 0) return null

  const rects: { row: RowInfo; rect: DOMRect }[] = []
  for (const row of nonDraggedRows) {
    const el = rowElements.get(row.row_id)
    if (el) rects.push({ row, rect: el.getBoundingClientRect() })
  }
  if (rects.length === 0) return null

  let gapIndex = 0
  for (let i = 0; i < rects.length; i++) {
    const midY = rects[i]!.rect.top + rects[i]!.rect.height / 2
    if (cursorY > midY) gapIndex = i + 1
    else break
  }

  const rowLeft = rects[0]!.rect.left
  const rowRight = rects[0]!.rect.right
  const displayDepth = Math.max(0, Math.round((cursorX - rowLeft) / INDENT_PX))
  const desiredRealDepth = displayDepth + depthOffset

  const rows = rects.map((r) => r.row)
  const realDepth = clampDropDepth(rows, gapIndex, desiredRealDepth, depthOffset)
  const position = computeDropPosition(rows, gapIndex, realDepth, depthOffset, focusRootKey)

  const aboveEntry = gapIndex > 0 ? rects[gapIndex - 1] : undefined
  const belowEntry = gapIndex < rects.length ? rects[gapIndex] : undefined

  let indicatorY: number
  if (aboveEntry && belowEntry) {
    indicatorY = (aboveEntry.rect.bottom + belowEntry.rect.top) / 2
  } else if (aboveEntry) {
    indicatorY = aboveEntry.rect.bottom
  } else if (belowEntry) {
    indicatorY = belowEntry.rect.top
  } else {
    return null
  }

  const indicatorDisplayDepth = realDepth - depthOffset
  const indicatorLeft = rowLeft + indicatorDisplayDepth * INDENT_PX
  const indicatorRight = rowRight

  return { ...position, indicatorY, indicatorLeft, indicatorRight }
}
