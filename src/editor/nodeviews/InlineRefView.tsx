import { useNodeViewContext } from '@prosemirror-adapter/solid'
import { createEffect, createMemo, createSignal, For, Show, type Component } from 'solid-js'

import { useQuery } from '../../sql/useQuery'
import { getColumns } from '../../core/client/matrix-client'
import type { ColumnDefinition } from '../../core/matrix'
import { tagColorFromName, tagBadgeBackground } from '../../tags/tag-color'
import { getRegistryMatrixId } from '../../tags/tags-plugin'

const MAX_KEY_PROPS = 2
const LABEL_COLUMNS = new Set(['id', 'label', 'title', 'name'])

export const InlineRefView: Component = () => {
  const context = useNodeViewContext()
  const targetMatrixId = createMemo(() => context().node.attrs.targetMatrixId as number | null)
  const targetRowId = createMemo(() => context().node.attrs.targetRowId as number | null)
  const kind = createMemo(() => (context().node.attrs.kind as string) ?? 'ref')
  const cachedTitle = createMemo(() => context().node.attrs.cachedTitle as string | null)

  const isEmpty = createMemo(() => targetMatrixId() == null || targetRowId() == null)
  const isOwn = createMemo(() => kind() === 'own')

  // Resolve target row existence and title (live vs ghost detection).
  // Uses `SELECT id` as a universal existence check since tag matrixes
  // may not have a `title` column. The title for ref-kind refs is
  // resolved separately below.
  const rowExistsQueryStr = createMemo(() => {
    if (isEmpty()) return ''
    return `SELECT id FROM "mx_${targetMatrixId()}_data" WHERE id = ${targetRowId()}`
  })
  const { result: rowExistsResult } = useQuery(() => rowExistsQueryStr())

  // Resolve title for ref-kind refs (own-kind uses tag type name instead)
  const refTitleQueryStr = createMemo(() => {
    if (isEmpty() || isOwn()) return ''
    return `SELECT title FROM "mx_${targetMatrixId()}_data" WHERE id = ${targetRowId()}`
  })
  const { result: refTitleResult } = useQuery(() => refTitleQueryStr())

  // Resolve tag type metadata for own-kind refs
  const tagTypeQueryStr = createMemo(() => {
    const mid = targetMatrixId()
    const regId = getRegistryMatrixId()
    if (!isOwn() || mid == null || regId == null) return ''
    return `SELECT name, color FROM "mx_${regId}_data" WHERE matrix_id = ${mid}`
  })
  const { result: tagTypeResult } = useQuery(() => tagTypeQueryStr())

  // Query all aspect row data for key property display
  const aspectRowQueryStr = createMemo(() => {
    const mid = targetMatrixId()
    const rid = targetRowId()
    if (!isOwn() || mid == null || rid == null) return ''
    return `SELECT * FROM "mx_${mid}_data" WHERE id = ${rid}`
  })
  const { result: aspectRowResult } = useQuery(() => aspectRowQueryStr())

  const [keyPropColumns, setKeyPropColumns] = createSignal<ColumnDefinition[]>([])

  createEffect(() => {
    const mid = targetMatrixId()
    if (!isOwn() || mid == null) return
    void getColumns(mid).then((cols) => {
      const candidates = cols.filter((c) => !LABEL_COLUMNS.has(c.name) && c.formula == null)
      setKeyPropColumns(candidates.slice(0, MAX_KEY_PROPS))
    })
  })

  const keyProps = createMemo((): { label: string; value: string }[] => {
    const data = aspectRowResult()
    if (!data || data.length === 0) return []
    const row = data[0] as Record<string, unknown>
    const cols = keyPropColumns()
    const result: { label: string; value: string }[] = []
    for (const col of cols) {
      const val = row[col.name]
      if (val != null && val !== '') {
        result.push({ label: col.name, value: String(val) })
      }
    }
    return result
  })

  const tagTypeMeta = createMemo(() => {
    const data = tagTypeResult()
    if (!data || data.length === 0) return null
    const row = data[0] as { name: string; color: string | null }
    return { name: row.name, color: row.color }
  })

  const resolvedTitle = createMemo(() => {
    const data = refTitleResult()
    if (!data || data.length === 0) return null
    return (data[0] as { title: string }).title
  })

  const isLive = createMemo(
    () => !isEmpty() && rowExistsResult() !== null && rowExistsResult()!.length > 0,
  )
  const isGhost = createMemo(
    () => !isEmpty() && rowExistsResult() !== null && rowExistsResult()!.length === 0,
  )

  const displayTitle = createMemo(() => {
    if (isOwn()) {
      const meta = tagTypeMeta()
      const name = meta?.name ?? cachedTitle()
      if (isLive()) return `#${name ?? 'Untitled'}`
      if (isGhost()) return `#${name ?? cachedTitle() ?? '(deleted)'}`
      if (isEmpty()) return `#${cachedTitle() ?? '(empty)'}`
      return '#…'
    }
    if (isLive()) return resolvedTitle() || 'Untitled'
    if (isGhost()) return cachedTitle() ?? '(deleted)'
    if (isEmpty()) return cachedTitle() ?? '(empty)'
    return '…'
  })

  const stateClass = createMemo(() => {
    if (isEmpty()) return ' inlineref-empty'
    if (isGhost()) return ' inlineref-ghost'
    return ''
  })

  const kindClass = createMemo(() => (isOwn() ? ' inlineref-own' : ' inlineref-ref'))

  const badgeStyle = createMemo(() => {
    if (!isOwn() || !isLive()) return undefined
    const meta = tagTypeMeta()
    const textColor = meta?.color ?? tagColorFromName(cachedTitle() ?? 'tag')
    const bgColor = tagBadgeBackground(textColor)
    return { color: textColor, 'background-color': bgColor }
  })

  const handleClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (isEmpty()) {
      const pos = context().getPos()
      const event = new CustomEvent('inlineref-create', {
        detail: { cachedTitle: cachedTitle(), pos },
        bubbles: true,
      })
      ;(e.currentTarget as HTMLElement).dispatchEvent(event)
      return
    }

    if (isGhost()) return

    if (isOwn() && isLive()) {
      const el = e.currentTarget as HTMLElement
      const rect = el.getBoundingClientRect()
      const meta = tagTypeMeta()
      const event = new CustomEvent('inlineref-open-tag-panel', {
        detail: {
          matrixId: targetMatrixId(),
          rowId: targetRowId(),
          tagTypeName: meta?.name ?? cachedTitle() ?? 'tag',
          tagTypeColor: meta?.color ?? null,
          anchorRect: {
            top: rect.top,
            left: rect.left,
            bottom: rect.bottom,
            right: rect.right,
            width: rect.width,
            height: rect.height,
          },
        },
        bubbles: true,
      })
      el.dispatchEvent(event)
      return
    }

    const event = new CustomEvent('inlineref-navigate', {
      detail: { rowId: targetRowId() },
      bubbles: true,
    })
    ;(e.currentTarget as HTMLElement).dispatchEvent(event)
  }

  return (
    <span
      class={'inlineref' + kindClass() + stateClass()}
      data-kind={kind()}
      style={badgeStyle()}
      onClick={handleClick}
    >
      {displayTitle()}
      <Show when={isOwn() && isLive() && keyProps().length > 0}>
        <span class="tag-panel-key-props">
          <For each={keyProps()}>
            {(kp) => (
              <span class="tag-key-prop" title={kp.label}>
                {kp.value}
              </span>
            )}
          </For>
        </span>
      </Show>
    </span>
  )
}
