import { Show, type JSX } from 'solid-js'

import { extractTextFromPmDoc } from '../core/pm-text'
import {
  NAVIGATION_OUTLINE_CONTROL_GUTTER,
  NAVIGATION_OUTLINE_DEPTH_INSET,
  NavigationOutlinePaint,
  type NavigationOutlineDecoration,
  type NavigationOutlineRow,
} from '../design/workspace/navigation-outline'
import type { NavigationOutlineVariant } from '../design/tokens'

import type { WorkspaceRowData } from './usePagedWorkspaceData'
import type { ProductionStickyRow } from './production-sticky'

import './NavigationRowHeader.css'

export const PRODUCTION_NAVIGATION_ROW_HEIGHT = 32

export type ProductionNavigationHeaderViewModel = {
  appearanceId: string
  logicalId: string
  rendererId: string
  matrixId: number
  rowId: number
  globalIndex: number
  depth: number
  label: string
  hasChildren: boolean
  expanded: boolean
  selected: boolean
  disabled: boolean
  drill: boolean
  drillActionLabel: string
}

export type ProductionNavigationHeaderViewModelOptions = {
  globalIndex: number
  depthOffset?: number
  collapsedAppearanceIds?: ReadonlySet<string>
  selected?: boolean
  disabled?: boolean
  drill?: boolean
  drillActionLabel?: string
}

export const createProductionNavigationHeaderViewModel = (
  row: WorkspaceRowData,
  options: ProductionNavigationHeaderViewModelOptions,
): ProductionNavigationHeaderViewModel => {
  const label =
    extractTextFromPmDoc(row.label) || (row.is_ghost === 1 ? '(deleted)' : 'Untitled')
  const hasChildren = row.has_children === 1

  return {
    appearanceId: row.pk,
    logicalId: row.ck,
    rendererId: row.rk,
    matrixId: row.matrix_id,
    rowId: row.row_id,
    globalIndex: options.globalIndex,
    depth: Math.max(0, row.depth - (options.depthOffset ?? 0)),
    label,
    hasChildren,
    expanded: hasChildren && !options.collapsedAppearanceIds?.has(row.pk),
    selected: options.selected ?? false,
    disabled: options.disabled ?? row.is_ghost === 1,
    drill: options.drill ?? false,
    drillActionLabel: options.drillActionLabel ?? `Open ${label}`,
  }
}

export const createProductionStickyNavigationHeaderViewModel = (
  row: ProductionStickyRow,
  options: {
    depthOffset?: number
    selected?: boolean
    disabled?: boolean
    drill?: boolean
  } = {},
): ProductionNavigationHeaderViewModel => {
  const label = extractTextFromPmDoc(row.label) || 'Untitled'
  return {
    appearanceId: row.identity.pk,
    logicalId: row.identity.ck,
    rendererId: row.identity.rk ?? `sticky:${row.identity.pk}`,
    matrixId: row.matrixId,
    rowId: row.rowId,
    globalIndex: row.visibleIndex,
    depth: Math.max(0, row.depth - (options.depthOffset ?? 0)),
    label,
    hasChildren: row.hasChildren,
    expanded: row.expanded,
    selected: options.selected ?? false,
    disabled: options.disabled ?? false,
    drill: options.drill ?? false,
    drillActionLabel: `Open ${label}`,
  }
}

type ProductionNavigationRowHeaderProps = {
  model: ProductionNavigationHeaderViewModel
  decoration: NavigationOutlineDecoration
  navigationOutline: NavigationOutlineVariant
  representation: 'source' | 'sticky'
  children?: JSX.Element
  onToggle?: (appearanceId: string) => void
  onScrollToSource?: (appearanceId: string) => void
  onDrill?: (appearanceId: string, logicalId: string) => void
  onDisclosureRef?: (element: HTMLButtonElement) => void
}

const outlineRow = (model: ProductionNavigationHeaderViewModel): NavigationOutlineRow => ({
  id: model.appearanceId,
  content: model.label,
  depth: model.depth,
  hasChildren: model.hasChildren,
  expanded: model.expanded,
  globalIndex: model.globalIndex,
})

