import { describe, expect, test } from 'vitest'

import type { ColumnDefinition } from '../core/matrix'

import { buildDistinctValuesRequest, DISTINCT_VALUE_LIMIT } from './distinct-values'

const column = (name: string): ColumnDefinition => ({
  id: 3,
  name,
  type: 'TEXT',
  displayType: 'select',
  order: 0,
  options: null,
  formula: null,
  constraints: null,
  managedBy: null,
  role: null,
})

describe('distinct-value suggestions', () => {
  test('quotes identifiers and binds escaped text with a fixed result cap', () => {
    const request = buildDistinctValuesRequest(7, column('status"value'), `50%_done`)

    expect(request.sql).toContain('d."status""value"')
    expect(request.sql).toContain('FROM "mx_7_data" AS d')
    expect(request.sql).not.toContain('50%_done')
    expect(request.bindings).toEqual([`%50\\%\\_done%`, DISTINCT_VALUE_LIMIT])
  })

  test('keeps one prepared shape while input changes', () => {
    const first = buildDistinctValuesRequest(7, column('status'), 'to')
    const second = buildDistinctValuesRequest(7, column('status'), 'done')

    expect(second.sql).toBe(first.sql)
    expect(second.bindings).not.toEqual(first.bindings)
  })
})
