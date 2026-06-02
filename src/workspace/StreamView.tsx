// ---------------------------------------------------------------------------
// StreamView -- wired overlaid-cards layout
//
// Owns the panel-stack state and the live data (ancestry chains, workspace
// title) for the workspace, and composes the presentational `OverlaidCards`
// component with that data. The card-stack rendering itself (layout pass,
// ancestor edge lines, tab layer, edge-fade visuals) lives in
// `src/design/overlaid-cards/OverlaidCards.tsx`; this mirrors the
// `Outline` (presentational) vs `NavigationPanel` (wired) split.
// ---------------------------------------------------------------------------

import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
  Suspense,
} from 'solid-js'

import { execQuery } from '../core/client/sql-client'
import { useQuery } from '../sql/useQuery'
import { extractTextFromPmDoc } from '../editor/pm-text'
import OverlaidCards from '../design/overlaid-cards/OverlaidCards'
import type { OverlaidAncestor } from '../design/overlaid-cards/OverlaidCards'

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

  // Clicking an ancestor tab focuses that ancestor: truncate the stack to the
  // panel the gap precedes and open a focus panel for the ancestor, mirroring
  // the right-arrow focus button. The title tab returns to the root nav panel.
  const handleAncestorClick = (panelIndex: number, ancestor: OverlaidAncestor) => {
    if (ancestor.rowId == null) {
      setPanels([{ type: 'navigation' }])
      return
    }
    const key = ancestorKeyById().get(ancestor.rowId)
    if (key) handleReplaceAt(panelIndex, ancestor.rowId, new Uint8Array(key))
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

  const handleInlinerefNavigate = (e: Event) => {
    const detail = (e as CustomEvent<{ rowId: number }>).detail
    if (detail?.rowId != null) {
      e.stopPropagation()
      void navigateToRow(detail.rowId)
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeyDown, { capture: true })
    document.addEventListener('inlineref-navigate', handleInlinerefNavigate)
  })

  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown, { capture: true })
    document.removeEventListener('inlineref-navigate', handleInlinerefNavigate)
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

  // Lookup from ancestor row id to its rank key (for ancestor-tab navigation).
  const ancestorKeyById = createMemo((): Map<number, Uint8Array> => {
    const m = new Map<number, Uint8Array>()
    for (const arr of ancestryByRow().values()) {
      for (const a of arr) m.set(a.row_id, a.key)
    }
    return m
  })

  // Matrix title query (for root ancestor tab and UI)
  const matrixTitleQuery = createMemo(() => buildMatrixTitleQuery(props.matrixId))
  const { result: matrixTitleResult } = useQuery(() => matrixTitleQuery())
  const matrixTitle = createMemo(
    () => (matrixTitleResult()?.[0] as { title: string } | undefined)?.title ?? '',
  )

  // -----------------------------------------------------------------------
  // Ancestor gaps: the missing breadcrumb levels before each panel.
  //
  // For each panel we slice its ancestor chain to exclude everything at or
  // above the previous panel's node, yielding the gap of ancestors rendered
  // as unfocused edge-line cards before it. Index-aligned with panels().
  // -----------------------------------------------------------------------

  const gaps = createMemo((): OverlaidAncestor[][] => {
    const ps = panels()
    const byRow = ancestryByRow()
    const result: OverlaidAncestor[][] = []

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

      result.push(
        gap.map((a) => ({
          key: `anc-${a.row_id}`,
          label: extractTextFromPmDoc(a.label) || 'Untitled',
          rowId: a.row_id,
        })),
      )
    }

    return result
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
  // Panel content slot
  // -----------------------------------------------------------------------

  const renderPanel = (panel: PanelState, index: number) => {
    if (panel.type === 'navigation') {
      return (
        <NavigationPanel
          matrixId={props.matrixId}
          rootKey={panel.rootKey}
          onOpenFocus={(rowId, key) => handleAppendAfter(index, rowId, new Uint8Array(key))}
          focusedRowId={focusedRowForNav().get(index)}
        />
      )
    }

    return (
      <FocusPanel
        matrixId={props.matrixId}
        rowId={panel.rowId}
        rowKey={panel.rowKey}
        active={index === panels().length - 1}
        onAppendFocus={(rowId, key) => handleAppendAfter(index, rowId, new Uint8Array(key))}
        onReplaceFocus={(rowId, key) => handleReplaceAt(index, rowId, new Uint8Array(key))}
        onCollapse={() => handleClose(index + 1)}
        onClose={() => handleClose(index)}
      />
    )
  }

  return (
    <Suspense
      fallback={
        <div class="card-viewport" style={{ padding: '16px', color: 'var(--text-muted)' }}>
          Loading…
        </div>
      }
    >
      {/* The live app stays on the default `expanded-staircase` theme. A second
          `collapsed-breadcrumb` renderer exists as a Storybook concept (Phase
          7b stage 5); to adopt it here later, pass `theme="collapsed-breadcrumb"`
          -- the data contract and `onAncestorClick` wiring are unchanged. */}
      <OverlaidCards
        panels={panels()}
        panelKind={(panel) => (panel.type === 'navigation' ? 'navigation' : 'focus')}
        gaps={gaps()}
        title={matrixTitle() || 'Workspace'}
        renderPanel={renderPanel}
        onAncestorClick={handleAncestorClick}
      />
    </Suspense>
  )
}

export default StreamView
