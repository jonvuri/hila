// ---------------------------------------------------------------------------
// StreamView -- Overlaid cards layout
//
// Renders the workspace as a stack of overlapping cards:
//   - Unfocused ancestor cards: visible only as left/top border strips with
//     file-folder label tabs, fading into the void background
//   - Focused cards: full content columns arranged left-to-right, each child
//     card overlaying the remainder of its parent after the visible column
//
// The ancestry tab bar replaces per-panel breadcrumbs, providing full context
// of the current location in the outline hierarchy.
// ---------------------------------------------------------------------------

import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
  Suspense,
} from 'solid-js'

import { execQuery } from '../core/client/sql-client'
import { useQuery } from '../sql/useQuery'
import { extractTextFromPmDoc } from '../editor/pm-text'

import NavigationPanel from './NavigationPanel'
import FocusPanel from './FocusPanel'
import { buildAncestryForRowsQuery, buildMatrixTitleQuery } from './workspace-plugin'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PanelState =
  | { type: 'navigation'; rootKey?: Uint8Array }
  | { type: 'focus'; rowId: number; rowKey: Uint8Array }

type StreamViewProps = {
  matrixId: number
  navigateToRowId?: number | null
  onNavigated?: () => void
}

type AncestorData = {
  key: Uint8Array
  row_id: number
  label: string
  depth: number
}

// Raw row from buildAncestryForRowsQuery: an ancestor of `for_row_id`.
type AncestorRow = AncestorData & { for_row_id: number }

// Unified layout model. Cards are laid out left-to-right in a single cumulative
// pass; ancestor cards are minimal border-strip layers (with a label tab),
// panel cards are full content columns.
type LayoutAncestor = {
  kind: 'ancestor'
  key: string
  label: string
  left: number
  top: number
  zIndex: number
  colorIndex: number
  isRunStart: boolean
}

type LayoutPanel = {
  kind: 'panel'
  panelIndex: number
  left: number
  top: number
  zIndex: number
  isLast: boolean
}

type LayoutCard = LayoutAncestor | LayoutPanel

// ---------------------------------------------------------------------------
// Card position helpers
//
// Unfocused cards form a tight staircase of border strips; focused cards
// each get a full content column width.
// ---------------------------------------------------------------------------

/** Compute border color for unfocused card at depth index `i` of `total` ancestors.
 *  Shallowest (i=0) fades into void (darkest); deepest is most prominent (lightest). */
const ancestorBorderColor = (i: number, total: number): string => {
  const darkL = 18 // --card-border-dark-l
  const lightL = 28 // --card-border-light-l
  const ratio = total <= 1 ? 1 : i / (total - 1)
  const l = darkL + ratio * (lightL - darkL)
  return `hsl(225, 16%, ${l.toFixed(1)}%)`
}

/** Compute surface color for unfocused card at depth index `i`.
 *  Progressively lighter from the void. */
const ancestorSurfaceColor = (i: number): string => {
  const baseL = 5 // --card-surface-base-l
  const stepL = 1.5 // --card-surface-step-l
  const l = baseL + i * stepL
  return `hsl(230, 18%, ${l.toFixed(1)}%)`
}

/** Tab text color: more prominent (lighter) for deeper tabs. */
const ancestorTextColor = (i: number, total: number): string => {
  const ratio = total <= 1 ? 1 : i / (total - 1)
  const l = 35 + ratio * 35
  return `hsl(225, 10%, ${l.toFixed(0)}%)`
}

// ---------------------------------------------------------------------------
// Layout constants (read from CSS custom properties at runtime would be ideal,
// but for positioning math we use the same values as the tokens)
// ---------------------------------------------------------------------------

const ANCESTOR_LEFT_STEP = 4 // --card-ancestor-left-step
const ANCESTOR_TOP_STEP = 2 // --card-ancestor-top-step
const FOCUS_COL_WIDTH = 320 // --card-focus-col-width
const FOCUS_TOP_STEP = 4 // --card-focus-top-step
const TAB_HEIGHT = 18 // --card-tab-height
const BORDER_WIDTH = 0.5 // --card-border-width
const OUTER_PAD = 6 // --card-outer-pad
const TAB_AREA = TAB_HEIGHT + 12 // --card-tab-area

