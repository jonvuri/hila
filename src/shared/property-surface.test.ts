import { describe, expect, test } from 'vitest'

import type { ColumnDefinition } from '../core/matrix'

import {
  buildAspectPreview,
  buildAspectPreviewFields,
  filterIntrinsicOverflowColumns,
  getKeyPropertyColumns,
  isLabelLikeColumn,
} from './property-surface'

const col = (name: string, overrides: Partial<ColumnDefinition> = {}): ColumnDefinition => ({
  id: 1,
  name,
  type: 'TEXT',
  displayType: 'text',
  order: 0,
  options: null,
  formula: null,
  constraints: null,
  managedBy: null,
  role: null,
  ...overrides,
})

describe('property-surface helpers', () => {
  test('filterIntrinsicOverflowColumns excludes label-like and formula columns', () => {
    const columns = [
      col('label', { role: 'label' }),
      col('content', { role: 'content' }),
      col('status'),
      col('computed', { formula: '1+1' }),
    ]
    const overflow = filterIntrinsicOverflowColumns(columns)
    expect(overflow.map((c) => c.name)).toEqual(['status'])
  })

  test('isLabelLikeColumn honors explicit roles, with a name fallback', () => {
    // Explicit roles are authoritative regardless of column name.
    expect(isLabelLikeColumn(col('heading', { role: 'label' }))).toBe(true)
    expect(isLabelLikeColumn(col('body', { role: 'content' }))).toBe(true)
    // A role-less, non-label-named column is a plain property.
    expect(isLabelLikeColumn(col('status'))).toBe(false)
    // Name fallback covers matrixes that predate column roles.
    expect(isLabelLikeColumn(col('title'))).toBe(true)
  })

  test('getKeyPropertyColumns returns first non-label columns up to max', () => {
    const columns = [col('label'), col('status'), col('priority'), col('notes')]
    expect(getKeyPropertyColumns(columns, 2).map((c) => c.name)).toEqual(['status', 'priority'])
  })

  test('buildAspectPreviewFields skips empty values', () => {
    const columns = [col('status'), col('priority')]
    const fields = buildAspectPreviewFields(columns, { status: 'todo', priority: '' })
    expect(fields).toEqual([{ name: 'status', value: 'todo' }])
  })

  test('buildAspectPreview includes tag color and fields', () => {
    const preview = buildAspectPreview('task', [col('status')], { status: 'done' })
    expect(preview.tagName).toBe('task')
    expect(preview.color).toMatch(/^hsl/)
    expect(preview.fields).toEqual([{ name: 'status', value: 'done' }])
  })
})