const Decoration = (props: {
  model: ProductionNavigationHeaderViewModel
  decoration: NavigationOutlineDecoration
  navigationOutline: NavigationOutlineVariant
}): JSX.Element => (
  <span class="production-navigation-row-decoration" aria-hidden="true">
    <NavigationOutlinePaint
      variant={props.navigationOutline}
      row={outlineRow(props.model)}
      decoration={props.decoration}
    />
  </span>
)

const Indent = (props: { depth: number }): JSX.Element => (
  <span
    class="production-navigation-row-indent"
    aria-hidden="true"
    style={{
      width: `${NAVIGATION_OUTLINE_CONTROL_GUTTER + props.depth * NAVIGATION_OUTLINE_DEPTH_INSET}px`,
    }}
  />
)

const Disclosure = (props: {
  model: ProductionNavigationHeaderViewModel
  sticky: boolean
  onToggle?: (appearanceId: string) => void
  onDisclosureRef?: (element: HTMLButtonElement) => void
}): JSX.Element => (
  <Show when={props.model.hasChildren}>
    <button
      type="button"
      class="production-navigation-row-disclosure"
      aria-label={`${props.model.expanded ? 'Collapse' : 'Expand'} ${props.model.label}${props.sticky ? ' from pinned navigation' : ''}`}
      aria-expanded={props.model.expanded}
      disabled={props.model.disabled}
      ref={(element) => props.onDisclosureRef?.(element)}
      onClick={() => props.onToggle?.(props.model.appearanceId)}
    >
      <span aria-hidden="true">{props.model.expanded ? '−' : '+'}</span>
    </button>
  </Show>
)

export const ProductionNavigationRowHeader = (
  props: ProductionNavigationRowHeaderProps,
): JSX.Element => {
  const sticky = () => props.representation === 'sticky'

  return (
    <div
      class="production-navigation-row-header"
      classList={{
        'production-navigation-row-header-source': !sticky(),
        'production-navigation-row-header-sticky': sticky(),
        'production-navigation-row-header-selected': props.model.selected,
        'production-navigation-row-header-disabled': props.model.disabled,
        'production-navigation-row-header-drill': props.model.drill,
      }}
      role={sticky() ? 'presentation' : 'treeitem'}
      aria-level={sticky() ? undefined : props.model.depth + 1}
      aria-expanded={!sticky() && props.model.hasChildren ? props.model.expanded : undefined}
      aria-selected={sticky() ? undefined : props.model.selected}
      aria-disabled={sticky() ? undefined : props.model.disabled}
      data-navigation-row-representation={props.representation}
      data-navigation-outline={props.navigationOutline}
      data-row-pk={props.model.appearanceId}
      data-row-ck={props.model.logicalId}
      data-row-rk={props.model.rendererId}
      style={{
        '--production-navigation-row-depth': `${props.model.depth}`,
        height: `${PRODUCTION_NAVIGATION_ROW_HEIGHT}px`,
      }}
    >
      <Decoration
        model={props.model}
        decoration={props.decoration}
        navigationOutline={props.navigationOutline}
      />
      <Indent depth={props.model.depth} />
      <Disclosure
        model={props.model}
        sticky={sticky()}
        onToggle={props.onToggle}
        onDisclosureRef={props.onDisclosureRef}
      />
      <Show
        when={sticky()}
        fallback={<div class="production-navigation-row-content">{props.children}</div>}
      >
        <button
          type="button"
          class="production-navigation-row-sticky-label"
          aria-label={`Scroll to ${props.model.label}`}
          disabled={props.model.disabled}
          onClick={() => props.onScrollToSource?.(props.model.appearanceId)}
        >
          {props.model.label}
        </button>
      </Show>
      <Show when={props.onDrill != null}>
        <button
          type="button"
          class="production-navigation-row-drill nav-row-open-focus"
          data-testid="open-focus-btn"
          aria-label={
            sticky() ?
              `Open ${props.model.label} from pinned navigation`
            : props.model.drillActionLabel
          }
          disabled={props.model.disabled}
          onClick={() => props.onDrill?.(props.model.appearanceId, props.model.logicalId)}
        >
          <span aria-hidden="true">→</span>
        </button>
      </Show>
    </div>
  )
}
