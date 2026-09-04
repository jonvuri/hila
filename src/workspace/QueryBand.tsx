import { createEffect, createMemo, createSignal, For, Show, type Component } from 'solid-js'

import type { ColumnDefinition } from '../core/matrix'
import {
  createViewBlock,
  deleteViewBlock,
  getColumns,
  updateViewBlock,
  updateRow,
} from '../core/client/matrix-client'
import { useQuery } from '../sql/useQuery'
import {
  addIdToProjection,
  recognizeUpdatableQuery,
  resolveEditableColumns,
} from '../sql/recognize-updatable'
import { FieldEditor } from '../shared/FieldEditor'
import { buildTagTypesWithCountsQuery } from '../tags/tag-queries'
import { extractTextFromPmDoc } from '../editor/pm-text'
import { registerFaceRenderings, type FaceRenderingProps } from '../core/face-runtime'

import { buildViewBlocksForNodeQuery, buildTypeInSubtreeQuery } from './block-marker-queries'

/**
 * View blocks (Phase 9.7 Stage B; successor to the Phase 9.3 query band).
 *
 * A focal node's persisted live SQL views, now backed by `view` block markers
 * (a real forest node + its SQL in `block_sources`) rather than the removed
 * `bands` table. Each block runs its SQL via `useQuery` and renders every result
 * field through a schema-adaptive collection. The rows are foreign (owned by
 * various hosts), so the block has no tether and cannot mesh — it is a view,
 * not a collection.
 *
 * Rendered here in the focus panel (the FocusPanel section). Folding the view
 * block's content inline into the loose outline via count+slice
 * (src/workspace/window-flatten.ts) is the renderer stage (Stage C).
 *
 * Write-back: the block runs `recognizeUpdatableQuery` over its SQL. For a
 * recognized single-base-table view, passthrough cells light up as live
 * `FieldEditor`s (with the base column's real display type) writing through
 * `updateRow(baseMatrixId, row.id, baseColumn)`; derived/aggregate cells and
 * unrecognized blocks stay read-only. Editing requires `id` in the result set —
 * the row-identity gate (see `resolveEditableColumns`).
 */

type ViewBlockRow = {
  marker_matrix_id: number
  marker_row_id: number
  name?: string | null
  sql: string
}

type TagTypeOption = {
  id: number
  name: string
  matrix_id: number
  instance_count: number
}

/**
 * Synthesize a column definition for a result key, defaulting to a plain text
 * field. Arbitrary-SELECT results carry no ColumnDefinition, so this is the
 * degraded baseline; recognized passthrough columns are enriched below with
 * their base column's real display type.
 */
const synthesizeColumn = (name: string, order: number): ColumnDefinition => ({
  id: order,
  name,
  type: 'TEXT',
  displayType: 'text',
  order,
  options: null,
  formula: null,
  constraints: null,
  managedBy: null,
  role: null,
})

