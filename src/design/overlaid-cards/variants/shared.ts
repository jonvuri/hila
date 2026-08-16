// ---------------------------------------------------------------------------
// Shared helpers for the session-4b OverlaidCards theme variants.
//
// Every variant renders the same underlying chain -- workspace title, gap
// ancestors, panels -- with a different physical expression. `buildRuns`
// resolves the props contract into per-panel "runs" (the column-locked tab
// groups all the variants share), and the ramp helpers turn ordered token
// lists into per-depth colors (Wipeout's hard brightness steps).
// ---------------------------------------------------------------------------

import type { GaugeOptions, NotchesOptions, OverlaidAncestor, ToplinesOptions } from '../types'

// ---------------------------------------------------------------------------
// Chain model
// ---------------------------------------------------------------------------

/**
 * One tab in a panel's column-locked group, in strip order.
 *   - `title`   : the workspace-title tab, leading panel 0's group. `card` is
 *     true when the title owns its own ancestor edge card (panel 0 is a focus
 *     panel, so the nav column it stands for is collapsed); false when panel 0
 *     is the navigation panel itself (the title tab IS that panel's tab).
 *   - `ancestor`: a collapsed gap level. Always carries a card.
 *   - `panel`   : a non-active panel's own tab -- carries its title
 *     (7b Resolution B). No card (the panel column is the card).
 *   - `marker`  : the active panel's tab -- no text in the Wipeout variants;
 *     Null/Ultramodern/gauge use its `label`.
 */
export type RunTab =
  | { kind: 'title'; ancestor: OverlaidAncestor; card: boolean }
  | { kind: 'ancestor'; ancestor: OverlaidAncestor; card: true }
  | { kind: 'panel'; label: string; card: false }
  | { kind: 'marker'; label: string; card: false }

export type PanelRun = {
  panelIndex: number
  /** Tabs in strip order: [title?] [ancestors...] [panel | marker]. */
  tabs: RunTab[]
  /** Leading tabs that own an ancestor edge card. */
  cardCount: number
}

export type RunsLayout = {
  runs: PanelRun[]
  /** Total ancestor edge cards across all runs (title card included). */
  totalCards: number
  /** Total tabs across all runs (the full chain length). */
  chainLength: number
}

export const buildRuns = <P>(
  panels: readonly P[],
  gaps: readonly (readonly OverlaidAncestor[])[],
  title: string,
  panelKind: (panel: P, index: number) => 'navigation' | 'focus',
  panelLabel?: (panel: P, index: number) => string,
): RunsLayout => {
  const runs: PanelRun[] = []
  let totalCards = 0
  let chainLength = 0

  for (let i = 0; i < panels.length; i++) {
    const tabs: RunTab[] = []
    const isNav = panelKind(panels[i]!, i) === 'navigation'
    if (i === 0) {
      tabs.push({
        kind: 'title',
        ancestor: { key: 'anc-title', label: title || 'Workspace', rowId: null },
        card: !isNav,
      })
    }
    for (const a of gaps[i] ?? []) {
      tabs.push({
        kind: 'ancestor',
        ancestor: {
          key: a.key,
          label: a.label || 'Untitled',
          rowId: a.rowId,
          matrixId: a.matrixId,
        },
        card: true,
      })
    }
    const cardCount = tabs.filter((t) => t.card).length
    const label = panelLabel?.(panels[i]!, i) ?? 'Untitled'
    if (i === panels.length - 1) {
      tabs.push({ kind: 'marker', label, card: false })
    } else if (!(i === 0 && isNav)) {
      tabs.push({ kind: 'panel', label, card: false })
    }
    runs.push({ panelIndex: i, tabs, cardCount })
    chainLength += tabs.length
    totalCards += cardCount
  }

  return { runs, totalCards, chainLength }
}

/**
 * Baseline offset (px above the field top) for tab `tabIndex` of the group
 * over panel `panelIndex`. Within a group baselines staircase down toward
 * focus; across groups the strip descends continuously, ending at 0 on the
 * active panel's marker.
 */
export const tabBaselineOffset = (
  step: number,
  panelCount: number,
  panelIndex: number,
  tabIndex: number,
  groupLength: number,
): number => step * (panelCount - 1 - panelIndex + (groupLength - 1 - tabIndex))

// ---------------------------------------------------------------------------
// Depth brightness ramps
// ---------------------------------------------------------------------------

/** Pick the ramp token for depth `i` of `total` (shallowest = ramp[0]). */
export const rampToken = (ramp: readonly string[], i: number, total: number): string => {
  if (ramp.length === 0) return 'line'
  const ratio = total <= 1 ? 1 : i / (total - 1)
  return ramp[Math.min(ramp.length - 1, Math.round(ratio * (ramp.length - 1)))]!
}

/** Resolve a Wipeout token name (e.g. 'line-2', 'ink-4') to its CSS var. */
export const woVar = (token: string): string => `var(--wo-${token})`

/** Wipeout ramp color for depth `i` of `total`. */
export const woRampColor = (ramp: readonly string[], i: number, total: number): string =>
  woVar(rampToken(ramp, i, total))

/** The border color a Wipeout tab renders with (see wipeout.css .wo-tab
 *  rules). Tab ticks and ancestor card ticks match it so tab + tick read as
 *  one continuous line. */
export const woTabBorderColor = (tab: RunTab): string => {
  switch (tab.kind) {
    case 'title':
      return 'var(--wo-invert-bg)'
    case 'ancestor':
      return 'var(--wo-line)'
    case 'panel':
      return 'var(--wo-ink-4)'
    case 'marker':
      return 'var(--wo-accent)'
  }
}

/** Two-digit mono level index ('00', '01', ...). */
export const levelIndex = (i: number): string => String(i).padStart(2, '0')

// ---------------------------------------------------------------------------
// Variant option defaults (latest prototype state)
// ---------------------------------------------------------------------------

/** Merge partial overrides over defaults, ignoring explicit `undefined`s
 *  (Storybook controls emit them; a plain spread would clobber defaults). */
export const withDefaults = <T extends object>(defaults: T, overrides?: Partial<T>): T => {
  const out = { ...defaults }
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined) (out as Record<string, unknown>)[key] = value
    }
  }
  return out
}

export const NOTCHES_DEFAULTS: NotchesOptions = {
  edgeMode: 'ticks',
  tabStaggerStep: 3,
  ancestorLeftStep: 5,
  ancestorTopStep: 3,
  tickLengthV: 12,
  tickLengthH: 16,
  tabTickLength: 10,
  cornerGap: 5,
  tabTicks: true,
  alignAncestorTicksToTabs: true,
  ancestorBottomTicks: false,
  panelBottomTicks: true,
  activeCorners: 'four',
  activeEdge: false,
  chamfer: 5,
  markerWidth: 18,
  markerHeight: 9,
  ramp: ['line-2', 'line', 'ink-4', 'ink-3'],
  tabMaxWidth: 190,
  displayFont: 'chakra-petch',
}

export const TOPLINES_DEFAULTS: ToplinesOptions = {
  staggerStep: 6,
  lineThickness: 1,
  ramp: ['line-2', 'line-2', 'line', 'ink-4'],
  tabMaxWidth: 190,
  displayFont: 'chakra-petch',
}

export const GAUGE_DEFAULTS: GaugeOptions = {
  railWidth: 208,
  ghostRows: 2,
  showNames: true,
  displayFont: 'chakra-petch',
}

// Shared layout constants (mirror the base renderers').
export const OUTER_PAD = 6
export const FOCUS_COL_WIDTH = 320
