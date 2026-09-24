import {
  materializeSqlValue,
  parseSingleStatement,
  sourceForNode,
  splitTopLevelAnd,
  type SqlAstNode,
} from '../sql-statement'

import {
  physicalTextRoleColumns,
  resolveCatalogMatrix,
  type QueryCatalog,
  type QueryCatalogMatrix,
} from './catalog'
import {
  renderPredicateTerm,
  renderScopeTerm,
  renderTextTerm,
  type ValueRenderer,
} from './compile'
import { normalizeQuerySpec } from './normalize'
import {
  QuerySpecError,
  type NormalizedQuerySpec,
  type QueryPredicate,
  type QueryRecognition,
  type QueryRecognitionReason,
  type QueryScalar,
  type QuerySpec,
} from './types'

const custom = (
  reason: QueryRecognitionReason,
  message: string,
  details: Pick<Extract<QueryRecognition, { type: 'custom-sql' }>, 'missingNode'> = {},
): QueryRecognition => ({
  type: 'custom-sql',
  reason,
  message,
  ...details,
})

const nameText = (node: SqlAstNode | undefined): string | undefined =>
  typeof node?.text === 'string' ? node.text
  : typeof node?.name === 'string' ? node.name
  : undefined

const baseColumnName = (
  node: SqlAstNode | undefined,
  baseNames: Set<string>,
  matrix: QueryCatalogMatrix,
): string | null => {
  if (!node) return null
  if (node.type === 'QualifiedExpr') {
    if (!baseNames.has(String(node.table?.text).toLowerCase())) return null
    return String(node.column?.text)
  }
  if (node.type === 'Id') {
    const found = matrix.columns.find(
      (column) => column.name.toLowerCase() === String(node.name).toLowerCase(),
    )
    return found?.name ?? String(node.name)
  }
  return null
}

const normalizeAst = (
  value: unknown,
  baseNames: Set<string>,
  matrix: QueryCatalogMatrix,
): unknown => {
  if (Array.isArray(value)) return value.map((item) => normalizeAst(item, baseNames, matrix))
  if (value === null || typeof value !== 'object') return value

  const node = value as Record<string, unknown>
  if (node.type === 'QualifiedExpr' || node.type === 'Id') {
    const column = baseColumnName(node, baseNames, matrix)
    if (column) return { type: 'BaseColumn', name: column.toLowerCase() }
  }
  if (node.type === 'Name' && typeof node.text === 'string') {
    return { type: 'Name', text: node.text.toLowerCase() }
  }
  if (node.type === 'NumericLiteral' && typeof node.value === 'string') {
    const number = Number(node.value)
    return { type: 'NumericLiteral', value: Object.is(number, -0) ? 0 : number }
  }

  const normalized: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(node)) {
    if (key === 'span') continue
    normalized[key] = normalizeAst(child, baseNames, matrix)
  }
  return normalized
}

const fingerprint = (
  node: SqlAstNode,
  baseNames: Set<string>,
  matrix: QueryCatalogMatrix,
): string => JSON.stringify(normalizeAst(node, baseNames, matrix))

const parseTerm = (sql: string): SqlAstNode | null => {
  const parsed = parseSingleStatement(`SELECT 1 WHERE ${sql}`)
  if (!parsed.ok) return null
  return parsed.statement.root?.body?.select?.whereClause ?? null
}

const candidateMatches = (
  actual: SqlAstNode,
  candidateSql: string,
  actualBaseNames: Set<string>,
  matrix: QueryCatalogMatrix,
): boolean => {
  const candidate = parseTerm(candidateSql)
  if (!candidate) return false
  const candidateBaseNames = new Set(['d', matrix.tableName.toLowerCase()])
  return (
    fingerprint(actual, actualBaseNames, matrix) ===
    fingerprint(candidate, candidateBaseNames, matrix)
  )
}

const scalarKey = (value: QueryScalar): string =>
  value instanceof Uint8Array ? `blob:${Array.from(value).join(',')}`
  : typeof value === 'bigint' ? `bigint:${value}`
  : `${typeof value}:${String(value)}`

