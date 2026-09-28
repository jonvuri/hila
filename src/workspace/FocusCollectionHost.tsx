import {
  createMemo,
  createResource,
  createSignal,
  For,
  on,
  Show,
  type Component,
} from 'solid-js'

import { createDependentRow, getFaceConfigForMatrix } from '../core/client/matrix-client'
import { FaceHostSlot, type FaceHostServices } from '../core/face-runtime'
import type { FaceSubject } from '../core/face-types'
import type { Density, RenderingFidelity } from '../design/tokens'
import { PropertyLine } from '../shared/PropertyLine'
import { useQuery } from '../sql/useQuery'

import { ViewCollection } from './QueryBand'
import SubstrateRegion from './SubstrateRegion'
import {
  getFocusCollectionRecipeMatrixId,
  resolveFocusCollectionAffinity,
  type RenderSubjectCollection,
} from './focus-subject'
import styles from './FocusCollectionHost.module.css'

const SUBSTRATE_PAGE_SIZE = 100

const subjectKey = (subject: FaceSubject): string =>
  subject.mode === 'container' ?
    `${subject.mode}:${subject.matrixId}:${subject.rowId}:${subject.extentMatrixId}`
  : subject.mode === 'view' ? `${subject.mode}:${subject.matrixId}:${subject.rowId}`
  : `${subject.mode}:${subject.matrixId}:${subject.rowId}`

