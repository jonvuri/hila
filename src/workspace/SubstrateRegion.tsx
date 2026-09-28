import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Show,
  type Component,
  type JSX,
} from 'solid-js'

import { getColumns, getFaceConfigForMatrix } from '../core/client/matrix-client'
import { resolveFaceAffinity } from '../core/face-affinity'
import { FaceHostSlot } from '../core/face-runtime'
import type { LooseSubject } from '../core/face-types'
import type { ColumnDefinition } from '../core/matrix'
import { useQuery } from '../sql/useQuery'
import { buildTagsForRowQuery } from '../tags/tag-queries'
import { tagColorFromName, tagBadgeBackground } from '../tags/tag-color'
import { setHoveredAspect, clearHoveredAspect, isAspectHovered } from '../editor/aspect-tether'
import { PropertyLine } from '../shared/PropertyLine'

import { QueryBandsSection } from './QueryBand'
import SubTableBand from './SubTableBand'
import { RowGestureMenu, OwnerAffix, CoalescedHeader } from './row-gestures'
import type { RenderSubjectCollection } from './focus-subject'
import styles from './SubstrateRegion.module.css'

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
    class={styles.typeBadge}
    data-testid="aspect-type-badge"
    title={`#${props.typeName}`}
    aria-label={`#${props.typeName}`}
    style={{ '--aspect-color': tagColorFromName(props.typeName) } as JSX.CSSProperties}
  >
    {props.typeName[0]?.toUpperCase() ?? '?'}
  </div>
)

const AspectRowItem: Component<{
  rootMatrixId: number
  matrixId: number
  rowId: number
}> = (props) => {
  const [config] = createResource(() => props.matrixId, getFaceConfigForMatrix)
  const subject = createMemo<LooseSubject>(() => ({
    mode: 'loose',
    matrixId: props.matrixId,
    rowId: props.rowId,
  }))

  return (
    <FaceHostSlot
      host="focus-panel-aspect"
      kind="line"
      subject={subject()}
      affinity={resolveFaceAffinity(config())}
      rootMatrixId={props.rootMatrixId}
      density="wide"
      services={{}}
      substrate={<PropertyLine matrixId={props.matrixId} rowId={props.rowId} density="wide" />}
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
  rootMatrixId: number
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
      <div class={styles.looseRegion} data-testid="focus-aspect-band">
        <For each={blocks()}>
          {(block) => {
            const color = tagColorFromName(block.tagType)
            return (
              <div
                class={styles.aspectBlock}
                data-testid="substrate-block"
                style={{ '--aspect-color': color } as JSX.CSSProperties}
              >
                <div class={styles.blockHeader}>
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
                        class={styles.aspectRow}
                        data-testid="aspect-row"
                        data-hovered={hovered() ? 'true' : undefined}
                        onMouseEnter={() => anchored() && setHoveredAspect(target)}
                        onMouseLeave={() => anchored() && clearHoveredAspect(target)}
                        style={
                          {
                            '--aspect-color': color,
                            '--aspect-background': tagBadgeBackground(color),
                          } as JSX.CSSProperties
                        }
                      >
                        <TypeBadge typeName={block.tagType} />
                        <div class={styles.aspectInterior}>
                          <AspectRowItem
                            rootMatrixId={props.rootMatrixId}
                            matrixId={item.target_matrix_id}
                            rowId={item.target_row_id}
                          />
                        </div>
                        {/* Tether indicator: lit dot for aspects anchored to an
                            inline #-ref in the host prose; brightens on hover. */}
                        <Show when={anchored()}>
                          <span
                            class={styles.tether}
                            data-testid="aspect-tether-indicator"
                            data-hovered={hovered() ? 'true' : undefined}
                            title="Anchored to an inline #tag in the content"
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
  rootMatrixId: number
  subject: LooseSubject
  contentAnchoredKeys?: Set<string>
  onOpenRowRef: (matrixId: number, rowId: number) => void
  renderCollection: RenderSubjectCollection
}> = (props) => {
  const focal = createMemo<Focal>(() => ({
    matrixId: props.subject.matrixId,
    rowId: props.subject.rowId,
  }))

  return (
    <div class={styles.region} data-testid="substrate-region">
      {/* loose — owned aspects (per-cell editable; grid-coalesced; gestures) */}
      <LooseRegion
        rootMatrixId={props.rootMatrixId}
        focal={focal()}
        contentAnchoredKeys={props.contentAnchoredKeys}
      />

      {/* view — persisted SQL blocks (owns nothing; the firewall) */}
      <QueryBandsSection
        rootMatrixId={props.rootMatrixId}
        matrixId={props.subject.matrixId}
        rowId={props.subject.rowId}
        onOpenView={props.onOpenRowRef}
        renderCollection={props.renderCollection}
      />

      {/* container — dedicated sub-tables (matrix bounded here, with its border) */}
      <SubTableBand
        rootMatrixId={props.rootMatrixId}
        focalMatrixId={props.subject.matrixId}
        focalRowId={props.subject.rowId}
        onOpenRowRef={props.onOpenRowRef}
        renderCollection={props.renderCollection}
      />
    </div>
  )
}

export default SubstrateRegion
