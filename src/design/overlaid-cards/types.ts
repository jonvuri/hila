import type { JSX } from 'solid-js'

// ---------------------------------------------------------------------------
// OverlaidCards -- presentational data contract
//
// A stub-friendly model of the overlaid-cards stream layout, decoupled from
// SQLite/worker data. The wired `StreamView` feeds it live data; Storybook
// feeds it static fixtures. Mirrors the `Outline` (presentational) vs
// `NavigationPanel` (wired) split.
// ---------------------------------------------------------------------------

/**
 * Swappable renderer over one data contract (mirrors the `OutlineTheme` model).
 *   - `expanded-staircase`  : the live look -- one unfocused card + label tab
 *     per ancestor, fanned into a depth staircase of edge lines.
 *   - `collapsed-breadcrumb`: space-saving concept -- each gap collapses to a
 *     single card whose tab renders its ancestors as an inline `a / b / c`
 *     breadcrumb trail (segments individually clickable).
 *
 * Phase 10 session 4b theme variants (Storybook-only exploration; the live
 * `StreamView` stays on `expanded-staircase`):
 *   - `wipeout-notches` : OC-A1 + OC-A3 -- column-locked instrument-strip tabs,
 *     card chrome dialable from full edges down to disconnected ticks.
 *   - `wipeout-toplines`: OC-A2 -- no vertical edges; each tab extends its
 *     baseline leftward as a 1px line (nested terraced card-tops).
 *   - `wipeout-gauge`   : OC-B -- fixed left rail rendering the whole chain as
 *     a vertical depth ladder; columns carry only a level index.
 *   - `null`            : per catalog N5b -- per-column breadcrumb runs over
 *     plain hairline-bordered surface cards.
 *   - `ultramodern`     : per catalog U5b -- glass panes at altitudes with
 *     column-locked pill groups.
 */
export type OverlaidCardsTheme =
  | 'expanded-staircase'
  | 'collapsed-breadcrumb'
  | 'wipeout-notches'
  | 'wipeout-toplines'
  | 'wipeout-gauge'
  | 'null'
  | 'ultramodern'

/** Display-voice font stack for the Wipeout variants. */
export type WipeoutDisplayFont = 'chakra-petch' | 'orbitron'

/** Card-chrome grade for the notches variant: full edge lines (OC-A1) vs
 *  disconnected ticks (OC-A3). */
export type NotchesEdgeMode = 'lines' | 'ticks'

/**
 * Options for the `wipeout-notches` variant. Every value that moved during
 * the session-4 prototyping is a dial here; defaults match the latest
 * prototype state (see `NOTCHES_DEFAULTS` in variants/shared.ts).
 */
export type NotchesOptions = {
  /** Master A1 <-> A3 dial. */
  edgeMode: NotchesEdgeMode
  /** Per-axis overrides of `edgeMode` (vertical ancestor/panel edges). */
  verticalEdges?: NotchesEdgeMode
  /** Per-axis overrides of `edgeMode` (panel top rules). */
  topEdges?: NotchesEdgeMode
  /** Tab baseline staircase, px per chain level. */
  tabStaggerStep: number
  /** Ancestor card left offset per level, px. */
  ancestorLeftStep: number
  /** Card top offset per level, px. */
  ancestorTopStep: number
  /** Vertical tick length, px. */
  tickLengthV: number
  /** Horizontal tick length, px. */
  tickLengthH: number
  /** Length of the tick thrown from a tab's bottom-left corner, px. */
  tabTickLength: number
  /** Inset before an open corner's point -- H and V ticks never meet. */
  cornerGap: number
  /** Bottom-left ticks on tabs. */
  tabTicks: boolean
  /** Ancestor top ticks start on their tab's baseline (the invisible line). */
  alignAncestorTicksToTabs: boolean
  /** Bottom ticks on ancestor cards (proto: off -- "has a floor" = "is open"). */
  ancestorBottomTicks: boolean
  /** Bottom ticks on panel cards (proto: on). */
  panelBottomTicks: boolean
  /** Active panel corner treatment: top corners only, four open corners, or
   *  3-corner brackets (TL reserved for the header). */
  activeCorners: 'top' | 'four' | 'brackets3'
  /** 2px accent left edge on the active panel. */
  activeEdge: boolean
  /** Title-tab corner cut, px. */
  chamfer: number
  /** Active-panel marker tab size, px. */
  markerWidth: number
  markerHeight: number
  /** Depth brightness ramp: ordered Wipeout token names (shallowest first),
   *  e.g. ['line-2', 'line', 'ink-4', 'ink-3']. */
  ramp: readonly string[]
  /** Tab max width before ellipsis, px. */
  tabMaxWidth: number
  displayFont: WipeoutDisplayFont
}

