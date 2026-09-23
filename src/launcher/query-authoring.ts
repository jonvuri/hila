import type { ColumnDefinition } from '../core/matrix'
import {
  addQueryPredicate,
  removeQueryPredicate,
  setQueryKind,
  setQueryOrder,
  setQueryScope,
  setQueryText,
} from '../sql/query-spec/operations'
import type { QuerySpec } from '../sql/query-spec/types'

import {
  FORMULA_QUERY_UNAVAILABLE_REASON,
  parseQueryValue,
  queryAuthoringOperators,
  type FrozenDateValue,
  type QueryAuthoringOperatorId,
} from './query-grammar'

export const DEFAULT_LAUNCHER_QUERY_LIMIT = 1_000

type QueryChipBase = {
  readonly id: string
  readonly label: string
}

export type QueryKindChip = QueryChipBase & {
  readonly type: 'kind'
  readonly matrixId: number
  readonly mark: '#' | '[]'
}

export type QueryScopeChip = QueryChipBase & {
  readonly type: 'scope'
  readonly node: { readonly matrixId: number; readonly rowId: number }
}

export type QueryPredicateChip = QueryChipBase & {
  readonly type: 'predicate'
  readonly columnId: number
  readonly columnName: string
  readonly operator: QueryAuthoringOperatorId
  readonly operatorGlyph: string
  readonly valueLabel: string
  readonly predicateCount: number
  readonly frozenDate?: FrozenDateValue
}

export type QueryOrderChip = QueryChipBase & {
  readonly type: 'order'
  readonly columnId: number
  readonly columnName: string
  readonly direction: 'asc' | 'desc'
  readonly operatorGlyph: '↑' | '↓'
}

export type LauncherQueryChip =
  | QueryKindChip
  | QueryScopeChip
  | QueryPredicateChip
  | QueryOrderChip

export type QueryAuthoringInvalidValue = {
  readonly type: 'invalid-value'
  readonly reason: string
}

export type LauncherQueryState = {
  readonly spec: QuerySpec
  readonly chips: readonly LauncherQueryChip[]
  readonly nextChipId: number
  readonly invalid: QueryAuthoringInvalidValue | null
}

export type LauncherQueryAction =
  | { readonly type: 'set-text'; readonly text: string }
  | {
      readonly type: 'commit-kind'
      readonly matrixId: number
      readonly label: string
      readonly mark: '#' | '[]'
    }
  | {
      readonly type: 'commit-scope'
      readonly node: { readonly matrixId: number; readonly rowId: number }
      readonly label: string
    }
  | {
      readonly type: 'commit-column'
      readonly column: ColumnDefinition
      readonly operator: QueryAuthoringOperatorId
      readonly valueText?: string
      readonly now?: Date
    }
  | { readonly type: 'remove-chip'; readonly chipId: string }
  | { readonly type: 'pop-chip' }
  | { readonly type: 'clear-invalid' }

export const createLauncherQueryState = (text = ''): LauncherQueryState => ({
  spec: {
    kind: { type: 'everything' },
    scope: { type: 'all' },
    text,
    where: [],
    order: { type: 'natural' },
    limit: DEFAULT_LAUNCHER_QUERY_LIMIT,
  },
  chips: [],
  nextChipId: 1,
  invalid: null,
})

export const queryTempo = (spec: QuerySpec): 'quick' | 'deep' =>
  (
    spec.kind.type !== 'everything' ||
    spec.scope.type !== 'all' ||
    spec.where.length > 0 ||
    spec.order.type !== 'natural'
  ) ?
    'deep'
  : 'quick'

const replaceDimensionChip = (
  chips: readonly LauncherQueryChip[],
  chip: LauncherQueryChip,
): readonly LauncherQueryChip[] => {
  const index = chips.findIndex((candidate) => candidate.type === chip.type)
  if (index === -1) return [...chips, chip]
  return chips.map((candidate, candidateIndex) => (candidateIndex === index ? chip : candidate))
}

const predicateStartIndex = (chips: readonly LauncherQueryChip[], chipIndex: number): number =>
  chips
    .slice(0, chipIndex)
    .reduce((count, chip) => count + (chip.type === 'predicate' ? chip.predicateCount : 0), 0)

const withoutChip = (state: LauncherQueryState, chipIndex: number): LauncherQueryState => {
  const chip = state.chips[chipIndex]
  if (!chip) return state
  let spec = state.spec
  if (chip.type === 'kind') {
    spec = setQueryKind(spec, { type: 'everything' })
    while (spec.where.length > 0) spec = removeQueryPredicate(spec, 0)
    spec = setQueryOrder(spec, { type: 'natural' })
  }
  if (chip.type === 'scope') spec = setQueryScope(spec, { type: 'all' })
  if (chip.type === 'order') spec = setQueryOrder(spec, { type: 'natural' })
  if (chip.type === 'predicate') {
    const startIndex = predicateStartIndex(state.chips, chipIndex)
    for (let index = 0; index < chip.predicateCount; index += 1) {
      spec = removeQueryPredicate(spec, startIndex)
    }
  }
  return {
    ...state,
    spec,
    chips:
      chip.type === 'kind' ?
        state.chips.filter(
          (candidate) =>
            candidate.type !== 'kind' &&
            candidate.type !== 'predicate' &&
            candidate.type !== 'order',
        )
      : state.chips.filter((_, index) => index !== chipIndex),
    invalid: null,
  }
}

