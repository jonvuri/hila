import type { JSX } from 'solid-js'

export type OutlineTheme =
  | 'workflowy-clone'
  | 'workflowy-geometric'
  | 'vector-field'
  | 'corner-notches'
  | 'whitespace-only'

export type FlatRow = {
  id: string
  content: string
  depth: number
  hasChildren: boolean
  expanded: boolean
}

export type VectorSlotData = {
  angle: number
  strokeWidth: number
  opacity: number
  short: boolean
}

export type RowDecoration = {
  continues: boolean[]
  isVisualLast: boolean
  vectorSlots?: VectorSlotData[]
}

export type OutlineRowProps = {
  theme: OutlineTheme
  row: FlatRow
  decoration: RowDecoration
  onToggle?: (id: string) => void
  renderContent?: (row: FlatRow) => JSX.Element
}

// Tree input type for the convenience wrapper (Storybook / non-virtualized use)
export type OutlineNode = {
  id: string
  content: string
  children?: OutlineNode[]
}

export type OutlineProps = {
  items: OutlineNode[]
  theme: OutlineTheme
  initialCollapsed?: ReadonlySet<string>
  renderContent?: (row: FlatRow) => JSX.Element
}
