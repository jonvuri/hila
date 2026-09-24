import {
  For,
  Show,
  batch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  untrack,
  type JSX,
} from 'solid-js'

import {
  commandRegistry,
  type CommandInvocationCapabilities,
  type CommandInvocationContext,
} from '../command-registry'
import { createViewBlockAtAppearance, getColumns } from '../core/client/matrix-client'
import type { CreatedViewBlock } from '../core/block-marker'
import { addObserver, removeObserver } from '../core/client/sql-client'
import type { ColumnDefinition } from '../core/matrix'
import type { AppearanceProvenance, PlaceNavigationTarget } from '../core/place-navigation'
import type { NodeRef } from '../core/tree'
import type { SqlObserver, SqlQuery } from '../core/sql-types'
import { CenteredOverlay } from '../design/overlay/Overlay'
import {
  SelectableList,
  getInitialSelectableListId,
  getSelectableListAction,
  type SelectableListItem,
} from '../design/overlay/SelectableList'
import type { VisualTheme } from '../design/tokens'
import { createWorkspaceDiscoveryService } from '../discovery/workspace-discovery'
import type {
  DiscoveryRequest,
  DiscoveryResult,
  DiscoverySearchOutcome,
} from '../discovery/types'
import { outlineShortcutDescriptors } from '../editor/keymap'
import {
  collectShortcutDescriptors,
  displayShortcutKey,
  getShortcutPlatform,
  shortcuts,
} from '../shortcuts'
import { createQueryCatalog } from '../sql/query-spec/catalog'
import { compileQuerySpec } from '../sql/query-spec/compile'
import { materializeQuerySpec } from '../sql/query-spec/materialize'

import DeepPreview from './DeepPreview'
import { buildDistinctValuesRequest } from './distinct-values'
import { createLauncherEchoBoxes, type LauncherEchoBox } from './echo'
import type { LauncherInvocation } from './invocation'
import {
  authoringCommitForLauncherItem,
  buildLauncherItems,
  launcherFamilyForToken,
  launcherFamilies,
  launcherInteractionShortcutDescriptors,
  navigationTargetForLauncherItem,
  splitLauncherInput,
  type LauncherFamilyFilter,
  type LauncherListItem,
} from './model'
import {
  createLauncherQueryState,
  launcherPreviewColumns,
  queryTempo,
  reduceLauncherQuery,
  relativeDateFreezeNotice,
  type LauncherQueryChip,
  type LauncherQueryState,
} from './query-authoring'
import {
  FORMULA_QUERY_UNAVAILABLE_REASON,
  parseTypedColumnOperator,
  queryAuthoringOperators,
  queryOperatorCandidates,
  type QueryAuthoringOperator,
} from './query-grammar'
import styles from './QuickLauncher.module.css'

export type LauncherDiscoveryService = {
  search: (request: DiscoveryRequest) => Promise<DiscoverySearchOutcome>
  cancel: () => void
}

export type QuickLauncherProps = {
  rootMatrixId: number | null
  visualTheme: VisualTheme
  invocation: LauncherInvocation
  commandCapabilities?: CommandInvocationCapabilities
  discoveryService?: LauncherDiscoveryService
  loadColumns?: (matrixId: number) => Promise<ColumnDefinition[]>
  runCommand?: (id: string, context: CommandInvocationContext) => Promise<void>
  createView?: (
    focalMatrixId: number,
    focalRowId: number,
    provenance: AppearanceProvenance,
    sql: string,
    name: string,
  ) => Promise<CreatedViewBlock>
  onSavedView?: (
    marker: NodeRef,
    generatedName: string,
    provenance: AppearanceProvenance,
  ) => void
  insertRef?: (target: {
    matrixId: number
    rowId: number
    cachedTitle: string
  }) => string | null
  onNavigate: (target: PlaceNavigationTarget) => void
  onDismiss: () => void
}

const WipeoutEchoes = (props: { tempo: 'quick' | 'deep' }) => {
  let layer: HTMLDivElement | undefined
  let quickGeometryProbe: HTMLDivElement | undefined
  let frame = 0
  const [boxes, setBoxes] = createSignal<readonly LauncherEchoBox[]>([])

  const measure = () => {
    if (!layer) return
    const layerBounds = layer.getBoundingClientRect()
    if (layerBounds.width === 0 || layerBounds.height === 0) return

    let start: { left: number; top: number; width: number; height: number } | null = null
    if (props.tempo === 'deep') {
      const quickBounds = quickGeometryProbe?.getBoundingClientRect()
      if (quickBounds) {
        start = {
          left: quickBounds.left - layerBounds.left,
          top: quickBounds.top - layerBounds.top,
          width: quickBounds.width,
          height: quickBounds.height,
        }
      }
    } else {
      const mark = document.querySelector<HTMLElement>('[data-launcher-workspace-mark]')
      const title = document.querySelector<HTMLElement>('[data-launcher-workspace-title]')
      if (!mark || !title) return
      const markBounds = mark.getBoundingClientRect()
      const titleBounds = title.getBoundingClientRect()
      const inset =
        Number.parseFloat(getComputedStyle(layer).getPropertyValue('--space-8')) || 8
      const left = Math.min(markBounds.left, titleBounds.left) - inset
      const top = Math.min(markBounds.top, titleBounds.top) - inset
      const right = Math.max(markBounds.right, titleBounds.right) + inset
      const bottom = Math.max(markBounds.bottom, titleBounds.bottom) + inset
      start = {
        left: left - layerBounds.left,
        top: top - layerBounds.top,
        width: right - left,
        height: bottom - top,
      }
    }
    if (!start) return
    setBoxes(
      createLauncherEchoBoxes(start, {
        left: 0,
        top: 0,
        width: layerBounds.width,
        height: layerBounds.height,
      }),
    )
  }

  onMount(() => {
    frame = requestAnimationFrame(measure)
  })
  createEffect(() => {
    void props.tempo
    setBoxes([])
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(measure)
  })
  onCleanup(() => cancelAnimationFrame(frame))

  return (
    <div
      ref={layer}
      class={styles.echoes}
      data-echo-tempo={props.tempo}
      data-testid="launcher-echoes"
      aria-hidden="true"
    >
      <div ref={quickGeometryProbe} class={styles.quickGeometryProbe} />
      <For each={boxes()}>
        {(box) => (
          <span
            class={styles.echoFrame}
            data-echo-progress={box.progress}
            style={{
              left: `${box.left}px`,
              top: `${box.top}px`,
              width: `${box.width}px`,
              height: `${box.height}px`,
            }}
          />
        )}
      </For>
    </div>
  )
}

