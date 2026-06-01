// ---------------------------------------------------------------------------
// OverlaidCards -- presentational overlaid-cards layout
//
// Renders a stack of overlapping cards:
//   - Unfocused ancestor cards: visible only as left/top edge lines with
//     file-folder label tabs, fading into the void background
//   - Focused/navigation cards: full content columns arranged left-to-right,
//     each child card overlaying the remainder of its parent
//
// Every card's left/top edge lines extend a depth-scaled distance toward the
// right/bottom edges and then fade (or hard-cut) to nothing -- a "staircase"
// mirroring the tab labels, tuned by `staircase` (see types.ts).
//
// Pure/presentational: fed by a stub-friendly contract (panels + index-aligned
// ancestor gaps + a `renderPanel` slot). The wired `StreamView` composes it
// with live data; Storybook renders it with static fixtures.
// ---------------------------------------------------------------------------

import { createEffect, createMemo, createSignal, For, Show } from 'solid-js'

import './OverlaidCards.css'
import type { OverlaidAncestor, OverlaidCardsProps } from './types'

export type { OverlaidAncestor, OverlaidCardsProps } from './types'

// ---------------------------------------------------------------------------
// Layout model (internal)
// ---------------------------------------------------------------------------

type LayoutAncestor = {
  kind: 'ancestor'
  key: string
  label: string
  left: number
  top: number
  zIndex: number
  colorIndex: number
  stairIndex: number
  isRunStart: boolean
  panelIndex: number
  ancestor: OverlaidAncestor
}

type LayoutPanel = {
  kind: 'panel'
  panelIndex: number
  left: number
  top: number
  zIndex: number
  stairIndex: number
  isLast: boolean
}

type LayoutCard = LayoutAncestor | LayoutPanel

// ---------------------------------------------------------------------------
// Staircase edge-line tuning (Phase 7b stage 4)
//
// These values were settled by iterating in Storybook (see git history for the
// slider-driven exploration that landed here). Kept as named constants so the
// look can be re-tuned in one place. All are fractions in [0, 1]:
//   - minExtent  : extent of the shallowest/topmost ancestor's lines (floored
//                  at its label tab so a line never detaches from its tab)
//   - maxExtent  : extent of the deepest card's lines
//   - fade       : 0 = hard cutoff (corner-notch style), 1 = long gentle fade
//   - focusReach : how much focus/nav borders opt out of the shared staircase
//                  (0 = fully join it, 1 = extend the whole way out)
// ---------------------------------------------------------------------------

const STAIRCASE = {
  minExtent: 0.15,
  maxExtent: 1,
  fade: 1,
  focusReach: 0,
}

// At focusReach = 1 a panel's line overshoots the edge by this fraction so its
// fade tail clips off-screen, leaving a solid line to the edge (pre-staircase look).
const EDGE_OVERSHOOT = 0.25
// fade = 1 spreads the fade across this fraction of the line.
const MAX_FADE_FRAC = 0.6
// A line always reaches at least its tab's far edge + this buffer (px).
const TAB_LINE_BUFFER = 12

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const pct = (frac: number): string => (frac * 100).toFixed(2) + '%'

// Edge-line mask stops (% of line length) for a card at staircase position
// `ratio` in [0, 1]. Panels optionally opt out of the staircase via focusReach.
const extentStops = (ratio: number, isPanel: boolean): { solid: string; end: string } => {
  let end = lerp(STAIRCASE.minExtent, STAIRCASE.maxExtent, ratio)
  if (isPanel) end = lerp(end, 1 + EDGE_OVERSHOOT, STAIRCASE.focusReach)
  const solid = Math.max(0, end - STAIRCASE.fade * MAX_FADE_FRAC)
  return { solid: pct(solid), end: pct(end) }
}

// ---------------------------------------------------------------------------
// Color helpers
//
// Unfocused cards form a tight staircase of edge lines; shallowest ancestors
// fade into the void (darkest), deepest are most prominent (lightest).
// ---------------------------------------------------------------------------

/** Edge-line color for the unfocused card at depth index `i` of `total`. */
const ancestorBorderColor = (i: number, total: number): string => {
  const darkL = 18 // --card-border-dark-l
  const lightL = 28 // --card-border-light-l
  const ratio = total <= 1 ? 1 : i / (total - 1)
  const l = darkL + ratio * (lightL - darkL)
  return `hsl(225, 16%, ${l.toFixed(1)}%)`
}

/** Tab text color: more prominent (lighter) for deeper tabs. */
const ancestorTextColor = (i: number, total: number): string => {
  const ratio = total <= 1 ? 1 : i / (total - 1)
  const l = 35 + ratio * 35
  return `hsl(225, 10%, ${l.toFixed(0)}%)`
}

