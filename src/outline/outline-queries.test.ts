/**
 * Tests for paginated outline queries.
 *
 * Exercises buildPaginatedOutlineQuery and buildOutlineCountQuery against a
 * real in-memory SQLite database to verify SQL-side collapse filtering,
 * keyset pagination, focus subtree filtering, and their combinations.
 */

import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { initMatrixSchema, ensureRootMatrix, insertDataRow, insertRow } from '../core/matrix'
import { ensureTrait } from '../core/traits'

import { buildPaginatedOutlineQuery, buildOutlineCountQuery } from './outline-plugin'

let db: Database
let matrixId: number

const keyToHex = (key: Uint8Array): string =>
  Array.from(key)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

type QueryRow = {
  key: Uint8Array
  row_id: number
  content: string
  depth: number
  has_children: number
}

const runQuery = (sql: string): QueryRow[] => {
  const stmt = db.prepare(sql)
  const result: QueryRow[] = []
  while (stmt.step()) {
    result.push(stmt.get({}) as unknown as QueryRow)
  }
  stmt.finalize()
  return result
}

const runCount = (sql: string): number => {
  const stmt = db.prepare(sql)
  stmt.step()
  const row = stmt.get({}) as { row_count: number }
  stmt.finalize()
  return row.row_count
}

const makeDoc = (text: string) =>
  JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })

const insertContentRow = (
  text: string,
  opts?: { parentKey?: Uint8Array; prevKey?: Uint8Array },
) => {
  const content = makeDoc(text)
  const rowId = insertDataRow(db, matrixId, { content })
  const key = insertRow(db, {
    matrixId,
    rowKind: 0,
    rowId,
    parentKey: opts?.parentKey,
    prevKey: opts?.prevKey,
  })
  return { key, rowId, hex: keyToHex(key) }
}

beforeEach(async () => {
  const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
  db = new sqlite3.oo1.DB(':memory:', 'c')
  initMatrixSchema(db)
  matrixId = ensureRootMatrix(db)
})

/**
 * Test tree structure (inserted in each test as needed):
 *
 *   A
 *     B
 *       C
 *       D
 *     E
 *   F
 *   G
 */
const buildTree = () => {
  const a = insertContentRow('A')
  const b = insertContentRow('B', { parentKey: a.key })
  const c = insertContentRow('C', { parentKey: b.key })
  const d = insertContentRow('D', { parentKey: b.key, prevKey: c.key })
  const e = insertContentRow('E', { parentKey: a.key, prevKey: b.key })
  const f = insertContentRow('F', { prevKey: a.key })
  const g = insertContentRow('G', { prevKey: f.key })
  return { a, b, c, d, e, f, g }
}

// ---------------------------------------------------------------------------
// buildPaginatedOutlineQuery
// ---------------------------------------------------------------------------

