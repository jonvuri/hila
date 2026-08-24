import { createMemo, createSignal, For, type JSX, onCleanup, onMount, Show } from 'solid-js'

import { flattenTree } from '../outline/data'
import type { OutlineNode } from '../outline/types'
import { resolveComponentVariant, type NavigationOutlineVariant } from '../tokens'

import { calculateStickyLayout, STICKY_ROW_HEIGHT, type StickySlotState } from './sticky-layout'
import {
  calculateNavigationOutlineDecorations,
  createNavigationOutlineWindow,
  NAVIGATION_OUTLINE_CONTROL_GUTTER,
  NAVIGATION_OUTLINE_DEPTH_INSET,
  NavigationOutlinePaint,
  type NavigationOutlineDecoration,
  type NavigationOutlineRow,
} from './navigation-outline'

type StickyNavigationProps = {
  ariaLabel?: string
  title?: string
  items: OutlineNode[]
  initialCollapsed?: ReadonlySet<string>
  drillId?: string
  drillLabel?: string
  selectedId?: string
  disabledIds?: ReadonlySet<string>
  navigationOutline?: NavigationOutlineVariant
  showLeafBullets?: boolean
  onDrill?: (rowId: string) => void
}

type NavigationRowProps = {
  row: NavigationOutlineRow
  variant: NavigationOutlineVariant
  decoration: NavigationOutlineDecoration
  selected: boolean
  selectedPath: boolean
  disabled: boolean
  drill: boolean
  drillPath: boolean
  onToggle: (id: string) => void
  onDrill?: (id: string) => void
}

const NavigationRow = (props: NavigationRowProps): JSX.Element => (
  <div
    class="ws-nav-row"
    classList={{
      'ws-nav-row-selected': props.selected,
      'ws-nav-row-selection-path': props.selectedPath,
      'ws-nav-row-disabled': props.disabled,
      'ws-nav-row-drill': props.drill,
      'ws-nav-row-path': props.drillPath,
    }}
    role="treeitem"
    aria-level={props.row.depth + 1}
    aria-expanded={props.row.hasChildren ? props.row.expanded : undefined}
    aria-selected={props.selected}
    aria-disabled={props.disabled}
    data-row-id={props.row.id}
    data-row-index={props.row.globalIndex}
    style={{ '--ws-row-depth': `${props.row.depth}` }}
  >
    <span class="ws-row-decoration-slot" aria-hidden="true">
      <NavigationOutlinePaint
        variant={props.variant}
        row={props.row}
        decoration={props.decoration}
      />
    </span>
    <span
      class="ws-row-indent"
      style={{
        width: `${NAVIGATION_OUTLINE_CONTROL_GUTTER + props.row.depth * NAVIGATION_OUTLINE_DEPTH_INSET}px`,
      }}
    />
    <Show
      when={props.row.hasChildren}
      fallback={<span class="ws-collapse-spacer" aria-hidden="true" />}
    >
      <button
        type="button"
        class="ws-collapse"
        aria-label={`${props.row.expanded ? 'Collapse' : 'Expand'} ${props.row.content}`}
        aria-expanded={props.row.expanded}
        disabled={props.disabled}
        onClick={() => props.onToggle(props.row.id)}
      >
        <span aria-hidden="true">{props.row.expanded ? '−' : '+'}</span>
      </button>
    </Show>
    <span
      class="ws-row-label"
      contentEditable={!props.disabled}
      aria-label={`Edit ${props.row.content}`}
      tabIndex={props.disabled ? -1 : 0}
    >
      {props.row.content}
    </span>
    <Show when={props.drill}>
      <button
        type="button"
        class="ws-drill"
        aria-label={`Open ${props.row.content}`}
        disabled={props.disabled}
        onClick={() => props.onDrill?.(props.row.id)}
      >
        <span aria-hidden="true">→</span>
      </button>
    </Show>
  </div>
)

