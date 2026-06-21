import { createEffect, createMemo, createSignal, For, Show, type Component } from 'solid-js'

import { getColumns, updateRow } from '../core/client/matrix-client'
import type { ColumnDefinition } from '../core/matrix'
import { useQuery } from '../sql/useQuery'
import { useRowData } from '../sql/useRowData'
import { buildTagsForRowQuery } from '../tags/tag-queries'
import { tagColorFromName } from '../tags/tag-color'
import { PropertyRow } from '../shared/PropertyRow'

/**
 * Aspect band (Phase 9.2; see context/Phase-9.2.md).
 *
 * The "banded" presentation of a focal node's owned aspects: the rows owned via
 * `#`-tag (`own`-join) attachments, grouped into contiguous blocks by tag type,
 * each row rendered through the shared schema-adaptive `PropertyRow` at the focus
 * panel's wide density. It mounts between the node body and the children nav
 * panel. Editing is in place (hydrated → `updateRow`).
 *
 * Every current aspect is content-anchored (created from an inline `#`-ref), so
 * they are treated uniformly here; the tether back to the prose token is a
 * deferred follow-up.
 */

type AspectDescriptor = {
  target_matrix_id: number
  target_row_id: number
  tag_type_name: string
}

type AspectBlock = { tagType: string; items: AspectDescriptor[] }

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

const AspectBand: Component<{ hostMatrixId: number; hostRowId: number }> = (props) => {
  const tagsQuery = createMemo(() =>
    buildTagsForRowQuery(props.hostMatrixId, props.hostMatrixId, props.hostRowId),
  )
  const { result } = useQuery(() => tagsQuery())

  const aspects = createMemo<AspectDescriptor[]>(() => {
    const data = result()
    if (!data || data.length === 0) return []
    return data as unknown as AspectDescriptor[]
  })

  // Group into contiguous blocks by tag type.
  const blocks = createMemo<AspectBlock[]>(() => {
    const out: AspectBlock[] = []
    for (const a of aspects()) {
      const last = out[out.length - 1]
      if (last && last.tagType === a.tag_type_name) last.items.push(a)
      else out.push({ tagType: a.tag_type_name, items: [a] })
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
          {(block) => (
            <div
              class="aspect-block"
              style={{
                'border-left': `2px solid ${tagColorFromName(block.tagType)}`,
                'padding-left': '8px',
                display: 'flex',
                'flex-direction': 'column',
                gap: '4px',
              }}
            >
              <For each={block.items}>
                {(item) => (
                  <div
                    class="aspect-row"
                    data-testid="aspect-row"
                    style={{ display: 'flex', 'align-items': 'flex-start', gap: '8px' }}
                  >
                    <TypeBadge typeName={block.tagType} />
                    <div style={{ flex: 1, 'min-width': 0 }}>
                      <AspectRowItem
                        matrixId={item.target_matrix_id}
                        rowId={item.target_row_id}
                      />
                    </div>
                  </div>
                )}
              </For>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}

export default AspectBand
