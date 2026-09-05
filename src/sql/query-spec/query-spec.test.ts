import { describe, expect, test } from 'vitest'

import type { ColumnDefinition } from '../../core/matrix'
import { recognizeUpdatableQuery } from '../recognize-updatable'

import { createQueryCatalog } from './catalog'
import { compileQuerySpec } from './compile'
import { materializeQuerySpec } from './materialize'
import { normalizeQuerySpec } from './normalize'
import {
  addQueryPredicate,
  removeQueryPredicate,
  replaceQueryPredicate,
  setQueryLimit,
  setQueryText,
} from './operations'
import { recognizeQuerySpec } from './recognize'
import { freezeRelativeDateRange } from './relative-date'
import { QuerySpecError, type QueryPredicate, type QuerySpec } from './types'

const column = (
  id: number,
  name: string,
  type: string,
  options: Partial<ColumnDefinition> = {},
): ColumnDefinition => ({
  id,
  name,
  type,
  displayType: 'text',
  order: id,
  options: null,
  formula: null,
  constraints: null,
  managedBy: null,
  role: null,
  ...options,
})

const columns = [
  column(11, 'label', 'TEXT', { role: 'label' }),
  column(12, 'body', 'TEXT', { role: 'content' }),
  column(13, 'score', 'INTEGER', { displayType: 'number' }),
  column(14, 'payload', 'BLOB'),
  column(15, 'computed', 'INTEGER', { formula: '{{13}} + 1' }),
]

const catalog = createQueryCatalog({
  matrices: [{ id: 7, title: 'Tasks', columns }],
  nodes: [{ matrixId: 2, rowId: 20 }],
})

const baseSpec = (overrides: Partial<QuerySpec> = {}): QuerySpec => ({
  kind: { type: 'matrix', matrixId: 7 },
  scope: { type: 'all' },
  text: '',
  where: [],
  order: { type: 'natural' },
  limit: 120,
  ...overrides,
})

const expectError = (run: () => unknown, code: QuerySpecError['code']): void => {
  try {
    run()
    throw new Error('Expected QuerySpecError')
  } catch (error) {
    expect(error).toBeInstanceOf(QuerySpecError)
    expect((error as QuerySpecError).code).toBe(code)
  }
}

