import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Suspense,
} from 'solid-js'

import { execQuery } from '../core/client/sql-client'

import NavigationPanel from './NavigationPanel'
import FocusPanel from './FocusPanel'

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

  // Append a new focus panel after the panel at `fromIndex`, removing
  // everything to the right of it first.
  const handleAppendAfter = (fromIndex: number, rowId: number, rowKey: Uint8Array) => {
    setPanels((prev) => {
      const next: PanelState[] = [...prev.slice(0, fromIndex + 1), { type: 'focus', rowId, rowKey }]
      return enforceColumnLimit(next)
    })
  }

  // Replace the panel at `fromIndex` (and everything after) with a new focus panel.
  const handleReplaceAt = (fromIndex: number, rowId: number, rowKey: Uint8Array) => {
    setPanels((prev) => {
      const next: PanelState[] = [...prev.slice(0, fromIndex), { type: 'focus', rowId, rowKey }]
      return enforceColumnLimit(next)
    })
  }

  // Panel closing: remove the panel at `fromIndex` and everything after it.
  const handleClose = (fromIndex: number) => {
    setPanels((prev) => prev.slice(0, fromIndex))
  }

  // Cmd+Left / Meta+Left closes the rightmost panel (navigates back).
  // Uses capture phase to fire before ProseMirror editors.
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

  // External navigation via prop (e.g. tag browser → workspace)
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

  // Map from navigation-panel index → focused row ID (the rowId of the
  // adjacent focus panel, if one exists).
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

  return (
    <div
      ref={viewRef}
      class="stream-view"
      data-testid="stream-view"
      style={{
        display: 'flex',
        flex: 1,
        overflow: 'auto',
        height: '100%',
      }}
    >
      <Suspense fallback={<div style={{ padding: '16px', color: '#888' }}>Loading…</div>}>
        <For each={panels()}>
          {(panel, i) => {
            if (panel.type === 'navigation') {
              return (
                <div
                  class="stream-nav-column"
                  data-testid="stream-nav-column"
                  style={{
                    flex: 1,
                    overflow: 'auto',
                    'min-width': '300px',
                  }}
                >
                  <NavigationPanel
                    matrixId={props.matrixId}
                    rootKey={panel.rootKey}
                    onOpenFocus={(rowId, key) =>
                      handleAppendAfter(i(), rowId, new Uint8Array(key))
                    }
                    focusedRowId={focusedRowForNav().get(i())}
                    showBreadcrumb={true}
                  />
                </div>
              )
            }

            return (
              <div
                class="stream-focus-column"
                data-testid="stream-focus-column"
                style={{
                  flex: 1,
                  overflow: 'auto',
                  'min-width': '360px',
                }}
              >
                <FocusPanel
                  matrixId={props.matrixId}
                  rowId={panel.rowId}
                  rowKey={panel.rowKey}
                  onAppendFocus={(rowId, key) => handleAppendAfter(i(), rowId, new Uint8Array(key))}
                  onReplaceFocus={(rowId, key) => handleReplaceAt(i(), rowId, new Uint8Array(key))}
                  onClose={() => handleClose(i())}
                  showBreadcrumb={true}
                />
              </div>
            )
          }}
        </For>
      </Suspense>
    </div>
  )
}

export default StreamView
