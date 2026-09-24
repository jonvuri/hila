import {
  For,
  Show,
  batch,
  createEffect,
  createSignal,
  type Component,
  type ParentComponent,
} from 'solid-js'

import { queryDiscoveryCatalog } from '../core/client/matrix-client'
import type { ColumnDefinition } from '../core/matrix'
import type { DiscoveryCatalogEntry } from '../discovery/types'
import {
  setQueryKind,
  setQueryLimit,
  setQueryOrder,
  setQueryScope,
  setQueryText,
} from '../sql/query-spec/operations'
import type {
  QueryCatalog,
  QueryCatalogMatrix,
  QueryNodeIdentity,
} from '../sql/query-spec/catalog'
import type { NormalizedQuerySpec, QueryPredicate } from '../sql/query-spec/types'
import {
  parseDateValue,
  parseQueryValue,
  queryAuthoringOperators,
  queryOperatorCandidates,
  type QueryAuthoringOperator,
  type QueryAuthoringOperatorId,
} from '../launcher/query-grammar'

type StructuredEditor =
  | { readonly type: 'kind'; readonly query: string }
  | { readonly type: 'scope'; readonly query: string }
  | { readonly type: 'text'; readonly value: string }
  | {
      readonly type: 'predicate'
      readonly indexes: readonly number[]
      readonly stage: 'column' | 'operator' | 'value'
      readonly column: ColumnDefinition | null
      readonly operator: QueryAuthoringOperator | null
      readonly value: string
    }
  | {
      readonly type: 'order'
      readonly stage: 'column' | 'operator'
      readonly column: ColumnDefinition | null
    }
  | { readonly type: 'limit'; readonly value: string }

const predicateValueLabel = (predicate: QueryPredicate): string => {
  if (predicate.type === 'opaque' || !('value' in predicate)) return ''
  if (predicate.value instanceof Uint8Array) {
    return `0x${Array.from(predicate.value, (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    )}`
  }
  return predicate.value === null ? 'null' : String(predicate.value)
}

const predicateOperatorId = (
  predicate: Exclude<QueryPredicate, { type: 'opaque' }>,
  column: ColumnDefinition,
): QueryAuthoringOperatorId | null => {
  if (column.displayType === 'date') {
    if (predicate.op === 'lt') return 'before'
    if (predicate.op === 'gt') return 'after'
    if (predicate.op === 'eq') return 'on'
  }
  return predicate.op in queryAuthoringOperators ?
      (predicate.op as QueryAuthoringOperatorId)
    : null
}

const predicateGlyph = (predicate: Exclude<QueryPredicate, { type: 'opaque' }>): string => {
  const operator = queryAuthoringOperators[predicate.op as QueryAuthoringOperatorId]
  return operator?.glyph ?? predicate.op
}

type PredicateGesture = {
  readonly predicate: QueryPredicate
  readonly indexes: readonly number[]
  readonly operatorId?: QueryAuthoringOperatorId
  readonly valueLabel?: string
}

const closedDateGesture = (
  predicates: readonly QueryPredicate[],
  index: number,
  columns: readonly ColumnDefinition[],
): PredicateGesture | null => {
  const start = predicates[index]
  const end = predicates[index + 1]
  if (
    start?.type !== 'predicate' ||
    end?.type !== 'predicate' ||
    start.op !== 'gte' ||
    end.op !== 'lte' ||
    start.columnId !== end.columnId ||
    typeof start.value !== 'string' ||
    typeof end.value !== 'string' ||
    columns.find((column) => column.id === start.columnId)?.displayType !== 'date'
  ) {
    return null
  }
  const startDate = parseDateValue(start.value)
  const endDate = parseDateValue(end.value)
  if (
    !startDate ||
    !endDate ||
    startDate.relative ||
    endDate.relative ||
    startDate.startInclusive !== start.value ||
    endDate.endInclusive !== end.value ||
    start.value > end.value
  ) {
    return null
  }
  return {
    predicate: start,
    indexes: [index, index + 1],
    operatorId: 'on',
    valueLabel: start.value === end.value ? start.value : `${start.value}..${end.value}`,
  }
}

