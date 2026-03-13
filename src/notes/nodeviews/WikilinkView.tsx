import { useNodeViewContext } from '@prosemirror-adapter/solid'
import { createMemo, type Component } from 'solid-js'

import { useQuery } from '../../sql/useQuery'

export const WikilinkView: Component = () => {
  const context = useNodeViewContext()
  const matrixId = createMemo(() => context().node.attrs.matrixId as number)
  const rowId = createMemo(() => context().node.attrs.rowId as number)

  const query = createMemo(
    () => `SELECT title FROM "mx_${matrixId()}_data" WHERE id = ${rowId()}`,
  )
  const { result } = useQuery(() => query())

  const title = createMemo(() => {
    const data = result()
    if (!data || data.length === 0) return null
    return (data[0] as { title: string }).title
  })

  const isBroken = createMemo(() => result() !== null && title() === null)

  const handleClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (isBroken()) return
    const event = new CustomEvent('wikilink-navigate', {
      detail: { rowId: rowId() },
      bubbles: true,
    })
    ;(e.currentTarget as HTMLElement).dispatchEvent(event)
  }

  return (
    <span class={isBroken() ? 'wikilink wikilink-broken' : 'wikilink'} onClick={handleClick}>
      {isBroken() ? '(broken link)' : (title() ?? '…')}
    </span>
  )
}
