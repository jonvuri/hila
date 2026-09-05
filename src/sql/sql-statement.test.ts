import { describe, expect, test } from 'vitest'

import {
  materializeSqlValue,
  parseSingleStatement,
  quoteSqlIdentifier,
  sourceForNode,
  splitTopLevelAnd,
  topLevelLimitNode,
} from './sql-statement'

describe('single SQLite statement parsing', () => {
  test('accepts one statement with harmless surrounding syntax', () => {
    const parsed = parseSingleStatement(' -- before\nSELECT 1; -- after\n')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.statement.sql).toBe('SELECT 1')
  })

  test('rejects a second statement', () => {
    expect(parseSingleStatement('SELECT 1; SELECT 2')).toMatchObject({
      ok: false,
      reason: 'parse-error',
    })
  })

  test('rejects extra semicolons', () => {
    expect(parseSingleStatement('SELECT 1;;')).toMatchObject({ ok: false })
    expect(parseSingleStatement('; SELECT 1')).toMatchObject({ ok: false })
  })

  test('splits only top-level AND terms and retains exact spans', () => {
    const source = `SELECT * FROM t WHERE a = 1 AND (b = 2 AND c = 3) AND d = 'x'`
    const parsed = parseSingleStatement(source)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const terms = splitTopLevelAnd(parsed.statement.root.body.select.whereClause)
    expect(terms.map((term) => sourceForNode(source, term))).toEqual([
      'a = 1',
      '(b = 2 AND c = 3)',
      "d = 'x'",
    ])
  })

  test('exposes only a top-level semantic limit', () => {
    const parsed = parseSingleStatement(
      'SELECT * FROM (SELECT * FROM t LIMIT 2) AS d ORDER BY d.id LIMIT 4',
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(topLevelLimitNode(parsed.statement.root)?.expr?.value).toBe('4')
  })
})

describe('SQL identifiers and values', () => {
  test('quotes identifiers, strings, blobs, bigint, and negative zero', () => {
    expect(quoteSqlIdentifier('a"b')).toBe('"a""b"')
    expect(materializeSqlValue("a'b")).toBe("'a''b'")
    expect(materializeSqlValue(new Uint8Array([0, 15, 255]))).toBe("X'000fff'")
    expect(materializeSqlValue(12n)).toBe('12')
    expect(materializeSqlValue(-0)).toBe('0')
  })

  test('rejects non-finite numbers', () => {
    expect(() => materializeSqlValue(Number.NaN)).toThrow(/finite/)
  })
})
