import { createSignal, For, Show, type Component, createComputed, onCleanup } from 'solid-js'

import { createMatrix, addSampleRows, resetDatabase } from './sql/sqlite-core/matrix-client'
import { observeQuery } from './sql/query'

interface Matrix {
  id: number
  title: string
}

interface MatrixData {
  id: number
  data1: string | null
  data2: string | null
}

interface OrderingData {
  key: Uint8Array
  element_kind: number
  element_id: number
}

interface ClosureData {
  ancestor_key: Uint8Array
  descendant_key: Uint8Array
  depth: number
}

const MatrixDebug: Component = () => {
  const [matrices, setMatrices] = createSignal<Matrix[]>([])
  const [matrixData, setMatrixData] = createSignal<Record<number, MatrixData[]>>({})
  const [orderingData, setOrderingData] = createSignal<Record<number, OrderingData[]>>({})
  const [closureData, setClosureData] = createSignal<Record<number, ClosureData[]>>({})
  const [newMatrixTitle, setNewMatrixTitle] = createSignal('')
  const [loading, setLoading] = createSignal<Record<number, boolean>>({})
  const [resetLoading, setResetLoading] = createSignal(false)

  // Watch for matrices changes
  createComputed(() => {
    const matricesQuery = observeQuery('SELECT id, title FROM matrix ORDER BY id')
    const subscription = matricesQuery.subscribe((state) => {
      if (state.result) {
        setMatrices(state.result as unknown as Matrix[])
      }
      if (state.error) {
        console.error('Error loading matrices:', state.error)
      }
    })

    onCleanup(() => {
      subscription.unsubscribe()
    })
  })

  // For each matrix, watch its data tables
  createComputed(() => {
    const currentMatrices = matrices()
    const subscriptions: (() => void)[] = []

    currentMatrices.forEach((matrix) => {
      // Watch matrix data table
      const dataQuery = observeQuery(`SELECT * FROM "mx_${matrix.id}_data" ORDER BY id`)
      const dataSubscription = dataQuery.subscribe((state) => {
        if (state.result) {
          setMatrixData((prev) => ({
            ...prev,
            [matrix.id]: state.result as unknown as MatrixData[],
          }))
        }
      })
      subscriptions.push(() => dataSubscription.unsubscribe())

      // Watch ordering table for this matrix
      const orderingQuery = observeQuery(`
        SELECT key, element_kind, element_id 
        FROM ordering 
        WHERE matrix_id = ${matrix.id} 
        ORDER BY key
      `)
      const orderingSubscription = orderingQuery.subscribe((state) => {
        if (state.result) {
          setOrderingData((prev) => ({
            ...prev,
            [matrix.id]: state.result as unknown as OrderingData[],
          }))
        }
      })
      subscriptions.push(() => orderingSubscription.unsubscribe())

      // Watch closure table for this matrix
      const closureQuery = observeQuery(`
        SELECT ancestor_key, descendant_key, depth 
        FROM "mx_${matrix.id}_closure" 
        ORDER BY ancestor_key, depth
      `)
      const closureSubscription = closureQuery.subscribe((state) => {
        if (state.result) {
          setClosureData((prev) => ({
            ...prev,
            [matrix.id]: state.result as unknown as ClosureData[],
          }))
        }
      })
      subscriptions.push(() => closureSubscription.unsubscribe())
    })

    onCleanup(() => {
      subscriptions.forEach((unsub) => unsub())
    })
  })

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

  const formatKey = (key: Uint8Array | string): string => {
    if (typeof key === 'string') return key
    // Convert Uint8Array to readable string, showing hex for non-printable bytes
    const bytes = Array.from(key)
    return bytes
      .map((b) =>
        b === 0 ? '\\0'
        : b >= 32 && b <= 126 ? String.fromCharCode(b)
        : `\\x${b.toString(16).padStart(2, '0')}`,
      )
      .join('')
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
                  Matrix {matrix.id}: "{matrix.title}"
                </h3>
                <button
                  onClick={() => handleAddSampleRows(matrix.id)}
                  disabled={loading()[matrix.id]}
                  style={{
                    padding: '8px 16px',
                    'background-color': '#28a745',
                    color: 'white',
                    border: 'none',
                    'border-radius': '3px',
                    cursor: loading()[matrix.id] ? 'not-allowed' : 'pointer',
                    opacity: loading()[matrix.id] ? '0.6' : '1',
                  }}
                >
                  {loading()[matrix.id] ? 'Adding...' : 'Add Sample Rows'}
                </button>
              </div>

              <div
                style={{ display: 'grid', 'grid-template-columns': '1fr 1fr 1fr', gap: '20px' }}
              >
                {/* Data Table */}
                <div>
                  <h4>Data Table (mx_{matrix.id}_data)</h4>
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
                          <th style={{ border: '1px solid #dee2e6', padding: '8px' }}>Data1</th>
                          <th style={{ border: '1px solid #dee2e6', padding: '8px' }}>Data2</th>
                        </tr>
                      </thead>
                      <tbody>
                        <Show
                          when={(matrixData()[matrix.id] || []).length > 0}
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
                                No data
                              </td>
                            </tr>
                          }
                        >
                          <For each={matrixData()[matrix.id] || []}>
                            {(row) => (
                              <tr>
                                <td style={{ border: '1px solid #dee2e6', padding: '8px' }}>
                                  {row.id}
                                </td>
                                <td style={{ border: '1px solid #dee2e6', padding: '8px' }}>
                                  {row.data1 || 'NULL'}
                                </td>
                                <td style={{ border: '1px solid #dee2e6', padding: '8px' }}>
                                  {row.data2 || 'NULL'}
                                </td>
                              </tr>
                            )}
                          </For>
                        </Show>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Ordering Table */}
                <div>
                  <h4>Ordering Table</h4>
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
                          <th style={{ border: '1px solid #dee2e6', padding: '8px' }}>
                            Elem ID
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <Show
                          when={(orderingData()[matrix.id] || []).length > 0}
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
                                No ordering
                              </td>
                            </tr>
                          }
                        >
                          <For each={orderingData()[matrix.id] || []}>
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
                                  {row.element_kind}
                                </td>
                                <td style={{ border: '1px solid #dee2e6', padding: '8px' }}>
                                  {row.element_id}
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
                  <h4>Closure Table (mx_{matrix.id}_closure)</h4>
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
                          <th style={{ border: '1px solid #dee2e6', padding: '8px' }}>
                            Ancestor
                          </th>
                          <th style={{ border: '1px solid #dee2e6', padding: '8px' }}>
                            Descendant
                          </th>
                          <th style={{ border: '1px solid #dee2e6', padding: '8px' }}>Depth</th>
                        </tr>
                      </thead>
                      <tbody>
                        <Show
                          when={(closureData()[matrix.id] || []).length > 0}
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
                          <For each={closureData()[matrix.id] || []}>
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
              </div>
            </div>
          )}
        </For>
      </Show>
    </div>
  )
}

export default MatrixDebug
