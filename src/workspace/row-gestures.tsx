import { createMemo, createSignal, For, Show, type Component } from 'solid-js'

import {
  addPortal,
  removePortal,
  moveOwner,
  deleteHomeGhostingPortals,
  hardDeleteIncludingRefs,
} from '../core/client/matrix-client'
import type { ColumnDefinition } from '../core/matrix'
import { partitionPropertyColumns } from '../shared/property-surface'

/**
 * Shared substrate row gestures (Phase 9.7 Stage C; see context/Phase-9.7.md §5).
 *
 * The convergence's new gestures ride on every related row that resolves to a
 * `(matrix, row)` — whether it renders in the focus-panel substrate region
 * (SubstrateRegion) or inline in the loose outline (NavigationPanel). Extracted
 * here (from the C1 SubstrateRegion) so both surfaces mount one implementation:
 *
 *  - **portal** (mirror this row under `host`),
 *  - **move-owner** (relocate the home under `host`, leaving a portal behind),
 *  - **two-tier delete** — *detach* (`removePortal`, non-destructive) vs. the
 *    confirmation-gated *hard-delete-including-refs* escalation (never the
 *    silent default; the default delete ghosts surviving portals).
 *
 * `host` is the destination/parent the position-anchored gestures act against
 * (the focal node in the focus panel; the outline row's own-parent inline). When
 * a row has no host — a root-level loose outline row — those three gestures hide,
 * leaving only the target-only deletes.
 */

export type GestureRef = { matrixId: number; rowId: number }

const GestureButton: Component<{
  testid: string
  label: string
  danger?: boolean
  onClick: () => void
}> = (props) => (
  <button
    type="button"
    data-testid={props.testid}
    onClick={(e) => {
      e.stopPropagation()
      props.onClick()
    }}
    style={{
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      'text-align': 'left',
      'font-size': '12px',
      padding: '3px 6px',
      'border-radius': '3px',
      color: props.danger ? 'var(--danger, #d66)' : 'var(--text-dim)',
    }}
  >
    {props.label}
  </button>
)

/**
 * Dev-grade per-row gesture affordance. `host` is the destination context
 * (focal node / outline parent); `target` is the row the gesture acts on. The
 * escalation (hard delete) is confirmation-gated; the default delete ghosts
 * surviving portals.
 */
export const RowGestureMenu: Component<{ host?: GestureRef; target: GestureRef }> = (props) => {
  const [open, setOpen] = createSignal(false)

  const run = (fn: () => Promise<unknown>) => {
    setOpen(false)
    void fn().catch((e) => console.error('gesture failed', e))
  }

  return (
    <span style={{ position: 'relative', 'flex-shrink': 0 }}>
      <button
        type="button"
        class="substrate-gesture-toggle"
        data-testid="substrate-gesture-toggle"
        aria-label="Row actions"
        title="Row actions (portal, move-owner, delete)"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          'font-size': '14px',
          padding: '0 4px',
          'line-height': '1',
        }}
      >
        ⋯
      </button>
      <Show when={open()}>
        <div
          class="substrate-gesture-menu"
          data-testid="substrate-gesture-menu"
          style={{
            position: 'absolute',
            right: '0',
            top: '18px',
            'z-index': 20,
            background: 'var(--card-focused-bg, #1b1e27)',
            border: '1px solid hsl(230, 15%, 22%)',
            'border-radius': '4px',
            padding: '4px',
            display: 'flex',
            'flex-direction': 'column',
            gap: '2px',
            'min-width': '160px',
            'box-shadow': '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          {/* Position-anchored gestures need a destination host. A root-level
              loose outline row has none, so they hide there. */}
          <Show when={props.host}>
            {(host) => (
              <>
                <GestureButton
                  testid="substrate-gesture-portal"
                  label="Portal here"
                  onClick={() => run(() => addPortal(host(), props.target))}
                />
                <GestureButton
                  testid="substrate-gesture-move-owner"
                  label="Move home here"
                  onClick={() => run(() => moveOwner(props.target, host()))}
                />
                <GestureButton
                  testid="substrate-gesture-detach"
                  label="Detach from here"
                  onClick={() => run(() => removePortal(host(), props.target))}
                />
              </>
            )}
          </Show>
          <GestureButton
            testid="substrate-gesture-delete"
            label="Delete (ghost mirrors)"
            onClick={() =>
              run(() => deleteHomeGhostingPortals(props.target.matrixId, props.target.rowId))
            }
          />
          <GestureButton
            testid="substrate-gesture-hard-delete"
            label="Delete everywhere…"
            danger
            onClick={() => {
              if (confirm('Hard-delete this row and every reference to it, everywhere?')) {
                run(() => hardDeleteIncludingRefs(props.target.matrixId, props.target.rowId))
              } else {
                setOpen(false)
              }
            }}
          />
        </div>
      </Show>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Owner-legibility affix — "what dies if I delete here"
// ---------------------------------------------------------------------------

export const OwnerAffix: Component<{ label: string; title: string }> = (props) => (
  <span
    class="substrate-owner-affix"
    data-testid="substrate-owner-affix"
    title={props.title}
    style={{
      'font-size': '9px',
      'font-weight': 600,
      'letter-spacing': '0.4px',
      'text-transform': 'uppercase',
      color: 'var(--c-fg-3, #888)',
      'user-select': 'none',
    }}
  >
    {props.label}
  </span>
)

// ---------------------------------------------------------------------------
// Coalesced grid header — a same-schema run hoists its column labels up
// ---------------------------------------------------------------------------

/** The field column names of a same-schema block, hoisted to one shared header
 *  (grid coalescing — §3). Empty when the block has no non-label field columns. */
export const CoalescedHeader: Component<{ columns: ColumnDefinition[] }> = (props) => {
  const fieldNames = createMemo(() =>
    partitionPropertyColumns(props.columns).fields.map((c) => c.name),
  )
  return (
    <Show when={fieldNames().length > 0}>
      <div
        class="substrate-grid-header"
        data-testid="substrate-grid-header"
        style={{
          display: 'flex',
          'flex-wrap': 'wrap',
          gap: '6px 16px',
          'padding-left': '23px',
          'margin-bottom': '2px',
        }}
      >
        <For each={fieldNames()}>
          {(name) => (
            <span
              style={{
                'font-size': '9px',
                'font-weight': 600,
                'letter-spacing': '0.4px',
                'text-transform': 'uppercase',
                color: 'var(--c-fg-3, #888)',
              }}
            >
              {name}
            </span>
          )}
        </For>
      </div>
    </Show>
  )
}
