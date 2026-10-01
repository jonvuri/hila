import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
  untrack,
  type Component,
} from 'solid-js'

import type { ColumnDefinition } from '../core/matrix'
import {
  deleteViewBlock,
  getColumns,
  updateViewBlock,
  updateRow,
} from '../core/client/matrix-client'
import { execQuery } from '../core/client/sql-client'
import { useQuery } from '../sql/useQuery'
import {
  addIdToProjection,
  recognizeUpdatableQuery,
  resolveEditableColumns,
} from '../sql/recognize-updatable'
import { FieldEditor, ReadonlyField } from '../shared/FieldEditor'
import { extractTextFromPmDoc } from '../editor/pm-text'
import {
  createQueryCatalog,
  type QueryCatalog,
  type QueryNodeIdentity,
} from '../sql/query-spec/catalog'
import { materializeQuerySpec } from '../sql/query-spec/materialize'
import { recognizeQuerySpec } from '../sql/query-spec/recognize'
import { isReadOnlySelect, parseSingleStatement } from '../sql/sql-statement'
import type { NormalizedQuerySpec } from '../sql/query-spec/types'
import type { ViewSubject } from '../core/face-types'

import { buildViewBlocksForNodeQuery } from './block-marker-queries'
import { SavedViewStructuredAuthoring } from './SavedViewStructuredAuthoring'
import type { RenderSubjectCollection } from './focus-subject'
import styles from './QueryBand.module.css'

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

type QueryNodeRow = { matrix_id: number; row_id: number }
type QueryMatrixRow = { id: number; title: string }

type SqlDraftValidation =
  | { type: 'idle' }
  | { type: 'checking' }
  | { type: 'valid' }
  | { type: 'invalid'; message: string }

type AppliedSql = { sql: string; previousStoredSql: string }
type StructuredWrite = {
  markerMatrixId: number
  markerRowId: number
  sql: string
  generation: number
}

const mergeNodeIdentities = (
  current: readonly QueryNodeIdentity[],
  additions: readonly QueryNodeIdentity[],
): QueryNodeIdentity[] => {
  const merged = new Map<string, QueryNodeIdentity>()
  for (const node of [...current, ...additions]) {
    if (
      Number.isSafeInteger(node.matrixId) &&
      node.matrixId > 0 &&
      Number.isSafeInteger(node.rowId) &&
      node.rowId > 0
    ) {
      merged.set(`${node.matrixId}:${node.rowId}`, node)
    }
  }
  return [...merged.values()]
}

