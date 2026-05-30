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
import { buildBreadcrumbQuery, buildMatrixTitleQuery } from './workspace-plugin'

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const keyToHex = (key: Uint8Array): string =>
  Array.from(key)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

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
  // Full ancestry query for the tab bar
  //
  // Fetches all ancestors of the leftmost panel's root key from the closure
  // table, providing labels for the unfocused ancestor tabs.
  // -----------------------------------------------------------------------

  const leftmostRootHex = createMemo(() => {
    const p = panels()
    if (p.length === 0) return null
    const first = p[0]!
    if (first.type === 'navigation' && first.rootKey) {
      return keyToHex(first.rootKey)
    }
    if (first.type === 'focus') {
      return keyToHex(first.rowKey)
    }
    return null
  })

  const ancestryQuery = createMemo(() => {
    const hex = leftmostRootHex()
    if (!hex) return ''
    return buildBreadcrumbQuery(props.matrixId, hex)
  })

  const { result: ancestryResult } = useQuery(() => ancestryQuery())

  const ancestors = createMemo((): AncestorData[] => {
    const data = ancestryResult()
    if (!data) return []
    return data as unknown as AncestorData[]
  })

  // Matrix title query (for root ancestor tab and UI)
  const matrixTitleQuery = createMemo(() => buildMatrixTitleQuery(props.matrixId))
  const { result: matrixTitleResult } = useQuery(() => matrixTitleQuery())
  const matrixTitle = createMemo(
    () => (matrixTitleResult()?.[0] as { title: string } | undefined)?.title ?? '',
  )

  // Combined tab entries: workspace title (when ancestors exist) + row ancestors.
  // Each entry is a label string. This drives both the unfocused card layers and
  // the tab labels, keeping the positioning math consistent.
  const tabLabels = createMemo((): string[] => {
    const rowAncestors = ancestors()
    if (rowAncestors.length === 0) return []
    const title = matrixTitle() || 'Workspace'
    return [title, ...rowAncestors.map((a) => extractTextFromPmDoc(a.label) || 'Untitled')]
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

  const positionTabs = () => {
    if (!tabLayerRef) return
    const tabs = tabLayerRef.querySelectorAll<HTMLElement>('.card-tab')
    let cursor = OUTER_PAD + 4
    tabs.forEach((tab, i) => {
      const cardLeft = OUTER_PAD + i * ANCESTOR_LEFT_STEP
      const tabLeft = Math.max(cardLeft + 4, cursor)
      tab.style.left = tabLeft + 'px'
      cursor = tabLeft + tab.offsetWidth + 5
    })
  }

  createEffect(() => {
    // Re-position tabs whenever tab labels change
    tabLabels() // track dependency
    requestAnimationFrame(positionTabs)
  })

  return (
    <div ref={viewRef} class="card-viewport" data-testid="stream-view">
      <Suspense
        fallback={<div style={{ padding: '16px', color: 'var(--text-muted)' }}>Loading…</div>}
      >
        {/* -- Unfocused ancestor cards (border-only layers) -- */}
        <For each={tabLabels()}>
          {(_label, i) => {
            const uc = () => tabLabels().length
            return (
              <div
                class="card"
                data-testid="card-ancestor"
                style={{
                  left: OUTER_PAD + i() * ANCESTOR_LEFT_STEP + 'px',
                  top: TAB_AREA + i() * ANCESTOR_TOP_STEP + 'px',
                  'z-index': i() + 1,
                  background: ancestorSurfaceColor(i()),
                  'border-left': `${BORDER_WIDTH}px solid ${ancestorBorderColor(i(), uc())}`,
                  'border-top': `${BORDER_WIDTH}px solid ${ancestorBorderColor(i(), uc())}`,
                }}
              />
            )
          }}
        </For>

        {/* -- Focused cards (content panels) -- */}
        <For each={panels()}>
          {(panel, i) => {
            const uc = () => tabLabels().length
            const fc = () => panels().length
            const isLast = () => i() === fc() - 1

            const cardLeft = () => OUTER_PAD + uc() * ANCESTOR_LEFT_STEP + i() * FOCUS_COL_WIDTH
            const cardTop = () => TAB_AREA + uc() * ANCESTOR_TOP_STEP + i() * FOCUS_TOP_STEP

            if (panel.type === 'navigation') {
              return (
                <div
                  class="card"
                  data-testid="stream-nav-column"
                  style={{
                    left: cardLeft() + 'px',
                    top: cardTop() + 'px',
                    'z-index': uc() + i() + 1,
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
                  left: cardLeft() + 'px',
                  top: cardTop() + 'px',
                  'z-index': uc() + i() + 1,
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
        <Show when={tabLabels().length > 0}>
          <div class="card-tab-layer" ref={tabLayerRef}>
            <For each={tabLabels()}>
              {(label, i) => {
                const uc = () => tabLabels().length
                const cardTop = () => TAB_AREA + i() * ANCESTOR_TOP_STEP
                const color = () => ancestorBorderColor(i(), uc())
                const surf = () => ancestorSurfaceColor(i())
                const tabPad = Math.round(TAB_HEIGHT * 0.4)
                const tabRadius = Math.round(TAB_HEIGHT * 0.2)

                return (
                  <div
                    class="card-tab"
                    data-testid="card-tab"
                    style={{
                      '--bw': BORDER_WIDTH + 'px',
                      top: cardTop() - TAB_HEIGHT + 'px',
                      height: TAB_HEIGHT + 'px',
                      padding: `0 ${tabPad}px`,
                      'border-width': BORDER_WIDTH + 'px',
                      'border-style': 'solid',
                      'border-color': color(),
                      'border-bottom-width': '0',
                      'border-radius': `${tabRadius}px ${tabRadius}px 0 0`,
                      background: surf(),
                      color: ancestorTextColor(i(), uc()),
                    }}
                  >
                    {label}
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