type OperatorDraft = {
  readonly stage: 'operator'
  readonly column: ColumnDefinition
  readonly restoreState?: LauncherQueryState
}

type ValueDraft = {
  readonly stage: 'value'
  readonly column: ColumnDefinition
  readonly operator: QueryAuthoringOperator
  readonly restoreState?: LauncherQueryState
}

type AuthoringDraft = OperatorDraft | ValueDraft

type ObjectEditDraft = {
  readonly chip: LauncherQueryChip
  readonly beforeState: LauncherQueryState
}

type ColumnAuthoringItem = SelectableListItem & {
  readonly kind: 'column'
  readonly column: ColumnDefinition
}

type OperatorAuthoringItem = SelectableListItem & {
  readonly kind: 'operator'
  readonly operator: QueryAuthoringOperator
}

type ValueAuthoringItem = SelectableListItem & {
  readonly kind: 'value'
  readonly value: string
}

type AuthoringItem = ColumnAuthoringItem | OperatorAuthoringItem | ValueAuthoringItem

const columnItems = (
  columns: readonly ColumnDefinition[],
  query: string,
): readonly ColumnAuthoringItem[] => {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []
  return columns
    .filter((column) => column.name.toLocaleLowerCase().includes(needle))
    .sort(
      (left, right) =>
        Number(!left.name.toLocaleLowerCase().startsWith(needle)) -
          Number(!right.name.toLocaleLowerCase().startsWith(needle)) ||
        left.order - right.order,
    )
    .map((column) => ({
      id: `column:${column.id}`,
      kind: 'column' as const,
      column,
      label: column.name,
      description: column.formula === null ? column.displayType : 'Formula',
      mark: column.formula === null ? '·' : 'ƒ',
      unavailableReason:
        column.formula === null ?
          undefined
        : 'Formula columns cannot filter or sort in this version.',
    }))
}

const operatorItems = (
  column: ColumnDefinition,
  query: string,
): readonly OperatorAuthoringItem[] =>
  queryOperatorCandidates(column, query).map((operator) => ({
    id: `operator:${operator.id}`,
    kind: 'operator',
    operator,
    label: operator.name,
    description: operator.requiresValue ? 'Enter a value next' : 'Commit immediately',
    mark: operator.glyph,
    unavailableReason: operator.unavailableReason,
  }))

const dateValueTokens = ['today', 'tomorrow', 'this week', 'last week', 'next week'] as const

const valueItems = (
  draft: ValueDraft,
  query: string,
  distinctValues: readonly unknown[],
): readonly ValueAuthoringItem[] => {
  const needle = query.trim().toLocaleLowerCase()
  const values =
    draft.column.displayType === 'boolean' ? ['true', 'false']
    : draft.column.displayType === 'date' ? [...dateValueTokens]
    : draft.column.displayType === 'select' ? distinctValues.map((value) => String(value))
    : []
  return [...new Set(values)]
    .filter((value) => !needle || value.toLocaleLowerCase().includes(needle))
    .map((value) => ({
      id: `value:${value}`,
      kind: 'value' as const,
      value,
      label: value,
      mark: '=',
    }))
}

