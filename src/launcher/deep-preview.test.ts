import { describe, expect, test } from 'vitest'

import type { QueryPlan } from '../sql/query-spec/types'

import {
  buildDeepPreviewCountRequest,
  buildDeepPreviewPageRequest,
  buildDeepPreviewRangeRequest,
  computeDeepPreviewWindowRange,
  DEEP_PREVIEW_MAX_RETAINED_PAGES,
  DEEP_PREVIEW_PAGE_SIZE,
  DEEP_PREVIEW_SEMANTIC_LIMIT,
} from './deep-preview'

const plan = (bindings: QueryPlan['bindings'] = ['open', 1_000]): QueryPlan => ({
  template: [
    'SELECT d.*',
    'FROM "mx_7_data" AS d',
    'WHERE d."status" = ?1',
    'ORDER BY d."score" DESC, d.id ASC',
    'LIMIT ?2',
  ].join('\n'),
  bindings,
})

describe('Deep preview paging', () => {
  test('counts the capped, ordered inner plan without changing its bindings', () => {
    const request = buildDeepPreviewCountRequest(plan())

    expect(request.sql).toContain('SELECT COUNT(*) AS row_count')
    expect(request.sql).toContain('ORDER BY d."score" DESC, d.id ASC\nLIMIT ?2')
    expect(request.bindings).toEqual(['open', DEEP_PREVIEW_SEMANTIC_LIMIT])
  })

  test('builds 100-row slices outside the semantic limit and order', () => {
    const request = buildDeepPreviewPageRequest(plan(), 4)

    expect(request.sql).toContain('ORDER BY d."score" DESC, d.id ASC\nLIMIT ?2')
    expect(request.sql).toMatch(/\) AS deep_results\nLIMIT \?3\nOFFSET \?4$/)
    expect(request.bindings).toEqual([
      'open',
      DEEP_PREVIEW_SEMANTIC_LIMIT,
      DEEP_PREVIEW_PAGE_SIZE,
      400,
    ])
  })

  test('keeps one reusable SQL shape while range bindings move', () => {
    const first = buildDeepPreviewRangeRequest(plan(), 0, 3)
    const later = buildDeepPreviewRangeRequest(plan(['closed', 1_000]), 4, 7)

    expect(later.sql).toBe(first.sql)
    expect(first.bindings).toEqual(['open', 1_000, 400, 0])
    expect(later.bindings).toEqual(['closed', 1_000, 400, 400])
  })

  test('computes a bounded contiguous range for retained virtualizer pages', () => {
    expect(
      computeDeepPreviewWindowRange(
        980,
        new Set(Array.from({ length: 9 }, (_, index) => index + 2)),
      ),
    ).toEqual({
      totalRows: 980,
      totalPages: 10,
      minPage: 2,
      maxPage: 2 + DEEP_PREVIEW_MAX_RETAINED_PAGES - 1,
      offset: 200,
      limit: DEEP_PREVIEW_MAX_RETAINED_PAGES * DEEP_PREVIEW_PAGE_SIZE,
    })
  })

  test('clamps totals to the semantic cap and trims the final page', () => {
    expect(computeDeepPreviewWindowRange(5_000, new Set([9]))).toEqual({
      totalRows: DEEP_PREVIEW_SEMANTIC_LIMIT,
      totalPages: 10,
      minPage: 9,
      maxPage: 9,
      offset: 900,
      limit: 100,
    })
    expect(computeDeepPreviewWindowRange(235, new Set([2]))?.limit).toBe(35)
    expect(computeDeepPreviewWindowRange(0, new Set([0]))).toBeNull()
  })

  test('rejects invalid and oversized request ranges without interpolating values', () => {
    expect(() => buildDeepPreviewPageRequest(plan(), -1)).toThrow(RangeError)
    expect(() =>
      buildDeepPreviewRangeRequest(plan(), 0, DEEP_PREVIEW_MAX_RETAINED_PAGES),
    ).toThrow(RangeError)

    const hostile = buildDeepPreviewPageRequest(
      plan([`open'; DROP TABLE matrix; --`, 1_000]),
      0,
    )
    expect(hostile.sql).not.toContain('DROP TABLE')
    expect(hostile.bindings?.[0]).toBe(`open'; DROP TABLE matrix; --`)
  })
})