// ---------------------------------------------------------------------------
// Layout constants (mirror the CSS custom properties used for positioning math)
// ---------------------------------------------------------------------------

const ANCESTOR_LEFT_STEP = 4 // --card-ancestor-left-step
const ANCESTOR_TOP_STEP = 2 // --card-ancestor-top-step
const FOCUS_COL_WIDTH = 320 // --card-focus-col-width
const FOCUS_TOP_STEP = 4 // --card-focus-top-step
const TAB_HEIGHT = 18 // --card-tab-height
const BORDER_WIDTH = 0.5 // --card-border-width
const OUTER_PAD = 6 // --card-outer-pad
const TAB_AREA = TAB_HEIGHT + 12 // --card-tab-area

// ---------------------------------------------------------------------------
// OverlaidCards
// ---------------------------------------------------------------------------

const OverlaidCards = <P,>(props: OverlaidCardsProps<P>) => {
  // -----------------------------------------------------------------------
  // Unified layout: a single cumulative left-to-right pass over the panels.
  // For each panel we render its gap of missing ancestors as minimal edge-line
  // cards, then the panel's content column. The workspace title leads panel
  // 0's gap when non-empty. `stairIndex` is a global order across all cards
  // (ancestors + panels) so the staircase can flow continuously across them.
  // -----------------------------------------------------------------------

  const layout = createMemo(
    (): { cards: LayoutCard[]; totalAncestors: number; stairTotal: number } => {
      const panels = props.panels
      const gaps = props.gaps
      const title = props.title || 'Workspace'

      const cards: LayoutCard[] = []
      let left = OUTER_PAD
      let top = TAB_AREA
      let ancIdx = 0
      let stair = 0
      let z = 0

      for (let i = 0; i < panels.length; i++) {
        const gap = gaps[i] ?? []

        const entries: OverlaidAncestor[] = gap.map((a) => ({
          key: a.key,
          label: a.label || 'Untitled',
          rowId: a.rowId,
        }))
        if (i === 0 && entries.length > 0) {
          entries.unshift({ key: 'anc-title', label: title, rowId: null })
        }

        for (let g = 0; g < entries.length; g++) {
          cards.push({
            kind: 'ancestor',
            key: entries[g]!.key,
            label: entries[g]!.label,
            left,
            top,
            zIndex: ++z,
            colorIndex: ancIdx,
            stairIndex: stair++,
            isRunStart: g === 0,
            panelIndex: i,
            ancestor: entries[g]!,
          })
          left += ANCESTOR_LEFT_STEP
          top += ANCESTOR_TOP_STEP
          ancIdx++
        }

        cards.push({
          kind: 'panel',
          panelIndex: i,
          left,
          top,
          zIndex: ++z,
          stairIndex: stair++,
          isLast: i === panels.length - 1,
        })
        left += FOCUS_COL_WIDTH
        top += FOCUS_TOP_STEP
      }

      return { cards, totalAncestors: ancIdx, stairTotal: stair }
    },
  )

  const stairRatio = (stairIndex: number): number => {
    const total = layout().stairTotal
    return total <= 1 ? 1 : stairIndex / (total - 1)
  }

  const ancestorCards = createMemo(
    () => layout().cards.filter((c) => c.kind === 'ancestor') as LayoutAncestor[],
  )

  // Panel positions keyed by panel index, so the panel <For> can iterate the
  // stable panels array (preserving component identity) while reading reactive
  // positions by index.
  const panelPositions = createMemo(() => {
    const m = new Map<number, LayoutPanel>()
    for (const c of layout().cards) {
      if (c.kind === 'panel') m.set(c.panelIndex, c)
    }
    return m
  })

  // -----------------------------------------------------------------------
  // Tab positioning + line continuity floor.
  //
  // Position each tab just above its own card, pushing right only to avoid
  // overlapping the previous tab within the same contiguous ancestor run (a
  // focus panel intervening resets the cursor). While here, record each
  // ancestor's tab far edge (+ buffer) so its top line is floored to always
  // reach -- and slightly pass -- its tab, regardless of the extent params.
  // -----------------------------------------------------------------------

  let tabLayerRef: HTMLDivElement | undefined
  const [tabFloors, setTabFloors] = createSignal<Map<string, number>>(new Map())

  const positionTabs = () => {
    if (!tabLayerRef) return
    const tabs = tabLayerRef.querySelectorAll<HTMLElement>('.card-tab')
    let cursor = 0
    const floors = new Map<string, number>()
    tabs.forEach((tab) => {
      const cardLeft = Number(tab.dataset.cardLeft ?? '0')
      if (tab.dataset.runStart === 'true') cursor = 0
      const tabLeft = Math.max(cardLeft + 4, cursor)
      tab.style.left = tabLeft + 'px'
      const width = tab.offsetWidth
      cursor = tabLeft + width + 5
      const key = tab.dataset.cardKey
      if (key) floors.set(key, Math.max(0, tabLeft + width + TAB_LINE_BUFFER - cardLeft))
    })
    setTabFloors(floors)
  }

  createEffect(() => {
    layout() // track dependency
    requestAnimationFrame(positionTabs)
  })

  return (
    <div class="card-viewport" data-testid="stream-view">
      {/* -- Unfocused ancestor cards (edge-line layers) -- */}
      <For each={ancestorCards()}>
        {(card) => {
          const total = () => layout().totalAncestors
          const stops = () => extentStops(stairRatio(card.stairIndex), false)
          return (
            <div
              class="card"
              data-testid="card-ancestor"
              style={{
                left: card.left + 'px',
                top: card.top + 'px',
                'z-index': card.zIndex,
                background: 'var(--card-ancestor-bg)',
                '--line-color': ancestorBorderColor(card.colorIndex, total()),
                '--ext-solid': stops().solid,
                '--ext-end': stops().end,
                '--tab-floor': (tabFloors().get(card.key) ?? 0) + 'px',
              }}
            >
              <div class="card-line card-line-top" />
              <div class="card-line card-line-left" />
            </div>
          )
        }}
      </For>

      {/* -- Focused / navigation cards (content panels) --
          Iterate the stable panels array (preserving component identity and
          editor state) and read positions from the layout by panel index. */}
      <For each={props.panels}>
        {(panel, i) => {
          const pos = () => panelPositions().get(i())
          const left = () => pos()?.left ?? OUTER_PAD
          const top = () => pos()?.top ?? TAB_AREA
          const zIndex = () => pos()?.zIndex ?? 1
          const isLast = () => pos()?.isLast ?? i() === props.panels.length - 1
          const kind = () => props.panelKind(panel, i())
          const stops = () => {
            const p = pos()
            return extentStops(p ? stairRatio(p.stairIndex) : 1, true)
          }

          return (
            <div
              class="card"
              data-testid={
                kind() === 'navigation' ? 'stream-nav-column' : 'stream-focus-column'
              }
              style={{
                left: left() + 'px',
                top: top() + 'px',
                'z-index': zIndex(),
                background: 'var(--card-focused-bg)',
                '--line-color': 'var(--card-focused-border)',
                '--ext-solid': stops().solid,
                '--ext-end': stops().end,
                '--tab-floor': '0px',
              }}
            >
              <div
                class={`card-inner${isLast() ? ' card-inner-full' : ''}`}
                style={isLast() ? undefined : { width: FOCUS_COL_WIDTH + 'px' }}
              >
                {props.renderPanel(panel, i())}
              </div>
              <div class="card-line card-line-top" />
              <div class="card-line card-line-left" />
            </div>
          )
        }}
      </For>

      {/* -- Ancestor tab layer (above all cards) -- */}
      <Show when={ancestorCards().length > 0}>
        <div class="card-tab-layer" ref={tabLayerRef}>
          <For each={ancestorCards()}>
            {(card) => {
              const total = () => layout().totalAncestors
              const tabPad = Math.round(TAB_HEIGHT * 0.4)
              const tabRadius = Math.round(TAB_HEIGHT * 0.2)

              return (
                <button
                  type="button"
                  class="card-tab"
                  data-testid="card-tab"
                  data-card-left={card.left}
                  data-card-key={card.key}
                  data-run-start={card.isRunStart}
                  onClick={() => props.onAncestorClick?.(card.panelIndex, card.ancestor)}
                  style={{
                    '--bw': BORDER_WIDTH + 'px',
                    top: card.top - TAB_HEIGHT + 'px',
                    height: TAB_HEIGHT + 'px',
                    padding: `0 ${tabPad}px`,
                    'border-width': BORDER_WIDTH + 'px',
                    'border-style': 'solid',
                    'border-color': ancestorBorderColor(card.colorIndex, total()),
                    'border-bottom-width': '0',
                    'border-radius': `${tabRadius}px ${tabRadius}px 0 0`,
                    background: 'var(--card-tab-bg)',
                    color: ancestorTextColor(card.colorIndex, total()),
                  }}
                >
                  {card.label}
                </button>
              )
            }}
          </For>
        </div>
      </Show>
    </div>
  )
}

export default OverlaidCards