describe('query-spec normalization and catalog resolution', () => {
  test('normalizes -0, safe bigint, and copies blob values', () => {
    const blob = new Uint8Array([0, 255])
    const normalized = normalizeQuerySpec(
      baseSpec({
        where: [
          { type: 'predicate', columnId: 13, op: 'eq', value: -0 },
          { type: 'predicate', columnId: 13, op: 'gt', value: 3n },
          { type: 'predicate', columnId: 14, op: 'eq', value: blob },
        ],
      }),
      catalog,
    )
    expect(normalized.where).toEqual([
      { type: 'predicate', columnId: 13, op: 'eq', value: 0 },
      { type: 'predicate', columnId: 13, op: 'gt', value: 3 },
      { type: 'predicate', columnId: 14, op: 'eq', value: new Uint8Array([0, 255]) },
    ])
    expect((normalized.where[2] as { value: Uint8Array }).value).not.toBe(blob)
  })

  test('retains an int64 bigint and rejects values outside int64', () => {
    const value = 9_007_199_254_740_993n
    const normalized = normalizeQuerySpec(
      baseSpec({ where: [{ type: 'predicate', columnId: 13, op: 'eq', value }] }),
      catalog,
    )
    expect((normalized.where[0] as { value: bigint }).value).toBe(value)
    expectError(
      () =>
        normalizeQuerySpec(
          baseSpec({
            where: [{ type: 'predicate', columnId: 13, op: 'eq', value: 1n << 63n }],
          }),
          catalog,
        ),
      'invalid-value',
    )
  })

  test('rejects transient kinds, missing identities, formula fields, affinity errors, and blanks', () => {
    expectError(
      () => normalizeQuerySpec(baseSpec({ kind: { type: 'everything' } }), catalog),
      'unsupported-kind',
    )
    expectError(
      () =>
        normalizeQuerySpec(
          baseSpec({ scope: { type: 'node', matrixId: 2, rowId: 21 } }),
          catalog,
        ),
      'node-not-found',
    )
    expectError(
      () =>
        normalizeQuerySpec(
          baseSpec({ order: { type: 'column', columnId: 15, direction: 'asc' } }),
          catalog,
        ),
      'formula-column',
    )
    expectError(
      () =>
        normalizeQuerySpec(
          baseSpec({ where: [{ type: 'predicate', columnId: 13, op: 'eq', value: '3' }] }),
          catalog,
        ),
      'invalid-value',
    )
    expectError(
      () => normalizeQuerySpec(baseSpec({ where: [{ type: 'opaque', sql: '  ' }] }), catalog),
      'empty-opaque-leaf',
    )
  })

  test.each(['?', '?12', ':value', '@value', '$value'])(
    'rejects parameterized opaque leaves using %s',
    (parameter) => {
      expectError(
        () =>
          normalizeQuerySpec(
            baseSpec({ where: [{ type: 'opaque', sql: `${parameter} = 1` }] }),
            catalog,
          ),
        'invalid-opaque-leaf',
      )
    },
  )

  test('rejects malformed opaque leaves without interpreting strings or comments as parameters', () => {
    expectError(
      () =>
        normalizeQuerySpec(
          baseSpec({ where: [{ type: 'opaque', sql: `1); DELETE FROM matrix; --` }] }),
          catalog,
        ),
      'invalid-opaque-leaf',
    )

    expect(
      normalizeQuerySpec(
        baseSpec({
          where: [
            {
              type: 'opaque',
              sql: `instr('?', ':value') > 0 /* @value and $value are comments */`,
            },
          ],
        }),
        catalog,
      ).where,
    ).toEqual([
      {
        type: 'opaque',
        sql: `instr('?', ':value') > 0 /* @value and $value are comments */`,
      },
    ])
  })

  test('rejects invalid IDs, limits, and deleted catalog items explicitly', () => {
    expectError(
      () => normalizeQuerySpec(baseSpec({ kind: { type: 'matrix', matrixId: 0 } }), catalog),
      'invalid-id',
    )
    expectError(
      () => normalizeQuerySpec(baseSpec({ kind: { type: 'matrix', matrixId: 99 } }), catalog),
      'matrix-not-found',
    )
    expectError(() => normalizeQuerySpec(baseSpec({ limit: 0 }), catalog), 'invalid-limit')
    expectError(
      () =>
        normalizeQuerySpec(
          baseSpec({ where: [{ type: 'predicate', columnId: 999, op: 'eq', value: 'x' }] }),
          catalog,
        ),
      'column-not-found',
    )
  })

  test('searches physical role fields only', () => {
    const formulaRoles = createQueryCatalog({
      matrices: [
        {
          id: 8,
          columns: [column(21, 'virtual_label', 'TEXT', { formula: "'x'", role: 'label' })],
        },
      ],
    })
    expectError(
      () =>
        normalizeQuerySpec(
          baseSpec({ kind: { type: 'matrix', matrixId: 8 }, text: 'x' }),
          formulaRoles,
        ),
      'no-text-columns',
    )
  })
})

