import { createMemo, createSignal, For, onCleanup, onMount, Suspense } from 'solid-js'

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
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_NAV_PANELS = 4

// ---------------------------------------------------------------------------
// StreamView
// ---------------------------------------------------------------------------

const StreamView = (props: StreamViewProps) => {
  const [panels, setPanels] = createSignal<PanelState[]>([{ type: 'navigation' }])

  // Panel opening: called from a panel at `fromIndex` to open a focus panel
  // for the target row. If the source is a navigation panel, keep it and
  // replace everything after. If the source is a focus panel, replace it and
  // everything after with a new focus panel.
  const handleOpenFocus = (fromIndex: number, rowId: number, rowKey: Uint8Array) => {
    setPanels((prev) => {
      const source = prev[fromIndex]
      const keepCount = source?.type === 'navigation' ? fromIndex + 1 : fromIndex
      const next: PanelState[] = [...prev.slice(0, keepCount), { type: 'focus', rowId, rowKey }]

      // Enforce navigation panel limit: at most MAX_NAV_PANELS entries with
      // type 'navigation'. When exceeded, remove the leftmost navigation
      // panel and its associated focus panel (if any).
      let navCount = next.filter((p) => p.type === 'navigation').length
      while (navCount > MAX_NAV_PANELS) {
        const idx = next.findIndex((p) => p.type === 'navigation')
        if (idx === -1) break
        if (idx + 1 < next.length && next[idx + 1]!.type === 'focus') {
          next.splice(idx, 2)
        } else {
          next.splice(idx, 1)
        }
        navCount--
      }

      return next
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

  onMount(() => {
    document.addEventListener('keydown', handleKeyDown, { capture: true })
  })

  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown, { capture: true })
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
                      handleOpenFocus(i(), rowId, new Uint8Array(key))
                    }
                    focusedRowId={focusedRowForNav().get(i())}
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
                  onOpenFocus={(rowId, key) => handleOpenFocus(i(), rowId, new Uint8Array(key))}
                  onClose={() => handleClose(i())}
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