describe('buildPaginatedOutlineQuery', () => {
  test('returns all rows ordered by key with no filters', () => {
    const { a, b, c, d, e, f, g } = buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId)
    const rows = runQuery(sql)

    expect(rows.map((r) => r.row_id)).toEqual([
      a.rowId,
      b.rowId,
      c.rowId,
      d.rowId,
      e.rowId,
      f.rowId,
      g.rowId,
    ])
  })

  test('returns correct depth for each row', () => {
    buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId)
    const rows = runQuery(sql)

    const depths = rows.map((r) => r.depth)
    expect(depths).toEqual([0, 1, 2, 2, 1, 0, 0])
  })

  test('returns correct has_children flag', () => {
    buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId)
    const rows = runQuery(sql)

    const hasChildren = rows.map((r) => r.has_children)
    // A has children (B, E), B has children (C, D), C/D/E/F/G have no children
    expect(hasChildren).toEqual([1, 1, 0, 0, 0, 0, 0])
  })

  test('focus root filter limits to subtree', () => {
    const { a, b, c, d, e } = buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId, { focusRootHex: a.hex })
    const rows = runQuery(sql)

    expect(rows.map((r) => r.row_id)).toEqual([a.rowId, b.rowId, c.rowId, d.rowId, e.rowId])
  })

  test('excludes collapsed subtree', () => {
    const { a, b, e, f, g } = buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId, {
      collapsedKeyHexes: [b.hex],
    })
    const rows = runQuery(sql)

    // B's children (C, D) are excluded; B itself remains
    expect(rows.map((r) => r.row_id)).toEqual([a.rowId, b.rowId, e.rowId, f.rowId, g.rowId])
  })

  test('excludes multiple collapsed subtrees', () => {
    const { a, b, f, g } = buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId, {
      collapsedKeyHexes: [a.hex, b.hex],
    })
    const rows = runQuery(sql)

    // A's children (B, C, D, E) are excluded; B's exclusion is redundant
    expect(rows.map((r) => r.row_id)).toEqual([a.rowId, f.rowId, g.rowId])
  })

  test('nested collapse: parent collapse subsumes child collapse', () => {
    const { a, b, f, g } = buildTree()
    // Same assertion as 'excludes multiple collapsed subtrees' — verifies the semantics
    // Collapsing both A and B — A's exclusion already covers B's children
    const sql = buildPaginatedOutlineQuery(matrixId, {
      collapsedKeyHexes: [a.hex, b.hex],
    })
    const rows = runQuery(sql)

    expect(rows.map((r) => r.row_id)).toEqual([a.rowId, f.rowId, g.rowId])
  })

  test('collapse within focused subtree', () => {
    const { a, b, e } = buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId, {
      focusRootHex: a.hex,
      collapsedKeyHexes: [b.hex],
    })
    const rows = runQuery(sql)

    // Focus on A's subtree, B is collapsed (C, D excluded)
    expect(rows.map((r) => r.row_id)).toEqual([a.rowId, b.rowId, e.rowId])
  })

  test('keyset pagination with afterKey', () => {
    const { b, c, d, e, f, g } = buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId, {
      afterKeyHex: b.hex,
    })
    const rows = runQuery(sql)

    // All rows after B (C, D, E, F, G)
    expect(rows.map((r) => r.row_id)).toEqual([c.rowId, d.rowId, e.rowId, f.rowId, g.rowId])
  })

  test('limit restricts row count', () => {
    buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId, { limit: 3 })
    const rows = runQuery(sql)

    expect(rows).toHaveLength(3)
  })

  test('afterKey + limit for page window', () => {
    const { c, d, e } = buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId, {
      afterKeyHex: c.hex,
      limit: 2,
    })
    const rows = runQuery(sql)

    // Two rows after C: D, E
    expect(rows.map((r) => r.row_id)).toEqual([d.rowId, e.rowId])
  })

  test('collapse + afterKey + limit combined', () => {
    const { a, b, e, f } = buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId, {
      collapsedKeyHexes: [b.hex],
      afterKeyHex: a.hex,
      limit: 3,
    })
    const rows = runQuery(sql)

    // After A, with B collapsed (C, D excluded): B, E, F
    expect(rows.map((r) => r.row_id)).toEqual([b.rowId, e.rowId, f.rowId])
  })

  test('focus + collapse + afterKey + limit combined', () => {
    const { a, b, e } = buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId, {
      focusRootHex: a.hex,
      collapsedKeyHexes: [b.hex],
      afterKeyHex: a.hex,
      limit: 2,
    })
    const rows = runQuery(sql)

    // Focus on A, B collapsed, after A, limit 2: B, E
    expect(rows.map((r) => r.row_id)).toEqual([b.rowId, e.rowId])
  })

  test('collapsing a leaf node has no effect', () => {
    const { a, b, c, d, e, f, g } = buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId, {
      collapsedKeyHexes: [g.hex],
    })
    const rows = runQuery(sql)

    // G has no children, so collapse exclusion matches nothing
    expect(rows.map((r) => r.row_id)).toEqual([
      a.rowId,
      b.rowId,
      c.rowId,
      d.rowId,
      e.rowId,
      f.rowId,
      g.rowId,
    ])
  })

  test('custom content column', () => {
    const mId = db.exec({
      sql: `INSERT INTO matrix (title) VALUES ('test') RETURNING id`,
      returnValue: 'resultRows',
    })[0]![0] as number

    db.exec(`
      INSERT INTO matrix_columns (matrix_id, name, type, "order") VALUES (${mId}, 'title', 'TEXT', 0);
      CREATE TABLE "mx_${mId}_data" (id INTEGER PRIMARY KEY DEFAULT ((abs(random()) >> 10) + 1), title TEXT);
    `)

    ensureTrait(db, 'rank', mId)
    ensureTrait(db, 'closure', mId)

    const rowId = db.exec({
      sql: `INSERT INTO "mx_${mId}_data" (title) VALUES ('Hello') RETURNING id`,
      returnValue: 'resultRows',
    })[0]![0] as number

    insertRow(db, { matrixId: mId, rowKind: 0, rowId })
    const sql = buildPaginatedOutlineQuery(mId, { contentColumn: 'title' })
    const rows = runQuery(sql)

    expect(rows).toHaveLength(1)
    expect(rows[0]!.content).toBe('Hello')
    expect(rows[0]!.row_id).toBe(rowId)
  })

  test('offset skips initial rows', () => {
    const { c, d, e, f, g } = buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId, {
      limit: 10,
      offset: 2,
    })
    const rows = runQuery(sql)

    // Skip first 2 rows (A, B), return rest: C, D, E, F, G
    expect(rows.map((r) => r.row_id)).toEqual([c.rowId, d.rowId, e.rowId, f.rowId, g.rowId])
  })

  test('offset + limit for a page window', () => {
    const { c, d, e } = buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId, {
      limit: 3,
      offset: 2,
    })
    const rows = runQuery(sql)

    // Skip 2, take 3: C, D, E
    expect(rows.map((r) => r.row_id)).toEqual([c.rowId, d.rowId, e.rowId])
  })

  test('offset is ignored without limit', () => {
    buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId, {
      offset: 2,
    })
    const rows = runQuery(sql)

    // Without LIMIT, OFFSET is not applied — all 7 rows returned
    expect(rows).toHaveLength(7)
  })

  test('afterKeyHex + offset + limit for focus-mode paging', () => {
    const { a, d, e } = buildTree()
    // In focus mode, afterKeyHex = focusRootHex to skip the root.
    // Then offset paginates within the remaining rows.
    const sql = buildPaginatedOutlineQuery(matrixId, {
      focusRootHex: a.hex,
      afterKeyHex: a.hex,
      limit: 2,
      offset: 2,
    })
    const rows = runQuery(sql)

    // Focus subtree after A: B, C, D, E (4 rows)
    // Offset 2 skips B, C → returns D, E
    expect(rows.map((r) => r.row_id)).toEqual([d.rowId, e.rowId])
  })

  test('collapse + offset + limit combined', () => {
    const { b, e, f } = buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId, {
      collapsedKeyHexes: [b.hex],
      limit: 2,
      offset: 2,
    })
    const rows = runQuery(sql)

    // With B collapsed: A, B, E, F, G (5 rows)
    // Offset 2 skips A, B → returns E, F
    expect(rows.map((r) => r.row_id)).toEqual([e.rowId, f.rowId])
  })

  test('empty result set with restrictive focus', () => {
    buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId, {
      focusRootHex: 'ff00',
    })
    const rows = runQuery(sql)

    expect(rows).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// buildOutlineCountQuery
// ---------------------------------------------------------------------------

describe('buildOutlineCountQuery', () => {
  test('counts all rows with no filters', () => {
    buildTree()
    const sql = buildOutlineCountQuery(matrixId)
    const count = runCount(sql)

    expect(count).toBe(7)
  })

  test('counts rows within focus subtree', () => {
    const { a } = buildTree()
    const sql = buildOutlineCountQuery(matrixId, { focusRootHex: a.hex })
    const count = runCount(sql)

    // A's subtree: A, B, C, D, E
    expect(count).toBe(5)
  })

  test('counts rows excluding collapsed subtree', () => {
    const { b } = buildTree()
    const sql = buildOutlineCountQuery(matrixId, { collapsedKeyHexes: [b.hex] })
    const count = runCount(sql)

    // All 7 minus C, D = 5
    expect(count).toBe(5)
  })

  test('counts correctly with focus + collapse', () => {
    const { a, b } = buildTree()
    const sql = buildOutlineCountQuery(matrixId, {
      focusRootHex: a.hex,
      collapsedKeyHexes: [b.hex],
    })
    const count = runCount(sql)

    // A's subtree (5) minus C, D (2) = 3
    expect(count).toBe(3)
  })

  test('counts correctly with multiple collapsed subtrees', () => {
    const { a } = buildTree()
    const sql = buildOutlineCountQuery(matrixId, { collapsedKeyHexes: [a.hex] })
    const count = runCount(sql)

    // All 7 minus B, C, D, E (4) = 3
    expect(count).toBe(3)
  })

  test('count matches data query row count', () => {
    const { a, b } = buildTree()
    const opts = { focusRootHex: a.hex, collapsedKeyHexes: [b.hex] }

    const dataRows = runQuery(buildPaginatedOutlineQuery(matrixId, opts))
    const count = runCount(buildOutlineCountQuery(matrixId, opts))

    expect(count).toBe(dataRows.length)
  })

  test('count is zero for empty matrix', () => {
    const sql = buildOutlineCountQuery(matrixId)
    const count = runCount(sql)

    expect(count).toBe(0)
  })
})