const savedViewPredicateGestures = (
  predicates: readonly QueryPredicate[],
  columns: readonly ColumnDefinition[],
): readonly PredicateGesture[] => {
  const gestures: PredicateGesture[] = []
  for (let index = 0; index < predicates.length; index += 1) {
    const dateGesture = closedDateGesture(predicates, index, columns)
    if (dateGesture) {
      gestures.push(dateGesture)
      index += 1
    } else {
      gestures.push({ predicate: predicates[index]!, indexes: [index] })
    }
  }
  return gestures
}

const predicateGestureLabel = (
  gesture: PredicateGesture,
  columns: readonly ColumnDefinition[],
): string => {
  const predicate = gesture.predicate
  if (predicate.type === 'opaque') return ''
  const column = columns.find((candidate) => candidate.id === predicate.columnId)
  const glyph =
    gesture.operatorId ?
      queryAuthoringOperators[gesture.operatorId].glyph
    : predicateGlyph(predicate)
  const value = gesture.valueLabel ?? predicateValueLabel(predicate)
  return `${column?.name ?? `#${predicate.columnId}`} ${glyph}${value ? ` ${value}` : ''}`
}

const Chip: ParentComponent<{
  testId: string
  title?: string
  disabled?: boolean
  onClick?: () => void
}> = (props) => (
  <button
    type="button"
    data-testid={props.testId}
    title={props.title}
    disabled={props.disabled || !props.onClick}
    onClick={() => props.onClick?.()}
    style={{
      border: '1px solid var(--color-line-subtle)',
      'border-radius': '999px',
      background: 'var(--color-surface-raised, transparent)',
      color: 'var(--color-text-strong)',
      cursor: props.onClick && !props.disabled ? 'pointer' : 'default',
      padding: '2px 7px',
      'font-size': '11px',
      opacity: props.disabled ? 0.65 : 1,
    }}
  >
    {props.children}
  </button>
)

const EditorInput: Component<{
  label: string
  value: string
  placeholder?: string
  onInput: (value: string) => void
  onCommit?: () => void
  onCancel: () => void
}> = (props) => (
  <input
    data-testid="saved-view-chip-input"
    aria-label={props.label}
    value={props.value}
    placeholder={props.placeholder}
    autofocus
    onInput={(event) => props.onInput(event.currentTarget.value)}
    onKeyDown={(event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        props.onCancel()
      } else if (event.key === 'Enter' && props.onCommit) {
        event.preventDefault()
        props.onCommit()
      }
    }}
    style={{
      border: '1px solid var(--color-line-subtle)',
      'border-radius': '5px',
      padding: '4px 6px',
      'font-size': '12px',
      'min-width': '180px',
    }}
  />
)

const MenuButton: ParentComponent<{
  testId?: string
  disabled?: boolean
  title?: string
  onClick: () => void
}> = (props) => (
  <button
    type="button"
    role="option"
    data-testid={props.testId}
    disabled={props.disabled}
    title={props.title}
    onClick={() => props.onClick()}
    style={{
      border: 'none',
      background: 'transparent',
      color: 'var(--color-text-strong)',
      cursor: props.disabled ? 'not-allowed' : 'pointer',
      padding: '4px 6px',
      'text-align': 'left',
    }}
  >
    {props.children}
  </button>
)

const queryMatches = (label: string, query: string): boolean =>
  label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())

const replacePredicate = (
  spec: NormalizedQuerySpec,
  indexes: readonly number[],
  predicates: readonly QueryPredicate[],
): NormalizedQuerySpec => {
  if (indexes.length === 0) return { ...spec, where: [...spec.where, ...predicates] }
  const replaced = new Set(indexes)
  const firstIndex = indexes[0]!
  return {
    ...spec,
    where: spec.where.flatMap((predicate, index) =>
      index === firstIndex ? [...predicates]
      : replaced.has(index) ? []
      : [predicate],
    ),
  }
}