const StickyPreview = (props: {
  row?: NavigationOutlineRow
  label: string
  variant: NavigationOutlineVariant
  decoration?: NavigationOutlineDecoration
  path: boolean
  selectedPath: boolean
  drill: boolean
  state?: StickySlotState
  location?: 'top' | 'bottom'
  style?: JSX.CSSProperties
  onClick: () => void
}): JSX.Element => (
  <button
    type="button"
    class="ws-sticky-preview"
    classList={{
      'ws-sticky-preview-path': props.path,
      'ws-sticky-preview-selection-path': props.selectedPath,
      'ws-sticky-preview-drill': props.drill,
      'ws-sticky-preview-candidate': props.state === 'candidate',
      'ws-sticky-preview-inactive': props.state === 'inactive',
      'ws-sticky-preview-bottom': props.location === 'bottom',
    }}
    data-sticky="true"
    data-sticky-location={props.location}
    data-sticky-state={props.state}
    aria-hidden={props.state === 'candidate' || props.state === 'inactive' ? 'true' : undefined}
    tabIndex={props.state === 'candidate' || props.state === 'inactive' ? -1 : 0}
    style={props.style}
    onClick={() => props.onClick()}
  >
    <span class="ws-row-decoration-slot" aria-hidden="true">
      <Show when={props.row && props.decoration}>
        <NavigationOutlinePaint
          variant={props.variant}
          row={props.row!}
          decoration={props.decoration!}
        />
      </Show>
    </span>
    <span
      class="ws-row-indent"
      style={{
        width: `${NAVIGATION_OUTLINE_CONTROL_GUTTER + (props.row?.depth ?? 0) * NAVIGATION_OUTLINE_DEPTH_INSET}px`,
      }}
      aria-hidden="true"
    />
    <span class="ws-sticky-label">{props.label}</span>
  </button>
)

const findAncestorIds = (
  nodes: readonly OutlineNode[],
  targetId: string | undefined,
): ReadonlySet<string> => {
  const output = new Set<string>()
  if (targetId == null) return output

  const walk = (items: readonly OutlineNode[], path: readonly string[]): boolean => {
    for (const item of items) {
      if (item.id === targetId) {
        for (const id of path) output.add(id)
        return true
      }
      if (item.children && walk(item.children, [...path, item.id])) return true
    }
    return false
  }

  walk(nodes, [])
  return output
}