/** Recognition-backed authoring chrome. SQL remains the only durable query state. */
export const SavedViewAuthoring: Component<{
  block: ViewBlockRow
  rootMatrixId: number
}> = (props) => {
  const initialStoredSql = untrack(() => props.block.sql)
  const [catalogMatrices, setCatalogMatrices] = createSignal<
    readonly { id: number; title: string; columns: readonly ColumnDefinition[] }[] | null
  >(null)
  const [catalogError, setCatalogError] = createSignal<string | null>(null)
  const [discoveredNodes, setDiscoveredNodes] = createSignal<readonly QueryNodeIdentity[]>([])
  const { result: nodeRowsResult } = useQuery(
    () => 'SELECT DISTINCT matrix_id, row_id FROM scroll_index',
  )
  let missingScopeGeneration = 0
  let requestedMissingScopeKey: string | null = null
  const [confirmedMissingScopeKey, setConfirmedMissingScopeKey] = createSignal<string | null>(
    null,
  )

  const mergeDiscoveredNodes = (additions: readonly QueryNodeIdentity[]): void => {
    setDiscoveredNodes((current) => {
      const merged = mergeNodeIdentities(current, additions)
      return merged.length === current.length ? current : merged
    })
  }

  createEffect(() => {
    setCatalogMatrices(null)
    setCatalogError(null)
    void execQuery('SELECT id, title FROM matrix ORDER BY id')
      .then(async (result) => {
        const matrices = result as unknown as QueryMatrixRow[]
        return Promise.all(
          matrices.map(async (matrix) => ({
            ...matrix,
            columns: await getColumns(matrix.id),
          })),
        )
      })
      .then(setCatalogMatrices)
      .catch((error: unknown) => {
        setCatalogMatrices([])
        setCatalogError(error instanceof Error ? error.message : String(error))
      })
  })

  const catalog = createMemo<QueryCatalog | null>(() => {
    const matrices = catalogMatrices()
    const nodeRows = nodeRowsResult()
    if (matrices === null || nodeRows === null) return null
    const nodes = mergeNodeIdentities(
      (nodeRows as unknown as QueryNodeRow[]).map((node) => ({
        matrixId: node.matrix_id,
        rowId: node.row_id,
      })),
      discoveredNodes(),
    )
    return createQueryCatalog({
      matrices,
      nodes,
    })
  })

  const [sqlOpen, setSqlOpen] = createSignal(false)
  const [sqlDraft, setSqlDraft] = createSignal('')
  const [validation, setValidation] = createSignal<SqlDraftValidation>({ type: 'idle' })
  const [appliedSql, setAppliedSql] = createSignal<AppliedSql | null>(null)
  const [structuredSql, setStructuredSql] = createSignal<string | null>(null)
  const [structuredWriteError, setStructuredWriteError] = createSignal<string | null>(null)
  let validationGeneration = 0
  let structuredWriteGeneration = 0
  let structuredWriteRunning = false
  const structuredWriteQueue: StructuredWrite[] = []
  let confirmedStructuredSql = initialStoredSql
  let observedStoredSql = initialStoredSql
  const issuedStructuredSql = new Set<string>()
  let initialRecognitionHandled = false

  createEffect(() => {
    const pending = appliedSql()
    if (pending && props.block.sql !== pending.previousStoredSql) setAppliedSql(null)
  })

  createEffect(() => {
    const storedSql = props.block.sql
    if (storedSql === observedStoredSql) return
    observedStoredSql = storedSql
    confirmedStructuredSql = storedSql
    if (storedSql === structuredSql()) {
      issuedStructuredSql.clear()
      setStructuredSql(null)
    } else if (issuedStructuredSql.has(storedSql)) {
      issuedStructuredSql.delete(storedSql)
    } else {
      issuedStructuredSql.clear()
      setStructuredSql(null)
    }
  })

  const effectiveStoredSql = (): string =>
    structuredSql() ?? appliedSql()?.sql ?? props.block.sql

  const storedRecognition = createMemo(() => {
    const loadedCatalog = catalog()
    if (!loadedCatalog) return null
    return recognizeQuerySpec(effectiveStoredSql(), loadedCatalog)
  })

  const recognition = createMemo(() => {
    const loadedCatalog = catalog()
    if (!loadedCatalog) return null
    return recognizeQuerySpec(sqlOpen() ? sqlDraft() : effectiveStoredSql(), loadedCatalog)
  })

  const missingScopeKey = (sql: string, node: QueryNodeIdentity): string =>
    `${sql}\u0000${node.matrixId}:${node.rowId}`

  createEffect(() => {
    const current = storedRecognition()
    if (current?.type !== 'custom-sql' || !current.missingNode) {
      missingScopeGeneration += 1
      requestedMissingScopeKey = null
      setConfirmedMissingScopeKey(null)
      return
    }
    const node = current.missingNode
    const key = missingScopeKey(effectiveStoredSql(), node)
    if (requestedMissingScopeKey === key) return
    requestedMissingScopeKey = key
    setConfirmedMissingScopeKey(null)
    const generation = ++missingScopeGeneration
    void execQuery(
      `SELECT 1 AS found FROM "mx_${node.matrixId}_data" WHERE id = ${node.rowId} LIMIT 1`,
    ).then(
      (rows) => {
        if (generation !== missingScopeGeneration) return
        if (rows.length > 0) mergeDiscoveredNodes([node])
        else setConfirmedMissingScopeKey(key)
      },
      () => {
        if (generation === missingScopeGeneration) setConfirmedMissingScopeKey(key)
      },
    )
  })

  const validateDraft = (draft: string): void => {
    const generation = ++validationGeneration
    const parsed = parseSingleStatement(draft)
    if (!parsed.ok) {
      setValidation({ type: 'invalid', message: parsed.message })
      return
    }
    if (!isReadOnlySelect(parsed.statement.root)) {
      setValidation({ type: 'invalid', message: 'Enter one read-only SELECT query.' })
      return
    }
    setValidation({ type: 'checking' })
    void execQuery(`SELECT * FROM (${parsed.statement.sql}) AS saved_view_draft LIMIT 0`).then(
      () => {
        if (generation === validationGeneration) setValidation({ type: 'valid' })
      },
      (error: unknown) => {
        if (generation !== validationGeneration) return
        setValidation({
          type: 'invalid',
          message: error instanceof Error ? error.message : String(error),
        })
      },
    )
  }

  const openSql = (): void => {
    setSqlDraft(effectiveStoredSql())
    setSqlOpen(true)
    validateDraft(effectiveStoredSql())
  }

  const cancelSql = (): void => {
    validationGeneration += 1
    setSqlDraft(effectiveStoredSql())
    setValidation({ type: 'idle' })
    setSqlOpen(false)
  }

  const applySql = (): void => {
    if (validation().type !== 'valid') return
    const nextSql = sqlDraft()
    const previousStoredSql = props.block.sql
    void updateViewBlock(props.block.marker_matrix_id, props.block.marker_row_id, nextSql).then(
      () => {
        setAppliedSql({ sql: nextSql, previousStoredSql })
        setSqlOpen(false)
      },
      (error: unknown) => {
        setValidation({
          type: 'invalid',
          message: error instanceof Error ? error.message : String(error),
        })
      },
    )
  }

  const persistNextStructuredWrite = (): void => {
    if (structuredWriteRunning) return
    const write = structuredWriteQueue.shift()
    if (!write) return
    structuredWriteRunning = true
    void updateViewBlock(write.markerMatrixId, write.markerRowId, write.sql)
      .then(
        () => {
          confirmedStructuredSql = write.sql
        },
        (error: unknown) => {
          issuedStructuredSql.delete(write.sql)
          if (write.generation !== structuredWriteGeneration) return
          setStructuredSql(
            confirmedStructuredSql === observedStoredSql ? null : confirmedStructuredSql,
          )
          setStructuredWriteError(error instanceof Error ? error.message : String(error))
        },
      )
      .then(() => {
        structuredWriteRunning = false
        persistNextStructuredWrite()
      })
  }

  const commitStructuredEdit = (
    next: NormalizedQuerySpec,
    discoveredScope?: QueryNodeIdentity,
  ): void => {
    const loadedCatalog = catalog()
    if (!loadedCatalog) return
    const commitCatalog =
      discoveredScope ?
        createQueryCatalog({
          matrices: loadedCatalog.matrices,
          nodes: mergeNodeIdentities(loadedCatalog.nodes, [discoveredScope]),
        })
      : loadedCatalog
    let sql: string
    try {
      sql = materializeQuerySpec(next, commitCatalog)
    } catch (error) {
      setStructuredWriteError(error instanceof Error ? error.message : String(error))
      return
    }

    const generation = ++structuredWriteGeneration
    batch(() => {
      if (discoveredScope) mergeDiscoveredNodes([discoveredScope])
      issuedStructuredSql.add(sql)
      setStructuredSql(sql)
      setStructuredWriteError(null)
    })
    structuredWriteQueue.push({
      markerMatrixId: props.block.marker_matrix_id,
      markerRowId: props.block.marker_row_id,
      sql,
      generation,
    })
    persistNextStructuredWrite()
  }

  createEffect(() => {
    const current = storedRecognition()
    if (!current || initialRecognitionHandled) return
    if (
      current.type === 'custom-sql' &&
      current.missingNode &&
      confirmedMissingScopeKey() !== missingScopeKey(effectiveStoredSql(), current.missingNode)
    ) {
      return
    }
    initialRecognitionHandled = true
    if (current.type === 'custom-sql') openSql()
  })

  return (
    <div class={styles.authoring} data-testid="saved-view-authoring">
      <Show when={catalogMatrices() === null}>
        <span class={styles.status} data-testid="saved-view-catalog-loading">
          Loading query fields…
        </span>
      </Show>
      <Show when={catalogError()}>
        {(message) => (
          <span class={styles.error} data-testid="saved-view-catalog-error">
            {message()}
          </span>
        )}
      </Show>
      <Show when={structuredWriteError()}>
        {(message) => (
          <span data-testid="saved-view-structured-error" role="alert" class={styles.error}>
            {message()}
          </span>
        )}
      </Show>
      <Show when={recognition()}>
        {(recognized) => (
          <Show
            when={recognized().type !== 'custom-sql'}
            fallback={
              <span
                data-testid="saved-view-custom-chip"
                class={styles.customChip}
                title={(() => {
                  const current = recognized()
                  return current.type === 'custom-sql' ? current.message : undefined
                })()}
              >
                ≔ custom SQL
              </span>
            }
          >
            {(() => {
              const current = recognized()
              const loadedCatalog = catalog()
              if (current.type === 'custom-sql' || !loadedCatalog) return null
              return (
                <SavedViewStructuredAuthoring
                  spec={current.spec}
                  catalog={loadedCatalog}
                  rootMatrixId={props.rootMatrixId}
                  disabled={sqlOpen()}
                  onCommit={commitStructuredEdit}
                />
              )
            })()}
          </Show>
        )}
      </Show>

      <Show
        when={sqlOpen()}
        fallback={
          <button
            type="button"
            class={styles.disclosureButton}
            data-testid="saved-view-sql-disclosure"
            onClick={() => openSql()}
          >
            view SQL ▸
          </button>
        }
      >
        <div
          class={styles.sqlEditor}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            cancelSql()
          }}
        >
          <textarea
            class={styles.textarea}
            data-testid="saved-view-sql-editor"
            aria-label="View SQL"
            value={sqlDraft()}
            onInput={(event) => {
              const draft = event.currentTarget.value
              setSqlDraft(draft)
              validateDraft(draft)
            }}
          />
          <Show when={validation().type === 'checking'}>
            <span class={styles.status} data-testid="saved-view-sql-checking">
              Checking…
            </span>
          </Show>
          <Show when={validation().type === 'invalid'}>
            <span data-testid="saved-view-sql-invalid" role="alert" class={styles.error}>
              {(() => {
                const current = validation()
                return current.type === 'invalid' ? current.message : ''
              })()}
            </span>
          </Show>
          <div class={styles.actionRow}>
            <button
              type="button"
              data-testid="saved-view-sql-apply"
              disabled={validation().type !== 'valid'}
              onClick={() => applySql()}
            >
              Apply
            </button>
            <button
              type="button"
              data-testid="saved-view-sql-cancel"
              onClick={() => cancelSql()}
            >
              Cancel
            </button>
          </div>
        </div>
      </Show>
    </div>
  )
}

