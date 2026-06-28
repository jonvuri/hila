import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  lazy,
  onCleanup,
  onMount,
  Show,
  Suspense,
  type Component,
} from 'solid-js'

import { applyFaceToMatrix, getFaceConfigs, renameMatrix } from '../core/client/matrix-client'
import type { FaceConfig, SlotBindingResult } from '../core/face-types'
import { pendingNewTableMatrixId, clearPendingNewTable } from '../editor/pending-table'
import { useQuery } from '../sql/useQuery'

import { buildDedicatedSubtablesQuery } from './workspace-plugin'

const RENAME_DEBOUNCE_MS = 300

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
 * The band is render-only: dedicated sub-tables are *created* through the §9.6
 * `/table` slash command (see `src/editor/slash-commands.ts`), which supersedes
 * the former dev-grade "+ sub-table" button.
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
  onOpenRowRef: (matrixId: number, rowId: number) => void
}> = (props) => {
  const [config] = createResource<FaceConfig, number>(
    () => props.matrixId,
    async (mid) => {
      const configs = await getFaceConfigs(mid)
      const existing = configs.find((c) => c.faceTypeId === 'hila.table')
      return existing ?? (await applyFaceToMatrix('hila.table', mid))
    },
  )

  // Editable sub-table name (Phase 9 §9.6). Writes through `renameMatrix`; safe
  // for a plain node's sub-table since `syncOwnedMatrixTitles` is scoped to
  // promoted owners (so the owner's label no longer clobbers this title).
  let nameInput: HTMLInputElement | undefined
  const [highlight, setHighlight] = createSignal(false)

  let renameTimer: ReturnType<typeof setTimeout> | undefined
  const scheduleRename = (value: string) => {
    if (renameTimer) clearTimeout(renameTimer)
    renameTimer = setTimeout(() => {
      void renameMatrix(props.matrixId, value).catch((e) =>
        console.error('rename sub-table failed', e),
      )
    }, RENAME_DEBOUNCE_MS)
  }
  onCleanup(() => {
    if (renameTimer) clearTimeout(renameTimer)
  })

  // Reconcile the input from the live title only while the user isn't editing it,
  // mirroring the focus-panel editors (avoids stomping an in-flight rename).
  createEffect(() => {
    const title = props.title
    if (nameInput && document.activeElement !== nameInput) {
      nameInput.value = title
    }
  })

  // Auto-focus handoff: `/table` set the pending signal to this matrix; on mount
  // scroll into view, focus + accent-highlight the name input, then clear it so
  // the next keystrokes name the freshly-created table.
  onMount(() => {
    if (pendingNewTableMatrixId() === props.matrixId) {
      clearPendingNewTable(props.matrixId)
      queueMicrotask(() => {
        if (!nameInput) return
        nameInput.scrollIntoView({ block: 'nearest' })
        nameInput.focus()
        nameInput.select()
        setHighlight(true)
      })
    }
  })

  return (
    <div class="sub-table-band-item" data-testid="sub-table-band-item">
      <input
        ref={nameInput}
        class="sub-table-name-input"
        data-testid="sub-table-name-input"
        placeholder="Untitled table"
        onInput={(e) => scheduleRename(e.currentTarget.value)}
        onBlur={() => setHighlight(false)}
        style={{
          'font-size': '12px',
          'font-weight': 600,
          color: 'var(--text-muted)',
          'margin-bottom': '6px',
          background: 'transparent',
          border: '1px solid transparent',
          'border-radius': '3px',
          padding: '1px 3px',
          width: '100%',
          outline: 'none',
          'box-shadow': highlight() ? '0 0 0 2px var(--accent)' : 'none',
        }}
      />
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
              onOpenRow={(rowId) => props.onOpenRowRef(props.matrixId, rowId)}
            />
          )}
        </Show>
      </Suspense>
    </div>
  )
}

const SubTableBand: Component<{
  focalMatrixId: number
  focalRowId: number
  onOpenRowRef: (matrixId: number, rowId: number) => void
}> = (props) => {
  const { result } = useQuery(() =>
    buildDedicatedSubtablesQuery(props.focalMatrixId, props.focalRowId),
  )
  const subTables = createMemo<SubTableRow[]>(() => {
    const data = result()
    if (!data) return []
    return data as unknown as SubTableRow[]
  })

  return (
    <Show when={subTables().length > 0}>
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
              onOpenRowRef={props.onOpenRowRef}
            />
          )}
        </For>
      </div>
    </Show>
  )
}

export default SubTableBand
