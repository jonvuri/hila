import { useNodeViewContext } from '@prosemirror-adapter/solid'
import { createMemo, type Component } from 'solid-js'

import { useQuery } from '../../sql/useQuery'

export const InlineRefView: Component = () => {
  const context = useNodeViewContext()
  const targetMatrixId = createMemo(() => context().node.attrs.targetMatrixId as number | null)
  const targetRowId = createMemo(() => context().node.attrs.targetRowId as number | null)
  const kind = createMemo(() => (context().node.attrs.kind as string) ?? 'ref')
  const cachedTitle = createMemo(() => context().node.attrs.cachedTitle as string | null)

  const isEmpty = createMemo(() => targetMatrixId() == null || targetRowId() == null)

  const queryStr = createMemo(() => {
    if (isEmpty()) return ''
    return `SELECT title FROM "mx_${targetMatrixId()}_data" WHERE id = ${targetRowId()}`
  })
  const { result } = useQuery(() => queryStr())

  const resolvedTitle = createMemo(() => {
    const data = result()
    if (!data || data.length === 0) return null
    return (data[0] as { title: string }).title
  })

  const isLive = createMemo(() => !isEmpty() && result() !== null && result()!.length > 0)
  const isGhost = createMemo(() => !isEmpty() && result() !== null && result()!.length === 0)

  const displayTitle = createMemo(() => {
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

  const kindClass = createMemo(() => (kind() === 'own' ? ' inlineref-own' : ' inlineref-ref'))

  const handleClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (isGhost() || isEmpty()) return
    const event = new CustomEvent('wikilink-navigate', {
      detail: { rowId: targetRowId() },
      bubbles: true,
    })
    ;(e.currentTarget as HTMLElement).dispatchEvent(event)
  }

  return (
    <span class={'inlineref' + kindClass() + stateClass()} onClick={handleClick}>
      {displayTitle()}
    </span>
  )
}
