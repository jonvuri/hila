import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  initMatrixSchema,
  createMatrix,
  getColumns,
  insertDataRow,
  insertJoin,
} from '../core/matrix'
import { createTreePosition } from '../core/tree'
import { registerPlugin, getPlugin } from '../core/plugin'
import { registerFaceType, clearFaceTypeRegistry } from '../core/face-registry'
import { getFaceConfigsForMatrix } from '../core/face-config'
import { ensureTrait, getTraits } from '../core/traits'
import { tableFaceTypeDefinition } from '../table/table-plugin'

import {
  workspaceFaceTypeDefinition,
  workspacePlugin,
  buildPaginatedOutlineQuery,
  buildOutlineCountQuery,
  buildBreadcrumbQuery,
  buildAncestryForRowsQuery,
  buildSingleRowQuery,
  buildBacklinksQuery,
} from './workspace-plugin'

const testWorkspacePlugin = { ...workspacePlugin, init: undefined }

afterEach(() => {
  clearFaceTypeRegistry()
})

// -- Plugin registration ------------------------------------------------------

describe('Workspace plugin registration', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    registerFaceType(tableFaceTypeDefinition)
    registerFaceType(workspaceFaceTypeDefinition)
  })

  test('registers the workspace plugin and creates the matrix with rank and closure traits', async () => {
    const ctx = await registerPlugin(db, testWorkspacePlugin)
    const matrixId = ctx.matrixIds['root']!

    expect(matrixId).toBeTypeOf('number')

    const plugin = getPlugin(db, 'hila.workspace')
    expect(plugin).not.toBeNull()
    expect(plugin!.name).toBe('Workspace')

    const traits = getTraits(db, matrixId)
    const traitTypes = traits.map((t) => t.trait_type)
    expect(traitTypes).toContain('rank')
    expect(traitTypes).toContain('closure')
  })

  test('matrix has label and content columns with correct roles', async () => {
    const ctx = await registerPlugin(db, testWorkspacePlugin)
    const matrixId = ctx.matrixIds['root']!

    const cols = getColumns(db, matrixId)
    const labelCol = cols.find((c) => c.name === 'label')
    const contentCol = cols.find((c) => c.name === 'content')

    expect(labelCol).toBeDefined()
    expect(contentCol).toBeDefined()
    expect(labelCol!.role).toBe('label')
    expect(contentCol!.role).toBe('content')
  })

  test('workspace face config has correct slot bindings', async () => {
    const ctx = await registerPlugin(db, testWorkspacePlugin)
    const matrixId = ctx.matrixIds['root']!

    const cols = getColumns(db, matrixId)
    const labelColId = cols.find((c) => c.name === 'label')!.id
    const contentColId = cols.find((c) => c.name === 'content')!.id

    const configs = getFaceConfigsForMatrix(db, matrixId)
    const wsConfig = configs.find((c) => c.faceTypeId === 'hila.workspace')!

    expect(wsConfig).toBeDefined()
    expect(wsConfig.slotBindings).toEqual({ label: labelColId, content: contentColId })
  })

  test('face type is registered', async () => {
    await registerPlugin(db, testWorkspacePlugin)

    const configs = getFaceConfigsForMatrix(
      db,
      (await registerPlugin(db, testWorkspacePlugin)).matrixIds['root']!,
    )
    const faceTypeIds = configs.map((c) => c.faceTypeId)

    expect(faceTypeIds).toContain('hila.workspace')
    expect(faceTypeIds).toContain('hila.table')
  })

  test('re-registering the workspace plugin is idempotent', async () => {
    const ctx1 = await registerPlugin(db, testWorkspacePlugin)
    const ctx2 = await registerPlugin(db, testWorkspacePlugin)

    expect(ctx2.matrixIds['root']).toBe(ctx1.matrixIds['root'])
  })
})

// -- Paginated outline query (ported from outline tests) ----------------------