describe('query-spec compilation and recognition', () => {
  test('builds one reusable template and a self-contained persistent query', () => {
    const spec = baseSpec({
      scope: { type: 'node', matrixId: 2, rowId: 20 },
      text: `100%_\\ O'Brien`,
      where: [
        { type: 'predicate', columnId: 13, op: 'gte', value: 4 },
        { type: 'predicate', columnId: 11, op: 'contains', value: 'a_b%' },
      ],
      order: { type: 'column', columnId: 13, direction: 'desc' },
    })
    const compiled = compileQuerySpec(spec, catalog)
    expect(compiled.plan.bindings).toEqual([
      7,
      2,
      20,
      `%100\\%\\_\\\\ O'Brien%`,
      4,
      '%a\\_b\\%%',
      120,
    ])
    expect(compiled.plan.template).toContain(
      `CAST(d."label" AS TEXT) LIKE ?4 ESCAPE '\\' OR CAST(d."body" AS TEXT) LIKE ?4`,
    )
    expect(compiled.plan.template).toContain('ORDER BY d."score" DESC, d.id ASC')

    const sql = materializeQuerySpec(spec, catalog)
    expect(sql).toContain(`LIKE '%100\\%\\_\\\\ O''Brien%' ESCAPE '\\'`)
    expect(sql).toContain('LIMIT 120')
    expect(recognizeUpdatableQuery(sql)).toMatchObject({ updatable: true, baseMatrixId: 7 })
  })

  const predicates: QueryPredicate[] = [
    { type: 'predicate', columnId: 11, op: 'eq', value: 'alpha' },
    { type: 'predicate', columnId: 11, op: 'neq', value: null },
    { type: 'predicate', columnId: 13, op: 'lt', value: -3 },
    { type: 'predicate', columnId: 13, op: 'lte', value: 4 },
    { type: 'predicate', columnId: 13, op: 'gt', value: 5 },
    { type: 'predicate', columnId: 13, op: 'gte', value: 6 },
    { type: 'predicate', columnId: 11, op: 'contains', value: 'a_%' },
    { type: 'predicate', columnId: 11, op: 'empty' },
    { type: 'predicate', columnId: 11, op: 'notEmpty' },
    { type: 'predicate', columnId: 14, op: 'eq', value: new Uint8Array([1, 2]) },
  ]

  test.each(predicates)('round-trips predicate $op', (predicate) => {
    const normalized = normalizeQuerySpec(baseSpec({ where: [predicate] }), catalog)
    const sql = materializeQuerySpec(normalized, catalog)
    const recognized = recognizeQuerySpec(sql, catalog)
    expect(recognized.type).toBe('chips')
    if (recognized.type === 'custom-sql') return
    expect(recognized.spec).toEqual(normalized)
  })

  test('round-trips scope, text, selected order, and opaque payload bytes', () => {
    const spec = normalizeQuerySpec(
      baseSpec({
        scope: { type: 'node', matrixId: 2, rowId: 20 },
        text: 'résumé_100%',
        where: [{ type: 'opaque', sql: 'json_valid(d."body") /*kept*/' }],
        order: { type: 'column', columnId: 11, direction: 'desc' },
        limit: 9,
      }),
      catalog,
    )
    const recognized = recognizeQuerySpec(materializeQuerySpec(spec, catalog), catalog)
    expect(recognized.type).toBe('chips-with-leaves')
    if (recognized.type === 'custom-sql') return
    expect(recognized.spec).toEqual(spec)
  })

  test('round-trips quoted Unicode and newline values', () => {
    const spec = normalizeQuerySpec(
      baseSpec({
        where: [{ type: 'predicate', columnId: 11, op: 'eq', value: "O'Brien\n雪" }],
      }),
      catalog,
    )
    const recognized = recognizeQuerySpec(materializeQuerySpec(spec, catalog), catalog)
    expect(recognized).toMatchObject({ type: 'chips', spec })
  })

  test('accepts harmless formatting and unqualified base columns', () => {
    const sql = `select * from mx_7_data as d
      where label = 'alpha'
      order by label desc, id
      limit 4; -- harmless`
    const recognized = recognizeQuerySpec(sql, catalog)
    expect(recognized).toMatchObject({
      type: 'chips',
      spec: {
        where: [{ type: 'predicate', columnId: 11, op: 'eq', value: 'alpha' }],
        order: { type: 'column', columnId: 11, direction: 'desc' },
        limit: 4,
      },
    })
  })

  test('keeps a parenthesized top-level OR as one opaque payload', () => {
    const sql = `SELECT d.* FROM "mx_7_data" AS d
WHERE (d."score" = 1 OR d."score" = 2)
ORDER BY d.id ASC
LIMIT 5`
    const recognized = recognizeQuerySpec(sql, catalog)
    expect(recognized).toMatchObject({
      type: 'chips-with-leaves',
      spec: { where: [{ type: 'opaque', sql: 'd."score" = 1 OR d."score" = 2' }] },
    })
  })

  test('reports canonical references whose catalog identities were deleted', () => {
    const scopedSql = materializeQuerySpec(
      baseSpec({ scope: { type: 'node', matrixId: 2, rowId: 20 } }),
      catalog,
    )
    const withoutScopeNode = createQueryCatalog({ matrices: catalog.matrices })
    expect(recognizeQuerySpec(scopedSql, withoutScopeNode)).toMatchObject({
      type: 'custom-sql',
      reason: 'node-not-found',
    })

    const predicateSql = materializeQuerySpec(
      baseSpec({
        where: [{ type: 'predicate', columnId: 11, op: 'contains', value: 'open' }],
      }),
      catalog,
    )
    const textSql = materializeQuerySpec(baseSpec({ text: 'open' }), catalog)
    const orderSql = materializeQuerySpec(
      baseSpec({ order: { type: 'column', columnId: 11, direction: 'asc' } }),
      catalog,
    )
    const withoutLabel = createQueryCatalog({
      matrices: [{ id: 7, columns: columns.filter((candidate) => candidate.id !== 11) }],
      nodes: catalog.nodes,
    })
    for (const sql of [predicateSql, textSql, orderSql]) {
      expect(recognizeQuerySpec(sql, withoutLabel)).toMatchObject({
        type: 'custom-sql',
        reason: 'column-not-found',
      })
    }
  })

  test('keeps complex terms with unavailable column names opaque', () => {
    const withoutLabel = createQueryCatalog({
      matrices: [{ id: 7, columns: columns.filter((candidate) => candidate.id !== 11) }],
      nodes: catalog.nodes,
    })
    for (const opaque of ['length(d."label") > 2', '(d."label" = 1 OR d."label" = 2)']) {
      const sql = `SELECT d.* FROM "mx_7_data" AS d
WHERE ${opaque}
ORDER BY d.id ASC
LIMIT 5`
      expect(recognizeQuerySpec(sql, withoutLabel)).toMatchObject({
        type: 'chips-with-leaves',
        spec: { where: [{ type: 'opaque' }] },
      })
    }
  })

  test.each([
    [
      'second statement',
      `SELECT d.* FROM "mx_7_data" d ORDER BY d.id LIMIT 1; DELETE FROM matrix`,
    ],
    ['join', `SELECT d.* FROM "mx_7_data" d JOIN matrix m ORDER BY d.id LIMIT 1`],
    ['projection', `SELECT d.label FROM "mx_7_data" d ORDER BY d.id LIMIT 1`],
    ['offset', `SELECT d.* FROM "mx_7_data" d ORDER BY d.id LIMIT 1 OFFSET 1`],
    ['mutation', `DELETE FROM "mx_7_data"`],
  ])('classifies %s as custom SQL', (_label, sql) => {
    expect(recognizeQuerySpec(sql, catalog).type).toBe('custom-sql')
  })
})

