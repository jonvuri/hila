import { createSignal, For, Show, type Component } from 'solid-js'

import { createMatrix, addSampleRows, resetDatabase } from './core/client/matrix-client'
import { useQuery } from './sql/useQuery'

interface Matrix {
  id: number
  title: string
}

interface MatrixData {
  id: number
  title: string | null
}

interface RankData {
  key: Uint8Array
  row_kind: number
  row_id: number
}

interface ClosureData {
  ancestor_key: Uint8Array
  descendant_key: Uint8Array
  depth: number
}

interface OutlineItem {
  key: Uint8Array
  row_kind: number
  row_id: number
  depth: number
  title: string | null
}

const formatKey = (key: Uint8Array | string): string => {
  if (typeof key === 'string') return key
  const bytes = Array.from(key)
  return bytes
    .map((b) =>
      b === 0 ? '\\0'
      : b >= 32 && b <= 126 ? String.fromCharCode(b)
      : `\\x${b.toString(16).padStart(2, '0')}`,
    )
    .join('')
}

const getOutlineStructure = (
  rankRows: RankData[],
  closure: ClosureData[],
  data: MatrixData[],
): OutlineItem[] => {
  const dataMap = new Map<number, MatrixData>()
  data.forEach((item) => {
    dataMap.set(item.id, item)
  })

  const depthMap = new Map<string, number>()
  closure.forEach((item) => {
    const descendantKeyStr = formatKey(item.descendant_key)
    const currentDepth = depthMap.get(descendantKeyStr) || 0
    depthMap.set(descendantKeyStr, Math.max(currentDepth, item.depth))
  })

  return rankRows.map((rankItem) => {
    const keyStr = formatKey(rankItem.key)
    const depth = depthMap.get(keyStr) || 0
    const rowData = dataMap.get(rankItem.row_id) || { title: null }

    return {
      key: rankItem.key,
      row_kind: rankItem.row_kind,
      row_id: rankItem.row_id,
      depth,
      title: rowData.title,
    }
  })
}

