import type { OutlineNode } from '../outline/types'
import type { NavigationOutlineVariant } from '../tokens'

export type WorkspaceAncestrySource = 'provenance' | 'home' | 'membership'

export type WorkspaceAncestryItem = {
  id: string
  label: string
  matrixId?: number
}

export type WorkspaceAncestry = {
  source: WorkspaceAncestrySource
  items: readonly WorkspaceAncestryItem[]
}

export type WorkspaceFocusContent = {
  content: readonly string[]
  properties: readonly (readonly [string, string])[]
  backlinks: readonly string[]
}

export type WorkspacePanel = {
  id: string
  kind: 'navigation' | 'focus'
  title: string
  items: OutlineNode[]
  initialCollapsed?: ReadonlySet<string>
  drillId?: string
  selectedId?: string
  disabledIds?: ReadonlySet<string>
  focus?: WorkspaceFocusContent
  ancestry?: WorkspaceAncestry
}

export type WorkspaceProps = {
  as?: 'main' | 'section'
  ariaLabel?: string
  panels: readonly WorkspacePanel[]
  workspaceTitle: string
  navigationOutline?: NavigationOutlineVariant
  showLeafBullets?: boolean
  onAncestrySelect?: (item: WorkspaceAncestryItem) => void
  onDrill?: (panel: WorkspacePanel, rowId: string) => void
}
