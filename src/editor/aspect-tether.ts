import { createSignal } from 'solid-js'

/**
 * Shared hover state for the aspect tether (Phase 9.2; see context/Phase-9.2.md).
 *
 * A content-anchored aspect (one created from an inline `#`-ref) is rendered in
 * two places at once: as a row in the focus-panel aspect band, and as the inline
 * `#`-badge inside the node's prose. The tether is the **hover bridge** between
 * them — hovering either side highlights the other. Both surfaces are Solid-
 * reactive (the badge is a prosemirror-adapter/solid nodeview), so they share
 * this module-scoped signal rather than threading props through ProseMirror.
 */

export type TetherTarget = { matrixId: number; rowId: number }

const [hoveredAspect, setHovered] = createSignal<TetherTarget | null>(null)

export { hoveredAspect }

export const setHoveredAspect = (target: TetherTarget): void => {
  setHovered(target)
}

/** Clear only if `target` is the one currently hovered (avoids a leave on one
 *  row stomping a concurrent enter on another). */
export const clearHoveredAspect = (target: TetherTarget): void => {
  const cur = hoveredAspect()
  if (cur && cur.matrixId === target.matrixId && cur.rowId === target.rowId) {
    setHovered(null)
  }
}

export const isAspectHovered = (matrixId: number, rowId: number): boolean => {
  const cur = hoveredAspect()
  return cur != null && cur.matrixId === matrixId && cur.rowId === rowId
}