const SubstrateContainerCollection: Component<{
  subject: Extract<FaceSubject, { mode: 'container' }>
  density: Density
  services: FaceHostServices
}> = (props) => {
  const [page, setPage] = createSignal(0)
  const query = createMemo(() => {
    const offset = page() * SUBSTRATE_PAGE_SIZE
    return `SELECT id FROM "mx_${props.subject.extentMatrixId}_data" ORDER BY id LIMIT ${SUBSTRATE_PAGE_SIZE + 1} OFFSET ${offset}`
  })
  const { result, error } = useQuery(() => query())
  const rowIds = createMemo(() =>
    ((result() ?? []) as unknown as { id: number }[]).map((row) => row.id),
  )
  const visibleRowIds = createMemo(() => rowIds().slice(0, SUBSTRATE_PAGE_SIZE))
  const hasNextPage = createMemo(() => rowIds().length > SUBSTRATE_PAGE_SIZE)

  return (
    <div class={styles.substrateCollection} data-testid="substrate-collection">
      <Show
        when={!error()}
        fallback={<div class={styles.error}>Collection failed to load.</div>}
      >
        <Show
          when={visibleRowIds().length > 0}
          fallback={<div class={styles.empty}>No rows.</div>}
        >
          <div class={styles.rows} role="rowgroup">
            <For each={visibleRowIds()}>
              {(rowId) => (
                <div class={styles.row} role="row">
                  <PropertyLine
                    matrixId={props.subject.extentMatrixId}
                    rowId={rowId}
                    density={props.density}
                  />
                  <Show when={props.services.requestNavigation}>
                    {(navigate) => (
                      <button
                        type="button"
                        class={styles.rowAction}
                        aria-label="Open row"
                        onClick={() =>
                          navigate()({
                            matrixId: props.subject.extentMatrixId,
                            rowId,
                          })
                        }
                      >
                        →
                      </button>
                    )}
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
      <div class={styles.actions}>
        <Show when={page() > 0}>
          <button type="button" onClick={() => setPage((current) => current - 1)}>
            Previous
          </button>
        </Show>
        <Show when={hasNextPage()}>
          <button type="button" onClick={() => setPage((current) => current + 1)}>
            Next
          </button>
        </Show>
        <Show when={props.services.requestInsert}>
          {(insert) => (
            <button
              type="button"
              onClick={() => {
                void insert()({})
              }}
            >
              New row
            </button>
          )}
        </Show>
      </div>
    </div>
  )
}

type FocusCollectionHostProps = {
  rootMatrixId: number
  subject: FaceSubject
  onOpenRowRef: (matrixId: number, rowId: number) => void
  contentAnchoredKeys?: Set<string>
  density?: Density
  fidelity?: RenderingFidelity
  host?: string
  view?: {
    name?: string | null
    onDelete: () => void
    onOpen?: () => void
  }
}

/**
 * The focus panel's one collection host path.
 *
 * Container affinity follows the extent matrix. Loose and view subjects keep their substrate-owned
 * child sources. The host owns navigation, insertion, substrate dispatch, and recursion.
 */
const FocusCollectionHost: Component<FocusCollectionHostProps> = (props) => {
  const recipeMatrixId = createMemo(
    () => getFocusCollectionRecipeMatrixId(props.subject) ?? false,
  )
  const substrateIdentity = createMemo(() => subjectKey(props.subject))
  const [config] = createResource(recipeMatrixId, getFaceConfigForMatrix)
  const affinity = createMemo(() => resolveFocusCollectionAffinity(props.subject, config()))
  const density = (): Density => props.density ?? 'wide'
  const services = createMemo<FaceHostServices>(() => {
    const subject = props.subject
    return {
      requestNavigation: (target) => props.onOpenRowRef(target.matrixId, target.rowId),
      ...(subject.mode === 'container' ?
        {
          requestInsert: async (request) => ({
            matrixId: subject.extentMatrixId,
            rowId: await createDependentRow(
              subject.matrixId,
              subject.rowId,
              subject.extentMatrixId,
              request.values ? { ...request.values } : undefined,
            ),
          }),
        }
      : {}),
    }
  })

  const renderCollection: RenderSubjectCollection = (subject, options) => (
    <FocusCollectionHost
      rootMatrixId={props.rootMatrixId}
      subject={subject}
      onOpenRowRef={props.onOpenRowRef}
      density={density()}
      fidelity={options?.fidelity}
      host={options?.host ?? 'focus-panel-nested'}
      view={options?.view}
    />
  )

  const viewBlock = {
    get marker_matrix_id() {
      return props.subject.matrixId
    },
    get marker_row_id() {
      return props.subject.rowId
    },
    get name() {
      return props.view?.name
    },
    get sql() {
      return props.subject.mode === 'view' ? props.subject.sql : ''
    },
  }
  const substrate = createMemo(
    on(substrateIdentity, () => {
      const subject = props.subject
      if (subject.mode === 'loose') {
        return (
          <SubstrateRegion
            rootMatrixId={props.rootMatrixId}
            subject={subject}
            contentAnchoredKeys={props.contentAnchoredKeys}
            onOpenRowRef={props.onOpenRowRef}
            renderCollection={renderCollection}
          />
        )
      }
      if (subject.mode === 'view') {
        return (
          <ViewCollection
            rootMatrixId={props.rootMatrixId}
            block={viewBlock}
            onDelete={props.view?.onDelete}
            onOpen={props.view?.onOpen}
            interiorOnly={!props.view}
          />
        )
      }
      return (
        <Show
          when={!config.loading}
          fallback={
            <div
              class={styles.status}
              role="status"
              data-testid="sub-table-collection-fallback"
            >
              Loading collection…
            </div>
          }
        >
          <Show
            when={!config.error}
            fallback={
              <div
                class={styles.error}
                role="alert"
                data-testid="sub-table-collection-fallback"
              >
                Collection recipe failed to load.
              </div>
            }
          >
            <SubstrateContainerCollection
              subject={subject}
              density={density()}
              services={services()}
            />
          </Show>
        </Show>
      )
    }),
  )

  return (
    <div class={styles.host} data-subject-key={subjectKey(props.subject)}>
      <FaceHostSlot
        host={props.host ?? 'focus-panel'}
        kind="collection"
        subject={props.subject}
        affinity={affinity()}
        rootMatrixId={props.rootMatrixId}
        density={density()}
        fidelity={props.fidelity}
        services={services()}
        substrate={substrate()}
        renderYieldedSubject={(subject) => renderCollection(subject)}
      />
    </div>
  )
}

export default FocusCollectionHost
