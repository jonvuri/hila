import { createEffect, createSignal, For, onCleanup, type JSX, Show } from 'solid-js'
import { render } from 'solid-js/web'

import { extractTextFromPmDoc } from '../core/pm-text'
import type { NavigationOutlineDecoration } from '../design/workspace/navigation-outline'
import type { VirtualizerGeometryState } from '../virtualizer/ScrollVirtualizer'

import {
  createProductionStickyNavigationHeaderViewModel,
  ProductionNavigationRowHeader,
} from './NavigationRowHeader'
import {
  calculateProductionStickyDockState,
  calculateProductionStickyWidgetState,
  classifyProductionStickyWidgetStateChange,
  EMPTY_PRODUCTION_STICKY_WIDGET_STATE,
  type ProductionStickyContext,
  type ProductionStickyDockState,
  type ProductionStickyRow,
  type ProductionStickyWidgetState,
} from './production-sticky'

import './ProductionStickyNavigation.css'

type ProductionStickyNavigationProps = {
  context: ProductionStickyContext
  geometry: VirtualizerGeometryState | undefined
  depthOffset: number
  title?: JSX.Element
  decorationFor: (row: ProductionStickyRow) => NavigationOutlineDecoration
  onToggle: (row: ProductionStickyRow) => void
  onScrollToSource: (pk: string, stackIndex: number) => void
  onDrill: (row: ProductionStickyRow) => void
}

const sameDock = (
  left: ProductionStickyDockState | null,
  right: ProductionStickyDockState | null,
): boolean =>
  left?.location === right?.location &&
  left?.position === right?.position &&
  left?.pk === right?.pk &&
  left?.ck === right?.ck &&
  left?.label === right?.label

const ProductionStickyNavigation = (props: ProductionStickyNavigationProps): JSX.Element => {
  const [dock, setDock] = createSignal<ProductionStickyDockState | null>(null)
  let widgetElement: HTMLDivElement | undefined
  let rowsElement: HTMLDivElement | undefined
  let disposeRows: (() => void) | undefined
  let frame: number | undefined
  let currentState: ProductionStickyWidgetState = EMPTY_PRODUCTION_STICKY_WIDGET_STATE
  let currentDock: ProductionStickyDockState | null = null
  let rebuildCount = 0
  let positionUpdateCount = 0
  const elements = new Map<string, HTMLDivElement>()

  const titleHeight = (): number => (props.title == null ? 0 : 32)

  const updateMetrics = () => {
    if (!widgetElement) return
    widgetElement.dataset.widgetRebuilds = `${rebuildCount}`
    widgetElement.dataset.widgetPositionUpdates = `${positionUpdateCount}`
    widgetElement.dataset.widgetAncestryCount = `${props.context.ancestry.length}`
    widgetElement.dataset.widgetRetainedCount = `${props.context.retained.length}`
    widgetElement.dataset.widgetPostWindowCount = props.context.postWindow ? '1' : '0'
    widgetElement.dataset.widgetDrillCount = props.context.drill ? '1' : '0'
    widgetElement.dataset.widgetGeometryRowCount = `${props.geometry?.rows.length ?? 0}`
    widgetElement.dataset.widgetNodeIds = currentState.nodes
      .map((node) => node.row.identity.pk)
      .join(',')
  }

  const rebuild = (state: ProductionStickyWidgetState) => {
    if (!rowsElement) return
    disposeRows?.()
    elements.clear()
    const drillCk = props.context.drill?.ck
    disposeRows = render(
      () => (
        <For each={state.nodes}>
          {(node) => {
            const model = createProductionStickyNavigationHeaderViewModel(node.row, {
              depthOffset: props.depthOffset,
              drill: node.row.identity.ck === drillCk,
            })
            return (
              <div
                ref={(element) => elements.set(node.row.identity.pk, element)}
                class="production-sticky-row"
                data-sticky-row-pk={node.row.identity.pk}
                data-source-row-visible={node.sourceRowVisible ? 'true' : 'false'}
                style={{
                  '--production-sticky-stack-index': `${node.stackIndex}`,
                  transform: `translate3d(0, ${titleHeight() + node.position}px, 0)`,
                }}
              >
                <ProductionNavigationRowHeader
                  model={model}
                  decoration={props.decorationFor(node.row)}
                  representation="sticky"
                  onToggle={() => props.onToggle(node.row)}
                  onScrollToSource={() =>
                    props.onScrollToSource(node.row.identity.pk, node.stackIndex)
                  }
                  onDrill={() => props.onDrill(node.row)}
                />
              </div>
            )
          }}
        </For>
      ),
      rowsElement,
    )
  }

  const commit = () => {
    const geometry = props.geometry
    const input = {
      context: props.context,
      rows: geometry?.rows ?? [],
      scrollTop: geometry?.scrollTop ?? 0,
      viewportHeight: geometry?.viewportHeight ?? 0,
      titleHeight: titleHeight(),
    }
    const next = calculateProductionStickyWidgetState(input)
    const change = classifyProductionStickyWidgetStateChange(currentState, next)
    if (change === 'final-position') {
      const finalNode = next.nodes[next.nodes.length - 1]!
      const element = elements.get(finalNode.row.identity.pk)
      if (element) {
        element.style.transform = `translate3d(0, ${titleHeight() + finalNode.position}px, 0)`
        element.dataset.sourceRowVisible = finalNode.sourceRowVisible ? 'true' : 'false'
      }
      positionUpdateCount += 1
    } else if (change !== 'none') {
      rebuildCount += 1
      rebuild(next)
    }
    currentState = next

    const nextDock = calculateProductionStickyDockState(input, next)
    if (!sameDock(currentDock, nextDock)) {
      currentDock = nextDock
      setDock(nextDock)
    }
    updateMetrics()
  }

  const schedule = () => {
    if (frame != null) return
    frame = requestAnimationFrame(() => {
      frame = undefined
      commit()
    })
  }

  createEffect(() => {
    void props.context
    void props.geometry
    void props.depthOffset
    void props.title
    schedule()
  })

  onCleanup(() => {
    if (frame != null) cancelAnimationFrame(frame)
    disposeRows?.()
  })

  const dockLabel = (): string => extractTextFromPmDoc(dock()?.label) || 'Untitled'
  const dockHidden = (): boolean => dock()?.location === 'flow' || dock()?.location === 'chain'

  return (
    <div
      class="production-sticky-widget"
      ref={(element) => {
        widgetElement = element
        updateMetrics()
      }}
      role="group"
      aria-label="Pinned navigation"
      data-sticky-widget="production"
    >
      <Show when={props.title != null}>
        <div class="production-sticky-title">{props.title}</div>
      </Show>
      <div class="production-sticky-rows" ref={rowsElement} />
      <Show when={dock() != null}>
        <button
          type="button"
          class="production-sticky-dock"
          data-sticky-location={dock()!.location}
          data-row-ck={dock()!.ck}
          data-row-pk={dock()!.pk ?? undefined}
          aria-label={
            dock()!.pk ?
              `Scroll to ${dockLabel()}`
            : `${dockLabel()} is not placed in navigation`
          }
          aria-hidden={dockHidden() ? 'true' : undefined}
          tabIndex={dockHidden() ? -1 : 0}
          disabled={dock()!.pk == null}
          style={{ transform: `translate3d(0, ${dock()!.position}px, 0)` }}
          onClick={() => {
            const state = dock()
            if (state?.pk) props.onScrollToSource(state.pk, currentState.nodes.length)
          }}
        >
          <span>{dockLabel()}</span>
        </button>
      </Show>
    </div>
  )
}

export default ProductionStickyNavigation