export const ViewCollection: Component<{
  block: ViewBlockRow
  rootMatrixId: number
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
      class={styles.collection}
      data-testid="query-band"
      data-fidelity="substrate"
      data-marker-matrix-id={props.block.marker_matrix_id}
      data-marker-row-id={props.block.marker_row_id}
    >
      <Show when={!props.interiorOnly}>
        <div class={styles.viewHeader}>
          <span class={styles.viewLabel}>
            <Show
              when={props.onOpen}
              fallback={<span>{props.focused ? '≔ view' : 'query:'}</span>}
            >
              {(open) => (
                <button
                  type="button"
                  class={styles.openButton}
                  data-testid="view-place-open"
                  onClick={() => open()()}
                >
                  ≔ {extractTextFromPmDoc(props.block.name ?? '') || 'Untitled view'}
                </button>
              )}
            </Show>
            <Show when={editable().size > 0}>
              <span
                class={styles.editableBadge}
                data-testid="query-band-editable-badge"
                title="Recognized updatable view — passthrough cells are editable"
              >
                editable
              </span>
            </Show>
            <Show when={canEnableWithId()}>
              <button
                type="button"
                class={styles.enableButton}
                data-testid="query-band-enable-edit"
                title="This view's columns become editable once the result set includes id"
                onClick={() => enableEditing()}
              >
                + id to edit
              </button>
            </Show>
          </span>
          <Show when={props.onDelete}>
            {(remove) => (
              <button
                type="button"
                class={styles.deleteButton}
                data-testid="query-band-delete"
                aria-label="Delete view"
                onClick={() => remove()()}
              >
                ×
              </button>
            )}
          </Show>
        </div>
      </Show>

      <SavedViewAuthoring block={props.block} rootMatrixId={props.rootMatrixId} />

      <Show
        when={!error()}
        fallback={
          <div class={styles.error} data-testid="query-band-error">
            {error()?.message}
          </div>
        }
      >
        <Show
          when={rows().length > 0}
          fallback={
            <div class={styles.empty} data-testid="query-band-empty">
              No results.
            </div>
          }
        >
          <div class={styles.rows}>
            <For each={rows()}>
              {(row) => (
                <div class={styles.resultRow} data-testid="query-band-row" role="row">
                  <For each={columns()}>
                    {(column) => (
                      <div role="cell" data-result-column={column.name}>
                        <div class={styles.cellLabel}>{column.name}</div>
                        <Show
                          when={isEditable(column)}
                          fallback={
                            <ReadonlyField
                              column={column}
                              value={String(row[column.name] ?? '')}
                              testId="property-row-readonly-cell"
                            />
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

/**
 * The saved-view stack for a focal node. New views are created through Quick.
 * Mounted in the focus panel like the aspect band.
 */
export const QueryBandsSection: Component<{
  rootMatrixId: number
  matrixId: number
  rowId: number
  onOpenView?: (matrixId: number, rowId: number) => void
  renderCollection: RenderSubjectCollection
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

  return (
    <div class={styles.section} data-testid="query-bands-section">
      <Show when={blocks().length > 0}>
        <For each={blocks()}>
          {(block) => {
            const subject: ViewSubject = {
              mode: 'view',
              matrixId: block.marker_matrix_id,
              rowId: block.marker_row_id,
              sql: block.sql,
            }
            return (
              <div class={styles.inlineView} data-testid="query-band-host">
                {props.renderCollection(subject, {
                  host: 'focus-panel-view',
                  fidelity: 'substrate',
                  view: {
                    name: block.name,
                    onDelete: () =>
                      void deleteViewBlock(block.marker_matrix_id, block.marker_row_id),
                    ...(props.onOpenView ?
                      {
                        onOpen: () =>
                          props.onOpenView?.(block.marker_matrix_id, block.marker_row_id),
                      }
                    : {}),
                  },
                })}
              </div>
            )
          }}
        </For>
      </Show>
    </div>
  )
}

export default QueryBandsSection
