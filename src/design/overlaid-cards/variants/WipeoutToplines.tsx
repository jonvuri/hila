// ---------------------------------------------------------------------------
// WipeoutToplines -- OC-A2 (session 4b).
//
// No vertical edges anywhere. Each tab extends its baseline leftward as a
// thin line to the frame's left edge; because baselines staircase, the lines
// nest into a terraced set of card tops -- the only card suggestion left.
// The marker's full-width accent line IS the active panel's rule (no rule
// inside the panel). Line brightness ramps by depth.
//
// Needs a larger stagger than notches to read (proto: ~6px/level; 3 smeared).
// Lines are real elements in the tab wrappers, not pseudo-elements (the
// title tab's clip-path / ellipsis overflow would swallow them).
// ---------------------------------------------------------------------------

import { createMemo, For, Index, type JSX, Show } from 'solid-js'

import './wipeout.css'
import type { OverlaidAncestor, OverlaidCardsProps, ToplinesOptions } from '../types'

import {
  buildRuns,
  FOCUS_COL_WIDTH,
  OUTER_PAD,
  type RunTab,
  tabBaselineOffset,
  TOPLINES_DEFAULTS,
  withDefaults,
  woRampColor,
} from './shared'

const TAB_HEIGHT = 20
const TAB_TOP_PAD = 8
const CONTENT_TOP_PAD = 4

type TabMeta = {
  tab: RunTab
  offset: number
  lineColor: string
  panelIndex: number
}

type GroupMeta = {
  panelIndex: number
  x: number
  tabs: TabMeta[]
}

const WipeoutToplines = <P,>(props: OverlaidCardsProps<P>): JSX.Element => {
  const opts = createMemo(
    (): ToplinesOptions => withDefaults(TOPLINES_DEFAULTS, props.toplinesOptions),
  )

  const layout = createMemo(() => {
    const o = opts()
    const { runs, chainLength } = buildRuns(
      props.panels,
      props.gaps,
      props.title,
      props.panelKind,
      props.panelLabel,
    )
    const panelCount = props.panels.length

    // Line colors ramp across the whole chain (marker stays accent).
    let chainPos = 0
    let maxOffset = 0
    const groups: GroupMeta[] = runs.map((run) => {
      const tabs = run.tabs.map((tab, j): TabMeta => {
        const offset = tabBaselineOffset(
          o.staggerStep,
          panelCount,
          run.panelIndex,
          j,
          run.tabs.length,
        )
        maxOffset = Math.max(maxOffset, offset)
        const lineColor =
          tab.kind === 'marker' ?
            'var(--wo-accent)'
          : woRampColor(o.ramp, chainPos, Math.max(chainLength - 1, 1))
        chainPos++
        return { tab, offset, lineColor, panelIndex: run.panelIndex }
      })
      return { panelIndex: run.panelIndex, x: 0, tabs }
    })

    const tabArea = maxOffset + TAB_HEIGHT + TAB_TOP_PAD

    // Panels only -- collapsed levels cost no horizontal space in the field.
    let x = OUTER_PAD
    const panelPos = new Map<number, { x: number; isLast: boolean }>()
    for (const group of groups) {
      group.x = x
      panelPos.set(group.panelIndex, { x, isLast: group.panelIndex === panelCount - 1 })
      x += FOCUS_COL_WIDTH
    }

    return { o, groups, panelPos, tabArea }
  })

  return (
    <div
      class="wo-cards wo-viewport"
      classList={{ 'wo-font-orbitron': layout().o.displayFont === 'orbitron' }}
      data-testid="stream-view"
    >
      {/* -- Panel columns (pure negative space below the terraced lines) -- */}
      <For each={props.panels}>
        {(panel, i) => {
          const pos = () => layout().panelPos.get(i())
          const isLast = () => pos()?.isLast ?? i() === props.panels.length - 1
          return (
            <div
              class="wo-panel"
              data-testid={
                props.panelKind(panel, i()) === 'navigation' ?
                  'stream-nav-column'
                : 'stream-focus-column'
              }
              style={{
                left: (pos()?.x ?? OUTER_PAD) + 'px',
                top: layout().tabArea + CONTENT_TOP_PAD + 'px',
                ...(isLast() ? { right: '0' } : { width: FOCUS_COL_WIDTH + 'px' }),
              }}
            >
              <div class="wo-panel-inner">{props.renderPanel(panel, i())}</div>
            </div>
          )
        }}
      </For>

      {/* -- Tab strip: each tab extends its baseline leftward -- */}
      <div class="wo-tab-layer" style={{ height: layout().tabArea + 'px' }}>
        <For each={layout().groups}>
          {(group) => (
            <div class="wo-tab-group" style={{ left: group.x + 'px' }}>
              <Index each={group.tabs}>
                {(meta) => {
                  const tab = () => meta().tab
                  const o = () => layout().o
                  return (
                    <div
                      class="wo-tab-wrap"
                      classList={{ 'wo-tab-wrap-marker': tab().kind === 'marker' }}
                      style={{ 'margin-bottom': meta().offset + 'px' }}
                    >
                      <div
                        class="wo-topline"
                        style={{
                          height: o().lineThickness + 'px',
                          background: meta().lineColor,
                        }}
                      />
                      <Show
                        when={tab().kind !== 'marker'}
                        fallback={
                          <div
                            class="wo-tab-marker"
                            data-testid="card-tab"
                            style={{ width: '18px', height: '9px' }}
                          />
                        }
                      >
                        <Show
                          when={tab().kind !== 'panel'}
                          fallback={
                            <span
                              class="wo-tab wo-tab-panel"
                              data-testid="card-tab"
                              style={{ 'max-width': o().tabMaxWidth + 'px' }}
                            >
                              {(tab() as { label: string }).label}
                            </span>
                          }
                        >
                          <button
                            type="button"
                            class="wo-tab"
                            classList={{ 'wo-tab-title': tab().kind === 'title' }}
                            data-testid="card-tab"
                            style={{ 'max-width': o().tabMaxWidth + 'px' }}
                            onClick={() =>
                              props.onAncestorClick?.(
                                meta().panelIndex,
                                (tab() as { ancestor: OverlaidAncestor }).ancestor,
                              )
                            }
                          >
                            {(tab() as { ancestor: OverlaidAncestor }).ancestor.label}
                          </button>
                        </Show>
                      </Show>
                    </div>
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

export default WipeoutToplines
