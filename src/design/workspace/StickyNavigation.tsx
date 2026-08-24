import { createMemo, createSignal, For, type JSX, onCleanup, onMount, Show } from 'solid-js'

import { flattenTree } from '../outline/data'
import type { FlatRow, OutlineNode } from '../outline/types'

const ROW_HEIGHT = 32
const FLOW_GAP = 4

type StickyNavigationProps = {
  ariaLabel?: string
  title?: string
  items: OutlineNode[]
  initialCollapsed?: ReadonlySet<string>
  drillId?: string
  drillLabel?: string
  selectedId?: string
  disabledIds?: ReadonlySet<string>
  onDrill?: (rowId: string) => void
}

type NavigationRowProps = {
  row: FlatRow
  selected: boolean
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
      'ws-nav-row-disabled': props.disabled,
      'ws-nav-row-drill': props.drill,
      'ws-nav-row-path': props.drillPath,
    }}
    role="treeitem"
    aria-expanded={props.row.hasChildren ? props.row.expanded : undefined}
    aria-selected={props.selected}
    aria-disabled={props.disabled}
    data-row-id={props.row.id}
  >
    <span class="ws-row-indent" style={{ width: `${props.row.depth * 16}px` }} />
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
  label: string
  path: boolean
  drill: boolean
  onClick: () => void
}): JSX.Element => (
  <button
    type="button"
    class="ws-sticky-preview"
    classList={{ 'ws-sticky-preview-path': props.path, 'ws-sticky-preview-drill': props.drill }}
    data-sticky="true"
    onClick={() => props.onClick()}
  >
    <span>{props.label}</span>
  </button>
)

const StickyNavigation = (props: StickyNavigationProps): JSX.Element => {
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<string>>(
    props.initialCollapsed ?? new Set(),
  )
  const [scrollTop, setScrollTop] = createSignal(0)
  const [viewHeight, setViewHeight] = createSignal(Number.POSITIVE_INFINITY)
  let scrollElement: HTMLDivElement | undefined

  const toggle = (id: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const rows = createMemo(() => flattenTree(props.items, collapsed()))

  const parents = createMemo((): number[] => {
    const output: number[] = []
    const byDepth: number[] = []
    for (let index = 0; index < rows().length; index++) {
      const depth = rows()[index]!.depth
      output.push(depth > 0 ? (byDepth[depth - 1] ?? -1) : -1)
      byDepth[depth] = index
    }
    return output
  })

  const drillAncestors = createMemo((): ReadonlySet<string> => {
    const output = new Set<string>()
    if (props.drillId == null) return output

    const walk = (nodes: readonly OutlineNode[], path: readonly string[]): boolean => {
      for (const node of nodes) {
        if (node.id === props.drillId) {
          for (const id of path) output.add(id)
          return true
        }
        if (node.children && walk(node.children, [...path, node.id])) return true
      }
      return false
    }

    walk(props.items, [])
    return output
  })

  onMount(() => {
    if (!scrollElement) return
    setViewHeight(scrollElement.clientHeight)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setViewHeight(scrollElement!.clientHeight))
    observer.observe(scrollElement)
    onCleanup(() => observer.disconnect())
  })

  const layout = createMemo(() => {
    const flatRows = rows()
    const pinnedCount = props.title == null ? 0 : 1
    const padding = pinnedCount * ROW_HEIGHT + FLOW_GAP
    const permanentCount = pinnedCount + (props.drillId == null ? 0 : 1)
    const chain: number[] = []

    if (flatRows.length > 0 && scrollTop() > 0) {
      const anchor = scrollTop() + permanentCount * ROW_HEIGHT
      const rowIndex = Math.min(
        flatRows.length - 1,
        Math.max(0, Math.floor((anchor - padding) / ROW_HEIGHT)),
      )
      let parentIndex = parents()[rowIndex] ?? -1
      while (parentIndex >= 0) {
        chain.unshift(parentIndex)
        parentIndex = parents()[parentIndex] ?? -1
      }
    }

    const drillIndex =
      props.drillId == null ? -1 : flatRows.findIndex((row) => row.id === props.drillId)
    const drillIsInChain = drillIndex >= 0 && chain.includes(drillIndex)
    const drillY = padding + drillIndex * ROW_HEIGHT
    const stackLength = pinnedCount + chain.length
    const drillAtTop =
      props.drillId != null &&
      !drillIsInChain &&
      (drillIndex < 0 || drillY < scrollTop() + stackLength * ROW_HEIGHT)
    const drillAtBottom =
      !drillAtTop &&
      !drillIsInChain &&
      drillIndex >= 0 &&
      drillY + ROW_HEIGHT > scrollTop() + viewHeight()

    return { chain, drillAtBottom, drillAtTop, drillIndex, padding, pinnedCount }
  })

  const scrollToRow = (index: number, slot: number) => {
    scrollElement?.scrollTo({
      top: Math.max(0, layout().padding + index * ROW_HEIGHT - slot * ROW_HEIGHT),
      behavior: 'smooth',
    })
  }

  const previewRow = (index: number, slot: number): JSX.Element => {
    const row = rows()[index]!
    const drill = row.id === props.drillId
    return (
      <StickyPreview
        label={row.content}
        path={drillAncestors().has(row.id)}
        drill={drill}
        onClick={() => scrollToRow(index, slot)}
      />
    )
  }

  return (
    <section class="ws-navigation" aria-label={props.ariaLabel ?? props.title ?? 'Children'}>
      <div
        class="ws-navigation-scroll"
        ref={scrollElement}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div class="ws-navigation-flow" style={{ 'padding-top': `${layout().padding}px` }}>
          <div class="ws-nav-tree" role="tree">
            <For each={rows()}>
              {(row) => (
                <NavigationRow
                  row={row}
                  selected={row.id === props.selectedId}
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

      <div class="ws-sticky-stack">
        <Show when={props.title != null}>
          <div class="ws-workspace-title" data-sticky="true" title={props.title}>
            {props.title}
          </div>
        </Show>
        <For each={layout().chain}>
          {(rowIndex, slot) => {
            const row = () => rows()[rowIndex]!
            return (
              <StickyPreview
                label={row().content}
                path={drillAncestors().has(row().id)}
                drill={row().id === props.drillId}
                onClick={() => scrollToRow(rowIndex, layout().pinnedCount + slot())}
              />
            )
          }}
        </For>
        <Show when={layout().drillAtTop}>
          <StickyPreview
            label={
              layout().drillIndex >= 0 ?
                rows()[layout().drillIndex]!.content
              : (props.drillLabel ?? 'Untitled')
            }
            path={false}
            drill
            onClick={() => {
              if (layout().drillIndex >= 0) {
                scrollToRow(layout().drillIndex, layout().pinnedCount + layout().chain.length)
              }
            }}
          />
        </Show>
      </div>

      <Show when={layout().drillAtBottom}>
        <div class="ws-sticky-dock">
          {previewRow(layout().drillIndex, layout().pinnedCount + layout().chain.length)}
        </div>
      </Show>
    </section>
  )
}

export default StickyNavigation