const MatrixPanel: Component<{
  matrix: Matrix
  loading: boolean
  onAddSampleRows: () => void
}> = (props) => {
  const { result: dataResult } = useQuery(
    () => `SELECT * FROM "mx_${props.matrix.id}_data" ORDER BY id`,
  )
  const { result: rankResult } = useQuery(
    () =>
      `SELECT key, row_kind, row_id FROM rank WHERE matrix_id = ${props.matrix.id} ORDER BY key`,
  )
  const { result: closureResult } = useQuery(
    () =>
      `SELECT ancestor_key, descendant_key, depth FROM "mx_${props.matrix.id}_closure" ORDER BY ancestor_key, depth`,
  )

  const matrixData = () => (dataResult() as unknown as MatrixData[]) ?? []
  const rankData = () => (rankResult() as unknown as RankData[]) ?? []
  const closureData = () => (closureResult() as unknown as ClosureData[]) ?? []
  const outlineStructure = () => getOutlineStructure(rankData(), closureData(), matrixData())

  return (
    <div
      style={{
        'margin-bottom': '40px',
        padding: '20px',
        border: '2px solid #333',
        'border-radius': '8px',
        'background-color': '#fdfdfd',
      }}
    >
      <div
        style={{
          display: 'flex',
          'justify-content': 'space-between',
          'align-items': 'center',
          'margin-bottom': '15px',
        }}
      >
        <h3>
          Matrix {props.matrix.id}: "{props.matrix.title}"
        </h3>
        <button
          onClick={() => props.onAddSampleRows()}
          disabled={props.loading}
          style={{
            padding: '8px 16px',
            'background-color': '#28a745',
            color: 'white',
            border: 'none',
            'border-radius': '3px',
            cursor: props.loading ? 'not-allowed' : 'pointer',
            opacity: props.loading ? '0.6' : '1',
          }}
        >
          {props.loading ? 'Adding...' : 'Add Sample Rows'}
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          'grid-template-columns': '1fr 1fr 1fr 1fr',
          gap: '20px',
        }}
      >
        {/* Data Table */}
        <div>
          <h4>Data Table (mx_{props.matrix.id}_data)</h4>
          <div style={{ 'overflow-x': 'auto' }}>
            <table
              style={{
                width: '100%',
                'border-collapse': 'collapse',
                'font-size': '12px',
              }}
            >
              <thead>
                <tr style={{ 'background-color': '#e9ecef' }}>
                  <th style={{ border: '1px solid #dee2e6', padding: '8px' }}>ID</th>
                  <th style={{ border: '1px solid #dee2e6', padding: '8px' }}>Title</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={matrixData().length > 0}
                  fallback={
                    <tr>
                      <td
                        colspan={2}
                        style={{
                          'text-align': 'center',
                          padding: '10px',
                          'font-style': 'italic',
                        }}
                      >
                        No data
                      </td>
                    </tr>
                  }
                >
                  <For each={matrixData()}>
                    {(row) => (
                      <tr>
                        <td style={{ border: '1px solid #dee2e6', padding: '8px' }}>
                          {row.id}
                        </td>
                        <td style={{ border: '1px solid #dee2e6', padding: '8px' }}>
                          {row.title || 'NULL'}
                        </td>
                      </tr>
                    )}
                  </For>
                </Show>
              </tbody>
            </table>
          </div>
        </div>

        {/* Rank Table */}
        <div>
          <h4>Rank Table</h4>
          <div style={{ 'overflow-x': 'auto' }}>
            <table
              style={{
                width: '100%',
                'border-collapse': 'collapse',
                'font-size': '12px',
              }}
            >
              <thead>
                <tr style={{ 'background-color': '#e9ecef' }}>
                  <th style={{ border: '1px solid #dee2e6', padding: '8px' }}>Key</th>
                  <th style={{ border: '1px solid #dee2e6', padding: '8px' }}>Kind</th>
                  <th style={{ border: '1px solid #dee2e6', padding: '8px' }}>Row ID</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={rankData().length > 0}
                  fallback={
                    <tr>
                      <td
                        colspan={3}
                        style={{
                          'text-align': 'center',
                          padding: '10px',
                          'font-style': 'italic',
                        }}
                      >
                        No rank data
                      </td>
                    </tr>
                  }
                >
                  <For each={rankData()}>
                    {(row) => (
                      <tr>
                        <td
                          style={{
                            border: '1px solid #dee2e6',
                            padding: '8px',
                            'max-width': '120px',
                            'word-break': 'break-all',
                          }}
                        >
                          {formatKey(row.key)}
                        </td>
                        <td style={{ border: '1px solid #dee2e6', padding: '8px' }}>
                          {row.row_kind}
                        </td>
                        <td style={{ border: '1px solid #dee2e6', padding: '8px' }}>
                          {row.row_id}
                        </td>
                      </tr>
                    )}
                  </For>
                </Show>
              </tbody>
            </table>
          </div>
        </div>

        {/* Closure Table */}
        <div>
          <h4>Closure Table (mx_{props.matrix.id}_closure)</h4>
          <div style={{ 'overflow-x': 'auto' }}>
            <table
              style={{
                width: '100%',
                'border-collapse': 'collapse',
                'font-size': '12px',
              }}
            >
              <thead>
                <tr style={{ 'background-color': '#e9ecef' }}>
                  <th style={{ border: '1px solid #dee2e6', padding: '8px' }}>Ancestor</th>
                  <th style={{ border: '1px solid #dee2e6', padding: '8px' }}>Descendant</th>
                  <th style={{ border: '1px solid #dee2e6', padding: '8px' }}>Depth</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={closureData().length > 0}
                  fallback={
                    <tr>
                      <td
                        colspan={3}
                        style={{
                          'text-align': 'center',
                          padding: '10px',
                          'font-style': 'italic',
                        }}
                      >
                        No closure
                      </td>
                    </tr>
                  }
                >
                  <For each={closureData()}>
                    {(row) => (
                      <tr>
                        <td
                          style={{
                            border: '1px solid #dee2e6',
                            padding: '8px',
                            'max-width': '100px',
                            'word-break': 'break-all',
                          }}
                        >
                          {formatKey(row.ancestor_key)}
                        </td>
                        <td
                          style={{
                            border: '1px solid #dee2e6',
                            padding: '8px',
                            'max-width': '100px',
                            'word-break': 'break-all',
                          }}
                        >
                          {formatKey(row.descendant_key)}
                        </td>
                        <td style={{ border: '1px solid #dee2e6', padding: '8px' }}>
                          {row.depth}
                        </td>
                      </tr>
                    )}
                  </For>
                </Show>
              </tbody>
            </table>
          </div>
        </div>

        {/* Outline View */}
        <div>
          <h4>Outline Structure</h4>
          <div style={{ 'overflow-x': 'auto' }}>
            <div
              style={{
                border: '1px solid #dee2e6',
                'border-radius': '3px',
                'font-size': '12px',
                'min-height': '100px',
                'background-color': 'white',
              }}
            >
              <Show
                when={rankData().length > 0}
                fallback={
                  <div
                    style={{
                      'text-align': 'center',
                      padding: '20px',
                      'font-style': 'italic',
                      color: '#666',
                    }}
                  >
                    No items to display
                  </div>
                }
              >
                <For each={outlineStructure()}>
                  {(item) => (
                    <div
                      style={{
                        padding: '4px 8px',
                        'border-bottom': '1px solid #f0f0f0',
                        'padding-left': `${8 + item.depth * 20}px`,
                        'font-family': 'monospace',
                        display: 'flex',
                        'align-items': 'center',
                        gap: '8px',
                      }}
                    >
                      <span
                        style={{
                          color: '#666',
                          'font-size': '10px',
                          'min-width': '40px',
                        }}
                      >
                        [{item.row_kind}:{item.row_id}]
                      </span>
                      <span style={{ flex: 1 }}>{item.title || 'No data'}</span>
                      <span
                        style={{
                          color: '#999',
                          'font-size': '10px',
                          'font-family': 'monospace',
                        }}
                      >
                        {formatKey(item.key)}
                      </span>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const MatrixDebug: Component = () => {
  const [newMatrixTitle, setNewMatrixTitle] = createSignal('')
  const [loading, setLoading] = createSignal<Record<number, boolean>>({})
  const [resetLoading, setResetLoading] = createSignal(false)

  const { result: matricesResult } = useQuery(() => 'SELECT id, title FROM matrix ORDER BY id')
  const matrices = () => (matricesResult() as unknown as Matrix[]) ?? []

  const handleCreateMatrix = async () => {
    const title = newMatrixTitle().trim()
    if (!title) return

    try {
      await createMatrix(title)
      setNewMatrixTitle('')
    } catch (error) {
      console.error('Error creating matrix:', error)
    }
  }

  const handleAddSampleRows = async (matrixId: number) => {
    setLoading((prev) => ({ ...prev, [matrixId]: true }))
    try {
      await addSampleRows(matrixId)
    } catch (error) {
      console.error('Error adding sample rows:', error)
    } finally {
      setLoading((prev) => ({ ...prev, [matrixId]: false }))
    }
  }

  const handleResetDatabase = async () => {
    setResetLoading(true)
    try {
      await resetDatabase()
    } catch (error) {
      console.error('Error resetting database:', error)
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div style={{ padding: '20px', font: '14px monospace' }}>
      <h2>Matrix Debug Interface</h2>

      {/* Create Matrix Section */}
      <div
        style={{
          'margin-bottom': '30px',
          padding: '15px',
          border: '1px solid #ccc',
          'border-radius': '5px',
          'background-color': '#f9f9f9',
        }}
      >
        <h3>Create New Matrix</h3>
        <div style={{ display: 'flex', gap: '10px', 'align-items': 'center' }}>
          <input
            type="text"
            placeholder="Matrix title"
            value={newMatrixTitle()}
            onInput={(e) => setNewMatrixTitle(e.currentTarget.value)}
            style={{ padding: '8px', 'min-width': '200px' }}
          />
          <button
            onClick={handleCreateMatrix}
            disabled={!newMatrixTitle().trim()}
            style={{
              padding: '8px 16px',
              'background-color': '#007acc',
              color: 'white',
              border: 'none',
              'border-radius': '3px',
              cursor: !newMatrixTitle().trim() ? 'not-allowed' : 'pointer',
              opacity: !newMatrixTitle().trim() ? '0.6' : '1',
            }}
          >
            Create Matrix
          </button>
        </div>
      </div>

      {/* Reset Database Section */}
      <div
        style={{
          'margin-bottom': '30px',
          padding: '15px',
          border: '1px solid #dc3545',
          'border-radius': '5px',
          'background-color': '#fdf2f2',
        }}
      >
        <h3 style={{ color: '#dc3545' }}>Reset Database</h3>
        <p style={{ margin: '10px 0', 'font-size': '13px', color: '#666' }}>
          ⚠️ This will completely reset the database using SQLite C-API. All data will be lost.
        </p>
        <button
          onClick={handleResetDatabase}
          disabled={resetLoading()}
          style={{
            padding: '8px 16px',
            'background-color': '#dc3545',
            color: 'white',
            border: 'none',
            'border-radius': '3px',
            cursor: resetLoading() ? 'not-allowed' : 'pointer',
            opacity: resetLoading() ? '0.6' : '1',
          }}
        >
          {resetLoading() ? 'Resetting...' : 'Reset Database'}
        </button>
      </div>

      {/* Matrices List */}
      <Show when={matrices().length > 0} fallback={<p>No matrices found. Create one above!</p>}>
        <For each={matrices()}>
          {(matrix) => (
            <MatrixPanel
              matrix={matrix}
              loading={loading()[matrix.id] ?? false}
              onAddSampleRows={() => handleAddSampleRows(matrix.id)}
            />
          )}
        </For>
      </Show>
    </div>
  )
}

export default MatrixDebug
