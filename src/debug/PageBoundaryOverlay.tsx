import { Show } from 'solid-js'

import { hexTruncate } from './debugState'

type PageBoundaryRow = {
  key: Uint8Array
  row_id: number
}

type PageBoundaryOverlayProps = {
  pageIndex: number
  rows: PageBoundaryRow[]
}

const PageBoundaryOverlay = (props: PageBoundaryOverlayProps) => {
  const firstRow = () => props.rows[0] as PageBoundaryRow | undefined
  const lastRow = () => props.rows[props.rows.length - 1] as PageBoundaryRow | undefined

  return (
    <div
      style={{
        'border-top': '2px solid rgba(255, 120, 0, 0.6)',
        padding: '2px 8px',
        'font-size': '10px',
        'font-family': 'monospace',
        color: 'rgba(255, 120, 0, 0.8)',
        'background-color': 'rgba(255, 120, 0, 0.05)',
        display: 'flex',
        gap: '12px',
        'user-select': 'none',
      }}
    >
      <span>page {props.pageIndex}</span>
      <Show when={firstRow()}>{(row) => <span>key: {hexTruncate(row().key)}</span>}</Show>
      <span>{props.rows.length} rows</span>
      <Show when={firstRow() && lastRow()}>
        <span>
          ids: {firstRow()!.row_id}–{lastRow()!.row_id}
        </span>
      </Show>
    </div>
  )
}

export default PageBoundaryOverlay
