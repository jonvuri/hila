import type { SqlValue } from '@sqlite.org/sqlite-wasm'

export type QueryScalar = string | number | bigint | Uint8Array | null

export type QueryPredicate =
  | {
      type: 'predicate'
      columnId: number
      op: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains'
      value: QueryScalar
    }
  | { type: 'predicate'; columnId: number; op: 'empty' | 'notEmpty' }
  | { type: 'opaque'; sql: string }

export type QuerySpec = {
  kind: { type: 'matrix'; matrixId: number } | { type: 'containers' } | { type: 'everything' }
  scope: { type: 'node'; matrixId: number; rowId: number } | { type: 'all' }
  text: string
  where: QueryPredicate[]
  order: { type: 'column'; columnId: number; direction: 'asc' | 'desc' } | { type: 'natural' }
  limit: number
}

export type NormalizedQuerySpec = QuerySpec

export type QueryPlan = {
  template: string
  bindings: SqlValue[]
}

export type CompiledQuerySpec = {
  spec: NormalizedQuerySpec
  plan: QueryPlan
}

export type QuerySpecErrorCode =
  | 'invalid-id'
  | 'invalid-limit'
  | 'unsupported-kind'
  | 'matrix-not-found'
  | 'invalid-physical-name'
  | 'node-not-found'
  | 'column-not-found'
  | 'formula-column'
  | 'unsupported-operator'
  | 'invalid-value'
  | 'empty-opaque-leaf'
  | 'invalid-opaque-leaf'
  | 'no-text-columns'

export class QuerySpecError extends Error {
  constructor(
    readonly code: QuerySpecErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'QuerySpecError'
  }
}

export type QueryRecognitionReason =
  | 'parse-error'
  | 'not-read-only'
  | 'not-select'
  | 'cte'
  | 'compound'
  | 'projection'
  | 'source'
  | 'matrix-not-found'
  | 'node-not-found'
  | 'column-not-found'
  | 'distinct'
  | 'group-by'
  | 'having'
  | 'window'
  | 'order'
  | 'limit'
  | 'offset'
  | 'invalid-spec'

export type QueryRecognition =
  | { type: 'chips'; spec: NormalizedQuerySpec }
  | { type: 'chips-with-leaves'; spec: NormalizedQuerySpec }
  | {
      type: 'custom-sql'
      reason: QueryRecognitionReason
      message: string
      missingNode?: { readonly matrixId: number; readonly rowId: number }
    }