export const ViewCollection: Component<{
  block: ViewBlockRow
  onDelete?: () => void
  onOpen?: () => void
  focused?: boolean
  interiorOnly?: boolean
}> = (props) => {
  const { result, error } = useQuery(() => props.block.sql)

  const rows = createMemo<Record<string, unknown>[]>(() => {
    const data = result()
    if (!data) return []
    return data as Record<string, unknown>[]
  })

  // Recognize whether this block is a sound single-base-table updatable view.
  const recognition = createMemo(() => recognizeUpdatableQuery(props.block.sql))

  // The base table's real catalog columns (for editable display types + formula
  // exclusion). Fetched only when the band recognizes as updatable.
  const [baseColumns, setBaseColumns] = createSignal<ColumnDefinition[]>([])
  createEffect(() => {
    const rec = recognition()
    if (rec.updatable) void getColumns(rec.baseMatrixId).then(setBaseColumns)
    else setBaseColumns([])
  })

  const resolution = createMemo(() => {
    const rec = recognition()
    if (!rec.updatable) return null
    return resolveEditableColumns(rec, baseColumns())
  })

  // Editable result columns: output name → base column name (empty unless the
  // recognizer accepts the query *and* `id` is in the result set).
  const editable = createMemo(() => resolution()?.editable ?? new Map<string, string>())

  // The band is shape-updatable but `id`-less, and adding `id` would unlock at
  // least one cell — show the one-click "add id to edit" affordance.
  const canEnableWithId = createMemo(() => resolution()?.enableableWithId ?? false)

  const enableEditing = () => {
    const next = addIdToProjection(props.block.sql)
    if (next)
      void updateViewBlock(props.block.marker_matrix_id, props.block.marker_row_id, next)
  }

  // Render columns synthesized from result keys, with editable passthrough
  // columns enriched from the base catalog (so e.g. a number/date/select cell
  // edits with the right control).
  const columns = createMemo<ColumnDefinition[]>(() => {
    const first = rows()[0]
    if (!first) return []
    const ed = editable()
    const baseByName = new Map(baseColumns().map((c) => [c.name.toLowerCase(), c]))
    return Object.keys(first).map((name, i) => {
      const base = synthesizeColumn(name, i)
      const baseColName = ed.get(name)
      const real = baseColName ? baseByName.get(baseColName.toLowerCase()) : undefined
      if (!real) return base
      return { ...base, displayType: real.displayType, options: real.options, role: real.role }
    })
  })

  const isEditable = (col: ColumnDefinition): boolean =>
    col.name.toLowerCase() !== 'id' && editable().has(col.name)

  const saveCell = (row: Record<string, unknown>, outputName: string, value: string) => {
    const rec = recognition()
    const baseColumn = editable().get(outputName)
    if (!rec.updatable || !baseColumn) return
    const rowId = Number(row.id)
    if (!Number.isFinite(rowId)) return
    void updateRow(rec.baseMatrixId, rowId, { [baseColumn]: value })
  }

  return (
    <div
      class="query-band"
      data-testid="query-band"
      data-fidelity="substrate"
      data-marker-matrix-id={props.block.marker_matrix_id}
      data-marker-row-id={props.block.marker_row_id}
      style={{
        border: '1px solid hsl(230, 15%, 18%)',
        'border-radius': '4px',
        padding: '8px',
        display: 'flex',
        'flex-direction': 'column',
        gap: '4px',
      }}
    >
      <Show when={!props.interiorOnly}>
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
            <Show
              when={props.onOpen}
              fallback={<span>{props.focused ? '≔ view' : 'query:'}</span>}
            >
              {(open) => (
                <button
                  type="button"
                  data-testid="view-place-open"
                  onClick={() => open()()}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-strong)',
                    cursor: 'pointer',
                    padding: 0,
                    'font-family': 'inherit',
                    'font-size': 'inherit',
                    'font-weight': 'inherit',
                  }}
                >
                  ≔ {extractTextFromPmDoc(props.block.name ?? '') || 'Untitled view'}
                </button>
              )}
            </Show>
            <Show when={editable().size > 0}>
              <span
                data-testid="query-band-editable-badge"
                title="Recognized updatable view — passthrough cells are editable"
                style={{ 'margin-left': '6px', color: 'var(--accent)' }}
              >
                editable
              </span>
            </Show>
            <Show when={canEnableWithId()}>
              <button
                type="button"
                data-testid="query-band-enable-edit"
                title="This view's columns become editable once the result set includes id"
                onClick={() => enableEditing()}
                style={{
                  'margin-left': '6px',
                  background: 'none',
                  border: '1px solid var(--accent)',
                  'border-radius': '3px',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  'font-size': '10px',
                  padding: '0 5px',
                }}
              >
                + id to edit
              </button>
            </Show>
          </span>
          <Show when={props.onDelete}>
            {(remove) => (
              <button
                type="button"
                class="query-band-delete"
                data-testid="query-band-delete"
                aria-label="Delete view"
                onClick={() => remove()()}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-danger)',
                  'font-size': '13px',
                }}
              >
                ×
              </button>
            )}
          </Show>
        </div>
      </Show>

      <Show when={props.focused && !props.interiorOnly}>
        <code
          data-testid="view-place-sql"
          style={{
            color: 'var(--color-text-muted)',
            'font-size': '11px',
            'overflow-wrap': 'anywhere',
          }}
        >
          {props.block.sql}
        </code>
      </Show>

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
                <div
                  class="query-band-row"
                  data-testid="query-band-row"
                  role="row"
                  style={{
                    display: 'grid',
                    'grid-template-columns': 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: 'var(--space-control-gap)',
                    border: 'var(--width-line) solid var(--color-line-subtle)',
                    padding: 'var(--space-8)',
                  }}
                >
                  <For each={columns()}>
                    {(column) => (
                      <div role="cell" data-result-column={column.name}>
                        <div
                          style={{
                            color: 'var(--color-text-muted)',
                            'font-size': '10px',
                            'font-family': 'var(--type-data-family)',
                          }}
                        >
                          {column.name}
                        </div>
                        <Show
                          when={isEditable(column)}
                          fallback={
                            <span data-testid="property-row-readonly-cell">
                              {String(row[column.name] ?? '')}
                            </span>
                          }
                        >
                          <FieldEditor
                            column={column}
                            value={String(row[column.name] ?? '')}
                            onSave={(value) => saveCell(row, column.name, value)}
                          />
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  )
}

