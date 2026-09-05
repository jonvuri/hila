import type { QueryPredicate, QuerySpec } from './types'

export const setQueryKind = (spec: QuerySpec, kind: QuerySpec['kind']): QuerySpec => ({
  ...spec,
  kind,
})

export const setQueryScope = (spec: QuerySpec, scope: QuerySpec['scope']): QuerySpec => ({
  ...spec,
  scope,
})

export const setQueryText = (spec: QuerySpec, text: string): QuerySpec => ({ ...spec, text })

export const setQueryOrder = (spec: QuerySpec, order: QuerySpec['order']): QuerySpec => ({
  ...spec,
  order,
})

export const setQueryLimit = (spec: QuerySpec, limit: number): QuerySpec => ({ ...spec, limit })

export const addQueryPredicate = (spec: QuerySpec, predicate: QueryPredicate): QuerySpec => ({
  ...spec,
  where: [...spec.where, predicate],
})

export const replaceQueryPredicate = (
  spec: QuerySpec,
  index: number,
  predicate: QueryPredicate,
): QuerySpec => ({
  ...spec,
  where: spec.where.map((current, currentIndex) =>
    currentIndex === index ? predicate : current,
  ),
})

export const removeQueryPredicate = (spec: QuerySpec, index: number): QuerySpec => ({
  ...spec,
  where: spec.where.filter((_, currentIndex) => currentIndex !== index),
})
