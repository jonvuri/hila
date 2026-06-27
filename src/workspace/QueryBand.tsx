import { createMemo, createSignal, For, Show, type Component } from 'solid-js'

import type { ColumnDefinition } from '../core/matrix'
import { createBand, deleteBand } from '../core/client/matrix-client'
import { useQuery } from '../sql/useQuery'
import { PropertyRow } from '../shared/PropertyRow'
import { buildTagTypesWithCountsQuery } from '../tags/tag-queries'

import { buildBandsForNodeQuery, buildTypeInSubtreeQuery } from './band-queries'

/**
 * Query bands (Phase 9.3; see context/Phase-9.3.md).
 *
 * The unanchored cousin of the aspect band: a focal node's persisted live SQL
 * views. Each band runs its SQL via `useQuery` and renders the result set
 * READ-ONLY through the schema-adaptive `PropertyRow`, with a `query:` header.
 * The rows are foreign (owned by various hosts, not the focal node), so the band
 * has no tether and cannot mesh — it is a view, not a collection.
 *
 * This is the read slice: write-back (the recognizer that lights up
 * recognized-updatable cells) is Session 2. Authoring is dev-tool-grade — a raw
 * SQL box plus a single "in this subtree" snippet; the schema-aware editor is
 * Session 3.
 */

type BandRow = {
  id: number
  focal_matrix_id: number
  focal_row_id: number
  sql: string
  face: string
  integration: string
  order: number
}

type TagTypeOption = {
  id: number
  name: string
  matrix_id: number
  instance_count: number
}

/**
 * Synthesize column definitions from an arbitrary result set's keys. An
 * arbitrary SELECT carries no ColumnDefinition (role/displayType/formula), so
 * every column degrades to a plain text field; name-based label detection
 * (`partitionPropertyColumns` → LABEL_LIKE_COLUMNS) still surfaces a `label` /
 * `title` / etc. column prominently. Real per-column metadata arrives in
 * Session 2 via the recognizer's column-origin resolution.
 */
const synthesizeColumns = (row: Record<string, unknown> | undefined): ColumnDefinition[] => {
  if (!row) return []
  return Object.keys(row).map((name, i) => ({
    id: i,
    name,
    type: 'TEXT',
    displayType: 'text',
    order: i,
    options: null,
    formula: null,
    constraints: null,
    managedBy: null,
    role: null,
  }))
}

const QueryBand: Component<{ band: BandRow; onDelete: () => void }> = (props) => {
  const { result, error } = useQuery(() => props.band.sql)

  const rows = createMemo<Record<string, unknown>[]>(() => {
    const data = result()
    if (!data) return []
    return data as Record<string, unknown>[]
  })

  const columns = createMemo(() => synthesizeColumns(rows()[0]))

  return (
    <div
      class="query-band"
      data-testid="query-band"
      style={{
        border: '1px solid hsl(230, 15%, 18%)',
        'border-radius': '4px',
        padding: '8px',
        display: 'flex',
        'flex-direction': 'column',
        gap: '4px',
      }}
    >
      <div
        style={{
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'space-between',
          gap: '8px',
        }}
      >
        <span
          style={{
            'font-size': '11px',
            'font-weight': 600,
            color: 'var(--text-muted)',
            'font-family': 'monospace',
          }}
        >
          query:
        </span>
        <button
          type="button"
          class="query-band-delete"
          data-testid="query-band-delete"
          aria-label="Delete band"
          onClick={() => props.onDelete()}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            'font-size': '13px',
          }}
        >
          ×
        </button>
      </div>

      <Show
        when={!error()}
        fallback={
          <div
            data-testid="query-band-error"
            style={{
              color: 'var(--danger, #d66)',
              'font-size': '12px',
              'font-family': 'monospace',
            }}
          >
            {error()?.message}
          </div>
        }
      >
        <Show
          when={rows().length > 0}
          fallback={
            <div
              data-testid="query-band-empty"
              style={{
                color: 'var(--text-muted)',
                'font-size': '12px',
                'font-style': 'italic',
              }}
            >
              No results.
            </div>
          }
        >
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
            <For each={rows()}>
              {(row) => (
                <div class="query-band-row" data-testid="query-band-row">
                  <PropertyRow columns={columns()} data={row} density="wide" readOnly />
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  )
}