const ViewCollectionRendering: Component<FaceRenderingProps> = (props) => (
  <Show when={props.subject.mode === 'view'}>
    <ViewCollection
      block={{
        marker_matrix_id: props.subject.matrixId,
        marker_row_id: props.subject.rowId,
        sql: props.subject.mode === 'view' ? props.subject.sql : '',
      }}
      interiorOnly
    />
  </Show>
)

export const registerViewCollectionRendering = (faceTypeId: string): void => {
  registerFaceRenderings(faceTypeId, { collection: ViewCollectionRendering })
}

/**
 * The bands stack for a focal node, plus the dev-grade authoring affordance.
 * Mounted in the focus panel like the aspect band.
 */
export const QueryBandsSection: Component<{
  matrixId: number
  rowId: number
  onOpenView?: (matrixId: number, rowId: number) => void
}> = (props) => {
  const [labelColumn, setLabelColumn] = createSignal<string | null>(null)
  createEffect(() => {
    void getColumns(props.matrixId).then((columns) => {
      setLabelColumn(columns.find((column) => column.role === 'label')?.name ?? null)
    })
  })
  const { result: blocksResult } = useQuery(() =>
    buildViewBlocksForNodeQuery(props.matrixId, props.rowId, labelColumn() ?? undefined),
  )
  const blocks = createMemo<ViewBlockRow[]>(() => {
    const data = blocksResult()
    if (!data) return []
    return data as unknown as ViewBlockRow[]
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
  const [nameDraft, setNameDraft] = createSignal('Untitled view')
  const [selectedType, setSelectedType] = createSignal<number | null>(null)

  const insertSnippet = () => {
    const typeMatrixId = selectedType() ?? typeOptions()[0]?.matrix_id
    if (typeMatrixId == null) return
    setSqlDraft(buildTypeInSubtreeQuery(typeMatrixId, props.matrixId, props.rowId))
  }

  const saveBand = () => {
    const sql = sqlDraft().trim()
    if (!sql) return
    void createViewBlock(props.matrixId, props.rowId, sql, nameDraft()).then(() => {
      setSqlDraft('')
      setNameDraft('Untitled view')
    })
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
      <Show when={blocks().length > 0}>
        <For each={blocks()}>
          {(block) => (
            <ViewCollection
              block={block}
              onOpen={
                props.onOpenView ?
                  () => props.onOpenView?.(block.marker_matrix_id, block.marker_row_id)
                : undefined
              }
              onDelete={() => void deleteViewBlock(block.marker_matrix_id, block.marker_row_id)}
            />
          )}
        </For>
      </Show>

      {/* Dev-grade authoring affordance. */}
      <div
        class="query-band-authoring"
        data-testid="query-band-authoring"
        style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}
      >
        <input
          data-testid="query-band-name-input"
          aria-label="View name"
          value={nameDraft()}
          onInput={(event) => setNameDraft(event.currentTarget.value)}
          style={{ 'font-size': '12px' }}
        />
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
