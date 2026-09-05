import { describe, expect, test } from 'vitest'

import type { ColumnDefinition } from '../../core/matrix'

import { createQueryCatalog } from './catalog'
import { materializeQuerySpec } from './materialize'
import { normalizeQuerySpec } from './normalize'
import { recognizeQuerySpec } from './recognize'
import type { QueryPredicate, QuerySpec } from './types'

const col = (
  id: number,
  name: string,
  type: string,
  role: ColumnDefinition['role'] = null,
) => ({
  id,
  name,
  type,
  displayType: type === 'TEXT' ? 'text' : 'number',
  order: id,
  options: null,
  formula: null,
  constraints: null,
  managedBy: null,
  role,
})

const catalog = createQueryCatalog({
  matrices: [
    {
      id: 31,
      columns: [
        col(1, 'title', 'TEXT', 'label'),
        col(2, 'note', 'TEXT', 'content'),
        col(3, 'n', 'INTEGER'),
      ],
    },
  ],
  nodes: [{ matrixId: 31, rowId: 99 }],
})

const random = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 0x1_0000_0000
  }
}

const pick = <T>(values: readonly T[], rand: () => number): T =>
  values[Math.floor(rand() * values.length)]!

const generatedSpec = (seed: number): QuerySpec => {
  const rand = random(seed)
  const textValues = ['', 'alpha', `quote'_${seed}%`, `雪 ${seed}`]
  const textOps = ['eq', 'neq', 'contains'] as const
  const numberOps = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte'] as const
  const where: QueryPredicate[] = []
  for (let index = 0; index < 1 + Math.floor(rand() * 4); index++) {
    if (rand() < 0.5) {
      const op = pick(textOps, rand)
      where.push({
        type: 'predicate',
        columnId: pick([1, 2], rand),
        op,
        value: pick(textValues.slice(1), rand),
      })
    } else {
      where.push({
        type: 'predicate',
        columnId: 3,
        op: pick(numberOps, rand),
        value: Math.floor(rand() * 200) - 100,
      })
    }
  }
  return {
    kind: { type: 'matrix', matrixId: 31 },
    scope: rand() < 0.5 ? { type: 'all' } : { type: 'node', matrixId: 31, rowId: 99 },
    text: pick(textValues, rand),
    where,
    order:
      rand() < 0.5 ?
        { type: 'natural' }
      : {
          type: 'column',
          columnId: pick([1, 2, 3], rand),
          direction: pick(['asc', 'desc'] as const, rand),
        },
    limit: 1 + Math.floor(rand() * 500),
  }
}

describe('query-spec seeded conformance', () => {
  test('recognize(materialize(spec)) equals the normalized spec deterministically', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const input = generatedSpec(seed)
      const normalized = normalizeQuerySpec(input, catalog)
      const firstSql = materializeQuerySpec(input, catalog)
      const secondSql = materializeQuerySpec(input, catalog)
      expect(secondSql).toBe(firstSql)
      const recognized = recognizeQuerySpec(firstSql, catalog)
      expect(recognized.type, `seed ${seed}: ${firstSql}`).toBe('chips')
      if (recognized.type === 'custom-sql') continue
      expect(recognized.spec, `seed ${seed}`).toEqual(normalized)
    }
  })
})