describe('Workspace paginated outline query', () => {
  let db: Database
  let matrixId: number

  const keyToHex = (key: Uint8Array): string =>
    Array.from(key)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

  type QueryRow = {
    key: Uint8Array
    row_id: number
    label: string
    content: string | null
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

  const makeLabel = (text: string) =>
    JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    })

  const insertWorkspaceRow = (
    text: string,
    opts?: { parentKey?: Uint8Array; prevKey?: Uint8Array },
  ) => {
    const label = makeLabel(text)
    const rowId = insertDataRow(db, matrixId, { label, content: null })
    const key = createTreePosition(db, matrixId, rowId, {
      parentKey: opts?.parentKey,
      prevKey: opts?.prevKey,
    })
    return { key, rowId, hex: keyToHex(key) }
  }

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    matrixId = createMatrix(db, 'Workspace', [
      { name: 'label', type: 'TEXT', role: 'label' },
      { name: 'content', type: 'TEXT', role: 'content' },
    ])
    ensureTrait(db, 'rank', matrixId)
    ensureTrait(db, 'closure', matrixId)
  })

  const buildTree = () => {
    const a = insertWorkspaceRow('A')
    const b = insertWorkspaceRow('B', { parentKey: a.key })
    const c = insertWorkspaceRow('C', { parentKey: b.key })
    const d = insertWorkspaceRow('D', { parentKey: b.key, prevKey: c.key })
    const e = insertWorkspaceRow('E', { parentKey: a.key, prevKey: b.key })
    const f = insertWorkspaceRow('F', { prevKey: a.key })
    const g = insertWorkspaceRow('G', { prevKey: f.key })
    return { a, b, c, d, e, f, g }
  }

  test('returns all rows with label and content columns', () => {
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
    expect(rows[0]!.label).toContain('A')
    expect(rows[0]!.content).toBeNull()
  })

  test('returns correct depth for each row', () => {
    buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId)
    const rows = runQuery(sql)
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 2, 1, 0, 0])
  })

  test('returns correct has_children flag', () => {
    buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId)
    const rows = runQuery(sql)
    expect(rows.map((r) => r.has_children)).toEqual([1, 1, 0, 0, 0, 0, 0])
  })

  test('focus root filter limits to subtree', () => {
    const { a, b, c, d, e } = buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId, { focusRootHex: a.hex })
    const rows = runQuery(sql)
    expect(rows.map((r) => r.row_id)).toEqual([a.rowId, b.rowId, c.rowId, d.rowId, e.rowId])
  })

  test('excludes collapsed subtree', () => {
    const { a, b, e, f, g } = buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId, { collapsedKeyHexes: [b.hex] })
    const rows = runQuery(sql)
    expect(rows.map((r) => r.row_id)).toEqual([a.rowId, b.rowId, e.rowId, f.rowId, g.rowId])
  })

  test('limit restricts row count', () => {
    buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId, { limit: 3 })
    const rows = runQuery(sql)
    expect(rows).toHaveLength(3)
  })

  test('offset skips initial rows', () => {
    const { c, d, e, f, g } = buildTree()
    const sql = buildPaginatedOutlineQuery(matrixId, { limit: 10, offset: 2 })
    const rows = runQuery(sql)
    expect(rows.map((r) => r.row_id)).toEqual([c.rowId, d.rowId, e.rowId, f.rowId, g.rowId])
  })

  test('count matches data query row count', () => {
    const { a, b } = buildTree()
    const opts = { focusRootHex: a.hex, collapsedKeyHexes: [b.hex] }
    const dataRows = runQuery(buildPaginatedOutlineQuery(matrixId, opts))
    const count = runCount(buildOutlineCountQuery(matrixId, opts))
    expect(count).toBe(dataRows.length)
  })
})

// -- Breadcrumb query ---------------------------------------------------------

