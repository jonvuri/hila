import type { ColumnDefinition } from '../core/matrix'
import { sqliteAffinity } from '../sql/query-spec/normalize'
import { freezeRelativeDateRange, type ClosedDateRange } from '../sql/query-spec/relative-date'
import type { QueryPredicate } from '../sql/query-spec/types'

export type QueryAuthoringOperatorId =
  | 'eq'
  | 'neq'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'contains'
  | 'empty'
  | 'notEmpty'
  | 'on'
  | 'before'
  | 'after'
  | 'asc'
  | 'desc'

export type QueryAuthoringOperator = {
  readonly id: QueryAuthoringOperatorId
  readonly glyph: string
  readonly name: string
  readonly synonyms: readonly string[]
  readonly typed: readonly string[]
  readonly requiresValue: boolean
}

const operator = (
  id: QueryAuthoringOperatorId,
  glyph: string,
  name: string,
  synonyms: readonly string[],
  typed: readonly string[],
  requiresValue = true,
): QueryAuthoringOperator => ({ id, glyph, name, synonyms, typed, requiresValue })

export const queryAuthoringOperators = {
  eq: operator('eq', '=', 'equals', ['equal', 'is'], ['=', '==']),
  neq: operator(
    'neq',
    '≠',
    'does not equal',
    ['not', 'not equal', 'differs'],
    ['≠', '!=', '<>'],
  ),
  lt: operator('lt', '<', 'less than', ['lower than'], ['<']),
  lte: operator('lte', '≤', 'at most', ['less than or equal'], ['≤', '<=']),
  gt: operator('gt', '>', 'greater than', ['more than', 'higher than'], ['>']),
  gte: operator('gte', '≥', 'at least', ['greater than or equal'], ['≥', '>=']),
  contains: operator('contains', '∈', 'contains', ['includes', 'has'], ['∈', '~=', 'contains']),
  empty: operator('empty', '∅', 'is empty', ['empty', 'blank'], ['∅', 'empty'], false),
  notEmpty: operator(
    'notEmpty',
    '!∅',
    'is not empty',
    ['not empty', 'not blank'],
    ['!∅', 'not empty'],
    false,
  ),
  on: operator('on', '=', 'on', ['date is'], ['=']),
  before: operator('before', '<', 'before', ['earlier than'], ['<']),
  after: operator('after', '>', 'after', ['later than'], ['>']),
  asc: operator(
    'asc',
    '↑',
    'ascending',
    ['asc', 'oldest first', 'smallest first'],
    ['↑', 'asc'],
    false,
  ),
  desc: operator(
    'desc',
    '↓',
    'descending',
    ['desc', 'newest first', 'largest first'],
    ['↓', 'desc'],
    false,
  ),
} as const satisfies Record<QueryAuthoringOperatorId, QueryAuthoringOperator>

export type QueryOperatorCandidate = QueryAuthoringOperator & {
  readonly unavailableReason?: string
}

export const FORMULA_QUERY_UNAVAILABLE_REASON =
  'Formula columns cannot filter or sort in this version.'

const operatorIdsForColumn = (
  column: ColumnDefinition,
): readonly QueryAuthoringOperatorId[] => {
  if (column.displayType === 'date') {
    return ['on', 'before', 'after', 'empty', 'notEmpty', 'asc', 'desc']
  }
  if (column.displayType === 'boolean') return ['eq', 'neq', 'asc', 'desc']
  if (column.displayType === 'number') {
    return ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'asc', 'desc']
  }
  return ['eq', 'neq', 'contains', 'empty', 'notEmpty', 'asc', 'desc']
}

export const queryOperatorCandidates = (
  column: ColumnDefinition,
  query = '',
): readonly QueryOperatorCandidate[] => {
  const needle = query.trim().toLocaleLowerCase()
  return operatorIdsForColumn(column)
    .map((id) => queryAuthoringOperators[id])
    .filter((candidate) => {
      if (!needle) return true
      const terms = [candidate.glyph, candidate.name, ...candidate.synonyms, ...candidate.typed]
      return terms.some((term) => term.toLocaleLowerCase().includes(needle))
    })
    .map((candidate) =>
      column.formula === null ?
        candidate
      : { ...candidate, unavailableReason: FORMULA_QUERY_UNAVAILABLE_REASON },
    )
}

