import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
  type Accessor,
} from 'solid-js'

import { resolvePlaceNavigation } from '../core/client/matrix-client'
import type { PlaceNavigationTarget, ResolvedPlaceNavigation } from '../core/place-navigation'
import { extractTextFromPmDoc } from '../editor/pm-text'
import { useQuery } from '../sql/useQuery'

import { buildAncestryForRowsQuery, buildMatrixTitleQuery } from './workspace-plugin'

export type StreamPanel =
  | { id: string; type: 'navigation'; rootKey?: Uint8Array }
  | {
      id: string
      type: 'focus'
      matrixId: number
      rowId: number
      rowKey: Uint8Array
      foldedOrigin?: boolean
      unresolvedPosition?: boolean
    }

export type StreamAncestor = {
  id: string
  label: string
  rowId?: number
  matrixId?: number
  key?: Uint8Array
}

export type StreamControllerInput = {
  matrixId: number
  navigateToPlace?: PlaceNavigationTarget | null
  onNavigated?: () => void
}

export type StreamController = {
  panels: Accessor<readonly StreamPanel[]>
  title: Accessor<string>
  ancestry: Accessor<readonly (readonly StreamAncestor[])[]>
  focusedRowForNavigation: (index: number) => number | undefined
  appendFocus: (fromIndex: number, matrixId: number, rowId: number, rowKey: Uint8Array) => void
  replaceFocus: (fromIndex: number, matrixId: number, rowId: number, rowKey: Uint8Array) => void
  closeFrom: (fromIndex: number) => void
  selectAncestor: (panelIndex: number, ancestor: StreamAncestor) => void
  openPlace: (fromIndex: number, target: PlaceNavigationTarget) => Promise<void>
  openRowReference: (fromIndex: number, matrixId: number, rowId: number) => Promise<void>
  openFoldedFocus: (fromIndex: number, matrixId: number, rowId: number) => Promise<void>
}

type AncestorData = {
  key: Uint8Array
  matrix_id: number
  row_id: number
  label: string | null
  depth: number
}

type AncestorRow = AncestorData & { for_matrix_id: number; for_row_id: number }

const MAX_COLUMNS = 4
const ROOT_PANEL_ID = 'stream-root'

const panelCompositeKey = (matrixId: number, rowId: number): string => `${matrixId}:${rowId}`

const createNavigationRootPanel = (): StreamPanel => ({
  id: ROOT_PANEL_ID,
  type: 'navigation',
})