const invalid = (state: LauncherQueryState, reason: string): LauncherQueryState => ({
  ...state,
  invalid: { type: 'invalid-value', reason },
})

export const reduceLauncherQuery = (
  state: LauncherQueryState,
  action: LauncherQueryAction,
): LauncherQueryState => {
  if (action.type === 'set-text') {
    return { ...state, spec: setQueryText(state.spec, action.text), invalid: null }
  }
  if (action.type === 'clear-invalid') return { ...state, invalid: null }
  if (action.type === 'remove-chip') {
    return withoutChip(
      state,
      state.chips.findIndex((chip) => chip.id === action.chipId),
    )
  }
  if (action.type === 'pop-chip') return withoutChip(state, state.chips.length - 1)

  const id = `query-chip-${state.nextChipId}`
  if (action.type === 'commit-kind') {
    const chip: QueryKindChip = {
      id,
      type: 'kind',
      matrixId: action.matrixId,
      label: action.label,
      mark: action.mark,
    }
    if (state.spec.kind.type === 'matrix' && state.spec.kind.matrixId === action.matrixId) {
      return {
        ...state,
        chips: replaceDimensionChip(state.chips, chip),
        nextChipId: state.nextChipId + 1,
        invalid: null,
      }
    }
    let spec = setQueryKind(state.spec, { type: 'matrix', matrixId: action.matrixId })
    while (spec.where.length > 0) spec = removeQueryPredicate(spec, 0)
    spec = setQueryOrder(spec, { type: 'natural' })
    return {
      ...state,
      spec,
      chips: [chip, ...state.chips.filter((candidate) => candidate.type === 'scope')],
      nextChipId: state.nextChipId + 1,
      invalid: null,
    }
  }
  if (action.type === 'commit-scope') {
    const chip: QueryScopeChip = {
      id,
      type: 'scope',
      node: action.node,
      label: action.label,
    }
    return {
      ...state,
      spec: setQueryScope(state.spec, { type: 'node', ...action.node }),
      chips: replaceDimensionChip(state.chips, chip),
      nextChipId: state.nextChipId + 1,
      invalid: null,
    }
  }

  if (action.column.formula !== null) return invalid(state, FORMULA_QUERY_UNAVAILABLE_REASON)
  const parsed = parseQueryValue(
    action.column,
    action.operator,
    action.valueText ?? '',
    action.now,
  )
  if (!parsed.ok) return invalid(state, parsed.reason)

  if (action.operator === 'asc' || action.operator === 'desc') {
    const chip: QueryOrderChip = {
      id,
      type: 'order',
      label: action.column.name,
      columnId: action.column.id,
      columnName: action.column.name,
      direction: action.operator,
      operatorGlyph: action.operator === 'asc' ? '↑' : '↓',
    }
    return {
      ...state,
      spec: setQueryOrder(state.spec, {
        type: 'column',
        columnId: action.column.id,
        direction: action.operator,
      }),
      chips: replaceDimensionChip(state.chips, chip),
      nextChipId: state.nextChipId + 1,
      invalid: null,
    }
  }

  let spec = state.spec
  for (const predicate of parsed.predicates) spec = addQueryPredicate(spec, predicate)
  const chip: QueryPredicateChip = {
    id,
    type: 'predicate',
    label: action.column.name,
    columnId: action.column.id,
    columnName: action.column.name,
    operator: action.operator,
    operatorGlyph: queryAuthoringOperators[action.operator].glyph,
    valueLabel: parsed.valueLabel,
    predicateCount: parsed.predicates.length,
    ...(parsed.frozenDate ? { frozenDate: parsed.frozenDate } : {}),
  }
  return {
    ...state,
    spec,
    chips: [...state.chips, chip],
    nextChipId: state.nextChipId + 1,
    invalid: null,
  }
}

export const relativeDateFreezeNotice = (chip: QueryPredicateChip): string | null =>
  !chip.frozenDate?.relative ? null
  : chip.operator === 'before' ?
    `${chip.frozenDate.sourceText} is frozen as before ${chip.frozenDate.startInclusive}.`
  : chip.operator === 'after' ?
    `${chip.frozenDate.sourceText} is frozen as after ${chip.frozenDate.endInclusive}.`
  : `${chip.frozenDate.sourceText} is frozen as ${chip.frozenDate.startInclusive} through ${chip.frozenDate.endInclusive}.`

export const launcherPreviewColumns = (
  columns: readonly ColumnDefinition[],
  chips: readonly LauncherQueryChip[],
): readonly ColumnDefinition[] => {
  const byId = new Map(columns.map((column) => [column.id, column]))
  const orderedIds = [
    ...columns
      .filter((column) => column.role === 'label')
      .sort((left, right) => left.order - right.order)
      .map((column) => column.id),
    ...chips.flatMap((chip) =>
      chip.type === 'predicate' || chip.type === 'order' ? [chip.columnId] : [],
    ),
  ]
  const seen = new Set<number>()
  return orderedIds.flatMap((id) => {
    if (seen.has(id)) return []
    seen.add(id)
    const column = byId.get(id)
    return column ? [column] : []
  })
}