const QuickLauncher = (props: QuickLauncherProps) => {
  const context: CommandInvocationContext = {
    surface: 'launcher',
    subject: untrack(() => props.invocation.subject),
    capabilities: { ...untrack(() => props.commandCapabilities) },
  }
  const discovery =
    untrack(() => props.discoveryService) ??
    createWorkspaceDiscoveryService({
      commandContext: () => context,
    })
  const invokeCommand = untrack(() => props.runCommand) ?? commandRegistry.invoke
  const createSavedView = untrack(() => props.createView) ?? createViewBlockAtAppearance
  const loadMatrixColumns = untrack(() => props.loadColumns) ?? getColumns
  const [queryState, setQueryState] = createSignal(createLauncherQueryState())
  const [editorText, setEditorText] = createSignal('')
  const [draft, setDraft] = createSignal<AuthoringDraft | null>(null)
  const [objectEdit, setObjectEdit] = createSignal<ObjectEditDraft | null>(null)
  const [filter, setFilter] = createSignal<LauncherFamilyFilter | null>(null)
  const [rawResults, setRawResults] = createSignal<DiscoveryResult[]>([])
  const [selectedId, setSelectedId] = createSignal<string | null>(null)
  const [loading, setLoading] = createSignal(false)
  const [catalogLoading, setCatalogLoading] = createSignal(false)
  const [catalogError, setCatalogError] = createSignal<string | null>(null)
  const [distinctValues, setDistinctValues] = createSignal<readonly unknown[]>([])
  const [distinctError, setDistinctError] = createSignal<Error | null>(null)
  const [interactionNotice, setInteractionNotice] = createSignal<string | null>(null)
  const [columns, setColumns] = createSignal<readonly ColumnDefinition[]>([])
  const [helpOpen, setHelpOpen] = createSignal(false)
  const [restoreInvoker, setRestoreInvoker] = createSignal(true)
  const [saving, setSaving] = createSignal(false)
  const [cursorIndex, setCursorIndex] = createSignal(0)
  const [input, setInput] = createSignal<HTMLInputElement>()
  const chipElements = new Map<string, HTMLButtonElement>()
  let searchGeneration = 0
  let catalogGeneration = 0
  let distinctGeneration = 0
  let distinctSubscription: {
    readonly request: SqlQuery
    readonly observer: SqlObserver
  } | null = null

  const tempo = createMemo(() => queryTempo(queryState().spec))
  const searchActive = () => filter() !== null || editorText().trim().length > 0
  const shouldDiscover = () =>
    !draft() && (tempo() === 'quick' ? searchActive() : filter() !== null)
  const launcherItems = createMemo(() =>
    buildLauncherItems({
      results: rawResults(),
      query: editorText(),
      filter: filter(),
      subjectLabel: props.invocation.subjectLabel,
    }),
  )
  const activeFilter = createMemo(() =>
    launcherFamilies.find((family) => family.filter === filter()),
  )
  const listId = 'quick-launcher-results'
  const shortcutGuide = collectShortcutDescriptors(
    shortcuts.getDescriptors(),
    outlineShortcutDescriptors,
    launcherInteractionShortcutDescriptors,
  )
  const commandGuide = commandRegistry.entries(context)
  const platform = getShortcutPlatform()

  const selectedKindChip = createMemo(() =>
    queryState().chips.find((chip) => chip.type === 'kind'),
  )
  const catalogMatrixId = createMemo(() => {
    const kind = queryState().spec.kind
    return kind.type === 'matrix' ? kind.matrixId : null
  })
  const authoringColumns = createMemo(() => columnItems(columns(), draft() ? '' : editorText()))
  const operatorMenuItems = createMemo(() => {
    const current = draft()
    return current?.stage === 'operator' ? operatorItems(current.column, editorText()) : []
  })

  const distinctRequest = createMemo<SqlQuery | null>(() => {
    const current = draft()
    const kind = queryState().spec.kind
    if (current?.stage !== 'value' || current.column.displayType !== 'select') return null
    if (kind.type !== 'matrix') return null
    return buildDistinctValuesRequest(kind.matrixId, current.column, editorText())
  })
  const valueMenuItems = createMemo(() => {
    const current = draft()
    if (current?.stage !== 'value') return []
    return valueItems(current, editorText(), distinctValues())
  })
  const deepDiscoveryItems = createMemo(() =>
    tempo() === 'deep' && filter() !== null ? launcherItems() : [],
  )
  const activeItems = createMemo<readonly (LauncherListItem | AuthoringItem)[]>(() => {
    const current = draft()
    if (current?.stage === 'operator') return operatorMenuItems()
    if (current?.stage === 'value') return valueMenuItems()
    if (tempo() === 'deep') {
      if (filter() !== null) return deepDiscoveryItems()
      return authoringColumns()
    }
    return launcherItems()
  })
  const authoringListVisible = createMemo(
    () =>
      draft() !== null ||
      (tempo() === 'deep' && (filter() !== null || activeItems().length > 0)),
  )

  createEffect(() => {
    const rootMatrixId = props.rootMatrixId
    const requestedQuery = editorText()
    const requestedFilter = filter()
    const showingHelp = helpOpen()
    const discover = shouldDiscover()
    const generation = ++searchGeneration

    if (
      showingHelp ||
      !discover ||
      (!requestedFilter && !requestedQuery.trim()) ||
      rootMatrixId == null
    ) {
      discovery.cancel()
      batch(() => {
        setRawResults([])
        setLoading(false)
      })
      return
    }

    batch(() => {
      setRawResults([])
      setLoading(true)
    })
    void discovery
      .search({
        rootMatrixId,
        query: requestedQuery,
        filter: requestedFilter ?? 'all',
        limit: 12,
      })
      .then((outcome) => {
        if (generation !== searchGeneration || outcome.status === 'stale') return
        batch(() => {
          setRawResults([...outcome.results])
          setLoading(false)
        })
      })
      .catch(() => {
        if (generation !== searchGeneration) return
        batch(() => {
          setRawResults([])
          setLoading(false)
        })
      })
  })

  createEffect(() => {
    const nextItems = activeItems()
    setSelectedId((current) => getInitialSelectableListId(nextItems, current))
  })

  createEffect(() => {
    const request = distinctRequest()
    const generation = ++distinctGeneration
    if (!request) {
      setDistinctValues([])
      setDistinctError(null)
      if (distinctSubscription) {
        removeObserver(distinctSubscription.request, distinctSubscription.observer)
        distinctSubscription = null
      }
      return
    }

    batch(() => {
      setDistinctValues([])
      setDistinctError(null)
    })
    const observer: SqlObserver = (result, error) => {
      if (generation !== distinctGeneration) return
      batch(() => {
        setDistinctValues((result ?? []).map((row) => row.value))
        setDistinctError(error)
      })
    }
    addObserver(request, observer)
    if (distinctSubscription) {
      removeObserver(distinctSubscription.request, distinctSubscription.observer)
    }
    distinctSubscription = { request, observer }
  })

  createEffect(() => {
    const matrixId = catalogMatrixId()
    const generation = ++catalogGeneration
    if (matrixId === null) {
      batch(() => {
        setColumns([])
        setCatalogLoading(false)
        setCatalogError(null)
      })
      return
    }

    batch(() => {
      setColumns([])
      setCatalogLoading(true)
      setCatalogError(null)
    })
    void loadMatrixColumns(matrixId)
      .then((nextColumns) => {
        if (generation !== catalogGeneration) return
        batch(() => {
          setColumns(nextColumns)
          setCatalogLoading(false)
        })
      })
      .catch((error: unknown) => {
        if (generation !== catalogGeneration) return
        batch(() => {
          setColumns([])
          setCatalogLoading(false)
          setCatalogError(error instanceof Error ? error.message : String(error))
        })
      })
  })

  const previewQueryState = createMemo(() => {
    const state = queryState()
    const currentDraft = draft()
    if (currentDraft?.stage !== 'value') return state
    return reduceLauncherQuery(state, {
      type: 'commit-column',
      column: currentDraft.column,
      operator: currentDraft.operator.id,
      valueText: editorText(),
    })
  })

  const compiledPreview = createMemo(() => {
    const state = previewQueryState()
    if (state.invalid) return null
    if (state.spec.kind.type !== 'matrix' || catalogLoading() || catalogError()) return null
    try {
      const catalog = createQueryCatalog({
        matrices: [
          {
            id: state.spec.kind.matrixId,
            title: selectedKindChip()?.label,
            columns: columns(),
          },
        ],
        nodes: state.spec.scope.type === 'node' ? [state.spec.scope] : [],
      })
      return { compiled: compileQuerySpec(state.spec, catalog), error: null }
    } catch (error) {
      return {
        compiled: null,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  const previewInvalidReason = createMemo(() => {
    const state = previewQueryState()
    if (state.spec.kind.type !== 'matrix') return 'Choose a type or container to preview.'
    return catalogError() ?? state.invalid?.reason ?? compiledPreview()?.error ?? null
  })

  onCleanup(() => {
    searchGeneration += 1
    catalogGeneration += 1
    discovery.cancel()
    distinctGeneration += 1
    if (distinctSubscription) {
      removeObserver(distinctSubscription.request, distinctSubscription.observer)
      distinctSubscription = null
    }
  })

  const dismiss = () => {
    discovery.cancel()
    props.onDismiss()
  }

  const applyFilter = (nextFilter: LauncherFamilyFilter, clearQuery: boolean) => {
    batch(() => {
      setHelpOpen(false)
      setFilter(nextFilter)
      if (clearQuery) {
        setEditorText('')
        setQueryState((state) => reduceLauncherQuery(state, { type: 'set-text', text: '' }))
        setCursorIndex(0)
      }
    })
    queueMicrotask(() => untrack(input)?.focus({ preventScroll: true }))
  }

  const activate = (item: LauncherListItem) => {
    if (item.kind === 'family') {
      applyFilter(item.filter, true)
      return
    }

    if (item.result.family === 'command') {
      void invokeCommand(item.result.commandId, context).catch((error: unknown) => {
        console.error('launcher command failed', error)
      })
      dismiss()
      return
    }

    const target = navigationTargetForLauncherItem(item)
    if (!target) return
    setRestoreInvoker(false)
    props.onNavigate(target)
    dismiss()
  }

  const insertRefTarget = (target: {
    matrixId: number
    rowId: number
    cachedTitle: string
  }): void => {
    const reason =
      props.insertRef ?
        props.insertRef(target)
      : 'Open the launcher from an editor to insert a reference.'
    if (reason) {
      setInteractionNotice(reason)
      return
    }
    setRestoreInvoker(false)
    dismiss()
  }

  const insertRefFromItem = (item: LauncherListItem | AuthoringItem | undefined): void => {
    if (!item || item.kind === 'column' || item.kind === 'operator' || item.kind === 'value') {
      return
    }
    if (item.kind === 'family' || item.result.family === 'command') return
    const target = navigationTargetForLauncherItem(item)
    if (target?.type !== 'node') return
    insertRefTarget({
      matrixId: target.node.matrixId,
      rowId: target.node.rowId,
      cachedTitle: item.label,
    })
  }

  const commitObject = (item: LauncherListItem): boolean => {
    if (item.kind === 'family') {
      applyFilter(item.filter, true)
      return true
    }
    const commit = authoringCommitForLauncherItem(item)
    if (!commit) return false
    const editState = objectEdit()?.beforeState
    batch(() => {
      setQueryState((state) => {
        const baseState = editState ?? state
        const committed = reduceLauncherQuery(
          baseState,
          commit.type === 'kind' ?
            {
              type: 'commit-kind',
              matrixId: commit.matrixId,
              label: commit.label,
              mark: commit.mark,
            }
          : {
              type: 'commit-scope',
              node: commit.node,
              label: commit.label,
            },
        )
        return reduceLauncherQuery(committed, { type: 'set-text', text: '' })
      })
      setEditorText('')
      setObjectEdit(null)
      setFilter(null)
      setSelectedId(null)
      setCursorIndex(0)
      setInteractionNotice(null)
    })
    return true
  }

  const focusInput = (select = false) => {
    queueMicrotask(() => {
      const element = untrack(input)
      element?.focus({ preventScroll: true })
      if (select) element?.select()
    })
  }

  const beginColumn = (column: ColumnDefinition, restoreState?: LauncherQueryState) => {
    batch(() => {
      setQueryState((state) => reduceLauncherQuery(state, { type: 'set-text', text: '' }))
      setDraft({ stage: 'operator', column, ...(restoreState ? { restoreState } : {}) })
      setObjectEdit(null)
      setEditorText('')
      setFilter(null)
      setSelectedId(null)
      setCursorIndex(0)
    })
    focusInput()
  }

  const commitColumn = (
    column: ColumnDefinition,
    operator: QueryAuthoringOperator,
    valueText = '',
  ): boolean => {
    const restoreState = draft()?.restoreState
    const next = reduceLauncherQuery(queryState(), {
      type: 'commit-column',
      column,
      operator: operator.id,
      valueText,
    })
    setQueryState(next)
    if (next.invalid) {
      batch(() => {
        setDraft({
          stage: 'value',
          column,
          operator,
          ...(restoreState ? { restoreState } : {}),
        })
        setEditorText(valueText)
      })
      focusInput(true)
      return false
    }
    batch(() => {
      setDraft(null)
      setEditorText('')
      setSelectedId(null)
      setCursorIndex(0)
    })
    focusInput()
    return true
  }

  const chooseOperator = (
    column: ColumnDefinition,
    operator: QueryAuthoringOperator,
    valueText = '',
  ) => {
    if (operator.requiresValue && !valueText.trim()) {
      const restoreState = draft()?.restoreState
      batch(() => {
        setDraft({
          stage: 'value',
          column,
          operator,
          ...(restoreState ? { restoreState } : {}),
        })
        setEditorText('')
        setSelectedId(null)
      })
      focusInput()
      return
    }
    commitColumn(column, operator, valueText)
  }

  const activateActiveItem = (item: LauncherListItem | AuthoringItem) => {
    if (item.kind === 'column') {
      beginColumn(item.column)
      return
    }
    if (item.kind === 'operator') {
      const current = draft()
      if (current?.stage === 'operator') chooseOperator(current.column, item.operator)
      return
    }
    if (item.kind === 'value') {
      const current = draft()
      if (current?.stage === 'value') commitColumn(current.column, current.operator, item.value)
      return
    }
    if (objectEdit()) {
      if (!commitObject(item)) {
        setInteractionNotice('Commands cannot be added to a query. Press Enter to run one.')
      }
      return
    }
    activate(item)
  }

  const editChip = (chip: LauncherQueryChip) => {
    const beforeState = queryState()
    const column =
      chip.type === 'predicate' || chip.type === 'order' ?
        columns().find((candidate) => candidate.id === chip.columnId)
      : undefined
    setQueryState((state) =>
      reduceLauncherQuery(state, { type: 'remove-chip', chipId: chip.id }),
    )
    if (chip.type === 'predicate' && column) {
      const operator = queryAuthoringOperators[chip.operator]
      batch(() => {
        setObjectEdit(null)
        setDraft(
          operator.requiresValue ?
            { stage: 'value', column, operator, restoreState: beforeState }
          : { stage: 'operator', column, restoreState: beforeState },
        )
        setEditorText(operator.requiresValue ? chip.valueLabel : '')
      })
      focusInput(operator.requiresValue)
      return
    }
    if (chip.type === 'order' && column) {
      beginColumn(column, beforeState)
      return
    }
    if (chip.type === 'kind' || chip.type === 'scope') {
      batch(() => {
        setDraft(null)
        setObjectEdit({ chip, beforeState })
        setFilter(
          chip.type === 'scope' ? 'named'
          : chip.mark === '#' ? 'types'
          : 'containers',
        )
        setEditorText(chip.label)
        setQueryState((state) => reduceLauncherQuery(state, { type: 'set-text', text: '' }))
        setSelectedId(null)
      })
      focusInput(true)
      return
    }
    batch(() => {
      setDraft(null)
      setObjectEdit(null)
      setEditorText(chip.label)
      setQueryState((state) =>
        reduceLauncherQuery(state, { type: 'set-text', text: chip.label }),
      )
    })
    focusInput(true)
  }

  const focusChip = (index: number) => {
    const chips = queryState().chips
    if (index < 0 || index >= chips.length) {
      focusInput()
      return
    }
    chipElements.get(chips[index]!.id)?.focus({ preventScroll: true })
  }

  const syncCursor = (element: HTMLInputElement) => {
    setCursorIndex(element.selectionStart ?? element.value.length)
  }

  const applyTypedExpression = (
    text: string,
    availableColumns: readonly ColumnDefinition[],
  ): boolean => {
    if (tempo() !== 'deep' || draft() || objectEdit() || filter()) return false
    const typed = parseTypedColumnOperator(text, availableColumns)
    if (!typed) return false
    if (typed.column.formula !== null) {
      batch(() => {
        setQueryState((state) => reduceLauncherQuery(state, { type: 'set-text', text: '' }))
        setInteractionNotice(FORMULA_QUERY_UNAVAILABLE_REASON)
      })
      return true
    }
    batch(() => {
      setQueryState((state) => reduceLauncherQuery(state, { type: 'set-text', text: '' }))
      setEditorText(typed.valueText)
    })
    chooseOperator(typed.column, typed.operator, typed.valueText)
    return true
  }

  const handleInput = (element: HTMLInputElement) => {
    setInteractionNotice(null)
    if (draft()) {
      setEditorText(element.value)
      setCursorIndex(element.selectionStart ?? element.value.length)
      setQueryState((state) =>
        state.invalid ? reduceLauncherQuery(state, { type: 'clear-invalid' }) : state,
      )
      return
    }
    if (objectEdit()) {
      setEditorText(element.value)
      setCursorIndex(element.selectionStart ?? element.value.length)
      return
    }
    const parsed = splitLauncherInput(element.value)
    batch(() => {
      setHelpOpen(false)
      if (parsed.filter) setFilter(parsed.filter)
      setEditorText(parsed.query)
      setQueryState((state) =>
        reduceLauncherQuery(state, { type: 'set-text', text: parsed.query }),
      )
      setCursorIndex(element.selectionStart ?? parsed.query.length)
    })
    if (!parsed.filter) applyTypedExpression(parsed.query, columns())
  }

  let reparsedColumns = untrack(columns)
  createEffect(() => {
    const availableColumns = columns()
    const loadingColumns = catalogLoading()
    if (availableColumns === reparsedColumns) return
    reparsedColumns = availableColumns
    if (loadingColumns) return
    untrack(() => {
      applyTypedExpression(editorText(), availableColumns)
    })
  })

  const finishDeletedEdit = () => {
    batch(() => {
      setDraft(null)
      setObjectEdit(null)
      setEditorText('')
      setFilter(null)
      setSelectedId(null)
      setInteractionNotice(null)
      setQueryState((state) => {
        const cleared = reduceLauncherQuery(state, { type: 'clear-invalid' })
        return reduceLauncherQuery(cleared, { type: 'set-text', text: '' })
      })
    })
    focusInput()
  }

  const saveUnavailableReason = createMemo((): string | null => {
    if (tempo() !== 'deep') return 'Add a query chip before saving.'
    if (draft() || objectEdit()) return 'Finish editing the current chip before saving.'
    if (queryState().invalid) return queryState().invalid!.reason
    if (queryState().spec.kind.type !== 'matrix') {
      return 'Choose a type or container before saving.'
    }
    if (!props.invocation.subject || !props.invocation.provenance) {
      return 'Open the launcher from a place before saving.'
    }
    if (catalogLoading()) return 'Wait for the query fields to finish loading.'
    if (catalogError()) return catalogError()
    if (!compiledPreview()?.compiled) {
      return compiledPreview()?.error ?? 'The query cannot be saved.'
    }
    return null
  })

  const generatedViewName = (): string =>
    queryState()
      .chips.map((chip) => {
        if (chip.type === 'kind') return chip.label
        if (chip.type === 'scope') return `${chip.label} ›`
        if (chip.type === 'order') return `${chip.operatorGlyph} ${chip.columnName}`
        return `${chip.columnName} ${chip.operatorGlyph}${chip.valueLabel ? ` ${chip.valueLabel}` : ''}`
      })
      .join(' · ') || 'Untitled view'

  const saveView = async (): Promise<void> => {
    const unavailable = saveUnavailableReason()
    if (unavailable || saving()) {
      if (unavailable) setInteractionNotice(unavailable)
      return
    }
    const subject = props.invocation.subject!
    const invocationProvenance = props.invocation.provenance!
    const compiled = compiledPreview()?.compiled
    if (!compiled || compiled.spec.kind.type !== 'matrix') return
    const catalog = createQueryCatalog({
      matrices: [
        {
          id: compiled.spec.kind.matrixId,
          title: selectedKindChip()?.label,
          columns: columns(),
        },
      ],
      nodes: compiled.spec.scope.type === 'node' ? [compiled.spec.scope] : [],
    })
    const name = generatedViewName()
    setSaving(true)
    setInteractionNotice(null)
    try {
      const sql = materializeQuerySpec(compiled.spec, catalog)
      const { marker, provenance } = await createSavedView(
        subject.matrixId,
        subject.rowId,
        invocationProvenance,
        sql,
        name,
      )
      setRestoreInvoker(false)
      dismiss()
      requestAnimationFrame(() => {
        if (props.onSavedView) props.onSavedView(marker, name, provenance)
        else props.onNavigate({ type: 'node', node: marker, provenance })
      })
    } catch (error) {
      setInteractionNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const handleInputKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return
    const element = event.currentTarget as HTMLInputElement
    const atStart = element.selectionStart === 0 && element.selectionEnd === 0
    const atEnd =
      element.selectionStart === element.value.length &&
      element.selectionEnd === element.value.length

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      insertRefFromItem(activeItems().find((item) => item.id === selectedId()))
      return
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void saveView()
      return
    }

    if (
      event.key === '?' &&
      !draft() &&
      !objectEdit() &&
      !filter() &&
      !editorText() &&
      atStart
    ) {
      event.preventDefault()
      setHelpOpen(true)
      return
    }

    const family = draft() || objectEdit() ? undefined : launcherFamilyForToken(event.key)
    if (family && atStart) {
      event.preventDefault()
      applyFilter(family.filter, false)
      return
    }

    if (
      event.key === 'Backspace' &&
      atStart &&
      !editorText() &&
      (draft() !== null || objectEdit() !== null)
    ) {
      event.preventDefault()
      finishDeletedEdit()
      return
    }

    if (event.key === 'Backspace' && filter() && atStart) {
      event.preventDefault()
      if (objectEdit()) {
        consumeLayeredEscape()
        return
      }
      setFilter(null)
      return
    }

    if (
      event.key === 'Backspace' &&
      !draft() &&
      !filter() &&
      !editorText() &&
      queryState().chips.length > 0
    ) {
      event.preventDefault()
      editChip(queryState().chips.at(-1)!)
      return
    }

    if (event.key === 'ArrowLeft' && atStart && queryState().chips.length > 0) {
      event.preventDefault()
      focusChip(queryState().chips.length - 1)
      return
    }
    if (event.key === 'ArrowRight' && atEnd && queryState().chips.length > 0) {
      event.preventDefault()
      focusChip(0)
      return
    }

    if (event.key === 'Tab') {
      const selectedItem = activeItems().find((item) => item.id === selectedId())
      if (selectedItem) {
        event.preventDefault()
        if (selectedItem.unavailableReason) {
          setInteractionNotice(selectedItem.unavailableReason)
          return
        }
        const committed =
          selectedItem.kind === 'column' ? (beginColumn(selectedItem.column), true)
          : selectedItem.kind === 'operator' ? (activateActiveItem(selectedItem), true)
          : selectedItem.kind === 'value' ? (activateActiveItem(selectedItem), true)
          : commitObject(selectedItem)
        if (!committed) {
          setInteractionNotice('Commands cannot be added to a query. Press Enter to run one.')
        }
        return
      }
    }

    if (event.key === 'Enter' && draft()?.stage === 'value') {
      const current = draft() as ValueDraft
      const selected = activeItems().find((item) => item.id === selectedId())
      event.preventDefault()
      if (selected?.kind === 'value' && !selected.unavailableReason) {
        commitColumn(current.column, current.operator, selected.value)
      } else {
        commitColumn(current.column, current.operator, editorText())
      }
      return
    }

    const currentItems = activeItems()
    const action = getSelectableListAction(currentItems, selectedId(), event.key)
    if (!action) return
    event.preventDefault()
    if (action.type === 'select') {
      setSelectedId(action.id)
      return
    }
    const item = currentItems.find((candidate) => candidate.id === action.id)
    if (item && !item.unavailableReason) activateActiveItem(item)
  }

  const countAnnouncement = () => {
    if ((!searchActive() && !draft()) || helpOpen()) return ''
    if (loading()) return 'Searching places and commands.'
    return `${activeItems().length} ${activeItems().length === 1 ? 'result' : 'results'}.`
  }

  const chipText = (chip: LauncherQueryChip): string => {
    if (chip.type === 'kind') return `${chip.mark}${chip.label}`
    if (chip.type === 'scope') return `${chip.label} ›`
    if (chip.type === 'order') return `${chip.operatorGlyph} ${chip.columnName}`
    return `${chip.columnName} ${chip.operatorGlyph}${chip.valueLabel ? ` ${chip.valueLabel}` : ''}`
  }

  const handleChipKeyDown = (event: KeyboardEvent, chip: LauncherQueryChip, index: number) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusChip(index - 1)
      return
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusChip(index + 1)
      return
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      setQueryState((state) =>
        reduceLauncherQuery(state, { type: 'remove-chip', chipId: chip.id }),
      )
      const nextChips = queryState().chips
      const nextChip = nextChips[Math.min(index, nextChips.length - 1)]
      const nextElement = nextChip ? chipElements.get(nextChip.id) : untrack(input)
      queueMicrotask(() => nextElement?.focus({ preventScroll: true }))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      editChip(chip)
    }
  }

  const consumeLayeredEscape = (): boolean => {
    const currentDraft = draft()
    const currentObjectEdit = objectEdit()
    if (!currentDraft && !currentObjectEdit) return false
    batch(() => {
      setDraft(null)
      setObjectEdit(null)
      setEditorText('')
      setFilter(null)
      setSelectedId(null)
      setInteractionNotice(null)
      const restoreState = currentObjectEdit?.beforeState ?? currentDraft?.restoreState
      if (restoreState) setQueryState(restoreState)
      else {
        setQueryState((state) => {
          const cleared = reduceLauncherQuery(state, { type: 'clear-invalid' })
          return reduceLauncherQuery(cleared, { type: 'set-text', text: '' })
        })
      }
    })
    focusInput()
    return true
  }

  const freezeNotice = createMemo(() => {
    for (const chip of queryState().chips) {
      if (chip.type !== 'predicate') continue
      const notice = relativeDateFreezeNotice(chip)
      if (notice) return notice
    }
    return null
  })
  const visibleNotice = createMemo(
    () =>
      queryState().invalid?.reason ??
      interactionNotice() ??
      freezeNotice() ??
      (tempo() === 'deep' ? saveUnavailableReason() : null),
  )

  const valuePrompt = createMemo(() => {
    const current = draft()
    if (current?.stage !== 'value') return null
    if (current.column.displayType === 'number') return 'Type a number and press Enter.'
    if (current.column.displayType === 'date') {
      return 'Type a date or relative phrase and press Enter.'
    }
    if (current.column.displayType === 'boolean') return 'Choose true or false.'
    return 'Type a value and press Enter.'
  })

  const previewMatrixId = createMemo(() => {
    const kind = queryState().spec.kind
    return kind.type === 'matrix' ? kind.matrixId : null
  })

  const navigateFromPreview = (target: PlaceNavigationTarget) => {
    setRestoreInvoker(false)
    props.onNavigate(target)
    dismiss()
  }

  return (
    <CenteredOverlay
      class={`${styles.overlay} ${
        props.visualTheme === 'wipeout' ? styles.wipeoutOverlay : styles.centeredOverlay
      } ${tempo() === 'deep' ? styles.deepOverlay : ''}`}
      ariaLabel={`${tempo() === 'deep' ? 'Deep' : 'Quick'} launcher`}
      tempo={tempo()}
      initialFocus={input}
      restoreFocusTo={props.invocation.focusElement}
      restoreFocus={restoreInvoker()}
      onEscape={consumeLayeredEscape}
      onDismiss={dismiss}
      testId="quick-launcher"
    >
      <section
        class={styles.surface}
        data-launcher-theme={props.visualTheme}
        data-launcher-tempo={tempo()}
        data-filter={filter() ?? undefined}
      >
        <div
          class={styles.queryRow}
          style={
            {
              '--launcher-cursor-index': `${cursorIndex() + (filter() ? 2 : 0)}`,
            } as JSX.CSSProperties
          }
        >
          <Show when={activeFilter()}>
            {(family) => (
              <button
                type="button"
                class={styles.filterToken}
                aria-label={`Remove ${family().label.toLowerCase()} filter`}
                onClick={() => {
                  setFilter(null)
                  input()?.focus({ preventScroll: true })
                }}
              >
                {family().token}
              </button>
            )}
          </Show>
          <For each={queryState().chips}>
            {(chip, index) => (
              <button
                ref={(element) => chipElements.set(chip.id, element)}
                type="button"
                class={styles.queryChip}
                data-chip-type={chip.type}
                aria-label={`${chipText(chip)}. Press Enter to edit or Backspace to delete.`}
                onClick={() => editChip(chip)}
                onKeyDown={(event) => handleChipKeyDown(event, chip, index())}
              >
                {chipText(chip)}
              </button>
            )}
          </For>
          <input
            ref={setInput}
            id="quick-launcher-input"
            name="quick-launcher-query"
            class={styles.queryInput}
            classList={{ [styles.invalidInput!]: queryState().invalid !== null }}
            aria-label={tempo() === 'deep' ? 'Refine query' : 'Search places and commands'}
            aria-invalid={queryState().invalid ? 'true' : undefined}
            aria-describedby={visibleNotice() ? 'quick-launcher-notice' : undefined}
            value={editorText()}
            placeholder={
              draft()?.stage === 'operator' ? 'Choose or type an operator…'
              : draft()?.stage === 'value' ?
                'Enter a value…'
              : tempo() === 'deep' ?
                'Refine results or name a column…'
              : 'Search places and commands…'
            }
            onInput={(event) => handleInput(event.currentTarget)}
            onKeyDown={handleInputKeyDown}
            onKeyUp={(event) => syncCursor(event.currentTarget)}
            onClick={(event) => syncCursor(event.currentTarget)}
            onSelect={(event) => syncCursor(event.currentTarget)}
          />
          <Show when={props.visualTheme === 'wipeout'}>
            <span
              class={styles.blockCursor}
              data-testid="launcher-block-cursor"
              aria-hidden="true"
            />
          </Show>
        </div>

        <div class={styles.body}>
          <Show
            when={!helpOpen()}
            fallback={
              <div class={styles.guide} data-testid="launcher-guide">
                <section>
                  <h2>Keyboard</h2>
                  <dl>
                    <For each={shortcutGuide}>
                      {(shortcut) => (
                        <>
                          <dt>{displayShortcutKey(shortcut.key, platform)}</dt>
                          <dd>{shortcut.title}</dd>
                        </>
                      )}
                    </For>
                  </dl>
                </section>
                <section>
                  <h2>Commands</h2>
                  <ul>
                    <For each={commandGuide}>
                      {(entry) => (
                        <li>
                          <span>{entry.command.label}</span>
                          <Show when={entry.unavailableReason}>
                            <small>{entry.unavailableReason}</small>
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                </section>
              </div>
            }
          >
            <Show
              when={tempo() === 'deep'}
              fallback={
                <Show
                  when={searchActive()}
                  fallback={
                    <div class={styles.emptyState} data-testid="launcher-empty-state">
                      <section>
                        <h2>Jump back</h2>
                        <p>Places visited this session will appear here.</p>
                      </section>
                      <section>
                        <h2>Recent deep searches</h2>
                        <p>Deep searches will appear here.</p>
                      </section>
                    </div>
                  }
                >
                  <SelectableList
                    id={listId}
                    items={launcherItems()}
                    selectedId={selectedId()}
                    ariaLabel="Launcher results"
                    emptyMessage={loading() ? 'Searching…' : 'No matching places or commands'}
                    focusable={false}
                    focusOwner={input()}
                    onSelectedIdChange={(id) => setSelectedId(id)}
                    onActivate={activateActiveItem}
                    onMarkActivate={(item) => applyFilter(item.filter, false)}
                  />
                </Show>
              }
            >
              <div class={styles.deepBody}>
                <Show when={authoringListVisible()}>
                  <div class={styles.authoringList} data-testid="launcher-authoring-list">
                    <SelectableList
                      id={listId}
                      items={activeItems()}
                      selectedId={selectedId()}
                      ariaLabel="Query authoring suggestions"
                      emptyMessage={
                        queryState().invalid?.reason ??
                        (distinctError()?.message ||
                          valuePrompt() ||
                          'No matching query option')
                      }
                      invalid={queryState().invalid !== null}
                      focusable={false}
                      focusOwner={input()}
                      onSelectedIdChange={(id) => setSelectedId(id)}
                      onActivate={activateActiveItem}
                      onMarkActivate={(item) => {
                        if ('filter' in item) applyFilter(item.filter, false)
                      }}
                    />
                  </div>
                </Show>
                <DeepPreview
                  plan={compiledPreview()?.compiled?.plan ?? null}
                  matrixId={previewMatrixId()}
                  columns={columns()}
                  presentationColumns={launcherPreviewColumns(
                    columns(),
                    previewQueryState().chips,
                  )}
                  focusOwner={input()}
                  active={true}
                  suspended={authoringListVisible()}
                  invalidReason={previewInvalidReason()}
                  loadingReason={catalogLoading() ? 'Loading query fields…' : null}
                  onNavigate={navigateFromPreview}
                  onInsertRef={insertRefTarget}
                />
              </div>
            </Show>
          </Show>
        </div>

        <footer class={styles.footer}>
          <span class={styles.origin}>{props.invocation.subjectLabel ?? 'Workspace'}</span>
          <span
            id="quick-launcher-notice"
            class={styles.footerNotice}
            role="status"
            aria-live="polite"
          >
            {visibleNotice() ?? ''}
          </span>
          <span class={styles.keyboardHint}>
            {tempo() === 'deep' ?
              'Tab chip · ↑↓ select · ↵ open · ⌘S save'
            : '↑↓ select · ↵ open · Esc close'}
          </span>
          <Show when={tempo() === 'deep'}>
            <button
              type="button"
              class={styles.saveButton}
              disabled={saving() || saveUnavailableReason() !== null}
              title={saveUnavailableReason() ?? 'Save as a view'}
              onClick={() => void saveView()}
            >
              {saving() ? 'Saving…' : 'Save view'}
            </button>
          </Show>
          <button
            type="button"
            class={styles.helpButton}
            onClick={() => setHelpOpen((open) => !open)}
          >
            ? guide
          </button>
        </footer>

        <div class={styles.status} role="status" aria-live="polite" aria-atomic="true">
          {countAnnouncement()}
        </div>
        <Show when={props.visualTheme === 'wipeout'}>
          <WipeoutEchoes tempo={tempo()} />
        </Show>
      </section>
    </CenteredOverlay>
  )
}

export default QuickLauncher
