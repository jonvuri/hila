/**
 * Tests for the AST-based scope inference in the range-aware invalidation
 * module. These exercise `inferScope` against the real query shapes produced
 * by the workspace plugin's query builders, confirming that the sqlite3-parser
 * AST walk correctly extracts matrix IDs, key ranges, and closure node IDs.
 */

import { describe, expect, test } from 'vitest'

import {
  buildPaginatedOutlineQuery,
  buildAncestryForRowsQuery,
} from '../../workspace/workspace-plugin'

import { inferScope, STRUCTURAL_TABLES } from './invalidation'

const toHex = (key: Uint8Array): string =>
  Array.from(key, (b) => b.toString(16).padStart(2, '0')).join('')

describe('inferScope: AST-based scope extraction', () => {
  test('outline query without focus root: extracts matrix_id, no key range', () => {
    const sql = buildPaginatedOutlineQuery(42)
    const tables = new Set(['scroll_index', 'mx_42_data', 'joins'])
    const scope = inferScope(sql, tables)

    expect(scope.dataTables).toEqual(new Set(['mx_42_data']))
    expect(scope.structuralTables).toEqual(new Set(['scroll_index', 'joins']))
    expect(scope.structural).toBeDefined()
    expect(scope.structural!.matrixId).toBe(42)
    expect(scope.structural!.keyLow).toBeNull()
    expect(scope.structural!.keyHigh).toBeNull()
    expect(scope.structural!.readsClosure).toBe(false)
  })

  test('outline query with focus root: extracts key range from blob literals', () => {
    const sql = buildPaginatedOutlineQuery(7, { focusRootHex: '8000c000' })
    const tables = new Set(['scroll_index', 'mx_7_data', 'joins'])
    const scope = inferScope(sql, tables)

    expect(scope.structural).toBeDefined()
    expect(scope.structural!.matrixId).toBe(7)
    expect(scope.structural!.keyLow).not.toBeNull()
    expect(scope.structural!.keyHigh).not.toBeNull()
    expect(toHex(scope.structural!.keyLow!)).toBe('8000c000')
    // nextPrefixHex('8000c000') = '8000c001'
    expect(toHex(scope.structural!.keyHigh!)).toBe('8000c001')
  })

  test('ancestry query: extracts closure node IDs from IN list', () => {
    const sql = buildAncestryForRowsQuery(3, [10, 20, 30])
    const tables = new Set(['closure', 'scroll_index', 'mx_3_data'])
    const scope = inferScope(sql, tables)

    expect(scope.structural).toBeDefined()
    expect(scope.structural!.readsClosure).toBe(true)
    expect(scope.structural!.closureNodeIds).toEqual([
      { matrixId: 3, rowId: 10 },
      { matrixId: 3, rowId: 20 },
      { matrixId: 3, rowId: 30 },
    ])
  })

  test('query with no structural tables: returns no structural scope', () => {
    const sql = 'SELECT * FROM "mx_5_data" WHERE id = 1'
    const tables = new Set(['mx_5_data'])
    const scope = inferScope(sql, tables)

    expect(scope.dataTables).toEqual(new Set(['mx_5_data']))
    expect(scope.structuralTables.size).toBe(0)
    expect(scope.structural).toBeUndefined()
  })

  test('handles different alias styles (AS vs space)', () => {
    const sqlExplicit = `
      SELECT r.matrix_id FROM scroll_index AS r WHERE r.matrix_id = 99
    `
    const tables = new Set(['scroll_index'])
    const scope = inferScope(sqlExplicit, tables)
    expect(scope.structural?.matrixId).toBe(99)
  })

  test('handles unaliased table references', () => {
    const sql = `
      SELECT scroll_index.matrix_id FROM scroll_index WHERE scroll_index.matrix_id = 11
    `
    const tables = new Set(['scroll_index'])
    const scope = inferScope(sql, tables)
    expect(scope.structural?.matrixId).toBe(11)
  })

  test('returns undefined structural scope for unparseable SQL', () => {
    const sql = 'THIS IS NOT VALID SQL AT ALL'
    const tables = new Set(['scroll_index'])
    const scope = inferScope(sql, tables)
    expect(scope.structural).toBeUndefined()
  })

  test('STRUCTURAL_TABLES constant covers the three global tables', () => {
    expect(STRUCTURAL_TABLES).toEqual(new Set(['scroll_index', 'closure', 'joins']))
  })
})
