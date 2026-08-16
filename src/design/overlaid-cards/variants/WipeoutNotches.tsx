// ---------------------------------------------------------------------------
// WipeoutNotches -- OC-A1 + OC-A3 combined (session 4b, priority variant).
//
// Column-locked instrument strip: per-column tab groups flush with their
// column's left edge, baselines staircasing down toward focus. Card chrome is
// dialable from full edge lines (A1) down to disconnected ticks (A3) via
// `NotchesOptions` -- every value that moved during prototyping is a dial.
//
// A3 semantic rules (locked during prototyping):
//   - Ancestor card = single top tick, no floor. Panels keep bottom ticks, so
//     "has a floor" quietly means "is open".
//   - Every tab throws a short tick from its bottom-left corner; the matching
//     ancestor card's top tick starts on that same invisible horizontal line
//     (tied by alignment, not connectors).
//   - Panel corners are an H tick + V tick that never meet (open corners);
//     the active panel earns its corners in accent.
//
// Ticks and lines are real positioned elements, never pseudo-elements: the
// chamfered title tab's clip-path and ellipsis overflow both swallow
// ::before/::after (session-4 prototype gotcha).
// ---------------------------------------------------------------------------

import { createMemo, For, Index, type JSX, Show } from 'solid-js'

import './wipeout.css'
import type { NotchesOptions, OverlaidAncestor, OverlaidCardsProps } from '../types'

import {
  buildRuns,
  FOCUS_COL_WIDTH,
  NOTCHES_DEFAULTS,
  OUTER_PAD,
  type RunTab,
  tabBaselineOffset,
  withDefaults,
  woRampColor,
  woTabBorderColor,
} from './shared'

const TAB_HEIGHT = 20
const TAB_TOP_PAD = 8
const BOTTOM_PAD = 6

type TabMeta = {
  tab: RunTab
  /** Baseline height above the field top, px. */
  offset: number
  /** Bottom-left tick color -- matches the tab's border color. */
  tickColor: string
  panelIndex: number
}

type GroupMeta = {
  panelIndex: number
  x: number
  /** Clip before the next column's group starts (undefined = last group). */
  maxWidth?: number
  tabs: TabMeta[]
}

type AncestorCard = {
  key: string
  x: number
  y: number
  /** Baseline offset of this card's own tab (the invisible alignment line). */
  tabOffset: number
  /** Full-edge color in lines mode (the depth brightness ramp). */
  color: string
  /** Tick color in ticks mode -- matches the associated tab's border. */
  tickColor: string
  zIndex: number
  panelIndex: number
  ancestor: OverlaidAncestor
}

type PanelCard = {
  x: number
  y: number
  zIndex: number
  isLast: boolean
}

