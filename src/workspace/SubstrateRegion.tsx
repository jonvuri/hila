import { createEffect, createMemo, createSignal, For, Show, type Component } from 'solid-js'

import { getColumns, updateRow } from '../core/client/matrix-client'
import type { ColumnDefinition } from '../core/matrix'
import { useQuery } from '../sql/useQuery'
import { useRowData } from '../sql/useRowData'
import { buildTagsForRowQuery } from '../tags/tag-queries'
import { tagColorFromName, tagBadgeBackground } from '../tags/tag-color'
import { setHoveredAspect, clearHoveredAspect, isAspectHovered } from '../editor/aspect-tether'
import { PropertyRow } from '../shared/PropertyRow'

import { QueryBandsSection } from './QueryBand'
import SubTableBand from './SubTableBand'
import { RowGestureMenu, OwnerAffix, CoalescedHeader } from './row-gestures'

/**
 * Substrate region (Phase 9.7 Stage C; see context/Phase-9.7.md §3, §5).
 *
 * The convergence collapses the three former bands (aspect / query / sub-table)
 * into **one mode-dispatching region** driven by a node's child-sourcing mode:
 *
 *  - **loose** — the node's owned aspects (`#`-tag / `/attach` own-edges),
 *    rendered through the shared schema-adaptive `PropertyRow`. Editability is
 *    per-cell hydration computed uniformly — there is no per-band host-matrix
 *    scope (the §9.6 sharp edge is gone; the query is descoped, see
 *    `buildTagsForRowQuery`). Grouped into contiguous same-schema blocks whose
 *    column labels **coalesce** into one shared header (grid = coalescing, not a
 *    mode — §3).
 *  - **container** — a matrix bounded here (dedicated sub-tables), drawn with its
 *    border through the composed `TableFace` (the coalesced-grid rendering of a
 *    same-schema span). Owns the extent (matrix-axis cascade).
 *  - **view** — a persisted SQL block (owns nothing, the firewall). Per-cell
 *    editable where the query is recognized-updatable.
 *
 * This is the C1 increment: the *focus-panel* bands unify here. Folding block
 * content inline into the loose outline (NavigationPanel) is the C2 merge.
 *
 * New gestures ride on every related row that resolves to a `(matrix, row)`:
 * **portal** (mirror here), **move-owner** (relocate home here, leaving a
 * portal), and **two-tier delete** — detach (non-destructive) vs. the
 * confirmation-gated hard-delete-including-refs escalation (never the silent
 * default). See `RowGestureMenu`.
 */

type Focal = { matrixId: number; rowId: number }

// ---------------------------------------------------------------------------
// Loose mode — owned aspects (absorbs the former AspectBand)
// ---------------------------------------------------------------------------

type AspectDescriptor = {
  target_matrix_id: number
  target_row_id: number
  tag_type_name: string
}

type AspectBlock = { tagType: string; matrixId: number; items: AspectDescriptor[] }

/** Square type-badge bullet: type color background, first letter of the name. */
const TypeBadge: Component<{ typeName: string }> = (props) => (
  <div
    class="aspect-type-badge"
    data-testid="aspect-type-badge"
    title={`#${props.typeName}`}
    aria-label={`#${props.typeName}`}
    style={{
      width: '15px',
      height: '15px',
      'border-radius': '3px',
      background: tagColorFromName(props.typeName),
      color: '#fff',
      'font-size': '9px',
      'font-weight': 700,
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      'flex-shrink': 0,
      'user-select': 'none',
      'margin-top': '3px',
    }}
  >
    {props.typeName[0]?.toUpperCase() ?? '?'}
  </div>
)

const AspectRowItem: Component<{ matrixId: number; rowId: number }> = (props) => {
  const [columns, setColumns] = createSignal<ColumnDefinition[]>([])

  createEffect(() => {
    const mid = props.matrixId
    void getColumns(mid).then(setColumns)
  })

  const data = useRowData(
    () => props.matrixId,
    () => props.rowId,
  )

  return (
    <PropertyRow
      columns={columns()}
      data={data()}
      density="wide"
      onSave={(col, value) => void updateRow(props.matrixId, props.rowId, { [col]: value })}
    />
  )
}

/** Column defs for one block's matrix (for the coalesced header). */
const BlockHeader: Component<{ matrixId: number }> = (props) => {
  const [columns, setColumns] = createSignal<ColumnDefinition[]>([])
  createEffect(() => {
    void getColumns(props.matrixId).then(setColumns)
  })
  return <CoalescedHeader columns={columns()} />
}

