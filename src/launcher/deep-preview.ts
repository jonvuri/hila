import type { SqlQuery } from '../core/sql-types'
import type { QueryPlan } from '../sql/query-spec/types'
import { SCROLL_VIRTUALIZER_MAX_RETAINED_WINDOWS } from '../virtualizer/ScrollVirtualizer'

export const DEEP_PREVIEW_SEMANTIC_LIMIT = 1_000
export const DEEP_PREVIEW_PAGE_SIZE = 100

export const DEEP_PREVIEW_MAX_RETAINED_PAGES = SCROLL_VIRTUALIZER_MAX_RETAINED_WINDOWS

export type DeepPreviewWindowRange = {
  readonly totalRows: number
  readonly totalPages: number
  readonly minPage: number
  readonly maxPage: number
  readonly offset: number
  readonly limit: number
}

const planSql = (plan: QueryPlan): string => plan.template.trim()

const outerBinding = (plan: QueryPlan, offset: number): string =>
  `?${plan.bindings.length + offset}`

export const buildDeepPreviewCountRequest = (plan: QueryPlan): SqlQuery => ({
  sql: `SELECT COUNT(*) AS row_count\nFROM (\n${planSql(plan)}\n) AS deep_results`,
  bindings: [...plan.bindings],
})

const assertPageIndex = (pageIndex: number): void => {
  if (!Number.isSafeInteger(pageIndex) || pageIndex < 0) {
    throw new RangeError('Deep preview page indexes must be non-negative safe integers')
  }
}

export const buildDeepPreviewRangeRequest = (
  plan: QueryPlan,
  minPage: number,
  maxPage: number,
): SqlQuery => {
  assertPageIndex(minPage)
  assertPageIndex(maxPage)
  if (maxPage < minPage) throw new RangeError('Deep preview page ranges must not be reversed')

  const retainedPages = maxPage - minPage + 1
  if (retainedPages > DEEP_PREVIEW_MAX_RETAINED_PAGES) {
    throw new RangeError(
      `Deep preview page ranges may retain at most ${DEEP_PREVIEW_MAX_RETAINED_PAGES} pages`,
    )
  }

  const limit = retainedPages * DEEP_PREVIEW_PAGE_SIZE
  const offset = minPage * DEEP_PREVIEW_PAGE_SIZE
  return {
    sql: [
      'SELECT *',
      'FROM (',
      planSql(plan),
      ') AS deep_results',
      `LIMIT ${outerBinding(plan, 1)}`,
      `OFFSET ${outerBinding(plan, 2)}`,
    ].join('\n'),
    bindings: [...plan.bindings, limit, offset],
  }
}

export const buildDeepPreviewPageRequest = (plan: QueryPlan, pageIndex: number): SqlQuery =>
  buildDeepPreviewRangeRequest(plan, pageIndex, pageIndex)

export const computeDeepPreviewWindowRange = (
  totalRows: number,
  retainedPages: ReadonlySet<number>,
): DeepPreviewWindowRange | null => {
  const boundedRows = Math.min(
    DEEP_PREVIEW_SEMANTIC_LIMIT,
    Math.max(0, Math.floor(Number.isFinite(totalRows) ? totalRows : 0)),
  )
  const totalPages = Math.ceil(boundedRows / DEEP_PREVIEW_PAGE_SIZE)
  if (totalPages === 0) return null

  const pages = [...retainedPages]
    .filter((page) => Number.isSafeInteger(page) && page >= 0 && page < totalPages)
    .sort((left, right) => left - right)
  if (pages.length === 0) return null

  const minPage = pages[0]!
  const requestedMax = pages[pages.length - 1]!
  const maxPage = Math.min(
    requestedMax,
    minPage + DEEP_PREVIEW_MAX_RETAINED_PAGES - 1,
    totalPages - 1,
  )
  const offset = minPage * DEEP_PREVIEW_PAGE_SIZE
  return {
    totalRows: boundedRows,
    totalPages,
    minPage,
    maxPage,
    offset,
    limit: Math.min((maxPage - minPage + 1) * DEEP_PREVIEW_PAGE_SIZE, boundedRows - offset),
  }
}
