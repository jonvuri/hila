import type { SqlValue } from '@sqlite.org/sqlite-wasm'
import { parseStmt } from 'sqlite3-parser'

// sqlite3-parser does not export its AST node union.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SqlAstNode = any

export type ParsedSqlStatement = {
  root: SqlAstNode
  /** The parsed statement without harmless leading/trailing comments or `;`. */
  sql: string
  /** Offset of `sql` in the caller's original source. */
  offset: number
}

export type SqlParseResult =
  | { ok: true; statement: ParsedSqlStatement }
  | { ok: false; reason: 'parse-error'; message: string }

const skipTrivia = (source: string, start: number): number => {
  let offset = start
  while (offset < source.length) {
    const character = source[offset]
    if (/\s/.test(character!)) {
      offset += 1
      continue
    }
    if (source.startsWith('--', offset)) {
      const newline = source.indexOf('\n', offset + 2)
      if (newline === -1) return source.length
      offset = newline + 1
      continue
    }
    if (source.startsWith('/*', offset)) {
      const close = source.indexOf('*/', offset + 2)
      if (close === -1) return offset
      offset = close + 2
      continue
    }
    break
  }
  return offset
}

/**
 * Parse exactly one SQLite statement. The parser's strict mode accepts
 * whitespace, comments, and one trailing semicolon, but rejects another
 * statement or trailing garbage.
 */
export const parseSingleStatement = (source: string): SqlParseResult => {
  const result = parseStmt(source)
  if (result.status !== 'ok') {
    return {
      ok: false,
      reason: 'parse-error',
      message: result.errors.map(String).join('\n') || 'Invalid SQL statement',
    }
  }

  const span = (result.root as SqlAstNode)?.span
  if (typeof span?.offset !== 'number' || typeof span?.length !== 'number') {
    return { ok: false, reason: 'parse-error', message: 'SQL statement has no source span' }
  }

  if (skipTrivia(source, 0) !== span.offset) {
    return {
      ok: false,
      reason: 'parse-error',
      message:
        'Only whitespace, comments, and one trailing semicolon may surround the statement',
    }
  }

  const statementEnd = span.offset + span.length
  let trailingOffset = skipTrivia(source, statementEnd)
  if (source[trailingOffset] === ';') trailingOffset = skipTrivia(source, trailingOffset + 1)
  if (trailingOffset !== source.length) {
    return {
      ok: false,
      reason: 'parse-error',
      message:
        'Only whitespace, comments, and one trailing semicolon may surround the statement',
    }
  }

  return {
    ok: true,
    statement: {
      root: result.root as SqlAstNode,
      sql: source.slice(span.offset, span.offset + span.length),
      offset: span.offset,
    },
  }
}

export const isReadOnlySelect = (root: SqlAstNode): boolean => root?.type === 'SelectStmt'

export const sourceForNode = (source: string, node: SqlAstNode): string | null => {
  const span = node?.span
  if (typeof span?.offset !== 'number' || typeof span?.length !== 'number') return null
  return source.slice(span.offset, span.offset + span.length)
}

/** Flatten only AST-level top-level AND nodes. Parenthesized AND remains one leaf. */
export const splitTopLevelAnd = (node: SqlAstNode | undefined): SqlAstNode[] => {
  if (!node) return []
  if (node.type === 'BinaryExpr' && node.op === 'And') {
    return [...splitTopLevelAnd(node.left), ...splitTopLevelAnd(node.right)]
  }
  return [node]
}

export const unwrapSingleParenthesis = (node: SqlAstNode): SqlAstNode => {
  if (node?.type === 'ParenthesizedExpr' && node.exprs?.length === 1) return node.exprs[0]
  return node
}

export const quoteSqlIdentifier = (identifier: string): string =>
  `"${identifier.replaceAll('"', '""')}"`

export const quoteSqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`

export const materializeSqlValue = (value: SqlValue): string => {
  if (value === null) return 'NULL'
  if (typeof value === 'string') return quoteSqlString(value)
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('SQL numbers must be finite')
    return Object.is(value, -0) ? '0' : String(value)
  }

  const bytes =
    value instanceof ArrayBuffer ? new Uint8Array(value)
    : value instanceof Int8Array ?
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    : value
  return `X'${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}'`
}

export const topLevelLimitNode = (root: SqlAstNode): SqlAstNode | undefined =>
  root?.type === 'SelectStmt' ? root.body?.limit : undefined
