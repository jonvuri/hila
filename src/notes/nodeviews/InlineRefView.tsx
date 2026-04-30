import { useNodeViewContext } from '@prosemirror-adapter/solid'
import { createMemo, type Component } from 'solid-js'

import { useQuery } from '../../sql/useQuery'
import { tagColorFromName, tagBadgeBackground } from '../../tags/tag-color'

export const InlineRefView: Component = () => {
  const context = useNodeViewContext()
  const targetMatrixId = createMemo(() => context().node.attrs.targetMatrixId as number | null)
  const targetRowId = createMemo(() => context().node.attrs.targetRowId as number | null)
  const kind = createMemo(() => (context().node.attrs.kind as string) ?? 'ref')
  const cachedTitle = createMemo(() => context().node.attrs.cachedTitle as string | null)

  const isEmpty = createMemo(() => targetMatrixId() == null || targetRowId() == null)
  const isOwn = createMemo(() => kind() === 'own')

  // Resolve target row existence (live vs ghost detection)
  const rowQueryStr = createMemo(() => {
    if (isEmpty()) return ''
    return `SELECT title FROM "mx_${targetMatrixId()}_data" WHERE id = ${targetRowId()}`
  })
  const { result } = useQuery(() => rowQueryStr())

  // Resolve tag type metadata for own-kind refs
  const tagTypeQueryStr = createMemo(() => {
    const mid = targetMatrixId()
    if (!isOwn() || mid == null) return ''
    return `SELECT name, color FROM tag_types WHERE matrix_id = ${mid}`
  })
  const { result: tagTypeResult } = useQuery(() => tagTypeQueryStr())

  const tagTypeMeta = createMemo(() => {
    const data = tagTypeResult()
    if (!data || data.length === 0) return null
    const row = data[0] as { name: string; color: string | null }
    return { name: row.name, color: row.color }
  })

  const resolvedTitle = createMemo(() => {
    const data = result()
    if (!data || data.length === 0) return null
    return (data[0] as { title: string }).title
  })

  const isLive = createMemo(() => !isEmpty() && result() !== null && result()!.length > 0)
  const isGhost = createMemo(() => !isEmpty() && result() !== null && result()!.length === 0)

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
    </span>
  )
}
