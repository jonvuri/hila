import { For } from 'solid-js'

import type { WindowRendererFunction } from './Comp'

export interface ItemData {
  id: number
}

function ItemComponent(props: ItemData) {
  return (
    <div
      style={{
        padding: '16px',
        border: '1px solid #ddd',
        margin: '4px 0',
        'background-color': '#f9f9f9',
        'min-height': '40px',
        display: 'flex',
        'align-items': 'center',
      }}
    >
      <div contentEditable style={{ width: '100%' }}>
        {props.id}
      </div>
    </div>
  )
}

const WINDOW_SIZE = 50

// Calculate which items belong to a window
const getWindowItems = (windowIndex: number): number[] => {
  const start = windowIndex * WINDOW_SIZE
  return Array.from({ length: WINDOW_SIZE }, (_, i) => start + i)
}

export const DefaultWindowRenderer: WindowRendererFunction = (props) => {
  return (
    <For each={getWindowItems(props.windowIndex)}>
      {(itemId) => <ItemComponent id={itemId} />}
    </For>
  )
}
