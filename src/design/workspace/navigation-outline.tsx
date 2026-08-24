import { For, type JSX } from 'solid-js'
import { Dynamic } from 'solid-js/web'

import type { FlatRow } from '../outline/types'
import type { NavigationOutlineVariant } from '../tokens'

export const NAVIGATION_OUTLINE_DEPTH_INSET = 16
export const NAVIGATION_OUTLINE_CONTROL_GUTTER = 20

export type NavigationOutlineRow = FlatRow & {
  globalIndex: number
}

export type NavigationOutlineAncestor = Pick<
  NavigationOutlineRow,
  'id' | 'depth' | 'globalIndex'
>

export type NavigationOutlineWindowInput = {
  renderedRows: readonly NavigationOutlineRow[]
  ancestryBefore: readonly NavigationOutlineAncestor[]
  continuationAfter: readonly boolean[]
  lookAhead?: NavigationOutlineRow
}

export type NavigationOutlineDecoration = {
  continues: readonly boolean[]
}

type NavigationOutlinePaintProps = {
  row: NavigationOutlineRow
  decoration: NavigationOutlineDecoration
}

type NavigationOutlineAdapter = {
  calculate: (input: NavigationOutlineWindowInput) => readonly NavigationOutlineDecoration[]
  Paint: (props: NavigationOutlinePaintProps) => JSX.Element
}

const rowWithGlobalIndex = (row: FlatRow, globalIndex: number): NavigationOutlineRow => ({
  ...row,
  globalIndex,
})

const findAncestryBefore = (
  rows: readonly FlatRow[],
  startIndex: number,
): readonly NavigationOutlineAncestor[] => {
  const first = rows[startIndex]
  if (!first || first.depth === 0) return []

  const ancestors: NavigationOutlineAncestor[] = []
  let targetDepth = first.depth - 1
  for (let index = startIndex - 1; index >= 0 && targetDepth >= 0; index -= 1) {
    const row = rows[index]!
    if (row.depth !== targetDepth) continue
    ancestors.unshift({ id: row.id, depth: row.depth, globalIndex: index })
    targetDepth -= 1
  }
  return ancestors
}

const hasContinuationAtDepth = (
  rows: readonly FlatRow[],
  startIndex: number,
  depth: number,
): boolean => {
  for (let index = startIndex; index < rows.length; index += 1) {
    const row = rows[index]!
    if (row.depth < depth) return false
    if (row.depth === depth) return true
  }
  return false
}

export const createNavigationOutlineWindow = (
  rows: readonly FlatRow[],
  startIndex = 0,
  renderedCount = rows.length - startIndex,
): NavigationOutlineWindowInput => {
  const safeStart = Math.max(0, Math.min(startIndex, rows.length))
  const endIndex = Math.max(safeStart, Math.min(safeStart + renderedCount, rows.length))
  const maxDepth = rows.reduce((maximum, row) => Math.max(maximum, row.depth), 0)

  return {
    renderedRows: rows
      .slice(safeStart, endIndex)
      .map((row, index) => rowWithGlobalIndex(row, safeStart + index)),
    ancestryBefore: findAncestryBefore(rows, safeStart),
    continuationAfter: Array.from({ length: maxDepth + 1 }, (_, depth) =>
      hasContinuationAtDepth(rows, endIndex, depth),
    ),
    lookAhead:
      endIndex < rows.length ? rowWithGlobalIndex(rows[endIndex]!, endIndex) : undefined,
  }
}

const calculateGuideDecorations = (
  input: NavigationOutlineWindowInput,
): NavigationOutlineDecoration[] =>
  input.renderedRows.map((row, index) => {
    const next = input.renderedRows[index + 1] ?? input.lookAhead
    return {
      continues: Array.from({ length: row.depth }, (_, guideDepth) =>
        next?.depth != null ?
          next.depth > guideDepth
        : (input.continuationAfter[guideDepth + 1] ?? false),
      ),
    }
  })

const GuidePaint = (props: NavigationOutlinePaintProps): JSX.Element => (
  <For each={props.decoration.continues}>
    {(continues, depth) => (
      <span
        class="ws-outline-guide"
        classList={{ 'ws-outline-guide-continues': continues }}
        style={{ '--ws-outline-depth': `${depth()}` }}
      />
    )}
  </For>
)

export const navigationOutlineRegistry = {
  guides: {
    calculate: calculateGuideDecorations,
    Paint: GuidePaint,
  },
} as const satisfies Record<NavigationOutlineVariant, NavigationOutlineAdapter>

export const calculateNavigationOutlineDecorations = (
  variant: NavigationOutlineVariant,
  input: NavigationOutlineWindowInput,
): readonly NavigationOutlineDecoration[] => navigationOutlineRegistry[variant].calculate(input)

export const NavigationOutlinePaint = (props: {
  variant: NavigationOutlineVariant
  row: NavigationOutlineRow
  decoration: NavigationOutlineDecoration
}): JSX.Element => (
  <Dynamic
    component={navigationOutlineRegistry[props.variant].Paint}
    row={props.row}
    decoration={props.decoration}
  />
)
