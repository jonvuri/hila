// ---------------------------------------------------------------------------
// NullCards -- catalog N5b (session 4b).
//
// The most conventional lens on the 7b mechanics: the tab layer becomes
// per-column breadcrumb runs (each column's ancestry segments flush above
// that column's left edge; hover reveals the dotted-underline click
// affordance; the column's own title is the bold terminal segment; an accent
// dot marks the active column). Cards are plain surface cards with hairline
// borders and a small radius; ancestor edge cards are bare hairline slivers
// at 5px left-steps; card tops staircase 5px. The active card gets a
// one-shade-stronger border + the margin tick (the accent quirk). No shadows
// in-flow. Deliberate Resolution-B break: titles appear in both crumb and
// panel.
// ---------------------------------------------------------------------------

import { createMemo, For, Index, type JSX, Show } from 'solid-js'

import './null.css'
import type { OverlaidAncestor, OverlaidCardsProps } from '../types'

import { buildRuns, FOCUS_COL_WIDTH, type RunTab } from './shared'

const CRUMB_HEIGHT = 34
const PAD = 12
const LEFT_STEP = 5
const TOP_STEP = 5
const FIELD_TOP_PAD = 10
const BOTTOM_PAD = 12

type GroupMeta = {
  panelIndex: number
  /** Flush with the panel card's left edge. */
  x: number
  /** Clip before the next column's run starts (undefined = last run). */
  maxWidth?: number
  tabs: RunTab[]
}

type EdgeCard = { key: string; x: number; y: number; zIndex: number }

type PanelCard = { x: number; y: number; zIndex: number; isLast: boolean }

const NullCards = <P,>(props: OverlaidCardsProps<P>): JSX.Element => {
  const layout = createMemo(() => {
    const { runs } = buildRuns(
      props.panels,
      props.gaps,
      props.title,
      props.panelKind,
      props.panelLabel,
    )

    let x = PAD
    let stair = 0
    let z = 0
    const edges: EdgeCard[] = []
    const panelPos = new Map<number, PanelCard>()
    const groups: GroupMeta[] = []

    for (const run of runs) {
      for (const tab of run.tabs) {
        if (!tab.card) continue
        edges.push({
          key: (tab as { ancestor: OverlaidAncestor }).ancestor.key,
          x,
          y: CRUMB_HEIGHT + FIELD_TOP_PAD + TOP_STEP * stair,
          zIndex: ++z,
        })
        x += LEFT_STEP
        stair++
      }
      panelPos.set(run.panelIndex, {
        x,
        y: CRUMB_HEIGHT + FIELD_TOP_PAD + TOP_STEP * stair,
        zIndex: ++z,
        isLast: run.panelIndex === props.panels.length - 1,
      })
      groups.push({ panelIndex: run.panelIndex, x, tabs: run.tabs })
      x += FOCUS_COL_WIDTH
      stair++
    }

    // Each run clips before the next column's run starts.
    for (let g = 0; g < groups.length - 1; g++) {
      groups[g]!.maxWidth = groups[g + 1]!.x - groups[g]!.x - 12
    }

    return { edges, panelPos, groups }
  })

  return (
    <div class="nl-cards nl-viewport" data-testid="stream-view">
      {/* -- Ancestor edge cards: bare hairline slivers -- */}
      <For each={layout().edges}>
        {(edge) => (
          <div
            class="nl-edge"
            style={{
              left: edge.x + 'px',
              top: edge.y + 'px',
              bottom: BOTTOM_PAD + 'px',
              'z-index': edge.zIndex,
            }}
          />
        )}
      </For>

      {/* -- Panel cards -- */}
      <For each={props.panels}>
        {(panel, i) => {
          const pos = () => layout().panelPos.get(i())
          const isLast = () => pos()?.isLast ?? i() === props.panels.length - 1
          return (
            <div
              class="nl-card"
              classList={{ 'nl-card-active': isLast() }}
              data-testid={
                props.panelKind(panel, i()) === 'navigation' ?
                  'stream-nav-column'
                : 'stream-focus-column'
              }
              style={{
                left: (pos()?.x ?? PAD) + 'px',
                top: (pos()?.y ?? CRUMB_HEIGHT + FIELD_TOP_PAD) + 'px',
                bottom: BOTTOM_PAD + 'px',
                'z-index': pos()?.zIndex ?? 1,
                ...(isLast() ? { right: PAD + 'px' } : { width: FOCUS_COL_WIDTH + 'px' }),
              }}
            >
              <div class="nl-card-inner">{props.renderPanel(panel, i())}</div>
            </div>
          )
        }}
      </For>

      {/* -- Margin tick on the active card (the accent quirk) -- */}
      <For each={props.panels}>
        {(_, i) => {
          const pos = () => layout().panelPos.get(i())
          return (
            <Show when={pos()?.isLast}>
              <div
                class="nl-tick"
                style={{
                  left: (pos()!.x ?? 0) - 14 + 'px',
                  top: pos()!.y + 21 + 'px',
                  'z-index': (pos()!.zIndex ?? 1) + 1,
                }}
              />
            </Show>
          )
        }}
      </For>

      {/* -- Per-column breadcrumb runs -- */}
      <div class="nl-crumb-layer" style={{ height: CRUMB_HEIGHT + 'px' }}>
        <For each={layout().groups}>
          {(group) => (
            <div
              class="nl-crumb-group"
              style={{
                left: group.x + 2 + 'px',
                ...(group.maxWidth != null ? { 'max-width': group.maxWidth + 'px' } : {}),
              }}
            >
              <Index each={group.tabs}>
                {(tab, j) => {
                  const t = () => tab()
                  const isTerminal = () => t().kind === 'panel' || t().kind === 'marker'
                  return (
                    <>
                      <Show when={j > 0}>
                        <span class="nl-sep" aria-hidden="true">
                          /
                        </span>
                      </Show>
                      <Show
                        when={!isTerminal()}
                        fallback={
                          <span class="nl-seg nl-seg-cur" data-testid="card-tab">
                            <Show when={t().kind === 'marker'}>
                              <span class="nl-dot" />
                            </Show>
                            {(t() as { label: string }).label}
                          </span>
                        }
                      >
                        <button
                          type="button"
                          class="nl-seg"
                          classList={{
                            // A navigation panel 0's title tab is its own
                            // column's terminal segment.
                            'nl-seg-cur': t().kind === 'title' && group.tabs.length === 1,
                          }}
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

export default NullCards