const numericScalar = (text: string, negative = false): QueryScalar | null => {
  const source = negative ? `-${text}` : text
  if (/^-?\d+$/.test(source)) {
    try {
      const integer = BigInt(source)
      if (
        integer >= BigInt(Number.MIN_SAFE_INTEGER) &&
        integer <= BigInt(Number.MAX_SAFE_INTEGER)
      ) {
        return Number(integer)
      }
      return integer
    } catch {
      return null
    }
  }
  const number = Number(source)
  return Number.isFinite(number) ? number : null
}

const scalarFromNode = (node: SqlAstNode): QueryScalar | null | undefined => {
  if (node?.type === 'StringLiteral') return String(node.value)
  if (node?.type === 'BlobLiteral') return new Uint8Array(node.bytes)
  if (node?.type === 'NullLiteral') return null
  if (node?.type === 'NumericLiteral') return numericScalar(String(node.value)) ?? undefined
  if (
    node?.type === 'UnaryExpr' &&
    (node.op === 'Negative' || node.op === 'Positive') &&
    node.expr?.type === 'NumericLiteral'
  ) {
    return numericScalar(String(node.expr.value), node.op === 'Negative') ?? undefined
  }
  return undefined
}

const collectScalars = (node: SqlAstNode): QueryScalar[] => {
  const values = new Map<string, QueryScalar>()
  const visit = (value: unknown): void => {
    if (value === null || typeof value !== 'object') return
    const ast = value as SqlAstNode
    const scalar = scalarFromNode(ast)
    if (scalar !== undefined) values.set(scalarKey(scalar), scalar)
    if (Array.isArray(value)) {
      for (const child of value) visit(child)
      return
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key !== 'span') visit(child)
    }
  }
  visit(node)
  return [...values.values()]
}

const decodeLikePattern = (pattern: string): string | null => {
  if (pattern.length < 2 || !pattern.startsWith('%') || !pattern.endsWith('%')) return null
  const inner = pattern.slice(1, -1)
  let decoded = ''
  for (let index = 0; index < inner.length; index++) {
    const char = inner[index]!
    if (char !== '\\') {
      if (char === '%' || char === '_') return null
      decoded += char
      continue
    }
    const next = inner[++index]
    if (next !== '\\' && next !== '%' && next !== '_') return null
    decoded += next
  }
  return decoded
}

const collectLikeTexts = (node: SqlAstNode): string[] => {
  const texts = new Set<string>()
  const visit = (value: unknown): void => {
    if (value === null || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const child of value) visit(child)
      return
    }
    const ast = value as SqlAstNode
    if (ast.type === 'LikeExpr' && ast.rhs?.type === 'StringLiteral') {
      const decoded = decodeLikePattern(String(ast.rhs.value))
      if (decoded !== null) texts.add(decoded)
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key !== 'span') visit(child)
    }
  }
  visit(node)
  return [...texts]
}

const recognizeScope = (
  term: SqlAstNode,
  baseNames: Set<string>,
  matrix: QueryCatalogMatrix,
  baseSpec: NormalizedQuerySpec,
  catalog: QueryCatalog,
): QuerySpec['scope'] | null => {
  for (const node of catalog.nodes) {
    const spec: NormalizedQuerySpec = { ...baseSpec, scope: { type: 'node', ...node } }
    const candidate = renderScopeTerm(spec, materializeSqlValue)
    if (candidate && candidateMatches(term, candidate, baseNames, matrix)) return spec.scope
  }

  // A canonical scope can outlive its catalog node. Recover its literal
  // identity so final normalization reports node-not-found instead of silently
  // demoting the whole scope term to an opaque leaf.
  const ids = collectScalars(term).filter(
    (value): value is number =>
      typeof value === 'number' && Number.isSafeInteger(value) && value > 0,
  )
  if (ids.length <= 4) {
    for (const matrixId of ids) {
      for (const rowId of ids) {
        const spec: NormalizedQuerySpec = {
          ...baseSpec,
          scope: { type: 'node', matrixId, rowId },
        }
        const candidate = renderScopeTerm(spec, materializeSqlValue)
        if (candidate && candidateMatches(term, candidate, baseNames, matrix)) return spec.scope
      }
    }
  }
  return null
}

