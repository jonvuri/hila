import { describe, expect, test } from 'vitest'

import type { ColumnDefinition } from '../core/matrix'

import {
  addIdToProjection,
  recognizeUpdatableQuery,
  resolveEditableColumns,
} from './recognize-updatable'

const col = (
  name: string,
  opts: { formula?: string; role?: 'label' | 'content' } = {},
): ColumnDefinition => ({
  id: 0,
  name,
  type: 'TEXT',
  displayType: 'text',
  order: 0,
  options: null,
  formula: opts.formula ?? null,
  constraints: null,
  managedBy: null,
  role: opts.role ?? null,
})

describe('recognizeUpdatableQuery — accept', () => {
  test('SELECT * FROM base → star, no passthrough', () => {
    const r = recognizeUpdatableQuery(`SELECT * FROM "mx_5_data"`)
    expect(r).toMatchObject({ updatable: true, baseMatrixId: 5, star: true, passthrough: [] })
  })

  test('table-star with alias → star', () => {
    const r = recognizeUpdatableQuery(`SELECT d.* FROM "mx_42_data" d`)
    expect(r).toMatchObject({ updatable: true, baseMatrixId: 42, star: true })
  })

  test('explicit qualified + bare columns → passthrough with output names', () => {
    const r = recognizeUpdatableQuery(
      `SELECT d.status, due AS deadline, upper(d.label) FROM "mx_7_data" d`,
    )
    expect(r.updatable).toBe(true)
    if (!r.updatable) return
    expect(r.star).toBe(false)
    expect(r.passthrough).toEqual([
      { outputName: 'status', baseColumn: 'status' },
      { outputName: 'deadline', baseColumn: 'due' },
    ])
  })

  test('correlated EXISTS subquery in WHERE does not disqualify (single-table FROM)', () => {
    const sql = `SELECT d.* FROM "mx_9_data" d
      WHERE EXISTS (SELECT 1 FROM joins j WHERE j.target_row_id = d.id AND j.kind = 'own')`
    expect(recognizeUpdatableQuery(sql)).toMatchObject({
      updatable: true,
      baseMatrixId: 9,
      star: true,
    })
  })
})

describe('recognizeUpdatableQuery — reject (sound, no false positives)', () => {
  const cases: [string, string][] = [
    ['join', `SELECT d.* FROM "mx_5_data" d JOIN joins j ON j.target_row_id = d.id`],
    ['group-by', `SELECT a FROM "mx_5_data" GROUP BY a`],
    ['distinct', `SELECT DISTINCT a FROM "mx_5_data"`],
    ['compound', `SELECT a FROM "mx_5_data" UNION SELECT b FROM "mx_6_data"`],
    ['cte', `WITH x AS (SELECT 1 AS a) SELECT a FROM x`],
    ['subquery-from', `SELECT a FROM (SELECT id AS a FROM "mx_5_data")`],
    ['aggregate-in-projection', `SELECT count(*) FROM "mx_5_data"`],
    ['nested-aggregate-in-projection', `SELECT sum(a) + 1 FROM "mx_5_data"`],
    ['non-base-table', `SELECT * FROM joins`],
    ['values', `VALUES (1, 2)`],
    ['parse-error', `SELECT FROM WHERE`],
  ]
  test.each(cases)('rejects %s', (_label, sql) => {
    expect(recognizeUpdatableQuery(sql).updatable).toBe(false)
  })
})

describe('resolveEditableColumns', () => {
  const columns = [
    col('id'),
    col('label', { role: 'label' }),
    col('status'),
    col('age', { formula: 'now() - born' }),
  ]

  test('star → all columns editable except id and formula', () => {
    const r = recognizeUpdatableQuery(`SELECT * FROM "mx_1_data"`)
    if (!r.updatable) throw new Error('expected updatable')
    const { editable } = resolveEditableColumns(r, columns)
    expect([...editable.keys()].sort()).toEqual(['label', 'status'])
    expect(editable.get('status')).toBe('status')
  })

  test('explicit columns including id → only the non-formula passthroughs editable', () => {
    const r = recognizeUpdatableQuery(`SELECT id, status AS s, age FROM "mx_1_data"`)
    if (!r.updatable) throw new Error('expected updatable')
    const { editable } = resolveEditableColumns(r, columns)
    // 'age' is a formula → excluded; 's' maps to base 'status'; 'id' never editable.
    expect([...editable.entries()]).toEqual([['s', 'status']])
  })

  test('id absent from result set → nothing editable (no row identity)', () => {
    const r = recognizeUpdatableQuery(`SELECT status FROM "mx_1_data"`)
    if (!r.updatable) throw new Error('expected updatable')
    const { editable } = resolveEditableColumns(r, columns)
    expect(editable.size).toBe(0)
  })

  test('id-less view with a writable column → enableableWithId', () => {
    const r = recognizeUpdatableQuery(`SELECT status FROM "mx_1_data"`)
    if (!r.updatable) throw new Error('expected updatable')
    const res = resolveEditableColumns(r, columns)
    expect(res.idPresent).toBe(false)
    expect(res.enableableWithId).toBe(true)
  })

  test('id-less view with only derived/formula columns → not enableableWithId', () => {
    const r = recognizeUpdatableQuery(`SELECT upper(status), age FROM "mx_1_data"`)
    if (!r.updatable) throw new Error('expected updatable')
    const res = resolveEditableColumns(r, columns)
    // upper(status) is derived; age is a formula → adding id unlocks nothing.
    expect(res.enableableWithId).toBe(false)
  })

  test('id present → not enableableWithId (already editable)', () => {
    const r = recognizeUpdatableQuery(`SELECT * FROM "mx_1_data"`)
    if (!r.updatable) throw new Error('expected updatable')
    const res = resolveEditableColumns(r, columns)
    expect(res.idPresent).toBe(true)
    expect(res.enableableWithId).toBe(false)
  })
})

describe('addIdToProjection', () => {
  test('appends a bare id when there is no alias', () => {
    expect(addIdToProjection(`SELECT status FROM "mx_5_data"`)).toBe(
      `SELECT status, id FROM "mx_5_data"`,
    )
  })

  test('qualifies id with the table alias', () => {
    expect(addIdToProjection(`SELECT d.status FROM "mx_5_data" d`)).toBe(
      `SELECT d.status, d.id FROM "mx_5_data" d`,
    )
  })

  test('the rewrite becomes editable (round-trip through the recognizer)', () => {
    const rewritten = addIdToProjection(`SELECT status FROM "mx_5_data"`)
    expect(rewritten).not.toBeNull()
    const r = recognizeUpdatableQuery(rewritten!)
    if (!r.updatable) throw new Error('expected updatable')
    const res = resolveEditableColumns(r, [col('id'), col('status')])
    expect(res.idPresent).toBe(true)
    expect([...res.editable.keys()]).toEqual(['status'])
  })

  test('returns null on unparseable SQL', () => {
    expect(addIdToProjection(`SELECT FROM WHERE`)).toBeNull()
  })
})