export const createStreamController = (input: StreamControllerInput): StreamController => {
  let nextPanelId = 0
  const [panels, setPanels] = createSignal<StreamPanel[]>([createNavigationRootPanel()])

  const createFocusPanel = (
    matrixId: number,
    rowId: number,
    rowKey: Uint8Array,
    options?: { foldedOrigin?: boolean; unresolvedPosition?: boolean },
  ): StreamPanel => ({
    id: `stream-focus-${nextPanelId++}`,
    type: 'focus',
    matrixId,
    rowId,
    rowKey,
    ...options,
  })

  const enforceColumnLimit = (next: StreamPanel[]): StreamPanel[] => next.slice(-MAX_COLUMNS)

  const appendFocusWithOptions = (
    fromIndex: number,
    matrixId: number,
    rowId: number,
    rowKey: Uint8Array,
    options?: { foldedOrigin?: boolean; unresolvedPosition?: boolean },
  ) => {
    setPanels((previous) =>
      enforceColumnLimit([
        ...previous.slice(0, fromIndex + 1),
        createFocusPanel(matrixId, rowId, rowKey, options),
      ]),
    )
  }

  const appendFocus = (
    fromIndex: number,
    matrixId: number,
    rowId: number,
    rowKey: Uint8Array,
  ) => appendFocusWithOptions(fromIndex, matrixId, rowId, rowKey)

  const resolvePanels = (
    base: StreamPanel[],
    resolved: ResolvedPlaceNavigation,
    options?: { foldedOrigin?: boolean },
  ): StreamPanel[] => {
    if (resolved.type === 'position') {
      return enforceColumnLimit([
        ...base,
        createFocusPanel(
          resolved.node.matrixId,
          resolved.node.rowId,
          new Uint8Array(resolved.appearance.key),
          options,
        ),
      ])
    }

    const additions: StreamPanel[] = []
    for (const container of resolved.containers) {
      const prior = additions.at(-1) ?? base.at(-1)
      if (
        prior?.type === 'focus' &&
        prior.matrixId === container.node.matrixId &&
        prior.rowId === container.node.rowId
      ) {
        continue
      }
      additions.push(
        createFocusPanel(
          container.node.matrixId,
          container.node.rowId,
          container.key ? new Uint8Array(container.key) : new Uint8Array(0),
          container.key ? undefined : { unresolvedPosition: true },
        ),
      )
    }
    additions.push(
      createFocusPanel(resolved.node.matrixId, resolved.node.rowId, new Uint8Array(0), {
        ...options,
        unresolvedPosition: true,
      }),
    )
    return enforceColumnLimit([...base, ...additions])
  }

  const appendResolvedPlace = (
    fromIndex: number,
    resolved: ResolvedPlaceNavigation,
    options?: { foldedOrigin?: boolean },
  ): void => {
    setPanels((previous) => resolvePanels(previous.slice(0, fromIndex + 1), resolved, options))
  }

  const replaceWithResolvedPlaceFromRoot = (resolved: ResolvedPlaceNavigation): void => {
    setPanels(resolvePanels([createNavigationRootPanel()], resolved))
  }

  const replaceFocus = (
    fromIndex: number,
    matrixId: number,
    rowId: number,
    rowKey: Uint8Array,
  ) => {
    setPanels((previous) =>
      enforceColumnLimit([
        ...previous.slice(0, fromIndex),
        createFocusPanel(matrixId, rowId, rowKey),
      ]),
    )
  }

  const closeFrom = (fromIndex: number) => {
    setPanels((previous) => previous.slice(0, fromIndex))
  }

  const focusPairs = createMemo(() =>
    panels().flatMap((panel) =>
      panel.type === 'focus' ?
        [{ matrixId: panel.matrixId, rowId: panel.rowId, key: panel.rowKey }]
      : [],
    ),
  )

  const ancestryQuery = createMemo(() => {
    const pairs = focusPairs()
    return pairs.length === 0 ? '' : buildAncestryForRowsQuery(input.matrixId, pairs)
  })
  const { result: ancestryResult } = useQuery(() => ancestryQuery())

  const ancestryByCompositeKey = createMemo((): Map<string, AncestorData[]> => {
    const result = new Map<string, AncestorData[]>()
    const rows = ancestryResult() as unknown as AncestorRow[] | undefined
    if (!rows) return result

    for (const row of rows) {
      const compositeKey = panelCompositeKey(row.for_matrix_id, row.for_row_id)
      const chain = result.get(compositeKey) ?? []
      chain.push({
        key: row.key,
        matrix_id: row.matrix_id,
        row_id: row.row_id,
        label: row.label,
        depth: row.depth,
      })
      result.set(compositeKey, chain)
    }
    return result
  })

  const ancestorKeyByCompositeKey = createMemo((): Map<string, Uint8Array> => {
    const result = new Map<string, Uint8Array>()
    for (const chain of ancestryByCompositeKey().values()) {
      for (const ancestor of chain) {
        result.set(panelCompositeKey(ancestor.matrix_id, ancestor.row_id), ancestor.key)
      }
    }
    return result
  })

  const ancestry = createMemo((): readonly (readonly StreamAncestor[])[] => {
    const currentPanels = panels()
    const byCompositeKey = ancestryByCompositeKey()

    return currentPanels.map((panel, index) => {
      const chain =
        panel.type === 'focus' ?
          (byCompositeKey.get(panelCompositeKey(panel.matrixId, panel.rowId)) ?? [])
        : []
      const previous = currentPanels[index - 1]
      const previousCompositeKey =
        previous?.type === 'focus' ?
          panelCompositeKey(previous.matrixId, previous.rowId)
        : undefined
      const previousIndex =
        previousCompositeKey === undefined ? -1 : (
          chain.findIndex(
            (ancestor) =>
              panelCompositeKey(ancestor.matrix_id, ancestor.row_id) === previousCompositeKey,
          )
        )
      const visibleChain = previousIndex >= 0 ? chain.slice(previousIndex + 1) : chain

      return visibleChain.map((ancestor) => ({
        id: `ancestor-${ancestor.matrix_id}-${ancestor.row_id}`,
        label: extractTextFromPmDoc(ancestor.label ?? '') || 'Untitled',
        rowId: ancestor.row_id,
        matrixId: ancestor.matrix_id,
        key: new Uint8Array(ancestor.key),
      }))
    })
  })

  const matrixTitleQuery = createMemo(() => buildMatrixTitleQuery(input.matrixId))
  const { result: matrixTitleResult } = useQuery(() => matrixTitleQuery())
  const title = createMemo(
    () => (matrixTitleResult()?.[0] as { title: string } | undefined)?.title || 'Workspace',
  )

  const focusedRowsByNavigationIndex = createMemo(() => {
    const result = new Map<number, number>()
    const currentPanels = panels()
    for (let index = 0; index < currentPanels.length; index++) {
      if (currentPanels[index]?.type !== 'navigation') continue
      const next = currentPanels[index + 1]
      if (next?.type === 'focus' && next.matrixId === input.matrixId) {
        result.set(index, next.rowId)
      }
    }
    return result
  })

  const selectAncestor = (panelIndex: number, ancestor: StreamAncestor) => {
    if (ancestor.rowId == null || ancestor.matrixId == null) {
      setPanels([createNavigationRootPanel()])
      return
    }
    const key =
      ancestor.key ??
      ancestorKeyByCompositeKey().get(panelCompositeKey(ancestor.matrixId, ancestor.rowId))
    if (key) {
      replaceFocus(panelIndex, ancestor.matrixId, ancestor.rowId, new Uint8Array(key))
    }
  }

  const openPlace = async (fromIndex: number, target: PlaceNavigationTarget): Promise<void> => {
    if (target.type === 'root') {
      if (target.matrixId === input.matrixId) {
        setPanels([createNavigationRootPanel()])
      }
      return
    }
    const resolved = await resolvePlaceNavigation(
      input.matrixId,
      target.node,
      target.provenance,
    )
    if (resolved) appendResolvedPlace(fromIndex, resolved)
  }

  const openRowReference = (fromIndex: number, matrixId: number, rowId: number) =>
    openPlace(fromIndex, { type: 'node', node: { matrixId, rowId } })

  const openFoldedFocus = async (fromIndex: number, matrixId: number, rowId: number) => {
    const resolved = await resolvePlaceNavigation(input.matrixId, { matrixId, rowId })
    if (resolved) appendResolvedPlace(fromIndex, resolved, { foldedOrigin: true })
  }

  let externalNavigationGeneration = 0

  createEffect(
    on(
      () => input.navigateToPlace,
      (target) => {
        const generation = ++externalNavigationGeneration
        if (!target) return
        const navigate = async (): Promise<void> => {
          try {
            if (target.type === 'root') {
              if (
                target.matrixId === input.matrixId &&
                generation === externalNavigationGeneration
              ) {
                setPanels([createNavigationRootPanel()])
              }
            } else {
              const resolved = await resolvePlaceNavigation(
                input.matrixId,
                target.node,
                target.provenance,
              )
              if (resolved && generation === externalNavigationGeneration) {
                replaceWithResolvedPlaceFromRoot(resolved)
              }
            }
          } catch {
            // A failed lookup leaves the current stream unchanged. The acknowledgement below lets
            // the caller clear the consumed target and try again.
          } finally {
            if (generation === externalNavigationGeneration) input.onNavigated?.()
          }
        }
        void navigate()
      },
    ),
  )

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!event.metaKey || event.key !== 'ArrowLeft' || panels().length <= 1) return
    event.preventDefault()
    event.stopPropagation()
    setPanels((previous) => previous.slice(0, -1))
  }

  const handleInlineReferenceNavigate = (event: Event) => {
    const detail = (event as CustomEvent<{ matrixId?: number; rowId: number }>).detail
    if (detail?.rowId == null) return
    event.stopPropagation()
    const navigate = async (): Promise<void> => {
      const resolved = await resolvePlaceNavigation(
        input.matrixId,
        {
          matrixId: detail.matrixId ?? input.matrixId,
          rowId: detail.rowId,
        },
        undefined,
      )
      if (resolved) replaceWithResolvedPlaceFromRoot(resolved)
    }
    void navigate()
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeyDown, { capture: true })
    document.addEventListener('inlineref-navigate', handleInlineReferenceNavigate)
  })

  onCleanup(() => {
    externalNavigationGeneration++
    document.removeEventListener('keydown', handleKeyDown, { capture: true })
    document.removeEventListener('inlineref-navigate', handleInlineReferenceNavigate)
  })

  return {
    panels,
    title,
    ancestry,
    focusedRowForNavigation: (index) => focusedRowsByNavigationIndex().get(index),
    appendFocus,
    replaceFocus,
    closeFrom,
    selectAncestor,
    openPlace,
    openRowReference,
    openFoldedFocus,
  }
}
