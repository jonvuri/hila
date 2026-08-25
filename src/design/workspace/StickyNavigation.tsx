import {
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  onCleanup,
  onMount,
  Show,
} from 'solid-js'
import { render } from 'solid-js/web'

import { flattenTree } from '../outline/data'
import type { OutlineNode } from '../outline/types'
import { resolveComponentVariant, type NavigationOutlineVariant } from '../tokens'

import {
  calculateStickyDockState,
  calculateStickyWidgetState,
  classifyStickyWidgetStateChange,
  EMPTY_STICKY_WIDGET_STATE,
  STICKY_FLOW_GAP,
  STICKY_ROW_HEIGHT,
  type StickyDockState,
  type StickyWidgetNode,
  type StickyWidgetState,
  type StickyWidgetStateInput,
} from './sticky-widget'
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

type StickyWidgetRowProps = NavigationRowProps & {
  node: StickyWidgetNode
  titleHeight: number
  onScroll: (rowIndex: number, stackIndex: number) => void
  register: (id: string, element: HTMLDivElement) => void
}

const RowDecoration = (props: {
  row: NavigationOutlineRow
  variant: NavigationOutlineVariant
  decoration: NavigationOutlineDecoration
}): JSX.Element => (
  <span class="ws-row-decoration-slot" aria-hidden="true">
    <NavigationOutlinePaint
      variant={props.variant}
      row={props.row}
      decoration={props.decoration}
    />
  </span>
)

const RowIndent = (props: { depth: number }): JSX.Element => (
  <span
    class="ws-row-indent"
    aria-hidden="true"
    style={{
      width: `${NAVIGATION_OUTLINE_CONTROL_GUTTER + props.depth * NAVIGATION_OUTLINE_DEPTH_INSET}px`,
    }}
  />
)

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
    data-row-kind="source"
    style={{ '--ws-row-depth': `${props.row.depth}` }}
  >
    <RowDecoration row={props.row} variant={props.variant} decoration={props.decoration} />
    <RowIndent depth={props.row.depth} />
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

const StickyWidgetRow = (props: StickyWidgetRowProps): JSX.Element => (
  <div
    ref={(element) => props.register(props.row.id, element)}
    class="ws-sticky-row"
    classList={{
      'ws-sticky-row-selected': props.selected,
      'ws-sticky-row-selection-path': props.selectedPath,
      'ws-sticky-row-disabled': props.disabled,
      'ws-sticky-row-drill': props.drill,
      'ws-sticky-row-path': props.drillPath,
    }}
    role="presentation"
    data-sticky="true"
    data-sticky-state="active"
    data-sticky-row-id={props.row.id}
    data-source-row-visible={props.node.sourceRowVisible ? 'true' : 'false'}
    style={{
      '--ws-row-depth': `${props.row.depth}`,
      '--ws-sticky-stack-index': `${props.node.stackIndex}`,
      transform: `translate3d(0, ${props.titleHeight + props.node.position}px, 0)`,
    }}
  >
    <RowDecoration row={props.row} variant={props.variant} decoration={props.decoration} />
    <RowIndent depth={props.row.depth} />
    <button
      type="button"
      class="ws-collapse ws-sticky-collapse"
      aria-label={`Collapse ${props.row.content} from pinned navigation`}
      aria-expanded="true"
      disabled={props.disabled}
      onClick={() => props.onToggle(props.row.id)}
    >
      <span aria-hidden="true">−</span>
    </button>
    <button
      type="button"
      class="ws-sticky-label"
      aria-label={`Scroll to ${props.row.content}`}
      disabled={props.disabled}
      onClick={() => props.onScroll(props.node.rowIndex, props.node.stackIndex)}
    >
      {props.row.content}
    </button>
    <Show when={props.drill}>
      <button
        type="button"
        class="ws-drill"
        aria-label={`Open ${props.row.content} from pinned navigation`}
        disabled={props.disabled}
        onClick={() => props.onDrill?.(props.row.id)}
      >
        <span aria-hidden="true">→</span>
      </button>
    </Show>
  </div>
)