export type TypedColumnOperator = {
  readonly column: ColumnDefinition
  readonly operator: QueryAuthoringOperator
  readonly valueText: string
}

export const parseTypedColumnOperator = (
  input: string,
  columns: readonly ColumnDefinition[],
): TypedColumnOperator | null => {
  const lowered = input.toLocaleLowerCase()
  const orderedColumns = [...columns].sort(
    (left, right) => right.name.length - left.name.length,
  )
  for (const column of orderedColumns) {
    const columnName = column.name.toLocaleLowerCase()
    if (!lowered.startsWith(columnName)) continue
    const suffix = input.slice(column.name.length).trimStart()
    const loweredSuffix = suffix.toLocaleLowerCase()
    const candidates = queryOperatorCandidates(column)
    const tokens = candidates
      .flatMap((candidate) => candidate.typed.map((token) => ({ candidate, token })))
      .sort((left, right) => right.token.length - left.token.length)
    const match = tokens.find(({ token }) =>
      loweredSuffix.startsWith(token.toLocaleLowerCase()),
    )
    if (!match) continue
    return {
      column,
      operator: match.candidate,
      valueText: suffix.slice(match.token.length).trimStart(),
    }
  }
  return null
}

export type FrozenDateValue = ClosedDateRange & {
  readonly sourceText: string
  readonly relative: boolean
}

export type QueryValueParseResult =
  | {
      readonly ok: true
      readonly predicates: readonly QueryPredicate[]
      readonly valueLabel: string
      readonly frozenDate?: FrozenDateValue
    }
  | { readonly ok: false; readonly reason: string }

const pad = (value: number): string => String(value).padStart(2, '0')

const formatLocalDate = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const localDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

const addLocalDays = (date: Date, days: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)

const range = (
  start: Date,
  end: Date,
  sourceText: string,
  relative = true,
): FrozenDateValue | null =>
  !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) ?
    null
  : {
      startInclusive: formatLocalDate(start),
      endInclusive: formatLocalDate(end),
      sourceText,
      relative,
    }

const literalDate = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  return (
      date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ) ?
      date
    : null
}

export const parseDateValue = (input: string, now = new Date()): FrozenDateValue | null => {
  const sourceText = input.trim()
  const token = sourceText.toLocaleLowerCase()
  const today = localDay(now)
  if (token === 'today') return range(today, today, sourceText)
  if (token === 'tomorrow') {
    const tomorrow = addLocalDays(today, 1)
    return range(tomorrow, tomorrow, sourceText)
  }
  if (token === 'yesterday') {
    const yesterday = addLocalDays(today, -1)
    return range(yesterday, yesterday, sourceText)
  }

  const weekOffset =
    token === 'last week' ? -7
    : token === 'next week' ? 7
    : 0
  if (token === 'this week' || weekOffset !== 0) {
    const mondayOffset = (today.getDay() + 6) % 7
    const monday = addLocalDays(today, -mondayOffset + weekOffset)
    return range(monday, addLocalDays(monday, 6), sourceText)
  }

  const monthOffset =
    token === 'last month' ? -1
    : token === 'next month' ? 1
    : 0
  if (token === 'this month' || monthOffset !== 0) {
    const start = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
    const end = new Date(today.getFullYear(), today.getMonth() + monthOffset + 1, 0)
    return range(start, end, sourceText)
  }

  const rolling = /^(last|next)\s+([1-9]\d*)\s+days?$/.exec(token)
  if (rolling) {
    const count = Number(rolling[2])
    if (!Number.isSafeInteger(count)) return null
    return rolling[1] === 'last' ?
        range(addLocalDays(today, -(count - 1)), today, sourceText)
      : range(today, addLocalDays(today, count - 1), sourceText)
  }

  const literalRange = /^(\d{4}-\d{2}-\d{2})\s*\.\.\s*(\d{4}-\d{2}-\d{2})$/.exec(sourceText)
  if (literalRange) {
    const start = literalDate(literalRange[1]!)
    const end = literalDate(literalRange[2]!)
    if (!start || !end || start > end) return null
    return range(start, end, sourceText, false)
  }

  const literal = literalDate(sourceText)
  return literal ? range(literal, literal, sourceText, false) : null
}