const LooseRegion: Component<{
  focal: Focal
  /** "matrixId:rowId" keys of aspects anchored to an inline `#`-ref in the host
   *  prose. Those rows show a tether indicator and bridge to their badge. */
  contentAnchoredKeys?: Set<string>
}> = (props) => {
  const tagsQuery = createMemo(() =>
    buildTagsForRowQuery(props.focal.matrixId, props.focal.rowId),
  )
  const { result } = useQuery(() => tagsQuery())

  const aspects = createMemo<AspectDescriptor[]>(() => {
    const data = result()
    if (!data || data.length === 0) return []
    return data as unknown as AspectDescriptor[]
  })

  // Group into contiguous blocks by tag type (each block is one same-schema run).
  const blocks = createMemo<AspectBlock[]>(() => {
    const out: AspectBlock[] = []
    for (const a of aspects()) {
      const last = out[out.length - 1]
      if (last && last.tagType === a.tag_type_name) last.items.push(a)
      else out.push({ tagType: a.tag_type_name, matrixId: a.target_matrix_id, items: [a] })
    }
    return out
  })

  return (
    <Show when={aspects().length > 0}>
      <div
        class="focus-aspect-band"
        data-testid="focus-aspect-band"
        style={{
          'margin-bottom': '16px',
          display: 'flex',
          'flex-direction': 'column',
          gap: '6px',
        }}
      >
        <For each={blocks()}>
          {(block) => {
            const color = tagColorFromName(block.tagType)
            return (
              <div
                class="aspect-block substrate-block"
                data-testid="substrate-block"
                style={{
                  'border-left': `2px solid ${color}`,
                  'padding-left': '8px',
                  display: 'flex',
                  'flex-direction': 'column',
                  gap: '4px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    'align-items': 'center',
                    'justify-content': 'space-between',
                    gap: '8px',
                  }}
                >
                  <BlockHeader matrixId={block.matrixId} />
                  <OwnerAffix
                    label="owned here"
                    title="These aspects are owned by this node — deleting the node cascades them."
                  />
                </div>
                <For each={block.items}>
                  {(item) => {
                    const key = `${item.target_matrix_id}:${item.target_row_id}`
                    const target = {
                      matrixId: item.target_matrix_id,
                      rowId: item.target_row_id,
                    }
                    const anchored = () => props.contentAnchoredKeys?.has(key) ?? false
                    const hovered = () =>
                      isAspectHovered(item.target_matrix_id, item.target_row_id)
                    return (
                      <div
                        class="aspect-row"
                        data-testid="aspect-row"
                        onMouseEnter={() => anchored() && setHoveredAspect(target)}
                        onMouseLeave={() => anchored() && clearHoveredAspect(target)}
                        style={{
                          display: 'flex',
                          'align-items': 'flex-start',
                          gap: '8px',
                          'border-radius': '4px',
                          background: hovered() ? tagBadgeBackground(color) : 'transparent',
                          transition: 'background-color 0.12s',
                        }}
                      >
                        <TypeBadge typeName={block.tagType} />
                        <div style={{ flex: 1, 'min-width': 0 }}>
                          <AspectRowItem
                            matrixId={item.target_matrix_id}
                            rowId={item.target_row_id}
                          />
                        </div>
                        {/* Tether indicator: lit dot for aspects anchored to an
                            inline #-ref in the host prose; brightens on hover. */}
                        <Show when={anchored()}>
                          <span
                            class="aspect-tether-indicator"
                            data-testid="aspect-tether-indicator"
                            title="Anchored to an inline #tag in the content"
                            style={{
                              'align-self': 'center',
                              'flex-shrink': 0,
                              width: '6px',
                              height: '6px',
                              'border-radius': '50%',
                              background: color,
                              opacity: hovered() ? '1' : '0.35',
                              transition: 'opacity 0.12s',
                            }}
                          />
                        </Show>
                        <RowGestureMenu host={props.focal} target={target} />
                      </div>
                    )
                  }}
                </For>
              </div>
            )
          }}
        </For>
      </div>
    </Show>
  )
}

// ---------------------------------------------------------------------------
// SubstrateRegion — the three modes composed for a focal node
// ---------------------------------------------------------------------------

const SubstrateRegion: Component<{
  focalMatrixId: number
  focalRowId: number
  contentAnchoredKeys?: Set<string>
  onOpenRowRef: (matrixId: number, rowId: number) => void
}> = (props) => {
  const focal = createMemo<Focal>(() => ({
    matrixId: props.focalMatrixId,
    rowId: props.focalRowId,
  }))

  return (
    <div class="substrate-region" data-testid="substrate-region">
      {/* loose — owned aspects (per-cell editable; grid-coalesced; gestures) */}
      <LooseRegion focal={focal()} contentAnchoredKeys={props.contentAnchoredKeys} />

      {/* view — persisted SQL blocks (owns nothing; the firewall) */}
      <QueryBandsSection matrixId={props.focalMatrixId} rowId={props.focalRowId} />

      {/* container — dedicated sub-tables (matrix bounded here, with its border) */}
      <SubTableBand
        focalMatrixId={props.focalMatrixId}
        focalRowId={props.focalRowId}
        onOpenRowRef={props.onOpenRowRef}
      />
    </div>
  )
}

export default SubstrateRegion
