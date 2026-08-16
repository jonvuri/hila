// ---------------------------------------------------------------------------
// UltramodernCards -- catalog U5b (session 4b).
//
// The overlaid-cards metaphor taken literally: every card in the 7b stack is
// a pane of glass at a real altitude. Ancestors peek out from behind the next
// pane as slivers -- dimmer and lower the further from focus -- sliding out
// at tight 10px steps; panes overlap ~10px and the overlap shows through the
// glass. The active pane floats highest: brighter edge + accent glow. The tab
// layer is column-locked glass pill groups (panel pill = raised glass,
// active = the gradient pill).
//
// Open question flagged for review: backdrop-filter cost at dozens of panes
// (candidate fallback: glass rationed to overlays only).
// ---------------------------------------------------------------------------

import { createMemo, For, Index, type JSX, Show } from 'solid-js'

import './ultramodern.css'
import type { OverlaidAncestor, OverlaidCardsProps } from '../types'

import { buildRuns, FOCUS_COL_WIDTH, type RunTab } from './shared'

const PILL_AREA = 36
const PAD = 12
const SLIVER_STEP = 10
const SLIVER_WIDTH = 120
const SLIVER_SLOPE = 6
const PANEL_TOP_STEP = 4
const PANEL_OVERLAP = 10
const FIELD_TOP_PAD = 4
const BOTTOM_PAD = 12

type Sliver = {
  key: string
  x: number
  y: number
  opacity: number
  zIndex: number
}

type Pane = { x: number; y: number; zIndex: number; isLast: boolean }

type GroupMeta = {
  panelIndex: number
  x: number
  /** Clip before the next column's run starts (undefined = last run). */
  maxWidth?: number
  tabs: RunTab[]
}

const UltramodernCards = <P,>(props: OverlaidCardsProps<P>): JSX.Element => {
  const layout = createMemo(() => {
    const { runs } = buildRuns(
      props.panels,
      props.gaps,
      props.title,
      props.panelKind,
      props.panelLabel,
    )
    const panelCount = props.panels.length

    let x = PAD
    let z = 0
    const slivers: Sliver[] = []
    const panePos = new Map<number, Pane>()
    const groups: GroupMeta[] = []

    for (const run of runs) {
      const cardTabs = run.tabs.filter((t) => t.card)
      const paneTop =
        PILL_AREA + FIELD_TOP_PAD + PANEL_TOP_STEP * (panelCount - 1 - run.panelIndex)
      cardTabs.forEach((tab, j) => {
        slivers.push({
          key: (tab as { ancestor: OverlaidAncestor }).ancestor.key,
          x,
          y: paneTop + SLIVER_SLOPE * (cardTabs.length - j),
          opacity: Math.max(0.4, 1 - 0.15 * (cardTabs.length - j)),
          zIndex: ++z,
        })
        x += SLIVER_STEP
      })
      panePos.set(run.panelIndex, {
        x,
        y: paneTop,
        zIndex: ++z,
        isLast: run.panelIndex === panelCount - 1,
      })
      groups.push({ panelIndex: run.panelIndex, x, tabs: run.tabs })
      // Panes overlap: the next run starts before this pane's right edge,
      // and the overlap shows through the glass.
      x += FOCUS_COL_WIDTH - PANEL_OVERLAP
    }

    // Each pill run clips before the next column's run starts.
    for (let g = 0; g < groups.length - 1; g++) {
      groups[g]!.maxWidth = groups[g + 1]!.x - groups[g]!.x - 8
    }

    return { slivers, panePos, groups }
  })

  return (
    <div class="um-cards um-viewport" data-testid="stream-view">
      <div class="um-wash" />

      {/* -- Ancestor slivers: real panes peeking out from behind -- */}
      <For each={layout().slivers}>
        {(sliver) => (
          <div
            class="um-pane"
            style={{
              left: sliver.x + 'px',
              top: sliver.y + 'px',
              bottom: BOTTOM_PAD + 'px',
              width: SLIVER_WIDTH + 'px',
              opacity: sliver.opacity,
              'z-index': sliver.zIndex,
            }}
          />
        )}
      </For>

      {/* -- Panel panes -- */}
      <For each={props.panels}>
        {(panel, i) => {
          const pos = () => layout().panePos.get(i())
          const isLast = () => pos()?.isLast ?? i() === props.panels.length - 1
          return (
            <div
              class="um-pane"
              classList={{ 'um-pane-active': isLast() }}
              data-testid={
                props.panelKind(panel, i()) === 'navigation' ?
                  'stream-nav-column'
                : 'stream-focus-column'
              }
              style={{
                left: (pos()?.x ?? PAD) + 'px',
                top: (pos()?.y ?? PILL_AREA + FIELD_TOP_PAD) + 'px',
                bottom: BOTTOM_PAD + 'px',
                'z-index': pos()?.zIndex ?? 1,
                ...(isLast() ? { right: PAD + 'px' } : { width: FOCUS_COL_WIDTH + 'px' }),
              }}
            >
              <div class="um-pane-inner">{props.renderPanel(panel, i())}</div>
            </div>
          )
        }}
      </For>

      {/* -- Column-locked pill groups -- */}
      <div class="um-pill-layer" style={{ height: PILL_AREA + 'px' }}>
        <For each={layout().groups}>
          {(group) => (
            <div
              class="um-pill-group"
              style={{
                left: group.x + 2 + 'px',
                ...(group.maxWidth != null ? { 'max-width': group.maxWidth + 'px' } : {}),
              }}
            >
              <Index each={group.tabs}>
                {(tab, j) => {
                  const t = () => tab()
                  const isPanelPill = () => t().kind === 'panel' || t().kind === 'marker'
                  return (
                    <>
                      <Show when={j > 0}>
                        <span class="um-sep" aria-hidden="true">
                          ›
                        </span>
                      </Show>
                      <Show
                        when={!isPanelPill()}
                        fallback={
                          <span
                            class="um-pill"
                            classList={{
                              'um-pill-panel': t().kind === 'panel',
                              'um-pill-active': t().kind === 'marker',
                            }}
                            data-testid="card-tab"
                          >
                            {(t() as { label: string }).label}
                          </span>
                        }
                      >
                        <button
                          type="button"
                          class="um-pill"
                          data-testid="card-tab"
                          onClick={() =>
                            props.onAncestorClick?.(
                              group.panelIndex,
                              (t() as { ancestor: OverlaidAncestor }).ancestor,
                            )
                          }
                        >
                          {(t() as { ancestor: OverlaidAncestor }).ancestor.label}
                        </button>
                      </Show>
                    </>
                  )
                }}
              </Index>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

export default UltramodernCards
