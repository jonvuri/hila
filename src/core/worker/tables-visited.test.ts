/**
 * Tests for `tablesVisitedBySql` — the sqlite3-parser-based table extraction.
 * Exercises the full query repertoire: simple SELECTs, JOINs, subqueries,
 * correlated subqueries, and CTEs.
 */

import { describe, expect, test } from 'vitest'

import { tablesVisitedBySql } from './invalidation'

describe('tablesVisitedBySql', () => {
  test('simple SELECT from one table', () => {
    const tables = tablesVisitedBySql('SELECT * FROM matrix WHERE id = 1')
    expect(tables).toEqual(new Set(['matrix']))
  })

  test('quoted table name (double-quoted identifier)', () => {
    const tables = tablesVisitedBySql('SELECT * FROM "mx_42_data" WHERE id = 1')
    expect(tables).toEqual(new Set(['mx_42_data']))
  })

  test('JOIN across multiple tables', () => {
    const sql = `
      SELECT r.global_lexkey, d.label
      FROM scroll_index r
      JOIN "mx_5_data" d ON r.row_id = d.id
      WHERE r.matrix_id = 5
    `
    const tables = tablesVisitedBySql(sql)
    expect(tables).toEqual(new Set(['scroll_index', 'mx_5_data']))
  })

  test('correlated subquery (EXISTS with inner table reference)', () => {
    const sql = `
      SELECT r.global_lexkey AS key, r.row_id, d.label,
             CASE WHEN EXISTS (
               SELECT 1 FROM joins ch
               WHERE ch.kind = 'own' AND ch.source_matrix_id = 3
                 AND ch.source_row_id = r.row_id AND ch.target_matrix_id = 3
             ) THEN 1 ELSE 0 END as has_children
      FROM scroll_index r
      JOIN "mx_3_data" d ON r.row_id = d.id
      WHERE r.matrix_id = 3
    `
    const tables = tablesVisitedBySql(sql)
    expect(tables).toEqual(new Set(['joins', 'scroll_index', 'mx_3_data']))
  })

  test('CTE (WITH clause) with multiple tables', () => {
    const sql = `
      WITH ancestors AS (
        SELECT ancestor_row_id, ancestor_matrix_id
        FROM closure
        WHERE descendant_matrix_id = 1 AND descendant_row_id = 10
      )
      SELECT a.ancestor_row_id, s.global_lexkey, d.label
      FROM ancestors a
      JOIN scroll_index s ON s.matrix_id = a.ancestor_matrix_id AND s.row_id = a.ancestor_row_id
      JOIN "mx_1_data" d ON a.ancestor_row_id = d.id
    `
    const tables = tablesVisitedBySql(sql)
    expect(tables).toEqual(new Set(['closure', 'scroll_index', 'mx_1_data']))
  })

  test('ancestry query (real workspace query shape)', () => {
    const sql = `
      SELECT c.descendant_row_id AS for_row_id,
             s.global_lexkey AS key, s.depth,
             dt.label, c.ancestor_row_id AS row_id
      FROM closure c
      JOIN scroll_index s ON s.matrix_id = c.ancestor_matrix_id AND s.row_id = c.ancestor_row_id
      JOIN "mx_7_data" dt ON c.ancestor_row_id = dt.id
      WHERE c.descendant_matrix_id = 7
        AND c.descendant_row_id IN (10, 20, 30)
        AND c.ancestor_matrix_id = 7
      ORDER BY c.descendant_row_id, s.depth
    `
    const tables = tablesVisitedBySql(sql)
    expect(tables).toEqual(new Set(['closure', 'scroll_index', 'mx_7_data']))
  })

  test('backlinks query (JOIN with WHERE filter)', () => {
    const sql = `
      SELECT j.source_row_id AS id, j.kind, d.label
      FROM joins j
      JOIN "mx_2_data" d ON j.source_row_id = d.id
      WHERE j.target_matrix_id = 2 AND j.target_row_id = 5
        AND j.source_matrix_id = 2
        AND j.kind = 'ref'
      ORDER BY d.label
    `
    const tables = tablesVisitedBySql(sql)
    expect(tables).toEqual(new Set(['joins', 'mx_2_data']))
  })

  test('subquery in FROM clause', () => {
    const sql = `
      SELECT sub.id, sub.label
      FROM (SELECT id, label FROM "mx_1_data" WHERE id > 5) sub
      JOIN scroll_index s ON s.row_id = sub.id
    `
    const tables = tablesVisitedBySql(sql)
    expect(tables).toEqual(new Set(['mx_1_data', 'scroll_index']))
  })

  test('multiple CTEs', () => {
    const sql = `
      WITH
        roots AS (SELECT row_id FROM scroll_index WHERE depth = 0 AND matrix_id = 1),
        children AS (SELECT descendant_row_id FROM closure WHERE ancestor_row_id IN (SELECT row_id FROM roots))
      SELECT d.* FROM "mx_1_data" d WHERE d.id IN (SELECT descendant_row_id FROM children)
    `
    const tables = tablesVisitedBySql(sql)
    expect(tables).toEqual(new Set(['scroll_index', 'closure', 'mx_1_data']))
  })

  test('returns empty set for invalid SQL', () => {
    const tables = tablesVisitedBySql('THIS IS NOT VALID SQL')
    expect(tables).toEqual(new Set())
  })

  test('table names are lowercased', () => {
    const tables = tablesVisitedBySql('SELECT * FROM Scroll_Index WHERE matrix_id = 1')
    expect(tables).toEqual(new Set(['scroll_index']))
  })

  test('aliased table (AS keyword)', () => {
    const tables = tablesVisitedBySql(
      'SELECT r.matrix_id FROM scroll_index AS r WHERE r.matrix_id = 1',
    )
    expect(tables).toEqual(new Set(['scroll_index']))
  })

  test('aliased table (implicit, space-separated)', () => {
    const tables = tablesVisitedBySql(
      'SELECT r.matrix_id FROM scroll_index r WHERE r.matrix_id = 1',
    )
    expect(tables).toEqual(new Set(['scroll_index']))
  })
})