describe('query-spec operations', () => {
  test('return new specs and preserve untouched predicate identity', () => {
    const first: QueryPredicate = { type: 'predicate', columnId: 11, op: 'eq', value: 'a' }
    const second: QueryPredicate = { type: 'predicate', columnId: 13, op: 'gt', value: 1 }
    const initial = baseSpec({ where: [first] })
    const added = addQueryPredicate(initial, second)
    const replacement: QueryPredicate = { type: 'predicate', columnId: 13, op: 'gte', value: 2 }
    const replaced = replaceQueryPredicate(added, 1, replacement)
    const removed = removeQueryPredicate(replaced, 1)
    const updated = setQueryLimit(setQueryText(removed, 'find'), 10)

    expect(initial.where).toEqual([first])
    expect(added.where[0]).toBe(first)
    expect(replaced.where).toEqual([first, replacement])
    expect(removed.where).toEqual([first])
    expect(updated).toMatchObject({ text: 'find', limit: 10 })
  })

  test('freezes relative dates to a closed literal range', () => {
    expect(
      freezeRelativeDateRange(11, {
        startInclusive: '2026-09-01T00:00:00.000Z',
        endInclusive: '2026-09-07T23:59:59.999Z',
      }),
    ).toEqual([
      {
        type: 'predicate',
        columnId: 11,
        op: 'gte',
        value: '2026-09-01T00:00:00.000Z',
      },
      {
        type: 'predicate',
        columnId: 11,
        op: 'lte',
        value: '2026-09-07T23:59:59.999Z',
      },
    ])
    expect(() =>
      freezeRelativeDateRange(11, {
        startInclusive: '2026-09-08',
        endInclusive: '2026-09-07',
      }),
    ).toThrow(/boundaries/)
  })
})
