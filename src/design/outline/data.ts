import type { FlatRow, OutlineNode, OutlineTheme, RowDecoration, VectorSlotData } from './types'

export const ANGLE_CEILING_DIST = 100

// ─── Tree flattening (for the convenience wrapper) ─────────

export const flattenTree = (
  nodes: ReadonlyArray<OutlineNode>,
  collapsedIds: ReadonlySet<string>,
  depth = 0,
): FlatRow[] => {
  const result: FlatRow[] = []
  for (const node of nodes) {
    const hasChildren = (node.children?.length ?? 0) > 0
    const expanded = hasChildren && !collapsedIds.has(node.id)
    result.push({ id: node.id, content: node.content, depth, hasChildren, expanded })
    if (expanded && node.children) {
      result.push(...flattenTree(node.children, collapsedIds, depth + 1))
    }
  }
  return result
}

// ─── Decoration entry point ────────────────────────────────

/**
 * Compute per-row decoration data for a contiguous slice of rows.
 * Only computes what the given theme requires.
 *
 * For windowed rendering: pass the loaded range (visible + buffer windows).
 * Decorations for rendered rows are exact as long as the buffer provides
 * sufficient forward context (≥ ANGLE_CEILING_DIST rows).
 */
export const computeDecorations = (
  theme: OutlineTheme,
  rows: ReadonlyArray<FlatRow>,
): RowDecoration[] => {
  const n = rows.length
  if (n === 0) return []

  const isVisualLast = computeIsVisualLast(rows)

  if (theme === 'vector-field') {
    const vectorSlots = computeVectorSlots(rows)
    return rows.map((_, j) => ({
      continues: [],
      isVisualLast: isVisualLast[j]!,
      vectorSlots: vectorSlots[j],
    }))
  }

  if (theme === 'workflowy-clone' || theme === 'workflowy-geometric') {
    const continues = computeContinuations(rows)
    return rows.map((_, j) => ({
      continues: continues[j]!,
      isVisualLast: isVisualLast[j]!,
    }))
  }

  return rows.map((_, j) => ({
    continues: [],
    isVisualLast: isVisualLast[j]!,
  }))
}

// ─── Guide continuations (backward-pass algorithm) ─────────

/**
 * For each row, compute a boolean[] of length `depth` where `continues[d]`
 * indicates whether the vertical guide line at column d extends past this row.
 *
 * Uses a per-depth backward pass. For each depth d, tracks whether a row at
 * that depth has been seen since the last row at a shallower depth.
 *
 * The row component derives the visual segment type locally:
 *   connector level (d === depth-1): continues → ├, !continues → └
 *   ancestor level  (d <  depth-1): continues → │, !continues → ╵
 */
const computeContinuations = (rows: ReadonlyArray<FlatRow>): boolean[][] => {
  const n = rows.length
  if (n === 0) return []

  let maxDepth = 0
  for (let i = 0; i < n; i++) {
    if (rows[i]!.depth > maxDepth) maxDepth = rows[i]!.depth
  }

  // cont[j][d] = true if there's a row at depth d after j,
  // before any row at depth < d.
  const cont: boolean[][] = new Array(n)
  for (let j = 0; j < n; j++) cont[j] = []

  for (let d = 0; d <= maxDepth; d++) {
    let hasSeen = false
    for (let j = n - 1; j >= 0; j--) {
      if (d <= rows[j]!.depth) {
        cont[j]![d] = hasSeen
      }
      if (rows[j]!.depth === d) hasSeen = true
      else if (rows[j]!.depth < d) hasSeen = false
    }
  }

  return rows.map((row, j) => {
    const guides: boolean[] = []
    for (let d = 0; d < row.depth; d++) {
      if (d === row.depth - 1) {
        // Connector level: sibling at row's own depth?
        guides.push(cont[j]![d + 1] ?? false)
      } else {
        // Ancestor level: continuation at depth d?
        guides.push(cont[j]![d] ?? false)
      }
    }
    return guides
  })
}

// ─── Visual last (one-row lookahead) ───────────────────────

const computeIsVisualLast = (rows: ReadonlyArray<FlatRow>): boolean[] =>
  rows.map((row, j) => {
    if (j + 1 >= rows.length) return true
    return rows[j + 1]!.depth < row.depth
  })

// ─── Vector field slots ────────────────────────────────────

const computeVectorSlots = (rows: ReadonlyArray<FlatRow>): VectorSlotData[][] =>
  rows.map((row, j) => {
    const slots: VectorSlotData[] = []
    for (let d = 0; d <= row.depth; d++) {
      const isOwn = d === row.depth
      if (isOwn && row.hasChildren && !row.expanded) {
        slots.push({ angle: 0, strokeWidth: 2.5, opacity: 1, short: true })
      } else {
        const dist = distToLastInSubtree(rows, j, d)
        const angle = distToAngle(dist)
        const { strokeWidth, opacity } = styleForDepthDist(row.depth - d)
        slots.push({ angle, strokeWidth, opacity, short: false })
      }
    }
    return slots
  })

const distToLastInSubtree = (rows: ReadonlyArray<FlatRow>, j: number, d: number): number => {
  let last = -1
  for (let k = j + 1; k < rows.length; k++) {
    if (rows[k]!.depth <= d) break
    last = k
  }
  return last >= 0 ? last - j : 0
}

/**
 * Angle formula with ceiling at ANGLE_CEILING_DIST (100).
 *
 * Base: asymptotic curve `90 * dist / (dist + 1.6)` for fast initial ramp.
 * Squared-log blend smoothly pushes towards 90° as dist approaches ceiling.
 * At dist >= ANGLE_CEILING_DIST: exactly 90° (vertical, identical to a guide line).
 *
 * The ceiling aligns with the buffer window floor (≥100 rows), guaranteeing
 * that decoration computation never needs data beyond the loaded buffer.
 */
const distToAngle = (dist: number): number => {
  if (dist <= 0) return 0
  if (dist >= ANGLE_CEILING_DIST) return 90
  const base = (90 * dist) / (dist + 1.6)
  const logT = Math.log1p(dist) / Math.log1p(ANGLE_CEILING_DIST)
  const blend = logT * logT
  return base + (90 - base) * blend
}

const styleForDepthDist = (depthDist: number): { strokeWidth: number; opacity: number } => {
  if (depthDist === 0) return { strokeWidth: 1.5, opacity: 1 }
  if (depthDist === 1) return { strokeWidth: 1, opacity: 0.6 }
  if (depthDist === 2) return { strokeWidth: 1, opacity: 0.4 }
  if (depthDist === 3) return { strokeWidth: 1, opacity: 0.3 }
  return { strokeWidth: 1, opacity: 0.22 }
}
