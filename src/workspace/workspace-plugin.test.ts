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
import { createTreePosition, type NodeRef } from '../core/tree'
import { registerPlugin, getPlugin } from '../core/plugin'
import { registerFaceType, clearFaceTypeRegistry } from '../core/face-registry'
import { getFaceConfigsForMatrix } from '../core/face-config'
import { tableFaceTypeDefinition } from '../table/table-plugin'

import {
  workspaceFaceTypeDefinition,
  workspacePlugin,
  buildPaginatedOutlineQuery,
  buildOutlineCountQuery,
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

  test('registers the workspace plugin and creates the matrix', async () => {
    const ctx = await registerPlugin(db, testWorkspacePlugin)
    const matrixId = ctx.matrixIds['root']!

    expect(matrixId).toBeTypeOf('number')

    const plugin = getPlugin(db, 'hila.workspace')
    expect(plugin).not.toBeNull()
    expect(plugin!.name).toBe('Workspace')
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

  // Track the derived global key (gkey) the same way the read CTE does: a
  // row's gkey is its parent's gkey concatenated with its own sibling edge key.
  type WsRow = {
    rowId: number
    edgeKey: Uint8Array
    gkey: Uint8Array
    hex: string
    ref: NodeRef
  }

  const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
    const out = new Uint8Array(a.length + b.length)
    out.set(a)
    out.set(b, a.length)
    return out
  }

  const insertWorkspaceRow = (
    text: string,
    opts?: { parent?: WsRow; prevSiblingKey?: Uint8Array },
  ): WsRow => {
    const label = makeLabel(text)
    const rowId = insertDataRow(db, matrixId, { label, content: null })
    const edgeKey = createTreePosition(db, matrixId, rowId, {
      parent: opts?.parent?.ref,
      prevSiblingKey: opts?.prevSiblingKey,
    })
    const gkey = opts?.parent ? concat(opts.parent.gkey, edgeKey) : edgeKey
    return { rowId, edgeKey, gkey, hex: keyToHex(gkey), ref: { matrixId, rowId } }
  }

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    matrixId = createMatrix(db, 'Workspace', [
      { name: 'label', type: 'TEXT', role: 'label' },
      { name: 'content', type: 'TEXT', role: 'content' },
    ])
  })

  const buildTree = () => {
    const a = insertWorkspaceRow('A')
    const b = insertWorkspaceRow('B', { parent: a })
    const c = insertWorkspaceRow('C', { parent: b })
    const d = insertWorkspaceRow('D', { parent: b, prevSiblingKey: c.edgeKey })
    const e = insertWorkspaceRow('E', { parent: a, prevSiblingKey: b.edgeKey })
    const f = insertWorkspaceRow('F', { prevSiblingKey: a.edgeKey })
    const g = insertWorkspaceRow('G', { prevSiblingKey: f.edgeKey })
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
  })

  test('returns top-down ancestor chains keyed by descendant row id', () => {
    const a = insertDataRow(db, matrixId, { label: makeLabel('A'), content: null })
    createTreePosition(db, matrixId, a)
    const b = insertDataRow(db, matrixId, { label: makeLabel('B'), content: null })
    createTreePosition(db, matrixId, b, { parent: { matrixId, rowId: a } })
    const c = insertDataRow(db, matrixId, { label: makeLabel('C'), content: null })
    createTreePosition(db, matrixId, c, { parent: { matrixId, rowId: b } })

    const rows = runQuery(buildAncestryForRowsQuery(matrixId, [c]))
    // C's chain is [A (depth 0), B (depth 1)] ordered shallowest-first.
    expect(rows.map((r) => r.row_id)).toEqual([a, b])
    expect(rows.every((r) => r.for_row_id === c)).toBe(true)
    expect(rows[0]!.label).toContain('A')
    expect(rows[1]!.label).toContain('B')
  })

  test('returns chains for multiple descendants in one query', () => {
    const a = insertDataRow(db, matrixId, { label: makeLabel('A'), content: null })
    createTreePosition(db, matrixId, a)
    const b = insertDataRow(db, matrixId, { label: makeLabel('B'), content: null })
    createTreePosition(db, matrixId, b, { parent: { matrixId, rowId: a } })
    const c = insertDataRow(db, matrixId, { label: makeLabel('C'), content: null })
    createTreePosition(db, matrixId, c, { parent: { matrixId, rowId: b } })

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
  })

  test('returns ref backlinks and excludes structural own-edges', () => {
    const src1 = insertDataRow(db, matrixId, { label: makeLabel('Alpha'), content: null })
    createTreePosition(db, matrixId, src1)

    const src2 = insertDataRow(db, matrixId, { label: makeLabel('Beta'), content: null })
    createTreePosition(db, matrixId, src2)

    // target's own-edge (tree parent) is src2; src1 mentions it via a ref-edge.
    const target = insertDataRow(db, matrixId, { label: makeLabel('Target'), content: null })
    createTreePosition(db, matrixId, target, { parent: { matrixId, rowId: src2 } })
    insertJoin(db, matrixId, src1, matrixId, target, 'ref')

    const sql = buildBacklinksQuery(matrixId, target)
    const stmt = db.prepare(sql)
    const results: { id: number; kind: string; label: string }[] = []
    while (stmt.step()) {
      results.push(stmt.get({}) as unknown as { id: number; kind: string; label: string })
    }
    stmt.finalize()

    expect(results).toHaveLength(1)
    const alpha = results.find((r) => r.id === src1)
    expect(alpha?.kind).toBe('ref')
    expect(alpha?.label).toContain('Alpha')
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
