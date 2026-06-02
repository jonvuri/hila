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
 */
export type OverlaidCardsTheme = 'expanded-staircase' | 'collapsed-breadcrumb'

/** A single unfocused ancestor in the gap before a panel. `rowId === null`
 *  marks the workspace-title tab (leads panel 0's gap). */
export type OverlaidAncestor = {
  key: string
  label: string
  rowId: number | null
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
}
