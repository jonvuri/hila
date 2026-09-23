import { describe, expect, test } from 'vitest'

import type { ColumnDefinition } from '../core/matrix'

import {
  FORMULA_QUERY_UNAVAILABLE_REASON,
  parseDateValue,
  parseQueryValue,
  parseTypedColumnOperator,
  queryOperatorCandidates,
} from './query-grammar'

const column = (
  id: number,
  name: string,
  displayType: string,
  options: Partial<ColumnDefinition> = {},
): ColumnDefinition => ({
  id,
  name,
  type:
    displayType === 'number' ? 'REAL'
    : displayType === 'boolean' ? 'INTEGER'
    : 'TEXT',
  displayType,
  order: id,
  options: null,
  formula: null,
  constraints: null,
  managedBy: null,
  role: null,
  ...options,
})

const due = column(11, 'due', 'date')
const score = column(12, 'story points', 'number')
const status = column(13, 'status', 'select')

describe('launcher query operator grammar', () => {
  test('offers operators by value type and matches names and synonyms', () => {
    expect(queryOperatorCandidates(due).map(({ id }) => id)).toEqual([
      'on',
      'before',
      'after',
      'empty',
      'notEmpty',
      'asc',
      'desc',
    ])
    expect(queryOperatorCandidates(status, 'includes').map(({ id }) => id)).toEqual([
      'contains',
    ])
    expect(queryOperatorCandidates(status, 'INCLUDES').map(({ id }) => id)).toEqual([
      'contains',
    ])
    expect(queryOperatorCandidates(score, 'at least').map(({ id }) => id)).toEqual(['gte'])
    expect(queryOperatorCandidates(due, 'newest').map(({ id }) => id)).toEqual(['desc'])
  })

  test('keeps formula candidates visible but disabled with one stated reason', () => {
    const formula = column(14, 'remaining', 'number', { formula: '{{12}} - 1' })
    const candidates = queryOperatorCandidates(formula)

    expect(candidates).not.toHaveLength(0)
    expect(
      candidates.every(
        ({ unavailableReason }) => unavailableReason === FORMULA_QUERY_UNAVAILABLE_REASON,
      ),
    ).toBe(true)
  })

  test('parses glyph and ASCII operators after the longest matching column name', () => {
    expect(
      parseTypedColumnOperator('story points<= 8', [column(1, 'story', 'text'), score]),
    ).toMatchObject({
      column: { id: 12 },
      operator: { id: 'lte', glyph: '≤' },
      valueText: '8',
    })
    expect(parseTypedColumnOperator('status≠done', [status])).toMatchObject({
      operator: { id: 'neq' },
      valueText: 'done',
    })
    expect(parseTypedColumnOperator('due↓', [due])).toMatchObject({
      operator: { id: 'desc' },
      valueText: '',
    })
    expect(parseTypedColumnOperator('status contains done', [status])).toMatchObject({
      operator: { id: 'contains' },
      valueText: 'done',
    })
    expect(parseTypedColumnOperator('STATUS CONTAINS Done', [status])).toMatchObject({
      operator: { id: 'contains' },
      valueText: 'Done',
    })
  })
})

describe('launcher query value parsing', () => {
  const now = new Date(2026, 8, 23, 12)

  test('uses the local calendar for relative days, weeks, months, and rolling ranges', () => {
    expect(parseDateValue('today', now)).toMatchObject({
      startInclusive: '2026-09-23',
      endInclusive: '2026-09-23',
      relative: true,
    })
    expect(parseDateValue('this week', now)).toMatchObject({
      startInclusive: '2026-09-21',
      endInclusive: '2026-09-27',
    })
    expect(parseDateValue('next month', now)).toMatchObject({
      startInclusive: '2026-10-01',
      endInclusive: '2026-10-31',
    })
    expect(parseDateValue('last 3 days', now)).toMatchObject({
      startInclusive: '2026-09-21',
      endInclusive: '2026-09-23',
    })
  })

  test('rejects rolling ranges whose date boundaries overflow', () => {
    expect(parseDateValue('next 100000000 days', now)).toBeNull()
    expect(parseDateValue('last 200000000 days', now)).toBeNull()
  })

  test('accepts literal days and closed ranges while rejecting invalid calendar dates', () => {
    expect(parseDateValue('2026-10-01', now)).toMatchObject({
      startInclusive: '2026-10-01',
      endInclusive: '2026-10-01',
      relative: false,
    })
    expect(parseDateValue('2026-10-01..2026-10-04', now)).toMatchObject({
      startInclusive: '2026-10-01',
      endInclusive: '2026-10-04',
      relative: false,
    })
    expect(parseDateValue('2026-02-30', now)).toBeNull()
    expect(parseDateValue('2026-10-04..2026-10-01', now)).toBeNull()
  })

  test('maps on to a closed pair, before to the start, and after to the end', () => {
    expect(parseQueryValue(due, 'on', 'this week', now)).toMatchObject({
      ok: true,
      predicates: [
        { columnId: 11, op: 'gte', value: '2026-09-21' },
        { columnId: 11, op: 'lte', value: '2026-09-27' },
      ],
    })
    expect(parseQueryValue(due, 'before', 'this week', now)).toMatchObject({
      ok: true,
      predicates: [{ columnId: 11, op: 'lt', value: '2026-09-21' }],
    })
    expect(parseQueryValue(due, 'after', 'this week', now)).toMatchObject({
      ok: true,
      predicates: [{ columnId: 11, op: 'gt', value: '2026-09-27' }],
    })
  })

  test('normalizes number and boolean values and states invalid reasons', () => {
    expect(parseQueryValue(score, 'gte', ' 3.5 ')).toMatchObject({
      ok: true,
      predicates: [{ value: 3.5 }],
    })
    expect(parseQueryValue(column(15, 'done', 'boolean'), 'eq', 'yes')).toMatchObject({
      ok: true,
      predicates: [{ value: 1 }],
      valueLabel: 'true',
    })
    expect(parseQueryValue(score, 'eq', 'NaN')).toEqual({
      ok: false,
      reason: 'NaN is not a finite number.',
    })
    expect(parseQueryValue(column(15, 'done', 'boolean'), 'eq', 'maybe')).toEqual({
      ok: false,
      reason: 'Use true or false.',
    })
    expect(
      parseQueryValue(column(16, 'whole', 'number', { type: 'INTEGER' }), 'eq', '3.5'),
    ).toEqual({ ok: false, reason: '3.5 is not a valid SQLite integer.' })
    expect(
      parseQueryValue(
        column(16, 'whole', 'number', { type: 'INTEGER' }),
        'eq',
        '9007199254740993',
      ),
    ).toMatchObject({ ok: true, predicates: [{ value: 9_007_199_254_740_993n }] })
  })
})
