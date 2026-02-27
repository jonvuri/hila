import { createSignal, For } from 'solid-js'

import type { OutlineCallbacks } from './keymap'
import { OutlineRow } from './OutlineRow'

const makeDoc = (text: string) =>
  JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })

type MockRow = {
  rowId: number
  rankKey: Uint8Array
  content: string
  depth: number
  hasChildren: boolean
  label: string
}

const INITIAL_ROWS: MockRow[] = [
  {
    rowId: 1,
    rankKey: new Uint8Array([0x10]),
    content: makeDoc('Root item (has children, expanded)'),
    depth: 0,
    hasChildren: true,
    label: 'root-parent',
  },
  {
    rowId: 2,
    rankKey: new Uint8Array([0x10, 0x10]),
    content: makeDoc('Child at depth 1'),
    depth: 1,
    hasChildren: false,
    label: 'child-1',
  },
  {
    rowId: 3,
    rankKey: new Uint8Array([0x10, 0x20]),
    content: makeDoc('Another child at depth 1 (has children)'),
    depth: 1,
    hasChildren: true,
    label: 'child-parent',
  },
  {
    rowId: 4,
    rankKey: new Uint8Array([0x10, 0x20, 0x10]),
    content: makeDoc('Grandchild at depth 2'),
    depth: 2,
    hasChildren: false,
    label: 'grandchild',
  },
  {
    rowId: 5,
    rankKey: new Uint8Array([0x10, 0x20, 0x20]),
    content: makeDoc('Another grandchild at depth 2'),
    depth: 2,
    hasChildren: false,
    label: 'grandchild-2',
  },
  {
    rowId: 6,
    rankKey: new Uint8Array([0x20]),
    content: makeDoc('Second root item (no children)'),
    depth: 0,
    hasChildren: false,
    label: 'root-leaf',
  },
  {
    rowId: 7,
    rankKey: new Uint8Array([0x30]),
    content: makeDoc('Third root (has children, will collapse)'),
    depth: 0,
    hasChildren: true,
    label: 'root-collapsible',
  },
  {
    rowId: 8,
    rankKey: new Uint8Array([0x30, 0x10]),
    content: makeDoc('Hidden when parent collapsed'),
    depth: 1,
    hasChildren: false,
    label: 'collapsible-child',
  },
]

const OutlineRowHarness = () => {
  const [log, setLog] = createSignal<string[]>([])
  const [collapsedKeys, setCollapsedKeys] = createSignal<Set<string>>(new Set())

  const appendLog = (msg: string) => {
    setLog((prev) => [...prev.slice(-19), msg])
  }

  const callbacks: OutlineCallbacks = {
    onEnter: () => appendLog('[callback] Enter'),
    onBackspaceAtStart: () => appendLog('[callback] Backspace@start'),
    onIndent: () => appendLog('[callback] Tab (indent)'),
    onOutdent: () => appendLog('[callback] Shift-Tab (outdent)'),
    onArrowUp: () => appendLog('[callback] ArrowUp'),
    onArrowDown: () => appendLog('[callback] ArrowDown'),
    onInsertLink: () => appendLog('[callback] Mod-k (link)'),
  }

  const keyStr = (key: Uint8Array) =>
    Array.from(key)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

  const toggleCollapse = (key: Uint8Array) => {
    const k = keyStr(key)
    setCollapsedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(k)) {
        next.delete(k)
        appendLog(`[collapse] Expanded: ${k}`)
      } else {
        next.add(k)
        appendLog(`[collapse] Collapsed: ${k}`)
      }
      return next
    })
  }

  const isCollapsed = (key: Uint8Array) => collapsedKeys().has(keyStr(key))

  const isHiddenByCollapse = (row: MockRow) => {
    for (const other of INITIAL_ROWS) {
      if (!other.hasChildren) continue
      if (other.rowId === row.rowId) continue
      const otherKey = keyStr(other.rankKey)
      if (!collapsedKeys().has(otherKey)) continue
      const rowKey = keyStr(row.rankKey)
      if (rowKey.startsWith(otherKey) && rowKey.length > otherKey.length) return true
    }
    return false
  }

  const visibleRows = () => INITIAL_ROWS.filter((r) => !isHiddenByCollapse(r))

  return (
    <div data-testid="outline-row-harness">
      <h3>OutlineRow Harness</h3>
      <p style={{ color: '#666', 'font-size': '13px', margin: '0 0 12px' }}>
        Renders OutlineRow components with mock data. Editors are functional but saves are
        no-ops (no backing matrix). Click disclosure triangles to toggle collapse.
      </p>

      <div
        data-testid="outline-rows"
        style={{
          border: '1px solid #ddd',
          'border-radius': '4px',
          padding: '4px 0',
        }}
      >
        <For each={visibleRows()}>
          {(row) => (
            <div
              data-testid={`row-${row.label}`}
              data-depth={row.depth}
              data-has-children={row.hasChildren}
            >
              <OutlineRow
                rowId={row.rowId}
                rankKey={row.rankKey}
                content={row.content}
                depth={row.depth}
                hasChildren={row.hasChildren}
                collapsed={isCollapsed(row.rankKey)}
                matrixId={0}
                pageIndex={0}
                callbacks={callbacks}
                onToggleCollapse={() => toggleCollapse(row.rankKey)}
              />
            </div>
          )}
        </For>
      </div>

      <h3 style={{ 'margin-top': '16px' }}>Event Log</h3>
      <pre
        data-testid="harness-log"
        style={{
          background: '#f5f5f5',
          padding: '8px',
          'font-size': '12px',
          'max-height': '200px',
          overflow: 'auto',
        }}
      >
        {log().join('\n') || '(no events yet)'}
      </pre>
    </div>
  )
}

export default OutlineRowHarness