const MAX_COLUMNS = 4

// ---------------------------------------------------------------------------
// StreamView
// ---------------------------------------------------------------------------

const StreamView = (props: StreamViewProps) => {
  const [panels, setPanels] = createSignal<PanelState[]>([{ type: 'navigation' }])

  const enforceColumnLimit = (next: PanelState[]): PanelState[] => {
    while (next.length > MAX_COLUMNS) {
      next.shift()
    }
    return next
  }

  const handleAppendAfter = (fromIndex: number, rowId: number, rowKey: Uint8Array) => {
    setPanels((prev) => {
      const next: PanelState[] = [
        ...prev.slice(0, fromIndex + 1),
        { type: 'focus', rowId, rowKey },
      ]
      return enforceColumnLimit(next)
    })
  }

  const handleReplaceAt = (fromIndex: number, rowId: number, rowKey: Uint8Array) => {
    setPanels((prev) => {
      const next: PanelState[] = [...prev.slice(0, fromIndex), { type: 'focus', rowId, rowKey }]
      return enforceColumnLimit(next)
    })
  }

  const handleClose = (fromIndex: number) => {
    setPanels((prev) => prev.slice(0, fromIndex))
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey && e.key === 'ArrowLeft' && panels().length > 1) {
      e.preventDefault()
      e.stopPropagation()
      setPanels((prev) => prev.slice(0, -1))
    }
  }

  const navigateToRow = async (rowId: number) => {
    const result = await execQuery(
      `SELECT key FROM rank WHERE matrix_id = ${props.matrixId} AND row_id = ${rowId}`,
    )
    if (result && result.length > 0) {
      const key = (result[0] as { key: Uint8Array }).key
      handleAppendAfter(0, rowId, new Uint8Array(key))
    }
  }

  createEffect(
    on(
      () => props.navigateToRowId,
      (rowId) => {
        if (rowId != null) {
          void navigateToRow(rowId)
          props.onNavigated?.()
        }
      },
    ),
  )

  let viewRef: HTMLDivElement | undefined

  const handleInlinerefNavigate = (e: Event) => {
    const detail = (e as CustomEvent<{ rowId: number }>).detail
    if (detail?.rowId != null) {
      e.stopPropagation()
      void navigateToRow(detail.rowId)
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeyDown, { capture: true })
    viewRef?.addEventListener('inlineref-navigate', handleInlinerefNavigate)
  })

  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown, { capture: true })
    viewRef?.removeEventListener('inlineref-navigate', handleInlinerefNavigate)
  })

  // -----------------------------------------------------------------------
  // Ancestry data
  //
  // Fetches the full ancestor chain for every focus panel's row in a single
  // query, grouped by row id. These chains drive the gap-before-each-panel
  // computation: the unfocused ancestor cards that fill in breadcrumb levels
  // missing between a panel and a deeper focus panel to its right.
  // -----------------------------------------------------------------------

  const focusRowIds = createMemo(() =>
    panels().flatMap((p) => (p.type === 'focus' ? [p.rowId] : [])),
  )

  const ancestryQuery = createMemo(() => {
    const ids = focusRowIds()
    if (ids.length === 0) return ''
    return buildAncestryForRowsQuery(props.matrixId, ids)
  })

  const { result: ancestryResult } = useQuery(() => ancestryQuery())

  // Group the flat ancestry rows by descendant row id into top-down chains
  // ([root..parent]); the query already orders each group by depth DESC.
  const ancestryByRow = createMemo((): Map<number, AncestorData[]> => {
    const map = new Map<number, AncestorData[]>()
    const data = ancestryResult() as unknown as AncestorRow[] | undefined
    if (!data) return map
    for (const r of data) {
      let arr = map.get(r.for_row_id)
      if (!arr) {
        arr = []
        map.set(r.for_row_id, arr)
      }
      arr.push({ key: r.key, row_id: r.row_id, label: r.label, depth: r.depth })
    }
    return map
  })

  // Matrix title query (for root ancestor tab and UI)
  const matrixTitleQuery = createMemo(() => buildMatrixTitleQuery(props.matrixId))
  const { result: matrixTitleResult } = useQuery(() => matrixTitleQuery())
  const matrixTitle = createMemo(
    () => (matrixTitleResult()?.[0] as { title: string } | undefined)?.title ?? '',
  )

  // -----------------------------------------------------------------------
  // Unified layout: a single cumulative left-to-right pass over the panels.
  //
  // For each panel we compute the "gap" of missing ancestors before it (its
  // ancestor chain sliced to exclude everything at or above the previous
  // panel's node), render those as minimal ancestor cards, then the panel's
  // content column. The workspace title leads panel 0's gap when non-empty.
  // -----------------------------------------------------------------------

  const layout = createMemo((): { cards: LayoutCard[]; totalAncestors: number } => {
    const ps = panels()
    const byRow = ancestryByRow()
    const title = matrixTitle() || 'Workspace'

    const cards: LayoutCard[] = []
    let left = OUTER_PAD
    let top = TAB_AREA
    let ancIdx = 0
    let z = 0

    for (let i = 0; i < ps.length; i++) {
      const panel = ps[i]!
      const chain = panel.type === 'focus' ? (byRow.get(panel.rowId) ?? []) : []

      const prev = i > 0 ? ps[i - 1]! : undefined
      const prevRowId = prev && prev.type === 'focus' ? prev.rowId : null

      let gap = chain
      if (prevRowId != null) {
        const idx = chain.findIndex((a) => a.row_id === prevRowId)
        gap = idx >= 0 ? chain.slice(idx + 1) : chain
      }

      const entries: { key: string; label: string }[] = gap.map((a) => ({
        key: `anc-${a.row_id}`,
        label: extractTextFromPmDoc(a.label) || 'Untitled',
      }))
      if (i === 0 && entries.length > 0) {
        entries.unshift({ key: 'anc-title', label: title })
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
          isRunStart: g === 0,
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
        isLast: i === ps.length - 1,
      })
      left += FOCUS_COL_WIDTH
      top += FOCUS_TOP_STEP
    }

    return { cards, totalAncestors: ancIdx }
  })

  const ancestorCards = createMemo(
    () => layout().cards.filter((c) => c.kind === 'ancestor') as LayoutAncestor[],
  )

  // Panel positions keyed by panel index, so the panel <For> can iterate the
  // stable panels() array (preserving component identity / editor state) while
  // still reading reactive positions from the layout.
  const panelPositions = createMemo(() => {
    const m = new Map<number, LayoutPanel>()
    for (const c of layout().cards) {
      if (c.kind === 'panel') m.set(c.panelIndex, c)
    }
    return m
  })

  // -----------------------------------------------------------------------
  // Panel → focused row mapping (for highlighting in nav panels)
  // -----------------------------------------------------------------------

  const focusedRowForNav = createMemo(() => {
    const p = panels()
    const map = new Map<number, number>()
    for (let idx = 0; idx < p.length; idx++) {
      if (p[idx]!.type === 'navigation') {
        const next = p[idx + 1]
        if (next?.type === 'focus') {
          map.set(idx, next.rowId)
        }
      }
    }
    return map
  })

  // -----------------------------------------------------------------------
  // Tab positioning: measure text widths and space tabs to avoid overlap
  // -----------------------------------------------------------------------

  let tabLayerRef: HTMLDivElement | undefined

  // Position each tab just above its own card, pushing right only to avoid
  // overlapping the previous tab within the same contiguous ancestor run.
  // A run boundary (a focus panel intervening) resets the cursor.
  const positionTabs = () => {
    if (!tabLayerRef) return
    const tabs = tabLayerRef.querySelectorAll<HTMLElement>('.card-tab')
    let cursor = 0
    tabs.forEach((tab) => {
      const cardLeft = Number(tab.dataset.cardLeft ?? '0')
      if (tab.dataset.runStart === 'true') cursor = 0
      const tabLeft = Math.max(cardLeft + 4, cursor)
      tab.style.left = tabLeft + 'px'
      cursor = tabLeft + tab.offsetWidth + 5
    })
  }

  createEffect(() => {
    // Re-position tabs whenever the layout changes
    layout() // track dependency
    requestAnimationFrame(positionTabs)
  })

  return (
    <div ref={viewRef} class="card-viewport" data-testid="stream-view">
      <Suspense
        fallback={<div style={{ padding: '16px', color: 'var(--text-muted)' }}>Loading…</div>}
      >
        {/* -- Unfocused ancestor cards (border-only layers) -- */}
        <For each={ancestorCards()}>
          {(card) => {
            const total = () => layout().totalAncestors
            return (
              <div
                class="card"
                data-testid="card-ancestor"
                style={{
                  left: card.left + 'px',
                  top: card.top + 'px',
                  'z-index': card.zIndex,
                  background: ancestorSurfaceColor(card.colorIndex),
                  'border-left': `${BORDER_WIDTH}px solid ${ancestorBorderColor(card.colorIndex, total())}`,
                  'border-top': `${BORDER_WIDTH}px solid ${ancestorBorderColor(card.colorIndex, total())}`,
                }}
              />
            )
          }}
        </For>

        {/* -- Focused cards (content panels) --
            Iterate the stable panels() array (preserving component identity and
            editor state) and read positions from the layout by panel index. */}
        <For each={panels()}>
          {(panel, i) => {
            const pos = () => panelPositions().get(i())
            const left = () => pos()?.left ?? OUTER_PAD
            const top = () => pos()?.top ?? TAB_AREA
            const zIndex = () => pos()?.zIndex ?? 1
            const isLast = () => pos()?.isLast ?? i() === panels().length - 1

            if (panel.type === 'navigation') {
              return (
                <div
                  class="card"
                  data-testid="stream-nav-column"
                  style={{
                    left: left() + 'px',
                    top: top() + 'px',
                    'z-index': zIndex(),
                    background: 'var(--card-focused-bg)',
                    'border-left': `${BORDER_WIDTH}px solid var(--card-focused-border)`,
                    'border-top': `${BORDER_WIDTH}px solid var(--card-focused-border)`,
                  }}
                >
                  <div
                    class={`card-inner${isLast() ? ' card-inner-full' : ''}`}
                    style={isLast() ? undefined : { width: FOCUS_COL_WIDTH + 'px' }}
                  >
                    <NavigationPanel
                      matrixId={props.matrixId}
                      rootKey={panel.rootKey}
                      onOpenFocus={(rowId, key) =>
                        handleAppendAfter(i(), rowId, new Uint8Array(key))
                      }
                      focusedRowId={focusedRowForNav().get(i())}
                    />
                  </div>
                </div>
              )
            }

            return (
              <div
                class="card"
                data-testid="stream-focus-column"
                style={{
                  left: left() + 'px',
                  top: top() + 'px',
                  'z-index': zIndex(),
                  background: 'var(--card-focused-bg)',
                  'border-left': `${BORDER_WIDTH}px solid var(--card-focused-border)`,
                  'border-top': `${BORDER_WIDTH}px solid var(--card-focused-border)`,
                }}
              >
                <div
                  class={`card-inner${isLast() ? ' card-inner-full' : ''}`}
                  style={isLast() ? undefined : { width: FOCUS_COL_WIDTH + 'px' }}
                >
                  <FocusPanel
                    matrixId={props.matrixId}
                    rowId={panel.rowId}
                    rowKey={panel.rowKey}
                    onAppendFocus={(rowId, key) =>
                      handleAppendAfter(i(), rowId, new Uint8Array(key))
                    }
                    onReplaceFocus={(rowId, key) =>
                      handleReplaceAt(i(), rowId, new Uint8Array(key))
                    }
                    onClose={() => handleClose(i())}
                  />
                </div>
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
                  <div
                    class="card-tab"
                    data-testid="card-tab"
                    data-card-left={card.left}
                    data-run-start={card.isRunStart}
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
                      background: ancestorSurfaceColor(card.colorIndex),
                      color: ancestorTextColor(card.colorIndex, total()),
                    }}
                  >
                    {card.label}
                  </div>
                )
              }}
            </For>
          </div>
        </Show>
      </Suspense>
    </div>
  )
}

export default StreamView
