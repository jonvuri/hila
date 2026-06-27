import { createMemo, createResource, For, lazy, Show, Suspense, type Component } from 'solid-js'

import {
  applyFaceToMatrix,
  createOwnedMatrix,
  getFaceConfigs,
} from '../core/client/matrix-client'
import type { FaceConfig, SlotBindingResult } from '../core/face-types'
import { useQuery } from '../sql/useQuery'

import { buildDedicatedSubtablesQuery } from './workspace-plugin'

const TableFace = lazy(() => import('../table/TableFace'))

/**
 * Sub-table band (Phase 9.4; see context/Phase-9.md §9.4).
 *
 * The *composed* cousin of the §9.3 query band: a focal node's dedicated,
 * homogeneous own-matrixes (private sub-tables, Phase 8c §3) rendered through
 * the real matrix-bound `TableFace` — not the schema-adaptive `PropertyRow`.
 *
 * It is an **anchored** band: ownership is the source of truth (live-derived
 * from `matrix.owner` via `buildDedicatedSubtablesQuery`, like the aspect band,
 * not persisted in `bands`), so it can node-insert — the embedded `TableFace`
 * gets `insertParent` = the focal node, routing "+ New Row" through
 * `createDependentRow` so every row stays owned by the node.
 *
 * The "+ sub-table" control is a dev-grade placeholder for the §9.6 unified
 * creation gesture: it creates an empty dedicated own-matrix for the node.
 */

type SubTableRow = { id: number; title: string }

const EMBED_BINDINGS: SlotBindingResult = { bindings: [], overflowColumns: [] }

/**
 * One embedded sub-table: ensures a `hila.table` face config exists for the
 * matrix (reusing it if present, else creating one), then mounts `TableFace`.
 * The resource keys on the matrix id so the config is resolved once per table.
 */
const EmbeddedSubTable: Component<{
  matrixId: number
  title: string
  focalMatrixId: number
  focalRowId: number
}> = (props) => {
  const [config] = createResource<FaceConfig, number>(
    () => props.matrixId,
    async (mid) => {
      const configs = await getFaceConfigs(mid)
      const existing = configs.find((c) => c.faceTypeId === 'hila.table')
      return existing ?? (await applyFaceToMatrix('hila.table', mid))
    },
  )

  return (
    <div class="sub-table-band-item" data-testid="sub-table-band-item">
      <div
        style={{
          'font-size': '12px',
          'font-weight': 600,
          color: 'var(--text-muted)',
          'margin-bottom': '6px',
        }}
      >
        {props.title || 'Sub-table'}
      </div>
      <Suspense
        fallback={
          <div style={{ color: 'var(--text-muted)', 'font-size': '12px' }}>Loading table…</div>
        }
      >
        <Show when={config()}>
          {(c) => (
            <TableFace
              config={c()}
              bindings={EMBED_BINDINGS}
              insertParent={{ matrixId: props.focalMatrixId, rowId: props.focalRowId }}
            />
          )}
        </Show>
      </Suspense>
    </div>
  )
}

const SubTableBand: Component<{ focalMatrixId: number; focalRowId: number }> = (props) => {
  const { result } = useQuery(() =>
    buildDedicatedSubtablesQuery(props.focalMatrixId, props.focalRowId),
  )
  const subTables = createMemo<SubTableRow[]>(() => {
    const data = result()
    if (!data) return []
    return data as unknown as SubTableRow[]
  })

  const addSubTable = () => {
    void createOwnedMatrix(
      { matrixId: props.focalMatrixId, rowId: props.focalRowId },
      'Sub-table',
      [{ name: 'title', type: 'TEXT', role: 'label' }],
    )
  }

  return (
    <div
      class="sub-table-band"
      data-testid="sub-table-band"
      style={{
        'margin-bottom': '16px',
        'border-top': '1px solid hsl(230, 15%, 18%)',
        'padding-top': '12px',
        display: 'flex',
        'flex-direction': 'column',
        gap: '12px',
      }}
    >
      <For each={subTables()}>
        {(t) => (
          <EmbeddedSubTable
            matrixId={t.id}
            title={t.title}
            focalMatrixId={props.focalMatrixId}
            focalRowId={props.focalRowId}
          />
        )}
      </For>

      {/* Dev-grade creation affordance — placeholder for the §9.6 gesture. */}
      <button
        type="button"
        data-testid="sub-table-add"
        onClick={() => addSubTable()}
        style={{
          'font-size': '12px',
          cursor: 'pointer',
          'align-self': 'flex-start',
          background: 'none',
          border: '1px solid hsl(230, 15%, 24%)',
          'border-radius': '4px',
          color: 'var(--text-dim)',
          padding: '3px 8px',
        }}
      >
        + sub-table
      </button>
    </div>
  )
}

export default SubTableBand
