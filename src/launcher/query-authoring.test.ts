import { describe, expect, test } from 'vitest'

import type { ColumnDefinition } from '../core/matrix'

import {
  createLauncherQueryState,
  launcherPreviewColumns,
  queryTempo,
  reduceLauncherQuery,
  relativeDateFreezeNotice,
} from './query-authoring'

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

const label = column(10, 'title', 'text', { role: 'label', order: 0 })
const due = column(11, 'due', 'date')
const score = column(12, 'score', 'number')

describe('launcher query authoring reducer', () => {
  test('derives tempo only from committed QuerySpec dimensions', () => {
    let state = createLauncherQueryState('uncommitted words')
    expect(queryTempo(state.spec)).toBe('quick')

    state = reduceLauncherQuery(state, {
      type: 'commit-kind',
      matrixId: 7,
      label: 'Task',
      mark: '#',
    })
    expect(queryTempo(state.spec)).toBe('deep')

    state = reduceLauncherQuery(state, { type: 'pop-chip' })
    expect(queryTempo(state.spec)).toBe('quick')
    expect(state.spec.text).toBe('uncommitted words')
  })

  test('commits and replaces singular kind, scope, and order dimensions', () => {
    let state = createLauncherQueryState()
    state = reduceLauncherQuery(state, {
      type: 'commit-kind',
      matrixId: 7,
      label: 'Task',
      mark: '#',
    })
    state = reduceLauncherQuery(state, {
      type: 'commit-scope',
      node: { matrixId: 2, rowId: 20 },
      label: 'Projects',
    })
    state = reduceLauncherQuery(state, {
      type: 'commit-column',
      column: due,
      operator: 'asc',
    })
    state = reduceLauncherQuery(state, {
      type: 'commit-column',
      column: score,
      operator: 'desc',
    })

    expect(state.chips.map(({ type }) => type)).toEqual(['kind', 'scope', 'order'])
    expect(state.spec).toMatchObject({
      kind: { type: 'matrix', matrixId: 7 },
      scope: { type: 'node', matrixId: 2, rowId: 20 },
      order: { type: 'column', columnId: 12, direction: 'desc' },
    })
  })

  test('clears matrix-bound predicates and order when kind changes or is removed', () => {
    let state = createLauncherQueryState()
    state = reduceLauncherQuery(state, {
      type: 'commit-kind',
      matrixId: 7,
      label: 'Task',
      mark: '#',
    })
    state = reduceLauncherQuery(state, {
      type: 'commit-scope',
      node: { matrixId: 2, rowId: 20 },
      label: 'Projects',
    })
    state = reduceLauncherQuery(state, {
      type: 'commit-column',
      column: score,
      operator: 'gte',
      valueText: '3',
    })
    state = reduceLauncherQuery(state, {
      type: 'commit-column',
      column: due,
      operator: 'desc',
    })

    state = reduceLauncherQuery(state, {
      type: 'commit-kind',
      matrixId: 8,
      label: 'Project',
      mark: '[]',
    })
    expect(state.spec).toMatchObject({
      kind: { type: 'matrix', matrixId: 8 },
      scope: { type: 'node', matrixId: 2, rowId: 20 },
      where: [],
      order: { type: 'natural' },
    })
    expect(state.chips.map(({ type }) => type)).toEqual(['kind', 'scope'])

    state = reduceLauncherQuery(state, {
      type: 'remove-chip',
      chipId: state.chips.find((chip) => chip.type === 'kind')!.id,
    })
    expect(state.spec.kind).toEqual({ type: 'everything' })
    expect(state.chips.map(({ type }) => type)).toEqual(['scope'])
  })

  test('preserves matrix-bound predicates and order when the same kind is recommitted', () => {
    let state = createLauncherQueryState()
    state = reduceLauncherQuery(state, {
      type: 'commit-kind',
      matrixId: 7,
      label: 'Task',
      mark: '#',
    })
    state = reduceLauncherQuery(state, {
      type: 'commit-column',
      column: score,
      operator: 'gte',
      valueText: '3',
    })
    state = reduceLauncherQuery(state, {
      type: 'commit-column',
      column: due,
      operator: 'desc',
    })
    const predicateChip = state.chips.find((chip) => chip.type === 'predicate')
    const orderChip = state.chips.find((chip) => chip.type === 'order')

    state = reduceLauncherQuery(state, {
      type: 'commit-kind',
      matrixId: 7,
      label: 'Renamed task',
      mark: '#',
    })

    expect(state.spec).toMatchObject({
      kind: { type: 'matrix', matrixId: 7 },
      where: [{ type: 'predicate', columnId: 12, op: 'gte', value: 3 }],
      order: { type: 'column', columnId: 11, direction: 'desc' },
    })
    expect(state.chips).toEqual([
      expect.objectContaining({ type: 'kind', label: 'Renamed task' }),
      predicateChip,
      orderChip,
    ])
  })

  test('keeps one relative-date phrase as one logical chip over its frozen predicate pair', () => {
    const now = new Date(2026, 8, 23, 12)
    let state = createLauncherQueryState()
    state = reduceLauncherQuery(state, {
      type: 'commit-column',
      column: due,
      operator: 'on',
      valueText: 'this week',
      now,
    })

    expect(state.chips).toHaveLength(1)
    expect(state.spec.where).toEqual([
      { type: 'predicate', columnId: 11, op: 'gte', value: '2026-09-21' },
      { type: 'predicate', columnId: 11, op: 'lte', value: '2026-09-27' },
    ])
    const chip = state.chips[0]
    expect(chip).toMatchObject({
      type: 'predicate',
      valueLabel: 'this week',
      predicateCount: 2,
    })
    if (chip?.type !== 'predicate') throw new Error('Expected predicate chip')
    expect(relativeDateFreezeNotice(chip)).toBe(
      'this week is frozen as 2026-09-21 through 2026-09-27.',
    )

    const before = reduceLauncherQuery(createLauncherQueryState(), {
      type: 'commit-column',
      column: due,
      operator: 'before',
      valueText: 'this week',
      now,
    }).chips[0]
    const after = reduceLauncherQuery(createLauncherQueryState(), {
      type: 'commit-column',
      column: due,
      operator: 'after',
      valueText: 'this week',
      now,
    }).chips[0]
    if (before?.type !== 'predicate' || after?.type !== 'predicate') {
      throw new Error('Expected predicate chips')
    }
    expect(relativeDateFreezeNotice(before)).toBe('this week is frozen as before 2026-09-21.')
    expect(relativeDateFreezeNotice(after)).toBe('this week is frozen as after 2026-09-27.')

    state = reduceLauncherQuery(state, { type: 'remove-chip', chipId: chip.id })
    expect(state.spec.where).toEqual([])
    expect(queryTempo(state.spec)).toBe('quick')
  })

  test('removes a logical predicate without disturbing later predicate indexes', () => {
    let state = createLauncherQueryState()
    state = reduceLauncherQuery(state, {
      type: 'commit-column',
      column: score,
      operator: 'gte',
      valueText: '3',
    })
    state = reduceLauncherQuery(state, {
      type: 'commit-column',
      column: due,
      operator: 'before',
      valueText: '2026-10-01',
    })
    const firstId = state.chips[0]!.id

    state = reduceLauncherQuery(state, { type: 'remove-chip', chipId: firstId })
    expect(state.spec.where).toEqual([
      { type: 'predicate', columnId: 11, op: 'lt', value: '2026-10-01' },
    ])
  })

  test('preserves the valid spec and exposes one canonical invalid state', () => {
    const state = reduceLauncherQuery(createLauncherQueryState(), {
      type: 'commit-column',
      column: score,
      operator: 'eq',
      valueText: 'many',
    })

    expect(state.spec.where).toEqual([])
    expect(state.chips).toEqual([])
    expect(state.invalid).toEqual({
      type: 'invalid-value',
      reason: 'many is not a finite number.',
    })
  })
})

describe('launcher preview projection', () => {
  test('shows labels first, then predicate and order columns in chip order without duplicates', () => {
    let state = createLauncherQueryState()
    state = reduceLauncherQuery(state, {
      type: 'commit-column',
      column: score,
      operator: 'gt',
      valueText: '2',
    })
    state = reduceLauncherQuery(state, {
      type: 'commit-column',
      column: due,
      operator: 'before',
      valueText: 'today',
      now: new Date(2026, 8, 23, 12),
    })
    state = reduceLauncherQuery(state, {
      type: 'commit-column',
      column: score,
      operator: 'desc',
    })

    expect(
      launcherPreviewColumns([due, score, label], state.chips).map(({ name }) => name),
    ).toEqual(['title', 'score', 'due'])
  })
})