const recognizeText = (
  term: SqlAstNode,
  baseNames: Set<string>,
  matrix: QueryCatalogMatrix,
  baseSpec: NormalizedQuerySpec,
): string | null => {
  if (physicalTextRoleColumns(matrix).length === 0) return null
  for (const text of collectLikeTexts(term)) {
    const spec: NormalizedQuerySpec = { ...baseSpec, text }
    const candidate = renderTextTerm(spec, matrix, materializeSqlValue)
    if (candidate && candidateMatches(term, candidate, baseNames, matrix)) return text
  }
  return null
}

const recognizePredicate = (
  term: SqlAstNode,
  baseNames: Set<string>,
  matrix: QueryCatalogMatrix,
): QueryPredicate | null => {
  const values = collectScalars(term)
  const containsValues = collectLikeTexts(term)
  const compareOps = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte'] as const
  const render: ValueRenderer = materializeSqlValue

  for (const column of matrix.columns) {
    if (column.formula !== null) continue
    for (const op of ['empty', 'notEmpty'] as const) {
      const candidate: QueryPredicate = { type: 'predicate', columnId: column.id, op }
      if (
        candidateMatches(
          term,
          renderPredicateTerm(candidate, matrix, render),
          baseNames,
          matrix,
        )
      ) {
        return candidate
      }
    }
    for (const value of containsValues) {
      const candidate: QueryPredicate = {
        type: 'predicate',
        columnId: column.id,
        op: 'contains',
        value,
      }
      if (
        candidateMatches(
          term,
          renderPredicateTerm(candidate, matrix, render),
          baseNames,
          matrix,
        )
      ) {
        return candidate
      }
    }
    for (const value of values) {
      for (const op of compareOps) {
        if (value === null && op !== 'eq' && op !== 'neq') continue
        const candidate: QueryPredicate = { type: 'predicate', columnId: column.id, op, value }
        if (
          candidateMatches(
            term,
            renderPredicateTerm(candidate, matrix, render),
            baseNames,
            matrix,
          )
        ) {
          return candidate
        }
      }
    }
  }
  return null
}

const IMPLICIT_ROW_IDS = new Set(['id', 'rowid', '_rowid_', 'oid'])

const outerColumnNames = (node: SqlAstNode, baseNames: Set<string>): string[] => {
  const names = new Map<string, string>()
  const visit = (value: unknown): void => {
    if (value === null || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const child of value) visit(child)
      return
    }
    const ast = value as SqlAstNode
    if (ast.type === 'QualifiedExpr' && baseNames.has(String(ast.table?.text).toLowerCase())) {
      const name = String(ast.column?.text)
      names.set(name.toLowerCase(), name)
    } else if (ast.type === 'Id') {
      const name = String(ast.name)
      names.set(name.toLowerCase(), name)
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key !== 'span') visit(child)
    }
  }
  visit(node)
  return [...names.values()]
}

const syntheticColumn = (name: string, id: number): QueryCatalogMatrix['columns'][number] => ({
  id,
  name,
  type: 'TEXT',
  displayType: 'text',
  order: id,
  options: null,
  formula: null,
  constraints: null,
  managedBy: null,
  role: 'label',
})

const missingCanonicalColumn = (
  term: SqlAstNode,
  baseNames: Set<string>,
  matrix: QueryCatalogMatrix,
  baseSpec: NormalizedQuerySpec,
): string | null => {
  const known = new Set(matrix.columns.map((column) => column.name.toLowerCase()))
  for (const name of outerColumnNames(term, baseNames)) {
    if (known.has(name.toLowerCase()) || IMPLICIT_ROW_IDS.has(name.toLowerCase())) continue

    const id = -1
    const column = syntheticColumn(name, id)
    const predicateMatrix: QueryCatalogMatrix = {
      ...matrix,
      columns: [...matrix.columns, column],
    }
    const predicate = recognizePredicate(term, baseNames, predicateMatrix)
    if (predicate?.type === 'predicate' && predicate.columnId === id) return name

    for (let index = 0; index <= matrix.columns.length; index++) {
      const candidateMatrix: QueryCatalogMatrix = {
        ...matrix,
        columns: [...matrix.columns.slice(0, index), column, ...matrix.columns.slice(index)],
      }
      if (recognizeText(term, baseNames, candidateMatrix, baseSpec) !== null) return name
    }
  }
  return null
}