const WipeoutNotches = <P,>(props: OverlaidCardsProps<P>): JSX.Element => {
  const opts = createMemo(
    (): NotchesOptions => withDefaults(NOTCHES_DEFAULTS, props.notchesOptions),
  )

  const layout = createMemo(() => {
    const o = opts()
    const { runs, totalCards } = buildRuns(
      props.panels,
      props.gaps,
      props.title,
      props.panelKind,
      props.panelLabel,
    )
    const panelCount = props.panels.length

    // Pass 1: tab baseline offsets (they set the tab-area height, which every
    // card Y depends on) + tick colors (each tick matches its tab's border).
    let maxOffset = 0
    const groups: GroupMeta[] = runs.map((run) => {
      const tabs = run.tabs.map((tab, j): TabMeta => {
        const offset = tabBaselineOffset(
          o.tabStaggerStep,
          panelCount,
          run.panelIndex,
          j,
          run.tabs.length,
        )
        maxOffset = Math.max(maxOffset, offset)
        return { tab, offset, tickColor: woTabBorderColor(tab), panelIndex: run.panelIndex }
      })
      return { panelIndex: run.panelIndex, x: 0, tabs }
    })

    const tabArea = maxOffset + TAB_HEIGHT + TAB_TOP_PAD

    // Pass 2: cumulative left-to-right card layout.
    let x = OUTER_PAD
    let stair = 0
    let z = 0
    let cardIdx = 0
    const ancestors: AncestorCard[] = []
    const panelPos = new Map<number, PanelCard>()

    for (const group of groups) {
      group.x = x
      for (const meta of group.tabs) {
        if (!meta.tab.card) continue
        const ancestor = (meta.tab as { ancestor: OverlaidAncestor }).ancestor
        ancestors.push({
          key: ancestor.key,
          x,
          y: tabArea + o.ancestorTopStep * stair,
          tabOffset: meta.offset,
          color: woRampColor(o.ramp, cardIdx++, Math.max(totalCards, 1)),
          tickColor: meta.tickColor,
          zIndex: ++z,
          panelIndex: group.panelIndex,
          ancestor,
        })
        x += o.ancestorLeftStep
        stair++
      }
      panelPos.set(group.panelIndex, {
        x,
        y: tabArea + o.ancestorTopStep * stair,
        zIndex: ++z,
        isLast: group.panelIndex === panelCount - 1,
      })
      x += FOCUS_COL_WIDTH
      stair++
    }

    // Each group clips before the next column's group starts.
    for (let g = 0; g < groups.length - 1; g++) {
      groups[g]!.maxWidth = groups[g + 1]!.x - groups[g]!.x - 6
    }

    return { o, groups, ancestors, panelPos, tabArea }
  })

  const vertical = () => layout().o.verticalEdges ?? layout().o.edgeMode
  const top = () => layout().o.topEdges ?? layout().o.edgeMode

  const tickH = (style: JSX.CSSProperties): JSX.Element => (
    <div class="wo-tick-h" style={{ height: '1px', ...style }} />
  )
  const tickV = (style: JSX.CSSProperties): JSX.Element => (
    <div class="wo-tick-v" style={{ width: '1px', ...style }} />
  )

  // Chrome for one panel card; positioned relative to the panel div.
  const panelChrome = (isLast: boolean): JSX.Element => {
    const o = () => layout().o
    const accent = 'var(--wo-accent)'
    const quiet = 'var(--wo-ink-4)'
    const gap = () => o().cornerGap + 'px'
    const lenH = () => o().tickLengthH + 'px'
    const lenV = () => o().tickLengthV + 'px'

    return (
      <>
        {/* -- top chrome -- */}
        <Show when={top() === 'lines'}>
          <div
            class="wo-tick-h"
            style={{
              left: '0',
              right: '0',
              top: '0',
              background: isLast ? 'var(--wo-ink-3)' : 'var(--wo-line)',
            }}
          />
        </Show>
        <Show when={top() === 'ticks' && !(isLast && o().activeCorners === 'brackets3')}>
          {/* top-left open corner (H arm) */}
          {tickH({
            left: gap(),
            top: '0',
            width: lenH(),
            background: isLast ? accent : quiet,
          })}
          <Show when={isLast && o().activeCorners !== 'brackets3'}>
            {/* top-right open corner (H arm) */}
            {tickH({ right: gap(), top: '0', width: lenH(), background: accent })}
          </Show>
        </Show>

        {/* -- vertical chrome -- */}
        <Show when={vertical() === 'lines'}>
          <div
            class="wo-tick-v"
            style={{
              left: '0',
              top: '0',
              bottom: '0',
              width: isLast && o().activeEdge ? '2px' : '1px',
              background: isLast ? accent : quiet,
            }}
          />
        </Show>
        <Show when={vertical() === 'ticks' && !(isLast && o().activeCorners === 'brackets3')}>
          {/* top-left open corner (V arm) */}
          {tickV({
            left: '0',
            top: gap(),
            height: lenV(),
            background: isLast ? accent : quiet,
          })}
          <Show when={isLast}>
            {/* top-right open corner (V arm) */}
            {tickV({ right: '0', top: gap(), height: lenV(), background: accent })}
          </Show>
          <Show when={o().panelBottomTicks}>
            {tickV({
              left: '0',
              bottom: BOTTOM_PAD + 'px',
              height: lenV(),
              background: isLast ? accent : quiet,
            })}
            <Show when={isLast && o().activeCorners === 'four'}>
              {tickV({
                right: '0',
                bottom: BOTTOM_PAD + 'px',
                height: lenV(),
                background: accent,
              })}
            </Show>
          </Show>
          <Show when={isLast && o().activeEdge}>
            <div
              class="wo-tick-v"
              style={{ left: '0', top: '0', bottom: '0', width: '2px', background: accent }}
            />
          </Show>
        </Show>

        {/* -- 3-corner brackets (TR, BL, BR; TL reserved for the header) -- */}
        <Show when={isLast && o().activeCorners === 'brackets3'}>
          {tickH({ right: '0', top: '0', width: lenH(), background: accent })}
          {tickV({ right: '0', top: '0', height: lenV(), background: accent })}
          {tickH({ left: '0', bottom: '0', width: lenH(), background: accent })}
          {tickV({ left: '0', bottom: '0', height: lenV(), background: accent })}
          {tickH({ right: '0', bottom: '0', width: lenH(), background: accent })}
          {tickV({ right: '0', bottom: '0', height: lenV(), background: accent })}
        </Show>
      </>
    )
  }

  return (
    <div
      class="wo-cards wo-viewport"
      classList={{ 'wo-font-orbitron': layout().o.displayFont === 'orbitron' }}
      data-testid="stream-view"
    >
      {/* -- Ancestor edge cards (lines or top ticks) -- */}
      <For each={layout().ancestors}>
        {(card) => (
          <Show
            when={vertical() === 'ticks'}
            fallback={
              <div
                class="wo-edge-line"
                style={{
                  left: card.x + 'px',
                  top: card.y + 'px',
                  'z-index': card.zIndex,
                  background: card.color,
                }}
              />
            }
          >
            <div
              class="wo-tick-v"
              style={{
                left: card.x + 'px',
                top:
                  (layout().o.alignAncestorTicksToTabs ?
                    layout().tabArea - card.tabOffset
                  : card.y) + 'px',
                height: layout().o.tickLengthV + 'px',
                'z-index': card.zIndex,
                background: card.tickColor,
              }}
            />
            <Show when={layout().o.ancestorBottomTicks}>
              <div
                class="wo-tick-v"
                style={{
                  left: card.x + 'px',
                  bottom: BOTTOM_PAD + 'px',
                  height: layout().o.tickLengthV + 'px',
                  'z-index': card.zIndex,
                  background: card.tickColor,
                }}
              />
            </Show>
          </Show>
        )}
      </For>

      {/* -- Panel columns -- */}
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
                top: (pos()?.y ?? 0) + 'px',
                'z-index': pos()?.zIndex ?? 1,
                ...(isLast() ? { right: '0' } : { width: FOCUS_COL_WIDTH + 'px' }),
              }}
            >
              {panelChrome(isLast())}
              <div class="wo-panel-inner">{props.renderPanel(panel, i())}</div>
            </div>
          )
        }}
      </For>

      {/* -- Column-locked tab strip -- */}
      <div class="wo-tab-layer" style={{ height: layout().tabArea + 'px' }}>
        <For each={layout().groups}>
          {(group) => (
            // The group box is shifted left by the tab-tick length and padded
            // back, so the first tab's leftward tick stays inside the clip
            // box when the group is width-bounded.
            <div
              class="wo-tab-group"
              style={{
                left: group.x - layout().o.tabTickLength + 'px',
                'padding-left': layout().o.tabTickLength + 'px',
                ...(group.maxWidth != null ?
                  {
                    'max-width': group.maxWidth + layout().o.tabTickLength + 'px',
                    overflow: 'hidden',
                  }
                : {}),
              }}
            >
              <Index each={group.tabs}>
                {(meta) => {
                  const tab = () => meta().tab
                  const o = () => layout().o
                  const tick = (
                    <Show when={o().tabTicks}>
                      <div
                        class="wo-tab-tick"
                        style={{
                          width: o().tabTickLength + 'px',
                          background: meta().tickColor,
                        }}
                      />
                    </Show>
                  )
                  return (
                    <div
                      class="wo-tab-wrap"
                      classList={{ 'wo-tab-wrap-marker': tab().kind === 'marker' }}
                      style={{ 'margin-bottom': meta().offset + 'px' }}
                    >
                      {tick}
                      <Show
                        when={tab().kind !== 'marker'}
                        fallback={
                          <div
                            class="wo-tab-marker"
                            data-testid="card-tab"
                            style={{
                              width: o().markerWidth + 'px',
                              height: o().markerHeight + 'px',
                            }}
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
                            style={{
                              'max-width': o().tabMaxWidth + 'px',
                              '--wo-chamfer': o().chamfer + 'px',
                            }}
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

export default WipeoutNotches
