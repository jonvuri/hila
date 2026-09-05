import { QuerySpecError, type QueryPredicate } from './types'

export type ClosedDateRange = {
  startInclusive: string
  endInclusive: string
}

/**
 * Freeze an authoring-time relative date token into the normalized dialect's
 * closed literal range. Natural-language parsing stays with the later surface.
 */
export const freezeRelativeDateRange = (
  columnId: number,
  range: ClosedDateRange,
): QueryPredicate[] => {
  if (
    range.startInclusive === '' ||
    range.endInclusive === '' ||
    range.startInclusive > range.endInclusive
  ) {
    throw new QuerySpecError('invalid-value', 'Relative date range boundaries are invalid')
  }
  return [
    { type: 'predicate', columnId, op: 'gte', value: range.startInclusive },
    { type: 'predicate', columnId, op: 'lte', value: range.endInclusive },
  ]
}
