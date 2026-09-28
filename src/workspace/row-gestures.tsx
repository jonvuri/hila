import { createMemo, createSignal, For, Show, type Component } from 'solid-js'

import {
  addPortal,
  removePortal,
  moveOwner,
  deleteHomeGhostingPortals,
  hardDeleteIncludingRefs,
  deleteTagType,
} from '../core/client/matrix-client'
import type { ColumnDefinition } from '../core/matrix'
import { partitionPropertyColumns } from '../shared/property-surface'

import styles from './row-gestures.module.css'

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
 *  - **two-tier delete** for ordinary rows — *detach* (`removePortal`,
 *    non-destructive) vs. the confirmation-gated *hard-delete-including-refs*
 *    escalation. Promoted types instead use the confirmed type deletion that
 *    drops their owned matrix.
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
    class={styles.gestureButton}
    data-danger={props.danger ? 'true' : undefined}
    onClick={(e) => {
      e.stopPropagation()
      props.onClick()
    }}
  >
    {props.label}
  </button>
)

/**
 * Dev-grade per-row gesture affordance. `host` is the destination context
 * (focal node / outline parent); `target` is the row the gesture acts on. The
 * Ordinary rows keep the portal-aware two-tier delete. Promoted types use their
 * type-aware, confirmation-gated cascade.
 */
export const RowGestureMenu: Component<{
  host?: GestureRef
  target: GestureRef
  isTypeNode?: boolean
}> = (props) => {
  const [open, setOpen] = createSignal(false)

  const run = (fn: () => Promise<unknown>) => {
    setOpen(false)
    void fn().catch((e) => console.error('gesture failed', e))
  }

  return (
    <span class={styles.menuRoot}>
      <button
        type="button"
        class={styles.toggle}
        data-testid="substrate-gesture-toggle"
        aria-label="Row actions"
        title="Row actions (portal, move-owner, delete)"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
      >
        ⋯
      </button>
      <Show when={open()}>
        <div class={styles.menu} data-testid="substrate-gesture-menu">
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
          <Show
            when={props.isTypeNode}
            fallback={
              <>
                <GestureButton
                  testid="substrate-gesture-delete"
                  label="Delete (ghost mirrors)"
                  onClick={() =>
                    run(() =>
                      deleteHomeGhostingPortals(props.target.matrixId, props.target.rowId),
                    )
                  }
                />
                <GestureButton
                  testid="substrate-gesture-hard-delete"
                  label="Delete everywhere…"
                  danger
                  onClick={() => {
                    if (
                      confirm('Hard-delete this row and every reference to it, everywhere?')
                    ) {
                      run(() =>
                        hardDeleteIncludingRefs(props.target.matrixId, props.target.rowId),
                      )
                    } else {
                      setOpen(false)
                    }
                  }}
                />
              </>
            }
          >
            <GestureButton
              testid="substrate-gesture-delete-type"
              label="Delete type…"
              danger
              onClick={() => {
                if (
                  confirm('Delete this type? Its table and every row in it will be deleted.')
                ) {
                  run(() => deleteTagType(props.target.rowId))
                } else {
                  setOpen(false)
                }
              }}
            />
          </Show>
        </div>
      </Show>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Owner-legibility affix — "what dies if I delete here"
// ---------------------------------------------------------------------------

export const OwnerAffix: Component<{ label: string; title: string }> = (props) => (
  <span class={styles.ownerAffix} data-testid="substrate-owner-affix" title={props.title}>
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
      <div class={styles.gridHeader} data-testid="substrate-grid-header">
        <For each={fieldNames()}>{(name) => <span class={styles.gridLabel}>{name}</span>}</For>
      </div>
    </Show>
  )
}
