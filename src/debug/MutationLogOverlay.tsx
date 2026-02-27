import { createSignal, For, Show } from 'solid-js'

import {
  debugFlags,
  mutationLog,
  pmMountCount,
  pmUnmountCount,
  type MutationLogEntry,
} from './debugState'

const formatTime = (ts: number): string => {
  const d = new Date(ts)
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':')
}

const formatDelta = (entry: MutationLogEntry): string => {
  if (entry.pmMountsAfter === null) return '…'
  const mounts = entry.pmMountsAfter - entry.pmMountsBefore
  const unmounts = entry.pmUnmountsAfter! - entry.pmUnmountsBefore
  return `+${mounts}M −${unmounts}U`
}

const churnColor = (entry: MutationLogEntry): string => {
  if (entry.pmMountsAfter === null) return '#888'
  const total =
    entry.pmMountsAfter -
    entry.pmMountsBefore +
    (entry.pmUnmountsAfter! - entry.pmUnmountsBefore)
  if (total <= 2) return '#88ff88'
  if (total <= 4) return '#ffdd88'
  return '#ff8888'
}

const MutationLogOverlay = () => {
  const [collapsed, setCollapsed] = createSignal(false)

  return (
    <Show when={debugFlags.mutationLog()}>
      <div
        style={{
          position: 'fixed',
          bottom: '12px',
          right: '12px',
          'z-index': '9999',
          'font-family': 'monospace',
          'font-size': '11px',
          'background-color': 'rgba(0, 0, 0, 0.85)',
          color: '#e0e0e0',
          'border-radius': '6px',
          'box-shadow': '0 2px 12px rgba(0,0,0,0.3)',
          'min-width': '280px',
          'max-width': '400px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '6px 10px',
            'background-color': 'rgba(255, 255, 255, 0.1)',
            cursor: 'pointer',
            display: 'flex',
            'justify-content': 'space-between',
            'align-items': 'center',
            'user-select': 'none',
          }}
          onClick={() => setCollapsed((c) => !c)}
        >
          <span style={{ 'font-weight': 'bold' }}>Mutation Log</span>
          <span style={{ opacity: 0.6 }}>
            PM: {pmMountCount()}M / {pmUnmountCount()}U {collapsed() ? '▶' : '▼'}
          </span>
        </div>
        <Show when={!collapsed()}>
          <div style={{ padding: '4px 0', 'max-height': '240px', overflow: 'auto' }}>
            <Show
              when={mutationLog().length > 0}
              fallback={
                <div style={{ padding: '4px 10px', opacity: 0.5 }}>No mutations recorded</div>
              }
            >
              <For each={mutationLog()}>
                {(entry) => (
                  <div
                    style={{
                      padding: '2px 10px',
                      display: 'flex',
                      'justify-content': 'space-between',
                      gap: '8px',
                      'border-bottom': '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <span style={{ color: '#8bc7ff', flex: '1' }}>{entry.operation}</span>
                    <span style={{ opacity: 0.5 }}>{formatTime(entry.timestamp)}</span>
                    <span
                      style={{
                        color: churnColor(entry),
                        'min-width': '70px',
                        'text-align': 'right',
                      }}
                    >
                      {formatDelta(entry)}
                    </span>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  )
}

export default MutationLogOverlay