describe('Workspace breadcrumb query', () => {
  let db: Database
  let matrixId: number

  const keyToHex = (key: Uint8Array): string =>
    Array.from(key)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

  const makeLabel = (text: string) =>
    JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    })

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    matrixId = createMatrix(db, 'Workspace', [
      { name: 'label', type: 'TEXT', role: 'label' },
      { name: 'content', type: 'TEXT', role: 'content' },
    ])
    ensureTrait(db, 'rank', matrixId)
    ensureTrait(db, 'closure', matrixId)
  })

  test('returns ancestor chain with label column', () => {
    const a = insertDataRow(db, matrixId, { label: makeLabel('A'), content: null })
    const aKey = createTreePosition(db, matrixId, a)

    const b = insertDataRow(db, matrixId, { label: makeLabel('B'), content: null })
    const bKey = createTreePosition(db, matrixId, b, { parentKey: aKey })

    const c = insertDataRow(db, matrixId, { label: makeLabel('C'), content: null })
    const cKey = createTreePosition(db, matrixId, c, { parentKey: bKey })

    const sql = buildBreadcrumbQuery(matrixId, keyToHex(cKey))
    const stmt = db.prepare(sql)
    const results: { label: string; row_id: number; depth: number }[] = []
    while (stmt.step()) {
      results.push(stmt.get({}) as unknown as { label: string; row_id: number; depth: number })
    }
    stmt.finalize()

    expect(results).toHaveLength(2)
    expect(results[0]!.row_id).toBe(a)
    expect(results[0]!.label).toContain('A')
    expect(results[1]!.row_id).toBe(b)
    expect(results[1]!.label).toContain('B')
  })
})

// -- Ancestry-for-rows query --------------------------------------------------

describe('Workspace ancestry-for-rows query', () => {
  let db: Database
  let matrixId: number

  const makeLabel = (text: string) =>
    JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    })

  type AncestorRow = { for_row_id: number; row_id: number; label: string; depth: number }

  const runQuery = (sql: string): AncestorRow[] => {
    const stmt = db.prepare(sql)
    const result: AncestorRow[] = []
    while (stmt.step()) {
      result.push(stmt.get({}) as unknown as AncestorRow)
    }
    stmt.finalize()
    return result
  }

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    matrixId = createMatrix(db, 'Workspace', [
      { name: 'label', type: 'TEXT', role: 'label' },
      { name: 'content', type: 'TEXT', role: 'content' },
    ])
    ensureTrait(db, 'rank', matrixId)
    ensureTrait(db, 'closure', matrixId)
  })

  test('returns top-down ancestor chains keyed by descendant row id', () => {
    const a = insertDataRow(db, matrixId, { label: makeLabel('A'), content: null })
    const aKey = createTreePosition(db, matrixId, a)
    const b = insertDataRow(db, matrixId, { label: makeLabel('B'), content: null })
    const bKey = createTreePosition(db, matrixId, b, { parentKey: aKey })
    const c = insertDataRow(db, matrixId, { label: makeLabel('C'), content: null })
    createTreePosition(db, matrixId, c, { parentKey: bKey })

    const rows = runQuery(buildAncestryForRowsQuery(matrixId, [c]))
    // C's chain is [A (depth 2), B (depth 1)] ordered shallowest-first.
    expect(rows.map((r) => r.row_id)).toEqual([a, b])
    expect(rows.every((r) => r.for_row_id === c)).toBe(true)
    expect(rows[0]!.label).toContain('A')
    expect(rows[1]!.label).toContain('B')
  })

  test('returns chains for multiple descendants in one query', () => {
    const a = insertDataRow(db, matrixId, { label: makeLabel('A'), content: null })
    const aKey = createTreePosition(db, matrixId, a)
    const b = insertDataRow(db, matrixId, { label: makeLabel('B'), content: null })
    const bKey = createTreePosition(db, matrixId, b, { parentKey: aKey })
    const c = insertDataRow(db, matrixId, { label: makeLabel('C'), content: null })
    createTreePosition(db, matrixId, c, { parentKey: bKey })

    const rows = runQuery(buildAncestryForRowsQuery(matrixId, [b, c]))
    const forB = rows.filter((r) => r.for_row_id === b).map((r) => r.row_id)
    const forC = rows.filter((r) => r.for_row_id === c).map((r) => r.row_id)
    expect(forB).toEqual([a])
    expect(forC).toEqual([a, b])
  })

  test('returns no rows for a top-level descendant', () => {
    const a = insertDataRow(db, matrixId, { label: makeLabel('A'), content: null })
    createTreePosition(db, matrixId, a)

    const rows = runQuery(buildAncestryForRowsQuery(matrixId, [a]))
    expect(rows).toHaveLength(0)
  })
})

