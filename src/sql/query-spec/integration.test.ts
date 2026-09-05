import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, describe, expect, test } from 'vitest'

import {
  createDependentRow,
  createMatrix,
  getColumns,
  initMatrixSchema,
  insertDataRow,
} from '../../core/matrix'
import { recognizeUpdatableQuery } from '../recognize-updatable'

import { createQueryCatalog, type QueryCatalog } from './catalog'
import { compileQuerySpec } from './compile'
import { materializeQuerySpec } from './materialize'
import { recognizeQuerySpec } from './recognize'
import type { QueryPredicate, QuerySpec } from './types'

describe('query-spec SQLite integration', () => {
  let db: Database
  let hostMatrixId: number
  let resultMatrixId: number
  let hostRowId: number
  let catalog: QueryCatalog
  let columnId: Record<'label' | 'body' | 'score' | 'payload', number>
  let rowIds: Record<'alpha' | 'beta' | 'empty' | 'blank' | 'outside', number>

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    hostMatrixId = createMatrix(db, 'Hosts', [{ name: 'label', type: 'TEXT', role: 'label' }])
    resultMatrixId = createMatrix(db, 'Tasks', [
      { name: 'label', type: 'TEXT', role: 'label' },
      { name: 'body', type: 'TEXT', role: 'content' },
      { name: 'score', type: 'INTEGER' },
      { name: 'payload', type: 'BLOB' },
    ])
    hostRowId = insertDataRow(db, hostMatrixId, { label: 'Scope' })
    rowIds = {
      alpha: createDependentRow(db, hostMatrixId, hostRowId, resultMatrixId, {
        label: 'alpha_100%',
        body: 'ordinary',
        score: 5,
        payload: new Uint8Array([1, 2]),
      }),
      beta: createDependentRow(db, hostMatrixId, hostRowId, resultMatrixId, {
        label: 'beta',
        body: 'contains needle',
        score: 10,
        payload: new Uint8Array([2, 3]),
      }),
      empty: createDependentRow(db, hostMatrixId, hostRowId, resultMatrixId, {
        body: 'no label',
        score: 20,
      }),
      blank: createDependentRow(db, hostMatrixId, hostRowId, resultMatrixId, {
        label: '',
        score: 30,
      }),
      outside: insertDataRow(db, resultMatrixId, {
        label: 'outside',
        body: 'needle',
        score: 40,
      }),
    }

    const columns = getColumns(db, resultMatrixId)
    columnId = Object.fromEntries(
      columns.map((column) => [column.name, column.id]),
    ) as typeof columnId
    catalog = createQueryCatalog({
      matrices: [{ id: resultMatrixId, columns }],
      nodes: [{ matrixId: hostMatrixId, rowId: hostRowId }],
    })
  })

  const spec = (overrides: Partial<QuerySpec> = {}): QuerySpec => ({
    kind: { type: 'matrix', matrixId: resultMatrixId },
    scope: { type: 'all' },
    text: '',
    where: [],
    order: { type: 'natural' },
    limit: 100,
    ...overrides,
  })

  const executeBoth = (input: QuerySpec): number[] => {
    const compiled = compileQuerySpec(input, catalog)
    const persistent = materializeQuerySpec(input, catalog)
    expect(recognizeUpdatableQuery(persistent).updatable).toBe(true)
    expect(recognizeQuerySpec(persistent, catalog).type).not.toBe('custom-sql')

    const transientRows = db.selectObjects(compiled.plan.template, compiled.plan.bindings) as {
      id: number
    }[]
    const persistentRows = db.selectObjects(persistent) as { id: number }[]
    expect(transientRows).toEqual(persistentRows)
    return persistentRows.map((row) => row.id)
  }

  test('executes scope and text over physical label/content roles', () => {
    expect(
      executeBoth(
        spec({
          scope: { type: 'node', matrixId: hostMatrixId, rowId: hostRowId },
          text: 'needle',
        }),
      ),
    ).toEqual([rowIds.beta])
  })

  test('escapes LIKE wildcard characters as literal text', () => {
    expect(executeBoth(spec({ text: '_100%' }))).toEqual([rowIds.alpha])
  })

  const predicateCases = (): [string, QueryPredicate, () => number[]][] => [
    [
      'eq',
      { type: 'predicate', columnId: columnId.score, op: 'eq', value: 10 },
      () => [rowIds.beta],
    ],
    [
      'neq',
      { type: 'predicate', columnId: columnId.score, op: 'neq', value: 10 },
      () => [rowIds.alpha, rowIds.empty, rowIds.blank, rowIds.outside],
    ],
    [
      'lt',
      { type: 'predicate', columnId: columnId.score, op: 'lt', value: 10 },
      () => [rowIds.alpha],
    ],
    [
      'lte',
      { type: 'predicate', columnId: columnId.score, op: 'lte', value: 10 },
      () => [rowIds.alpha, rowIds.beta],
    ],
    [
      'gt',
      { type: 'predicate', columnId: columnId.score, op: 'gt', value: 20 },
      () => [rowIds.blank, rowIds.outside],
    ],
    [
      'gte',
      { type: 'predicate', columnId: columnId.score, op: 'gte', value: 20 },
      () => [rowIds.empty, rowIds.blank, rowIds.outside],
    ],
    [
      'contains',
      { type: 'predicate', columnId: columnId.label, op: 'contains', value: '_100%' },
      () => [rowIds.alpha],
    ],
    [
      'empty',
      { type: 'predicate', columnId: columnId.label, op: 'empty' },
      () => [rowIds.empty, rowIds.blank],
    ],
    [
      'notEmpty',
      { type: 'predicate', columnId: columnId.label, op: 'notEmpty' },
      () => [rowIds.alpha, rowIds.beta, rowIds.outside],
    ],
    [
      'blob eq',
      {
        type: 'predicate',
        columnId: columnId.payload,
        op: 'eq',
        value: new Uint8Array([1, 2]),
      },
      () => [rowIds.alpha],
    ],
  ]

  test('executes every structured predicate operator', () => {
    for (const [label, predicate, expected] of predicateCases()) {
      expect(executeBoth(spec({ where: [predicate] })), label).toEqual(
        expected().sort((left, right) => left - right),
      )
    }
  })

  test('applies selected ordering, id tie-breaking, and semantic limit', () => {
    const ids = executeBoth(
      spec({
        order: { type: 'column', columnId: columnId.score, direction: 'desc' },
        limit: 2,
      }),
    )
    expect(ids).toEqual([rowIds.outside, rowIds.blank])
  })
})
