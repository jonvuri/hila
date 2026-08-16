// ---------------------------------------------------------------------------
// WipeoutGauge -- OC-B, the depth gauge (session 4b).
//
// Hierarchy as an instrument readout: a fixed left rail renders the whole
// chain as a vertical ladder -- one row per level (2-digit mono index + cell
// + mono uppercase name). Cell states: narrow dim = collapsed ancestor,
// wide = open panel, wide accent = active panel, ghost (unlit, no name) =
// depth not yet opened (the VFD move). Gauge rows are click targets
// (ancestor-tab semantics).
//
// Columns carry no ancestry chrome -- only a mono level index in the panel
// header pointing back at the gauge; the active header gets an accent index
// + flag. Collapsed levels cost zero horizontal space in the field.
//
// Noted future idea (do not build): a collapsed micro-gauge riding the shell
// status strip.
// ---------------------------------------------------------------------------

import { createMemo, For, type JSX, Show } from 'solid-js'

import './wipeout.css'
import type { GaugeOptions, OverlaidAncestor, OverlaidCardsProps } from '../types'

import { buildRuns, GAUGE_DEFAULTS, levelIndex, withDefaults } from './shared'

type GaugeRow =
  | {
      kind: 'ancestor'
      index: number
      label: string
      panelIndex: number
      ancestor: OverlaidAncestor
    }
  | { kind: 'panel'; index: number; label: string; panelIndex: number; isActive: boolean }
  | { kind: 'ghost'; index: number }

const WipeoutGauge = <P,>(props: OverlaidCardsProps<P>): JSX.Element => {
  const opts = createMemo((): GaugeOptions => withDefaults(GAUGE_DEFAULTS, props.gaugeOptions))

  const layout = createMemo(() => {
    const o = opts()
    const { runs, chainLength } = buildRuns(
      props.panels,
      props.gaps,
      props.title,
      props.panelKind,
      props.panelLabel,
    )

    const rows: GaugeRow[] = []
    const panelLevel = new Map<number, number>()
    let index = 0
    for (const run of runs) {
      for (const tab of run.tabs) {
        if (tab.kind === 'title' && !tab.card) {
          // Panel 0 is the navigation panel; the title tab IS its tab, so its
          // gauge row reads as an open panel (wide cell), not a collapsed level.
          rows.push({
            kind: 'panel',
            index,
            label: tab.ancestor.label,
            panelIndex: run.panelIndex,
            isActive: run.panelIndex === props.panels.length - 1,
          })
          panelLevel.set(run.panelIndex, index)
          index++
        } else if (tab.kind === 'title' || tab.kind === 'ancestor') {
          rows.push({
            kind: 'ancestor',
            index,
            label: tab.ancestor.label,
            panelIndex: run.panelIndex,
            ancestor: tab.ancestor,
          })
          index++
        } else {
          rows.push({
            kind: 'panel',
            index,
            label: tab.label,
            panelIndex: run.panelIndex,
            isActive: tab.kind === 'marker',
          })
          panelLevel.set(run.panelIndex, index)
          index++
        }
      }
      // A navigation panel 0 has no panel tab of its own (the title covers
      // it); its gauge row is that title row.
      if (!panelLevel.has(run.panelIndex)) {
        panelLevel.set(run.panelIndex, index - run.tabs.length)
      }
    }
    for (let g = 0; g < o.ghostRows; g++) {
      rows.push({ kind: 'ghost', index: index++ })
    }

    return { o, rows, panelLevel, chainLength }
  })

  return (
    <div
      class="wo-cards wo-gauge-viewport"
      classList={{ 'wo-font-orbitron': layout().o.displayFont === 'orbitron' }}
      data-testid="stream-view"
    >
      {/* -- The gauge rail -- */}
      <div class="wo-gauge-rail" style={{ width: layout().o.railWidth + 'px' }}>
        <div class="wo-gauge-head">Depth · {levelIndex(layout().chainLength)} levels</div>
        <For each={layout().rows}>
          {(row) => (
            <div
              class="wo-gauge-row"
              classList={{ 'wo-gauge-row-ghost': row.kind === 'ghost' }}
            >
              <span class="wo-gauge-idx">{levelIndex(row.index)}</span>
              <span
                class="wo-gauge-cell"
                classList={{
                  'wo-gauge-cell-on': row.kind === 'ancestor',
                  'wo-gauge-cell-panel': row.kind === 'panel' && !row.isActive,
                  'wo-gauge-cell-hot': row.kind === 'panel' && row.isActive,
                }}
              />
              <Show when={layout().o.showNames && row.kind !== 'ghost'}>
                <Show
                  when={row.kind === 'ancestor'}
                  fallback={
                    <span
                      class="wo-gauge-name"
                      classList={{
                        'wo-gauge-name-panel':
                          row.kind === 'panel' && !(row as { isActive: boolean }).isActive,
                        'wo-gauge-name-hot':
                          row.kind === 'panel' && (row as { isActive: boolean }).isActive,
                      }}
                    >
                      {(row as { label: string }).label}
                    </span>
                  }
                >
                  <button
                    type="button"
                    class="wo-gauge-name"
                    data-testid="card-tab"
                    onClick={() => {
                      const r = row as {
                        panelIndex: number
                        ancestor: OverlaidAncestor
                      }
                      props.onAncestorClick?.(r.panelIndex, r.ancestor)
                    }}
                  >
                    {(row as { label: string }).label}
                  </button>
                </Show>
              </Show>
            </div>
          )}
        </For>
      </div>

      {/* -- Panel columns: no ancestry chrome, just the level index -- */}
      <div class="wo-gauge-panels">
        <For each={props.panels}>
          {(panel, i) => {
            const isLast = () => i() === props.panels.length - 1
            return (
              <div
                class="wo-gauge-col"
                classList={{ 'wo-gauge-col-active': isLast() }}
                data-testid={
                  props.panelKind(panel, i()) === 'navigation' ?
                    'stream-nav-column'
                  : 'stream-focus-column'
                }
              >
                <div class="wo-gauge-phead">
                  <span class="wo-gauge-pidx">
                    {levelIndex(layout().panelLevel.get(i()) ?? 0)} ·
                  </span>
                  <Show when={isLast()}>
                    <span class="wo-gauge-pflag" />
                  </Show>
                </div>
                <div class="wo-gauge-body">{props.renderPanel(panel, i())}</div>
              </div>
            )
          }}
        </For>
      </div>
    </div>
  )
}

export default WipeoutGauge