export const SavedViewStructuredAuthoring: Component<{
  spec: NormalizedQuerySpec
  catalog: QueryCatalog
  rootMatrixId: number
  disabled?: boolean
  onCommit: (next: NormalizedQuerySpec, discoveredScope?: QueryNodeIdentity) => void
}> = (props) => {
  const [editor, setEditor] = createSignal<StructuredEditor | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const [scopeChoices, setScopeChoices] = createSignal<readonly DiscoveryCatalogEntry[]>([])
  let scopeGeneration = 0

  const matrix = (): QueryCatalogMatrix | undefined => {
    const kind = props.spec.kind
    return kind.type === 'matrix' ?
        props.catalog.matrices.find((candidate) => candidate.id === kind.matrixId)
      : undefined
  }

  const closeEditor = (): void => {
    scopeGeneration += 1
    batch(() => {
      setEditor(null)
      setError(null)
    })
  }

  const commit = (next: NormalizedQuerySpec, discoveredScope?: QueryNodeIdentity): void => {
    props.onCommit(next, discoveredScope)
    closeEditor()
  }

  createEffect(() => {
    const current = editor()
    if (current?.type !== 'scope') return
    const generation = ++scopeGeneration
    void queryDiscoveryCatalog({
      rootMatrixId: props.rootMatrixId,
      query: current.query,
      filter: 'named',
      limit: 50,
    }).then(
      (choices) => {
        if (generation === scopeGeneration) {
          setScopeChoices(choices)
        }
      },
      () => {
        if (generation === scopeGeneration) setScopeChoices([])
      },
    )
  })

  const editPredicate = (gesture: PredicateGesture): void => {
    const { predicate } = gesture
    if (predicate.type === 'opaque') return
    const column = matrix()?.columns.find((candidate) => candidate.id === predicate.columnId)
    if (!column) return
    const operatorId = gesture.operatorId ?? predicateOperatorId(predicate, column)
    const operator = operatorId ? queryAuthoringOperators[operatorId] : null
    setError(null)
    setEditor({
      type: 'predicate',
      indexes: gesture.indexes,
      stage: operator?.requiresValue ? 'value' : 'operator',
      column,
      operator,
      value: gesture.valueLabel ?? predicateValueLabel(predicate),
    })
  }

  const commitPredicate = (): void => {
    const current = editor()
    if (current?.type !== 'predicate' || !current.column || !current.operator) {
      return
    }
    const parsed = parseQueryValue(current.column, current.operator.id, current.value)
    if (!parsed.ok) {
      setError(parsed.reason)
      return
    }
    commit(replacePredicate(props.spec, current.indexes, parsed.predicates))
  }

  const commitText = (): void => {
    const current = editor()
    if (current?.type === 'text') commit(setQueryText(props.spec, current.value))
  }

  const commitLimit = (): void => {
    const current = editor()
    if (current?.type !== 'limit') return
    const limit = Number(current.value)
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      setError('Use a positive whole-number limit.')
      return
    }
    commit(setQueryLimit(props.spec, limit))
  }

  const commitTypedEditor = (): void => {
    const current = editor()
    if (current?.type === 'text') commitText()
    if (current?.type === 'limit') commitLimit()
    if (current?.type === 'predicate' && current.stage === 'value') commitPredicate()
  }

  const removeEditedDimension = (): void => {
    const current = editor()
    if (!current) return
    if (current.type === 'scope') commit(setQueryScope(props.spec, { type: 'all' }))
    if (current.type === 'text') commit(setQueryText(props.spec, ''))
    if (current.type === 'order') commit(setQueryOrder(props.spec, { type: 'natural' }))
    if (current.type === 'predicate' && current.indexes.length > 0) {
      commit(replacePredicate(props.spec, current.indexes, []))
    }
  }

  const current = () => editor()
  const kindEditor = () => {
    const value = editor()
    return value?.type === 'kind' ? value : null
  }
  const scopeEditor = () => {
    const value = editor()
    return value?.type === 'scope' ? value : null
  }
  const textEditor = () => {
    const value = editor()
    return value?.type === 'text' ? value : null
  }
  const limitEditor = () => {
    const value = editor()
    return value?.type === 'limit' ? value : null
  }
  const predicateEditor = () => {
    const value = editor()
    return value?.type === 'predicate' ? value : null
  }
  const columns = () => matrix()?.columns ?? []
  const predicateGestures = () => savedViewPredicateGestures(props.spec.where, columns())

  return (
    <>
      <div
        data-testid="saved-view-chips"
        style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '4px' }}
      >
        <Show when={matrix()}>
          {(currentMatrix) => (
            <Chip
              testId="saved-view-kind-chip"
              disabled={props.disabled}
              title="Change row kind"
              onClick={() => setEditor({ type: 'kind', query: '' })}
            >
              [{currentMatrix().title ?? `#${currentMatrix().id}`}]
            </Chip>
          )}
        </Show>
        <Show
          when={props.spec.scope.type === 'node'}
          fallback={
            <Chip
              testId="saved-view-add-scope-chip"
              disabled={props.disabled}
              onClick={() => setEditor({ type: 'scope', query: '' })}
            >
              + scope
            </Chip>
          }
        >
          <Chip
            testId="saved-view-scope-chip"
            disabled={props.disabled}
            title="Change scope"
            onClick={() => setEditor({ type: 'scope', query: '' })}
          >
            {props.spec.scope.type === 'node' ?
              `${props.spec.scope.matrixId}:${props.spec.scope.rowId} ›`
            : ''}
          </Chip>
        </Show>
        <Show
          when={props.spec.text !== ''}
          fallback={
            <Chip
              testId="saved-view-add-text-chip"
              disabled={props.disabled}
              onClick={() => setEditor({ type: 'text', value: '' })}
            >
              + text
            </Chip>
          }
        >
          <Chip
            testId="saved-view-text-chip"
            disabled={props.disabled}
            title="Edit text search"
            onClick={() => setEditor({ type: 'text', value: props.spec.text })}
          >
            {props.spec.text}
          </Chip>
        </Show>
        <For each={predicateGestures()}>
          {(gesture) => (
            <Show
              when={gesture.predicate.type !== 'opaque'}
              fallback={
                <Chip
                  testId="saved-view-opaque-chip"
                  title="Opaque SQL is preserved by structured edits"
                >
                  SQL · {gesture.predicate.type === 'opaque' ? gesture.predicate.sql : ''}
                </Chip>
              }
            >
              <Chip
                testId="saved-view-predicate-chip"
                disabled={props.disabled}
                title="Edit filter"
                onClick={() => editPredicate(gesture)}
              >
                {predicateGestureLabel(gesture, columns())}
              </Chip>
            </Show>
          )}
        </For>
        <Chip
          testId="saved-view-add-predicate-chip"
          disabled={props.disabled}
          onClick={() =>
            setEditor({
              type: 'predicate',
              indexes: [],
              stage: 'column',
              column: null,
              operator: null,
              value: '',
            })
          }
        >
          + filter
        </Chip>
        <Show
          when={props.spec.order.type === 'column'}
          fallback={
            <Chip
              testId="saved-view-add-order-chip"
              disabled={props.disabled}
              onClick={() => setEditor({ type: 'order', stage: 'column', column: null })}
            >
              + order
            </Chip>
          }
        >
          <Chip
            testId="saved-view-order-chip"
            disabled={props.disabled}
            title="Edit order"
            onClick={() => {
              const order = props.spec.order
              const column =
                order.type === 'column' ?
                  (columns().find((candidate) => candidate.id === order.columnId) ?? null)
                : null
              setEditor({ type: 'order', stage: 'operator', column })
            }}
          >
            {(() => {
              const order = props.spec.order
              if (order.type !== 'column') return ''
              return `${columns().find((column) => column.id === order.columnId)?.name ?? `#${order.columnId}`} ${order.direction === 'asc' ? '↑' : '↓'}`
            })()}
          </Chip>
        </Show>
        <Chip
          testId="saved-view-limit-chip"
          disabled={props.disabled}
          title="Edit result limit"
          onClick={() => setEditor({ type: 'limit', value: String(props.spec.limit) })}
        >
          limit {props.spec.limit}
        </Chip>
      </div>

      <Show when={current()}>
        {(active) => (
          <div
            data-testid="saved-view-chip-editor"
            style={{
              display: 'flex',
              'flex-direction': 'column',
              gap: '5px',
              padding: '6px',
              border: '1px solid var(--color-line-subtle)',
              'border-radius': '6px',
            }}
          >
            <Show when={active().type === 'kind'}>
              <EditorInput
                label="Find a row kind"
                value={kindEditor()?.query ?? ''}
                placeholder="Name a type or matrix…"
                onInput={(query) => setEditor({ type: 'kind', query })}
                onCancel={closeEditor}
              />
              <div role="listbox" style={{ display: 'flex', 'flex-direction': 'column' }}>
                <For
                  each={props.catalog.matrices.filter((candidate) =>
                    queryMatches(
                      candidate.title ?? `#${candidate.id}`,
                      kindEditor()?.query ?? '',
                    ),
                  )}
                >
                  {(candidate) => (
                    <MenuButton
                      testId="saved-view-kind-option"
                      onClick={() => {
                        let next = setQueryKind(props.spec, {
                          type: 'matrix',
                          matrixId: candidate.id,
                        }) as NormalizedQuerySpec
                        next = {
                          ...next,
                          where: next.where.filter((predicate) => predicate.type === 'opaque'),
                          order: { type: 'natural' },
                        }
                        commit(next)
                      }}
                    >
                      [{candidate.title ?? `#${candidate.id}`}]
                    </MenuButton>
                  )}
                </For>
              </div>
            </Show>

            <Show when={active().type === 'scope'}>
              <EditorInput
                label="Find a scope"
                value={scopeEditor()?.query ?? ''}
                placeholder="Name a place…"
                onInput={(query) => setEditor({ type: 'scope', query })}
                onCancel={closeEditor}
              />
              <div role="listbox" style={{ display: 'flex', 'flex-direction': 'column' }}>
                <For each={scopeChoices()}>
                  {(choice) => {
                    const target = choice.target.type === 'node' ? choice.target.node : null
                    return (
                      <Show when={target}>
                        {(node) => (
                          <MenuButton
                            testId="saved-view-scope-option"
                            onClick={() =>
                              commit(
                                setQueryScope(props.spec, {
                                  type: 'node',
                                  matrixId: node().matrixId,
                                  rowId: node().rowId,
                                }) as NormalizedQuerySpec,
                                node(),
                              )
                            }
                          >
                            {choice.label} ›
                          </MenuButton>
                        )}
                      </Show>
                    )
                  }}
                </For>
              </div>
            </Show>

            <Show when={active().type === 'text'}>
              <EditorInput
                label="Text search"
                value={textEditor()?.value ?? ''}
                placeholder="Search label and content…"
                onInput={(value) => setEditor({ type: 'text', value })}
                onCommit={commitText}
                onCancel={closeEditor}
              />
            </Show>

            <Show when={active().type === 'predicate'}>
              {(() => {
                return (
                  <>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <Chip
                        testId="saved-view-predicate-column"
                        onClick={() => {
                          const value = predicateEditor()
                          if (value) setEditor({ ...value, stage: 'column' })
                        }}
                      >
                        {predicateEditor()?.column?.name ?? 'column'}
                      </Chip>
                      <Chip
                        testId="saved-view-predicate-operator"
                        disabled={!predicateEditor()?.column}
                        onClick={() => {
                          const value = predicateEditor()
                          if (value) setEditor({ ...value, stage: 'operator' })
                        }}
                      >
                        {predicateEditor()?.operator?.glyph ?? 'op'}
                      </Chip>
                    </div>
                    <Show when={predicateEditor()?.stage === 'column'}>
                      <div
                        role="listbox"
                        style={{ display: 'flex', 'flex-direction': 'column' }}
                      >
                        <For each={columns()}>
                          {(column) => (
                            <MenuButton
                              disabled={column.formula !== null}
                              title={
                                column.formula === null ?
                                  undefined
                                : 'Formula columns cannot filter or sort in this version.'
                              }
                              onClick={() => {
                                const value = predicateEditor()
                                if (!value) return
                                setEditor({
                                  ...value,
                                  stage: 'operator',
                                  column,
                                  operator: null,
                                  value: '',
                                })
                              }}
                            >
                              {column.name}
                            </MenuButton>
                          )}
                        </For>
                      </div>
                    </Show>
                    <Show when={predicateEditor()?.stage === 'operator'}>
                      <div
                        role="listbox"
                        style={{ display: 'flex', 'flex-direction': 'column' }}
                      >
                        <For
                          each={
                            predicateEditor()?.column ?
                              queryOperatorCandidates(predicateEditor()!.column!).filter(
                                (operator) => operator.id !== 'asc' && operator.id !== 'desc',
                              )
                            : []
                          }
                        >
                          {(operator) => (
                            <MenuButton
                              disabled={Boolean(operator.unavailableReason)}
                              title={operator.unavailableReason}
                              onClick={() => {
                                const value = predicateEditor()
                                if (!value) return
                                if (operator.requiresValue) {
                                  setEditor({ ...value, stage: 'value', operator, value: '' })
                                  return
                                }
                                const parsed = parseQueryValue(value.column!, operator.id, '')
                                if (parsed.ok) {
                                  commit(
                                    replacePredicate(
                                      props.spec,
                                      value.indexes,
                                      parsed.predicates,
                                    ),
                                  )
                                }
                              }}
                            >
                              {operator.glyph} {operator.name}
                            </MenuButton>
                          )}
                        </For>
                      </div>
                    </Show>
                    <Show when={predicateEditor()?.stage === 'value'}>
                      <EditorInput
                        label="Filter value"
                        value={predicateEditor()?.value ?? ''}
                        placeholder="Enter a value…"
                        onInput={(value) => {
                          const currentEditor = predicateEditor()
                          if (currentEditor) setEditor({ ...currentEditor, value })
                          setError(null)
                        }}
                        onCommit={commitPredicate}
                        onCancel={closeEditor}
                      />
                    </Show>
                  </>
                )
              })()}
            </Show>

            <Show when={active().type === 'order'}>
              {(() => {
                const orderEditor = () => {
                  const value = editor()
                  return value?.type === 'order' ? value : null
                }
                return (
                  <>
                    <Show when={orderEditor()?.stage === 'column'}>
                      <div
                        role="listbox"
                        style={{ display: 'flex', 'flex-direction': 'column' }}
                      >
                        <For each={columns()}>
                          {(column) => (
                            <MenuButton
                              disabled={column.formula !== null}
                              title={
                                column.formula === null ?
                                  undefined
                                : 'Formula columns cannot filter or sort in this version.'
                              }
                              onClick={() =>
                                setEditor({ type: 'order', stage: 'operator', column })
                              }
                            >
                              {column.name}
                            </MenuButton>
                          )}
                        </For>
                      </div>
                    </Show>
                    <Show when={orderEditor()?.stage === 'operator'}>
                      <div
                        role="listbox"
                        style={{ display: 'flex', 'flex-direction': 'column' }}
                      >
                        <For
                          each={
                            orderEditor()?.column ?
                              queryOperatorCandidates(orderEditor()!.column!).filter(
                                (operator) => operator.id === 'asc' || operator.id === 'desc',
                              )
                            : []
                          }
                        >
                          {(operator) => (
                            <MenuButton
                              onClick={() => {
                                const value = orderEditor()
                                if (!value?.column) return
                                commit(
                                  setQueryOrder(props.spec, {
                                    type: 'column',
                                    columnId: value.column.id,
                                    direction: operator.id === 'asc' ? 'asc' : 'desc',
                                  }) as NormalizedQuerySpec,
                                )
                              }}
                            >
                              {operator.glyph} {operator.name}
                            </MenuButton>
                          )}
                        </For>
                      </div>
                    </Show>
                  </>
                )
              })()}
            </Show>

            <Show when={active().type === 'limit'}>
              <EditorInput
                label="Result limit"
                value={limitEditor()?.value ?? ''}
                onInput={(value) => {
                  setEditor({ type: 'limit', value })
                  setError(null)
                }}
                onCommit={commitLimit}
                onCancel={closeEditor}
              />
            </Show>

            <Show when={error()}>
              {(message) => (
                <span
                  role="alert"
                  data-testid="saved-view-chip-error"
                  style={{ color: 'var(--color-danger)', 'font-size': '11px' }}
                >
                  {message()}
                </span>
              )}
            </Show>
            <div style={{ display: 'flex', gap: '6px' }}>
              <Show
                when={
                  active().type === 'text' ||
                  active().type === 'limit' ||
                  predicateEditor()?.stage === 'value'
                }
              >
                <button
                  type="button"
                  data-testid="saved-view-chip-apply"
                  onClick={commitTypedEditor}
                >
                  Apply
                </button>
              </Show>
              <Show
                when={
                  active().type === 'scope' ||
                  active().type === 'text' ||
                  active().type === 'order' ||
                  Boolean(predicateEditor() && predicateEditor()!.indexes.length > 0)
                }
              >
                <button
                  type="button"
                  data-testid="saved-view-chip-remove"
                  onClick={removeEditedDimension}
                >
                  Remove
                </button>
              </Show>
              <button type="button" data-testid="saved-view-chip-cancel" onClick={closeEditor}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Show>
    </>
  )
}

export default SavedViewStructuredAuthoring