const opaqueSql = (source: string, term: SqlAstNode): string | null => {
  const sql = sourceForNode(source, term)
  if (sql === null) return null
  if (term.type === 'ParenthesizedExpr' && sql.startsWith('(') && sql.endsWith(')')) {
    return sql.slice(1, -1)
  }
  return sql
}

const orderFromAst = (
  orderBy: SqlAstNode[] | undefined,
  baseNames: Set<string>,
  matrix: QueryCatalogMatrix,
): QuerySpec['order'] | null => {
  if (!orderBy || orderBy.length < 1 || orderBy.length > 2) return null
  if (orderBy.some((term) => term?.nulls !== undefined)) return null

  const firstName = baseColumnName(orderBy[0]?.expr, baseNames, matrix)
  const firstDirection = orderBy[0]?.order ?? 'Asc'
  if (!firstName || (firstDirection !== 'Asc' && firstDirection !== 'Desc')) return null
  if (firstName.toLowerCase() === 'id') {
    return orderBy.length === 1 && firstDirection === 'Asc' ? { type: 'natural' } : null
  }

  const column = matrix.columns.find(
    (candidate) => candidate.name.toLowerCase() === firstName.toLowerCase(),
  )
  if (!column || column.formula !== null || orderBy.length !== 2) return null
  const tieName = baseColumnName(orderBy[1]?.expr, baseNames, matrix)
  const tieDirection = orderBy[1]?.order ?? 'Asc'
  if (tieName?.toLowerCase() !== 'id' || tieDirection !== 'Asc') return null
  return {
    type: 'column',
    columnId: column.id,
    direction: firstDirection === 'Desc' ? 'desc' : 'asc',
  }
}

const limitFromAst = (limit: SqlAstNode | undefined): number | null => {
  if (!limit || limit.offset !== undefined) return null
  const scalar = scalarFromNode(limit.expr)
  return typeof scalar === 'number' && Number.isSafeInteger(scalar) && scalar > 0 ?
      scalar
    : null
}