/**
 * The bands stack for a focal node, plus the dev-grade authoring affordance.
 * Mounted in the focus panel like the aspect band.
 */
export const QueryBandsSection: Component<{ matrixId: number; rowId: number }> = (props) => {
  const { result: bandsResult } = useQuery(() =>
    buildBandsForNodeQuery(props.matrixId, props.rowId),
  )
  const bands = createMemo<BandRow[]>(() => {
    const data = bandsResult()
    if (!data) return []
    return data as unknown as BandRow[]
  })

  // Promoted type-nodes for the "in this subtree" snippet. Scoped to the focal
  // matrix as the workspace matrix (the common case: an outline node whose
  // type-nodes are promoted in the same matrix). Dev-grade.
  const { result: typesResult } = useQuery(() => buildTagTypesWithCountsQuery(props.matrixId))
  const typeOptions = createMemo<TagTypeOption[]>(() => {
    const data = typesResult()
    if (!data) return []
    return data as unknown as TagTypeOption[]
  })

  const [sqlDraft, setSqlDraft] = createSignal('')
  const [selectedType, setSelectedType] = createSignal<number | null>(null)

  const insertSnippet = () => {
    const typeMatrixId = selectedType() ?? typeOptions()[0]?.matrix_id
    if (typeMatrixId == null) return
    setSqlDraft(buildTypeInSubtreeQuery(typeMatrixId, props.matrixId, props.rowId))
  }

  const saveBand = () => {
    const sql = sqlDraft().trim()
    if (!sql) return
    void createBand(props.matrixId, props.rowId, sql).then(() => setSqlDraft(''))
  }

  return (
    <div
      class="query-bands-section"
      data-testid="query-bands-section"
      style={{
        'margin-bottom': '16px',
        'border-top': '1px solid hsl(230, 15%, 18%)',
        'padding-top': '12px',
        display: 'flex',
        'flex-direction': 'column',
        gap: '8px',
      }}
    >
      <Show when={bands().length > 0}>
        <For each={bands()}>
          {(band) => <QueryBand band={band} onDelete={() => void deleteBand(band.id)} />}
        </For>
      </Show>

      {/* Dev-grade authoring affordance. */}
      <div
        class="query-band-authoring"
        data-testid="query-band-authoring"
        style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}
      >
        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
          <select
            data-testid="query-band-type-select"
            value={selectedType() ?? ''}
            onChange={(e) =>
              setSelectedType(e.currentTarget.value ? Number(e.currentTarget.value) : null)
            }
            style={{ 'font-size': '12px' }}
          >
            <option value="">— type —</option>
            <For each={typeOptions()}>
              {(t) => <option value={t.matrix_id}>{t.name}</option>}
            </For>
          </select>
          <button
            type="button"
            data-testid="query-band-insert-snippet"
            onClick={() => insertSnippet()}
            style={{ 'font-size': '12px', cursor: 'pointer' }}
          >
            Insert "in this subtree" snippet
          </button>
        </div>
        <textarea
          data-testid="query-band-sql-input"
          placeholder="SELECT … (raw SQL — read-only view)"
          value={sqlDraft()}
          onInput={(e) => setSqlDraft(e.currentTarget.value)}
          style={{
            'font-family': 'monospace',
            'font-size': '12px',
            'min-height': '60px',
            width: '100%',
            'box-sizing': 'border-box',
          }}
        />
        <button
          type="button"
          data-testid="query-band-save"
          onClick={() => saveBand()}
          style={{ 'font-size': '12px', cursor: 'pointer', 'align-self': 'flex-start' }}
        >
          Save band
        </button>
      </div>
    </div>
  )
}

export default QueryBandsSection