/** Options for the `wipeout-toplines` variant (OC-A2). */
export type ToplinesOptions = {
  /** Tab baseline staircase, px per chain level (proto: ~6; 3 smeared). */
  staggerStep: number
  /** Baseline line thickness, px. */
  lineThickness: number
  /** Depth brightness ramp (ordered Wipeout token names, shallowest first). */
  ramp: readonly string[]
  /** Tab max width before ellipsis, px. */
  tabMaxWidth: number
  displayFont: WipeoutDisplayFont
}

/** Options for the `wipeout-gauge` variant (OC-B). */
export type GaugeOptions = {
  /** Fixed rail width, px (proto: ~208). */
  railWidth: number
  /** Unlit VFD rows below the chain (depth not yet opened). */
  ghostRows: number
  /** Show level names in the rail (vs indices-only). */
  showNames: boolean
  displayFont: WipeoutDisplayFont
}

/** A single unfocused ancestor in the gap before a panel. `rowId === null`
 *  marks the workspace-title tab (leads panel 0's gap). `matrixId` identifies the
 *  ancestor's matrix so the stack can reopen the correct `(matrix_id, row_id)`
 *  panel across a boundary hop (Phase 9.5); omitted/undefined for the title tab. */
export type OverlaidAncestor = {
  key: string
  label: string
  rowId: number | null
  matrixId?: number
}

/**
 * Generic over the caller's panel type `P` so the panel-column `<For>` can key
 * on referentially-stable panel objects (preserving editor/component identity
 * across re-renders), exactly as the wired `StreamView` requires. Volatile
 * ancestor data is passed separately in `gaps` (index-aligned) so it never
 * forces the panel columns to rebuild.
 */
export type OverlaidCardsProps<P> = {
  /** Stable, ordered panels. Item identity drives panel-column reconciliation. */
  panels: readonly P[]
  /** Classify a panel for its test id / wrapper (content comes from `renderPanel`). */
  panelKind: (panel: P, index: number) => 'navigation' | 'focus'
  /** Ancestors missing before each panel, index-aligned with `panels`. */
  gaps: readonly (readonly OverlaidAncestor[])[]
  /** Workspace title for the lead tab on panel 0's gap. */
  title: string
  /** Render a panel's content (live component or Storybook stub). */
  renderPanel: (panel: P, index: number) => JSX.Element
  /** Clicking an ancestor tab. `panelIndex` is the panel the gap precedes. */
  onAncestorClick?: (panelIndex: number, ancestor: OverlaidAncestor) => void
  /** Which renderer to use. Defaults to `'expanded-staircase'` (the live look). */
  theme?: OverlaidCardsTheme
  /** Panel title for renderers whose tab layer carries panel names (all the
   *  session-4b variants -- Resolution B tabs, crumbs, pills, gauge rows).
   *  Unused by the two original renderers. */
  panelLabel?: (panel: P, index: number) => string
  /** Per-variant dials; each applies only when `theme` selects that variant. */
  notchesOptions?: Partial<NotchesOptions>
  toplinesOptions?: Partial<ToplinesOptions>
  gaugeOptions?: Partial<GaugeOptions>
}