export const recognizeQuerySpec = (sql: string, catalog: QueryCatalog): QueryRecognition => {
  const parsed = parseSingleStatement(sql)
  if (!parsed.ok) return custom('parse-error', parsed.message)
  const root = parsed.statement.root
  if (root?.type !== 'SelectStmt')
    return custom('not-read-only', 'Query is not a read-only SELECT')

  const body = root.body
  if (body?.type !== 'Select') return custom('not-select', 'Query is not a SELECT')
  if (body.with) return custom('cte', 'CTE sources are outside the v1 dialect')
  if (body.compounds?.length)
    return custom('compound', 'Compound queries are outside the dialect')
  const select = body.select
  if (select?.type !== 'SelectFrom')
    return custom('not-select', 'VALUES is outside the dialect')
  if (select.distinctness) return custom('distinct', 'DISTINCT is outside the dialect')
  if (select.groupBy) return custom('group-by', 'GROUP BY is outside the dialect')
  if (select.having) return custom('having', 'HAVING is outside the dialect')
  if (select.windowClause) return custom('window', 'WINDOW is outside the dialect')

  const from = select.from
  if (from?.type !== 'FromClause' || from.joins?.length) {
    return custom('source', 'The v1 dialect requires one base table')
  }
  const table = from.select
  if (table?.type !== 'TableSelectTable' || table.tblName?.dbName || table.indexed) {
    return custom('source', 'The v1 dialect requires one unqualified base table')
  }
  const tableName = nameText(table.tblName?.objName)
  const match = /^mx_(\d+)_data$/i.exec(tableName ?? '')
  if (!match) return custom('source', 'Source is not a matrix data table')
  const matrixId = Number(match[1])
  let matrix: QueryCatalogMatrix
  try {
    matrix = resolveCatalogMatrix(catalog, matrixId)
  } catch {
    return custom('matrix-not-found', `Matrix ${matrixId} is not in the catalog`)
  }

  const alias = nameText(table.alias?.name) ?? tableName!
  const baseNames = new Set([alias.toLowerCase(), tableName!.toLowerCase()])
  if (!Array.isArray(select.columns) || select.columns.length !== 1) {
    return custom('projection', 'Projection must be exactly the base-table star')
  }
  const projection = select.columns[0]
  if (
    projection?.type !== 'StarResultColumn' &&
    !(
      projection?.type === 'TableStarResultColumn' &&
      baseNames.has(String(projection.table?.text).toLowerCase())
    )
  ) {
    return custom('projection', 'Projection must be exactly the base-table star')
  }

  const order = orderFromAst(body.orderBy, baseNames, matrix)
  if (!order) {
    const firstOrderName = baseColumnName(body.orderBy?.[0]?.expr, baseNames, matrix)
    if (
      firstOrderName &&
      !IMPLICIT_ROW_IDS.has(firstOrderName.toLowerCase()) &&
      !matrix.columns.some(
        (column) => column.name.toLowerCase() === firstOrderName.toLowerCase(),
      )
    ) {
      return custom(
        'column-not-found',
        `Column ${firstOrderName} is not in matrix ${matrix.id}`,
      )
    }
    return custom('order', 'Query lacks the canonical deterministic order')
  }
  if (body.limit?.offset !== undefined)
    return custom('offset', 'Semantic OFFSET is outside the dialect')
  const limit = limitFromAst(body.limit)
  if (limit === null) return custom('limit', 'Query lacks a positive literal semantic limit')

  const baseSpec: NormalizedQuerySpec = {
    kind: { type: 'matrix', matrixId },
    scope: { type: 'all' },
    text: '',
    where: [],
    order,
    limit,
  }
  let scope: QuerySpec['scope'] = { type: 'all' }
  let text = ''
  const where: QueryPredicate[] = []

  for (const term of splitTopLevelAnd(select.whereClause)) {
    if (scope.type === 'all') {
      const recognizedScope = recognizeScope(term, baseNames, matrix, baseSpec, catalog)
      if (recognizedScope) {
        scope = recognizedScope
        continue
      }
    }
    if (text === '') {
      const recognizedText = recognizeText(term, baseNames, matrix, baseSpec)
      if (recognizedText !== null) {
        text = recognizedText
        continue
      }
    }
    const predicate = recognizePredicate(term, baseNames, matrix)
    if (predicate) {
      where.push(predicate)
      continue
    }
    const missingColumn = missingCanonicalColumn(term, baseNames, matrix, baseSpec)
    if (missingColumn !== null) {
      return custom('column-not-found', `Column ${missingColumn} is not in matrix ${matrix.id}`)
    }
    const opaque = opaqueSql(sql, term)
    if (opaque === null) return custom('invalid-spec', 'WHERE term has no source span')
    where.push({ type: 'opaque', sql: opaque })
  }

  try {
    const spec = normalizeQuerySpec({ ...baseSpec, scope, text, where }, catalog)
    return {
      type:
        spec.where.some((predicate) => predicate.type === 'opaque') ?
          'chips-with-leaves'
        : 'chips',
      spec,
    }
  } catch (error) {
    if (
      error instanceof QuerySpecError &&
      (error.code === 'node-not-found' || error.code === 'column-not-found')
    ) {
      return custom(
        error.code,
        error.message,
        error.code === 'node-not-found' && scope.type === 'node' ? { missingNode: scope } : {},
      )
    }
    return custom(
      'invalid-spec',
      error instanceof Error ? error.message : 'Recognized query has invalid catalog values',
    )
  }
}