const StickyDock = (props: {
  dock: StickyDockState
  row?: NavigationOutlineRow
  label: string
  onScroll: () => void
}): JSX.Element => (
  <button
    type="button"
    class="ws-sticky-dock"
    data-sticky="true"
    data-sticky-location={props.dock.location}
    aria-label={`Scroll to ${props.label}`}
    aria-hidden={
      props.dock.location === 'flow' || props.dock.location === 'chain' ? 'true' : undefined
    }
    tabIndex={props.dock.location === 'flow' || props.dock.location === 'chain' ? -1 : 0}
    style={{ transform: `translate3d(0, ${props.dock.position}px, 0)` }}
    onClick={() => props.onScroll()}
  >
    <RowIndent depth={props.row?.depth ?? 0} />
    <span class="ws-sticky-label-text">{props.label}</span>
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

const sameDock = (left: StickyDockState | null, right: StickyDockState | null): boolean =>
  left?.id === right?.id &&
  left?.location === right?.location &&
  left?.position === right?.position &&
  left?.rowIndex === right?.rowIndex

const StickyNavigation = (props: StickyNavigationProps): JSX.Element => {
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<string>>(
    props.initialCollapsed ?? new Set(),
  )
  const [viewHeight, setViewHeight] = createSignal(Number.POSITIVE_INFINITY)
  const [dockState, setDockState] = createSignal<StickyDockState | null>(null)
  let scrollElement: HTMLDivElement | undefined
  let widgetElement: HTMLDivElement | undefined
  let widgetRowsElement: HTMLDivElement | undefined
  let disposeWidgetRows: (() => void) | undefined
  let scrollFrame: number | undefined
  let modelUpdateQueued = false
  let pendingScrollTop = 0
  let currentWidgetState = EMPTY_STICKY_WIDGET_STATE
  let currentDockState: StickyDockState | null = null
  let rebuildCount = 0
  let positionUpdateCount = 0
  const stickyElements = new Map<string, HTMLDivElement>()

  const rows = createMemo(() => flattenTree(props.items, collapsed()))
  const outlineVariant = createMemo(() =>
    resolveComponentVariant('navigationOutline', props.navigationOutline),
  )
  const outlineWindow = createMemo(() => createNavigationOutlineWindow(rows()))
  const outlineRows = createMemo(() => outlineWindow().renderedRows)
  const outlineDecorations = createMemo(() =>
    calculateNavigationOutlineDecorations(outlineVariant(), outlineWindow()),
  )
  const outlineRowById = createMemo(
    () => new Map(outlineRows().map((row) => [row.id, row] as const)),
  )
  const outlineDecorationById = createMemo(
    () =>
      new Map(
        outlineRows().map((row, index) => [row.id, outlineDecorations()[index]!] as const),
      ),
  )
  const drillAncestors = createMemo(() => findAncestorIds(props.items, props.drillId))
  const selectedAncestors = createMemo(() => findAncestorIds(props.items, props.selectedId))
  const titleHeight = (): number => (props.title == null ? 0 : STICKY_ROW_HEIGHT)

  const toggle = (id: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    scheduleModelUpdate()
  }

  const toggleFromSticky = (id: string) => {
    toggle(id)
    queueMicrotask(() => {
      scrollElement
        ?.querySelector<HTMLButtonElement>(`[data-row-id="${CSS.escape(id)}"] > .ws-collapse`)
        ?.focus()
    })
  }

  const stateInput = (scrollTop: number): StickyWidgetStateInput & { drillId?: string } => ({
    rows: rows(),
    scrollTop,
    viewportHeight: viewHeight(),
    hasTitle: props.title != null,
    drillId: props.drillId,
    contentKey: (row) =>
      [
        row.content,
        row.expanded,
        row.id === props.selectedId,
        props.disabledIds?.has(row.id) === true,
        row.id === props.drillId,
        drillAncestors().has(row.id),
        selectedAncestors().has(row.id),
        outlineVariant(),
      ].join(':'),
  })

  const updateMetrics = () => {
    if (!widgetElement) return
    widgetElement.dataset.widgetRebuilds = `${rebuildCount}`
    widgetElement.dataset.widgetPositionUpdates = `${positionUpdateCount}`
    widgetElement.dataset.widgetHeight = `${currentWidgetState.widgetHeight}`
    widgetElement.dataset.widgetNodeIds = currentWidgetState.activeNodeIds.join(',')
  }

  const rebuildWidgetRows = (state: StickyWidgetState) => {
    if (!widgetRowsElement) return
    disposeWidgetRows?.()
    stickyElements.clear()
    const rowById = outlineRowById()
    const decorationById = outlineDecorationById()
    const variant = outlineVariant()
    const selectedId = props.selectedId
    const disabledIds = props.disabledIds
    const drillId = props.drillId
    const drillAncestorIds = drillAncestors()
    const selectedAncestorIds = selectedAncestors()
    disposeWidgetRows = render(
      () => (
        <For each={state.nodes}>
          {(node) => {
            const row = rowById.get(node.id)!
            return (
              <StickyWidgetRow
                row={row}
                node={node}
                titleHeight={titleHeight()}
                variant={variant}
                decoration={decorationById.get(node.id)!}
                selected={node.id === selectedId}
                selectedPath={selectedAncestorIds.has(node.id)}
                disabled={disabledIds?.has(node.id) === true}
                drill={node.id === drillId}
                drillPath={drillAncestorIds.has(node.id)}
                onToggle={toggleFromSticky}
                onDrill={props.onDrill}
                onScroll={scrollToRow}
                register={(id, element) => stickyElements.set(id, element)}
              />
            )
          }}
        </For>
      ),
      widgetRowsElement,
    )
  }

  const commitWidgetState = (scrollTop: number) => {
    const input = stateInput(scrollTop)
    const next = calculateStickyWidgetState(input)
    const change = classifyStickyWidgetStateChange(currentWidgetState, next)

    if (change === 'final-position') {
      const finalNode = next.nodes[next.nodes.length - 1]!
      const element = stickyElements.get(finalNode.id)
      if (element) {
        element.style.transform = `translate3d(0, ${titleHeight() + finalNode.position}px, 0)`
        element.dataset.sourceRowVisible = finalNode.sourceRowVisible ? 'true' : 'false'
      }
      positionUpdateCount += 1
      currentWidgetState = next
    } else if (change !== 'none') {
      rebuildCount += 1
      currentWidgetState = next
      rebuildWidgetRows(next)
    }
    currentWidgetState = next

    const nextDock = calculateStickyDockState(input, next)
    if (!sameDock(currentDockState, nextDock)) {
      currentDockState = nextDock
      setDockState(nextDock)
    }
    updateMetrics()
  }

  const updateScroll = (nextScrollTop: number) => {
    pendingScrollTop = nextScrollTop
    if (scrollFrame != null) return
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = undefined
      commitWidgetState(pendingScrollTop)
    })
  }

  const scheduleModelUpdate = () => {
    if (modelUpdateQueued) return
    modelUpdateQueued = true
    // The queued controller reads the latest state after model changes settle.
    // eslint-disable-next-line solid/reactivity
    queueMicrotask(() => {
      modelUpdateQueued = false
      commitWidgetState(scrollElement?.scrollTop ?? pendingScrollTop)
    })
  }

  createEffect(() => {
    rows()
    viewHeight()
    outlineVariant()
    outlineDecorations()
    void props.title
    void props.drillId
    void props.selectedId
    void props.disabledIds
    drillAncestors()
    selectedAncestors()
    scheduleModelUpdate()
  })

  onMount(() => {
    if (!scrollElement) return
    if (scrollElement.clientHeight > 0) setViewHeight(scrollElement.clientHeight)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (scrollElement!.clientHeight > 0) setViewHeight(scrollElement!.clientHeight)
    })
    observer.observe(scrollElement)
    onCleanup(() => observer.disconnect())
  })

  onCleanup(() => {
    if (scrollFrame != null) cancelAnimationFrame(scrollFrame)
    disposeWidgetRows?.()
  })

  const prefersReducedMotion = (): boolean =>
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const scrollToRow = (rowIndex: number, stackIndex: number) => {
    const top = Math.max(
      0,
      titleHeight() +
        STICKY_FLOW_GAP +
        rowIndex * STICKY_ROW_HEIGHT -
        titleHeight() -
        stackIndex * STICKY_ROW_HEIGHT,
    )
    scrollElement?.scrollTo({
      top,
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
        <div
          class="ws-sticky-widget"
          ref={(element) => {
            widgetElement = element
            updateMetrics()
          }}
          role="group"
          aria-label="Pinned navigation"
          data-sticky-widget="true"
        >
          <Show when={props.title != null}>
            <div class="ws-workspace-title" data-sticky="true" aria-hidden="true">
              {props.title}
            </div>
          </Show>
          <div class="ws-sticky-rows" ref={widgetRowsElement} />
          <Show when={dockState() != null}>
            <StickyDock
              dock={dockState()!}
              row={
                dockState()!.rowIndex >= 0 ? outlineRows()[dockState()!.rowIndex] : undefined
              }
              label={
                dockState()!.rowIndex >= 0 ?
                  rows()[dockState()!.rowIndex]!.content
                : (props.drillLabel ?? 'Untitled')
              }
              onScroll={() => {
                if (dockState()!.rowIndex >= 0) {
                  scrollToRow(dockState()!.rowIndex, currentWidgetState.nodes.length)
                }
              }}
            />
          </Show>
        </div>

        <div
          class="ws-navigation-flow"
          style={{ 'padding-top': `${titleHeight() + STICKY_FLOW_GAP}px` }}
        >
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
    </section>
  )
}

export default StickyNavigation