const parseBoolean = (value: string): 0 | 1 | null => {
  const normalized = value.trim().toLocaleLowerCase()
  if (['true', 'yes', '1'].includes(normalized)) return 1
  if (['false', 'no', '0'].includes(normalized)) return 0
  return null
}

const valuePredicateOperators = {
  eq: 'eq',
  neq: 'neq',
  lt: 'lt',
  lte: 'lte',
  gt: 'gt',
  gte: 'gte',
  contains: 'contains',
} as const

const parseNumericValue = (column: ColumnDefinition, value: string): number | bigint | null => {
  if (sqliteAffinity(column.type) !== 'integer') {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : null
  }
  if (!/^[+-]?\d+$/.test(value)) return null
  try {
    const integer = BigInt(value)
    if (integer < -(1n << 63n) || integer > (1n << 63n) - 1n) return null
    return (
        integer >= BigInt(Number.MIN_SAFE_INTEGER) && integer <= BigInt(Number.MAX_SAFE_INTEGER)
      ) ?
        Number(integer)
      : integer
  } catch {
    return null
  }
}

export const parseQueryValue = (
  column: ColumnDefinition,
  operatorId: QueryAuthoringOperatorId,
  input: string,
  now = new Date(),
): QueryValueParseResult => {
  if (column.formula !== null) return { ok: false, reason: FORMULA_QUERY_UNAVAILABLE_REASON }
  const available = operatorIdsForColumn(column)
  if (!available.includes(operatorId)) {
    return {
      ok: false,
      reason: `${queryAuthoringOperators[operatorId].name} is not valid for ${column.name}.`,
    }
  }
  if (operatorId === 'asc' || operatorId === 'desc') {
    return { ok: true, predicates: [], valueLabel: '' }
  }
  if (operatorId === 'empty' || operatorId === 'notEmpty') {
    return {
      ok: true,
      predicates: [{ type: 'predicate', columnId: column.id, op: operatorId }],
      valueLabel: '',
    }
  }

  if (column.displayType === 'date') {
    const frozenDate = parseDateValue(input, now)
    if (!frozenDate) {
      return {
        ok: false,
        reason: 'Use a date, a closed date range, or a phrase such as today or this week.',
      }
    }
    const predicates =
      operatorId === 'on' ? freezeRelativeDateRange(column.id, frozenDate)
      : operatorId === 'before' ?
        [
          {
            type: 'predicate' as const,
            columnId: column.id,
            op: 'lt' as const,
            value: frozenDate.startInclusive,
          },
        ]
      : [
          {
            type: 'predicate' as const,
            columnId: column.id,
            op: 'gt' as const,
            value: frozenDate.endInclusive,
          },
        ]
    return { ok: true, predicates, valueLabel: frozenDate.sourceText, frozenDate }
  }

  const predicateOperator =
    operatorId in valuePredicateOperators ?
      valuePredicateOperators[operatorId as keyof typeof valuePredicateOperators]
    : null
  if (!predicateOperator) {
    return {
      ok: false,
      reason: `${queryAuthoringOperators[operatorId].name} is not valid for ${column.name}.`,
    }
  }

  const value = input.trim()
  if (!value) return { ok: false, reason: `${column.name} needs a value.` }
  if (column.displayType === 'number') {
    const numeric = parseNumericValue(column, value)
    if (numeric === null) {
      return {
        ok: false,
        reason:
          sqliteAffinity(column.type) === 'integer' ?
            `${value} is not a valid SQLite integer.`
          : `${value} is not a finite number.`,
      }
    }
    return {
      ok: true,
      predicates: [
        { type: 'predicate', columnId: column.id, op: predicateOperator, value: numeric },
      ],
      valueLabel: value,
    }
  }
  if (column.displayType === 'boolean') {
    const boolean = parseBoolean(value)
    if (boolean === null) {
      return { ok: false, reason: 'Use true or false.' }
    }
    return {
      ok: true,
      predicates: [
        { type: 'predicate', columnId: column.id, op: predicateOperator, value: boolean },
      ],
      valueLabel: boolean === 1 ? 'true' : 'false',
    }
  }
  return {
    ok: true,
    predicates: [{ type: 'predicate', columnId: column.id, op: predicateOperator, value }],
    valueLabel: value,
  }
}
