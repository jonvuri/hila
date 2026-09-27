import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type Component,
} from 'solid-js'

import {
  createDependentRow,
  getFaceConfigForMatrix,
  renameMatrix,
} from '../core/client/matrix-client'
import { resolveFaceAffinity } from '../core/face-affinity'
import { FaceHostSlot, type FaceHostServices } from '../core/face-runtime'
import type { ContainerSubject } from '../core/face-types'
import { pendingNewTableMatrixId, clearPendingNewTable } from '../editor/pending-table'
import { useQuery } from '../sql/useQuery'

import { buildDedicatedSubtablesQuery } from './workspace-plugin'
import styles from './SubTableBand.module.css'

const RENAME_DEBOUNCE_MS = 300

/**
 * Sub-table band (Phase 9.4; see context/Phase-9.md §9.4).
 *
 * The *composed* cousin of the §9.3 query band: a focal node's dedicated,
 * homogeneous own-matrixes (private sub-tables, Phase 8c §3) rendered through
 * registered collection dispatch — not the schema-adaptive `PropertyRow`.
 *
 * It is an **anchored** band: ownership is the source of truth (live-derived
 * from `matrix.owner` via `buildDedicatedSubtablesQuery`, like the aspect band,
 * not persisted in `bands`), so its host can route insertion through
 * `createDependentRow` and keep every row owned by the node.
 *
 * The band is render-only: dedicated sub-tables are *created* through the §9.6
 * `/table` slash command (see `src/editor/slash-commands.ts`), which supersedes
 * the former dev-grade "+ sub-table" button.
 */

type SubTableRow = { id: number; title: string }

/**
 * One embedded sub-table. The host resolves the matrix's intentional recipe and
 * falls through visibly when none exists; rendering never creates recipe state.
 */
const EmbeddedSubTable: Component<{
  rootMatrixId: number
  matrixId: number
  title: string
  focalMatrixId: number
  focalRowId: number
  onOpenRowRef: (matrixId: number, rowId: number) => void
}> = (props) => {
  const [config] = createResource(() => props.matrixId, getFaceConfigForMatrix)
  const subject = createMemo<ContainerSubject>(() => ({
    mode: 'container',
    matrixId: props.focalMatrixId,
    rowId: props.focalRowId,
    extentMatrixId: props.matrixId,
  }))
  const affinity = createMemo(() => resolveFaceAffinity(config()))
  const services: FaceHostServices = {
    requestInsert: async (request) => ({
      matrixId: props.matrixId,
      rowId: await createDependentRow(
        props.focalMatrixId,
        props.focalRowId,
        props.matrixId,
        request.values ? { ...request.values } : undefined,
      ),
    }),
    requestNavigation: (target) => props.onOpenRowRef(target.matrixId, target.rowId),
  }
  const fallbackMessage = () => {
    if (config.loading) return 'Loading table…'
    if (config.error) return 'Table recipe failed to load.'
    return 'No collection face is configured for this table.'
  }

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
    <section class={styles.item} data-testid="sub-table-band-item">
      <input
        ref={nameInput}
        class={styles.nameInput}
        data-testid="sub-table-name-input"
        aria-label="Table name"
        placeholder="Untitled table"
        onInput={(e) => scheduleRename(e.currentTarget.value)}
        onBlur={() => setHighlight(false)}
        data-highlighted={highlight() ? 'true' : undefined}
      />
      <div class={styles.collectionHost} data-testid="sub-table-collection-host">
        <FaceHostSlot
          host="embedded-table"
          kind="collection"
          subject={subject()}
          affinity={affinity()}
          rootMatrixId={props.rootMatrixId}
          services={services}
          substrate={
            <div
              class={styles.fallback}
              role={config.error ? 'alert' : 'status'}
              data-testid="sub-table-collection-fallback"
            >
              {fallbackMessage()}
            </div>
          }
        />
      </div>
    </section>
  )
}

const SubTableBand: Component<{
  rootMatrixId: number
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
      <div class={styles.band} data-testid="sub-table-band">
        <For each={subTables()}>
          {(t) => (
            <EmbeddedSubTable
              rootMatrixId={props.rootMatrixId}
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
