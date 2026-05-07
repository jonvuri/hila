import { createSignal, createMemo, For, Show, type Component } from 'solid-js'

import { createMatrix, addSampleRows, resetDatabase } from '../core/client/matrix-client'
import { useQuery } from '../sql/useQuery'

type MatrixRow = {
  id: number
  title: string
  source_plugin_id: string | null
}

type PluginOption = {
  id: string
  name: string
}

type ColumnDef = {
  id: number
  name: string
  type: string
  display_type: string
  order: number
  options: string | null
  formula: string | null
}

type TraitRow = {
  trait_type: string
}

type RankRow = {
  key: Uint8Array
  row_kind: number
  row_id: number
}

type ClosureRow = {
  ancestor_key: Uint8Array
  descendant_key: Uint8Array
  depth: number
}

type JoinRow = {
  source_matrix_id: number
  source_row_id: number
  target_matrix_id: number
  target_row_id: number
}

type FaceConfigRow = {
  id: string
  face_type_id: string
  slot_bindings: string
  settings: string | null
  created_by_plugin: string | null
}

type DetailTab = 'data' | 'traits' | 'joins' | 'faces' | 'schema'

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

// --- Detail view for a single matrix ---

const MatrixDetail: Component<{
  matrix: MatrixRow
  onBack: () => void
  onApplyFace?: (matrixId: number) => void
}> = (props) => {
  const [activeTab, setActiveTab] = createSignal<DetailTab>('data')
  const [sampleLoading, setSampleLoading] = createSignal(false)

  const { result: dataResult } = useQuery(
    () => `SELECT * FROM "mx_${props.matrix.id}_data" ORDER BY id`,
  )
  const { result: colResult } = useQuery(
    () =>
      `SELECT id, name, type, display_type, "order", options, formula FROM matrix_columns WHERE matrix_id = ${props.matrix.id} ORDER BY "order"`,
  )
  const { result: traitResult } = useQuery(
    () =>
      `SELECT trait_type FROM matrix_traits WHERE matrix_id = ${props.matrix.id} ORDER BY trait_type`,
  )
  const { result: rankResult } = useQuery(
    () =>
      `SELECT key, row_kind, row_id FROM rank WHERE matrix_id = ${props.matrix.id} ORDER BY key`,
  )
  const { result: closureResult } = useQuery(
    () =>
      `SELECT ancestor_key, descendant_key, depth FROM "mx_${props.matrix.id}_closure" ORDER BY ancestor_key, depth`,
  )
  const { result: forwardJoinResult } = useQuery(
    () =>
      `SELECT source_matrix_id, source_row_id, target_matrix_id, target_row_id FROM joins WHERE source_matrix_id = ${props.matrix.id}`,
  )
  const { result: reverseJoinResult } = useQuery(
    () =>
      `SELECT source_matrix_id, source_row_id, target_matrix_id, target_row_id FROM joins WHERE target_matrix_id = ${props.matrix.id}`,
  )
  const { result: faceConfigResult } = useQuery(
    () =>
      `SELECT id, face_type_id, slot_bindings, settings, created_by_plugin FROM face_configs WHERE matrix_id = ${props.matrix.id}`,
  )
  const { result: rowCountResult } = useQuery(
    () => `SELECT COUNT(*) as count FROM "mx_${props.matrix.id}_data"`,
  )

  const columns = () => (colResult() as unknown as ColumnDef[]) ?? []
  const traits = () => (traitResult() as unknown as TraitRow[]) ?? []
  const rankData = () => (rankResult() as unknown as RankRow[]) ?? []
  const closureData = () => (closureResult() as unknown as ClosureRow[]) ?? []
  const forwardJoins = () => (forwardJoinResult() as unknown as JoinRow[]) ?? []
  const reverseJoins = () => (reverseJoinResult() as unknown as JoinRow[]) ?? []
  const faceConfigs = () => (faceConfigResult() as unknown as FaceConfigRow[]) ?? []
  const dataRows = () => (dataResult() as unknown as Record<string, unknown>[]) ?? []
  const rowCount = () => {
    const r = rowCountResult() as unknown as { count: number }[] | null
    return r?.[0]?.count ?? 0
  }

  const handleAddSampleRows = async () => {
    setSampleLoading(true)
    try {
      await addSampleRows(props.matrix.id)
    } catch (err) {
      console.error('Error adding sample rows:', err)
    } finally {
      setSampleLoading(false)
    }
  }

  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'data', label: 'Data' },
    { id: 'traits', label: 'Traits' },
    { id: 'joins', label: 'Joins' },
    { id: 'faces', label: 'Face Configs' },
    { id: 'schema', label: 'Schema' },
  ]

  return (
    <div class="mb-detail" data-testid="matrix-detail">
      <div class="mb-detail-header">
        <button
          class="mb-back-btn"
          onClick={() => props.onBack()}
          data-testid="matrix-detail-back"
        >
          &larr; Back
        </button>
        <div class="mb-detail-title">
          <h3 class="mb-detail-name">
            Matrix {props.matrix.id}: {props.matrix.title}
          </h3>
          <span class="mb-detail-meta">
            {rowCount()} rows &middot; {columns().length} columns
            <Show when={props.matrix.source_plugin_id}>
              {(pluginId) => <> &middot; plugin: {pluginId()}</>}
            </Show>
          </span>
        </div>
        <div class="mb-detail-actions">
          <button
            class="mb-action-btn mb-action-sample"
            onClick={handleAddSampleRows}
            disabled={sampleLoading()}
            data-testid="add-sample-rows"
          >
            {sampleLoading() ? 'Adding...' : 'Add Sample Rows'}
          </button>
          <Show when={props.onApplyFace}>
            <button
              class="mb-action-btn mb-action-face"
              onClick={() => props.onApplyFace?.(props.matrix.id)}
              data-testid="apply-face-btn"
            >
              Apply Face
            </button>
          </Show>
        </div>
      </div>

      <div class="mb-detail-tabs">
        <For each={tabs}>
          {(tab) => (
            <button
              class="mb-detail-tab"
              data-active={activeTab() === tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`detail-tab-${tab.id}`}
            >
              {tab.label}
            </button>
          )}
        </For>
      </div>

      <div class="mb-detail-body">
        {/* Data tab */}
        <Show when={activeTab() === 'data'}>
          <div class="mb-tab-content" data-testid="detail-panel-data">
            <Show
              when={dataRows().length > 0}
              fallback={<div class="mb-empty">No data rows</div>}
            >
              <div class="mb-table-wrap">
                <table class="mb-table">
                  <thead>
                    <tr>
                      <For each={Object.keys(dataRows()[0]!)}>{(col) => <th>{col}</th>}</For>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={dataRows()}>
                      {(row) => (
                        <tr>
                          <For each={Object.values(row)}>
                            {(val) => (
                              <td>
                                {val === null ?
                                  <span class="mb-null">NULL</span>
                                : typeof val === 'object' ?
                                  String(val)
                                : String(val)}
                              </td>
                            )}
                          </For>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </div>
        </Show>

        {/* Traits tab */}
        <Show when={activeTab() === 'traits'}>
          <div class="mb-tab-content" data-testid="detail-panel-traits">
            <h4 class="mb-section-title">Provisioned Traits</h4>
            <Show
              when={traits().length > 0}
              fallback={<div class="mb-empty">No traits provisioned</div>}
            >
              <div class="mb-badge-list">
                <For each={traits()}>{(t) => <span class="mb-badge">{t.trait_type}</span>}</For>
              </div>
            </Show>

            <h4 class="mb-section-title">Rank Table</h4>
            <Show
              when={rankData().length > 0}
              fallback={<div class="mb-empty">No rank entries</div>}
            >
              <div class="mb-table-wrap">
                <table class="mb-table">
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Kind</th>
                      <th>Row ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={rankData()}>
                      {(row) => (
                        <tr>
                          <td class="mb-key-cell">{formatKey(row.key)}</td>
                          <td>{row.row_kind}</td>
                          <td>{row.row_id}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>

            <h4 class="mb-section-title">Closure Table</h4>
            <Show
              when={closureData().length > 0}
              fallback={<div class="mb-empty">No closure entries</div>}
            >
              <div class="mb-table-wrap">
                <table class="mb-table">
                  <thead>
                    <tr>
                      <th>Ancestor</th>
                      <th>Descendant</th>
                      <th>Depth</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={closureData()}>
                      {(row) => (
                        <tr>
                          <td class="mb-key-cell">{formatKey(row.ancestor_key)}</td>
                          <td class="mb-key-cell">{formatKey(row.descendant_key)}</td>
                          <td>{row.depth}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </div>
        </Show>

        {/* Joins tab */}
        <Show when={activeTab() === 'joins'}>
          <div class="mb-tab-content" data-testid="detail-panel-joins">
            <h4 class="mb-section-title">Forward Joins (this matrix is source)</h4>
            <Show
              when={forwardJoins().length > 0}
              fallback={<div class="mb-empty">No forward joins</div>}
            >
              <div class="mb-table-wrap">
                <table class="mb-table">
                  <thead>
                    <tr>
                      <th>Source Row</th>
                      <th>Target Matrix</th>
                      <th>Target Row</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={forwardJoins()}>
                      {(j) => (
                        <tr>
                          <td>{j.source_row_id}</td>
                          <td>{j.target_matrix_id}</td>
                          <td>{j.target_row_id}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>

            <h4 class="mb-section-title">Reverse Joins (this matrix is target)</h4>
            <Show
              when={reverseJoins().length > 0}
              fallback={<div class="mb-empty">No reverse joins</div>}
            >
              <div class="mb-table-wrap">
                <table class="mb-table">
                  <thead>
                    <tr>
                      <th>Source Matrix</th>
                      <th>Source Row</th>
                      <th>Target Row</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={reverseJoins()}>
                      {(j) => (
                        <tr>
                          <td>{j.source_matrix_id}</td>
                          <td>{j.source_row_id}</td>
                          <td>{j.target_row_id}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </div>
        </Show>

        {/* Face configs tab */}
        <Show when={activeTab() === 'faces'}>
          <div class="mb-tab-content" data-testid="detail-panel-faces">
            <Show
              when={faceConfigs().length > 0}
              fallback={<div class="mb-empty">No face configurations</div>}
            >
              <For each={faceConfigs()}>
                {(fc) => (
                  <div class="mb-face-card">
                    <div class="mb-face-header">
                      <span class="mb-face-type">{fc.face_type_id}</span>
                      <span class="mb-face-id">{fc.id}</span>
                    </div>
                    <div class="mb-face-body">
                      <div class="mb-face-row">
                        <span class="mb-face-label">Slot bindings:</span>
                        <code class="mb-face-code">{fc.slot_bindings}</code>
                      </div>
                      <Show when={fc.settings}>
                        <div class="mb-face-row">
                          <span class="mb-face-label">Settings:</span>
                          <code class="mb-face-code">{fc.settings}</code>
                        </div>
                      </Show>
                      <Show when={fc.created_by_plugin}>
                        {(pluginId) => (
                          <div class="mb-face-row">
                            <span class="mb-face-label">Plugin:</span>
                            <span>{pluginId()}</span>
                          </div>
                        )}
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </Show>

        {/* Schema tab */}
        <Show when={activeTab() === 'schema'}>
          <div class="mb-tab-content" data-testid="detail-panel-schema">
            <Show
              when={columns().length > 0}
              fallback={<div class="mb-empty">No columns defined</div>}
            >
              <div class="mb-table-wrap">
                <table class="mb-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Display Type</th>
                      <th>Order</th>
                      <th>Options</th>
                      <th>Formula</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={columns()}>
                      {(col) => (
                        <tr>
                          <td class="mb-col-name">{col.name}</td>
                          <td>{col.type}</td>
                          <td>{col.display_type}</td>
                          <td>{col.order}</td>
                          <td>
                            {col.options ?
                              <code class="mb-face-code">{col.options}</code>
                            : <span class="mb-null">—</span>}
                          </td>
                          <td>
                            {col.formula ?
                              <code class="mb-face-code">{col.formula}</code>
                            : <span class="mb-null">—</span>}
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  )
}

// --- Main matrix browser ---

export type MatrixBrowserProps = {
  onReset?: () => void | Promise<void>
  onApplyFace?: (matrixId: number) => void
}

const MatrixBrowser: Component<MatrixBrowserProps> = (props) => {
  const [selectedMatrix, setSelectedMatrix] = createSignal<MatrixRow | null>(null)
  const [pluginFilter, setPluginFilter] = createSignal('')
  const [titleFilter, setTitleFilter] = createSignal('')
  const [newMatrixTitle, setNewMatrixTitle] = createSignal('')
  const [resetLoading, setResetLoading] = createSignal(false)
  const [resetConfirm, setResetConfirm] = createSignal(false)

  const { result: matricesResult } = useQuery(
    () => 'SELECT m.id, m.title, m.source_plugin_id FROM matrix m ORDER BY m.id',
  )
  const { result: pluginsResult } = useQuery(() => 'SELECT id, name FROM plugins ORDER BY name')
  const { result: colCountResult } = useQuery(
    () => 'SELECT matrix_id, COUNT(*) as col_count FROM matrix_columns GROUP BY matrix_id',
  )

  const matrices = () => (matricesResult() as unknown as MatrixRow[]) ?? []
  const plugins = () => (pluginsResult() as unknown as PluginOption[]) ?? []
  const colCountMap = createMemo(() => {
    const rows =
      (colCountResult() as unknown as { matrix_id: number; col_count: number }[]) ?? []
    const map = new Map<number, number>()
    for (const r of rows) map.set(r.matrix_id, r.col_count)
    return map
  })

  const filteredMatrices = createMemo(() => {
    let result = matrices()
    const pf = pluginFilter()
    const tf = titleFilter().toLowerCase()

    if (pf === '__none__') {
      result = result.filter((m) => !m.source_plugin_id)
    } else if (pf) {
      result = result.filter((m) => m.source_plugin_id === pf)
    }

    if (tf) {
      result = result.filter((m) => m.title.toLowerCase().includes(tf))
    }

    return result
  })

  const handleCreateMatrix = async () => {
    const title = newMatrixTitle().trim()
    if (!title) return
    try {
      await createMatrix(title)
      setNewMatrixTitle('')
    } catch (err) {
      console.error('Error creating matrix:', err)
    }
  }

  const handleResetDatabase = async () => {
    if (!resetConfirm()) {
      setResetConfirm(true)
      return
    }
    setResetLoading(true)
    try {
      await resetDatabase()
      if (props.onReset) await props.onReset()
      setSelectedMatrix(null)
    } catch (err) {
      console.error('Error resetting database:', err)
    } finally {
      setResetLoading(false)
      setResetConfirm(false)
    }
  }

  return (
    <div class="mb-root" data-testid="matrix-browser">
      <Show
        when={selectedMatrix()}
        fallback={
          <div class="mb-list-view">
            {/* Quick actions bar */}
            <div class="mb-actions-bar">
              <div class="mb-create-row">
                <input
                  class="mb-input"
                  type="text"
                  placeholder="New matrix title…"
                  value={newMatrixTitle()}
                  onInput={(e) => setNewMatrixTitle(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreateMatrix()
                  }}
                  data-testid="create-matrix-input"
                />
                <button
                  class="mb-action-btn mb-action-create"
                  onClick={handleCreateMatrix}
                  disabled={!newMatrixTitle().trim()}
                  data-testid="create-matrix-btn"
                >
                  Create
                </button>
              </div>
              <button
                class="mb-action-btn mb-action-reset"
                onClick={handleResetDatabase}
                disabled={resetLoading()}
                data-testid="reset-db-btn"
              >
                {resetLoading() ?
                  'Resetting…'
                : resetConfirm() ?
                  'Confirm Reset'
                : 'Reset DB'}
              </button>
            </div>

            {/* Filters */}
            <div class="mb-filters">
              <select
                class="mb-select"
                value={pluginFilter()}
                onChange={(e) => setPluginFilter(e.currentTarget.value)}
                data-testid="plugin-filter"
              >
                <option value="">All plugins</option>
                <option value="__none__">No plugin (user-created)</option>
                <For each={plugins()}>{(p) => <option value={p.id}>{p.name}</option>}</For>
              </select>
              <input
                class="mb-input mb-search"
                type="text"
                placeholder="Filter by title…"
                value={titleFilter()}
                onInput={(e) => setTitleFilter(e.currentTarget.value)}
                data-testid="title-filter"
              />
            </div>

            {/* Matrix list */}
            <div class="mb-matrix-list">
              <Show
                when={filteredMatrices().length > 0}
                fallback={<div class="mb-empty">No matrixes found</div>}
              >
                <For each={filteredMatrices()}>
                  {(matrix) => (
                    <button
                      class="mb-matrix-item"
                      onClick={() => setSelectedMatrix(matrix)}
                      data-testid={`matrix-item-${matrix.id}`}
                    >
                      <div class="mb-matrix-item-main">
                        <span class="mb-matrix-item-title">{matrix.title}</span>
                        <span class="mb-matrix-item-id">#{matrix.id}</span>
                      </div>
                      <div class="mb-matrix-item-meta">
                        <span>{colCountMap().get(matrix.id) ?? 0} cols</span>
                        <Show when={matrix.source_plugin_id}>
                          {(pid) => <span class="mb-badge-sm">{pid()}</span>}
                        </Show>
                      </div>
                    </button>
                  )}
                </For>
              </Show>
            </div>
          </div>
        }
      >
        {(matrix) => (
          <MatrixDetail
            matrix={matrix()}
            onBack={() => setSelectedMatrix(null)}
            onApplyFace={props.onApplyFace}
          />
        )}
      </Show>
    </div>
  )
}

export default MatrixBrowser