const StickyNavigation = (props: StickyNavigationProps): JSX.Element => {
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<string>>(
    props.initialCollapsed ?? new Set(),
  )
  const [scrollTop, setScrollTop] = createSignal(0)
  const [viewHeight, setViewHeight] = createSignal(Number.POSITIVE_INFINITY)
  let scrollElement: HTMLDivElement | undefined
  let scrollFrame: number | undefined
  let pendingScrollTop = 0

  const toggle = (id: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const rows = createMemo(() => flattenTree(props.items, collapsed()))
  const outlineVariant = createMemo(() =>
    resolveComponentVariant('navigationOutline', props.navigationOutline),
  )
  const outlineWindow = createMemo(() => createNavigationOutlineWindow(rows()))
  const outlineRows = createMemo(() => outlineWindow().renderedRows)
  const outlineDecorations = createMemo(() =>
    calculateNavigationOutlineDecorations(outlineVariant(), outlineWindow()),
  )
  const outlineDecorationById = createMemo(
    () =>
      new Map(
        outlineRows().map((row, index) => [row.id, outlineDecorations()[index]!] as const),
      ),
  )
  const stickyRows = createMemo(() =>
    outlineRows().filter((row) => row.hasChildren && row.expanded),
  )

  const drillAncestors = createMemo(() => findAncestorIds(props.items, props.drillId))
  const selectedAncestors = createMemo(() => findAncestorIds(props.items, props.selectedId))

  onMount(() => {
    if (!scrollElement) return
    setViewHeight(scrollElement.clientHeight)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setViewHeight(scrollElement!.clientHeight))
    observer.observe(scrollElement)
    onCleanup(() => observer.disconnect())
  })

  onCleanup(() => {
    if (scrollFrame != null) cancelAnimationFrame(scrollFrame)
  })

  const layout = createMemo(() =>
    calculateStickyLayout({
      rows: rows(),
      scrollTop: scrollTop(),
      viewHeight: viewHeight(),
      hasTitle: props.title != null,
      drillId: props.drillId,
    }),
  )

  const updateScroll = (nextScrollTop: number) => {
    pendingScrollTop = nextScrollTop
    if (scrollFrame != null) return
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = undefined
      setScrollTop(pendingScrollTop)
    })
  }

  const prefersReducedMotion = (): boolean =>
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const scrollToRow = (index: number, slot: number) => {
    scrollElement?.scrollTo({
      top: Math.max(0, layout().padding + index * STICKY_ROW_HEIGHT - slot * STICKY_ROW_HEIGHT),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }

  return (
    <section
      class="ws-navigation"
      aria-label={props.ariaLabel ?? props.title ?? 'Children'}
      data-navigation-outline={outlineVariant()}
      data-leaf-bullets={props.showLeafBullets === true ? 'true' : 'false'}
    >
      <div
        class="ws-navigation-scroll"
        ref={scrollElement}
        onScroll={(event) => updateScroll(event.currentTarget.scrollTop)}
      >
        <div class="ws-navigation-flow" style={{ 'padding-top': `${layout().padding}px` }}>
          <div class="ws-nav-tree" role="tree">
            <For each={outlineRows()}>
              {(row, index) => (
                <NavigationRow
                  row={row}
                  variant={outlineVariant()}
                  decoration={outlineDecorations()[index()]!}
                  selected={row.id === props.selectedId}
                  selectedPath={selectedAncestors().has(row.id)}
                  disabled={props.disabledIds?.has(row.id) === true}
                  drill={row.id === props.drillId}
                  drillPath={drillAncestors().has(row.id)}
                  onToggle={toggle}
                  onDrill={props.onDrill}
                />
              )}
            </For>
          </div>
        </div>
      </div>

      <div class="ws-sticky-layer">
        <Show when={props.title != null}>
          <div class="ws-workspace-title" data-sticky="true" title={props.title}>
            {props.title}
          </div>
        </Show>
        <For each={stickyRows()}>
          {(row) => {
            const slot = () => layout().slots.find((candidate) => candidate.id === row.id)!
            return (
              <StickyPreview
                row={row}
                label={row.content}
                variant={outlineVariant()}
                decoration={outlineDecorationById().get(row.id)}
                path={drillAncestors().has(row.id)}
                selectedPath={selectedAncestors().has(row.id)}
                drill={row.id === props.drillId}
                state={slot().state}
                style={{ transform: `translate3d(0, ${slot().y}px, 0)` }}
                onClick={() => scrollToRow(slot().rowIndex, row.depth + 1)}
              />
            )
          }}
        </For>
        <Show when={layout().drill != null}>
          <StickyPreview
            row={
              layout().drill!.rowIndex >= 0 ?
                outlineRows()[layout().drill!.rowIndex]
              : undefined
            }
            label={
              layout().drill!.rowIndex >= 0 ?
                rows()[layout().drill!.rowIndex]!.content
              : (props.drillLabel ?? 'Untitled')
            }
            variant={outlineVariant()}
            decoration={
              layout().drill!.rowIndex >= 0 ?
                outlineDecorations()[layout().drill!.rowIndex]
              : undefined
            }
            path={false}
            selectedPath={false}
            drill
            state={
              layout().drill!.location === 'flow' ? 'candidate'
              : layout().drill!.location === 'chain' ?
                'inactive'
              : undefined
            }
            location={
              layout().drill!.location === 'bottom' ? 'bottom'
              : layout().drill!.location === 'top' ?
                'top'
              : undefined
            }
            style={{ transform: `translate3d(0, ${layout().drill!.y}px, 0)` }}
            onClick={() => {
              if (layout().drill!.rowIndex >= 0) {
                scrollToRow(
                  layout().drill!.rowIndex,
                  layout().activeAncestorChain.length + (props.title == null ? 0 : 1),
                )
              }
            }}
          />
        </Show>
      </div>
    </section>
  )
}

export default StickyNavigation