// -- Single row query ---------------------------------------------------------

describe('Workspace single row query', () => {
  let db: Database
  let matrixId: number

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    matrixId = createMatrix(db, 'Workspace', [
      { name: 'label', type: 'TEXT', role: 'label' },
      { name: 'content', type: 'TEXT', role: 'content' },
    ])
    ensureTrait(db, 'rank', matrixId)
  })

  test('returns a single row by ID with all columns', () => {
    const labelJson = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test' }] }],
    })
    const contentJson = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body text' }] }],
    })
    const rowId = insertDataRow(db, matrixId, { label: labelJson, content: contentJson })

    const sql = buildSingleRowQuery(matrixId, rowId)
    const stmt = db.prepare(sql)
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { id: number; label: string; content: string }
    stmt.finalize()

    expect(row.id).toBe(rowId)
    expect(row.label).toBe(labelJson)
    expect(row.content).toBe(contentJson)
  })

  test('returns correct SQL with matrix and row IDs', () => {
    const sql = buildSingleRowQuery(42, 7)
    expect(sql).toContain('mx_42_data')
    expect(sql).toContain('WHERE d.id = 7')
  })
})

// -- Backlinks query ----------------------------------------------------------

describe('Workspace backlinks query', () => {
  let db: Database
  let matrixId: number

  const makeLabel = (text: string) =>
    JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    })

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    matrixId = createMatrix(db, 'Workspace', [
      { name: 'label', type: 'TEXT', role: 'label' },
      { name: 'content', type: 'TEXT', role: 'content' },
    ])
    ensureTrait(db, 'rank', matrixId)
  })

  test('returns backlinks with label and kind', () => {
    const src1 = insertDataRow(db, matrixId, { label: makeLabel('Alpha'), content: null })
    createTreePosition(db, matrixId, src1)

    const src2 = insertDataRow(db, matrixId, { label: makeLabel('Beta'), content: null })
    createTreePosition(db, matrixId, src2)

    const target = insertDataRow(db, matrixId, { label: makeLabel('Target'), content: null })
    createTreePosition(db, matrixId, target)

    insertJoin(db, matrixId, src1, matrixId, target, 'ref')
    insertJoin(db, matrixId, src2, matrixId, target, 'own')

    const sql = buildBacklinksQuery(matrixId, target)
    const stmt = db.prepare(sql)
    const results: { id: number; kind: string; label: string }[] = []
    while (stmt.step()) {
      results.push(stmt.get({}) as unknown as { id: number; kind: string; label: string })
    }
    stmt.finalize()

    expect(results).toHaveLength(2)
    const alpha = results.find((r) => r.id === src1)
    const beta = results.find((r) => r.id === src2)
    expect(alpha?.kind).toBe('ref')
    expect(alpha?.label).toContain('Alpha')
    expect(beta?.kind).toBe('own')
    expect(beta?.label).toContain('Beta')
  })

  test('returns empty results when no backlinks exist', () => {
    const row = insertDataRow(db, matrixId, { label: makeLabel('Alone'), content: null })
    createTreePosition(db, matrixId, row)

    const sql = buildBacklinksQuery(matrixId, row)
    const stmt = db.prepare(sql)
    const results: unknown[] = []
    while (stmt.step()) {
      results.push(stmt.get({}))
    }
    stmt.finalize()

    expect(results).toHaveLength(0)
  })
})
