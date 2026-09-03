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
import { addPortal } from '../core/portal'
import { getGlobalKey, positionsOf } from '../core/scroll-index'
import { createViewBlock } from '../core/block-marker'
import { registerPlugin, getPlugin } from '../core/plugin'
import { registerFaceType, clearFaceTypeRegistry } from '../core/face-registry'
import { getFaceConfigsForMatrix } from '../core/face-config'
import { tableFaceTypeDefinition } from '../table/table-plugin'

import {
  workspaceFaceTypeDefinition,
  workspacePlugin,
  buildPaginatedOutlineQuery,
  buildOutlineCountQuery,
  buildHydrationQuery,
  buildAncestryForRowsQuery,
  buildChildCountQuery,
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
    matrix_id: number
    row_id: number
    depth: number
    has_children: number
    is_type_node: number
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

  test('returns all rows in pre-order with their matrix id', () => {
    const { a, b, c, d, e, f, g } = buildTree()
    const sql = buildPaginatedOutlineQuery()
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
    // Index-only window: every row carries its own matrix id (here all the
    // workspace matrix) and is not a type-node.
    expect(rows.every((r) => r.matrix_id === matrixId)).toBe(true)
    expect(rows.every((r) => r.is_type_node === 0)).toBe(true)
  })

  test('discovers a named view row without duplicating its marker in the loose outline', () => {
    const parent = insertWorkspaceRow('Parent')
    const marker = createViewBlock(db, parent.ref, 'SELECT 1 WHERE 0', 'Saved view')

    const rows = runQuery(buildPaginatedOutlineQuery())
    expect(rows.map((row) => row.row_id)).toEqual([parent.rowId])
    expect(rows[0]!.has_children).toBe(0)
    expect(runCount(buildOutlineCountQuery())).toBe(1)
    expect(
      db.selectValue(`SELECT label FROM "mx_${matrixId}_data" WHERE id = ?`, [marker.rowId]),
    ).toContain('Saved view')
  })

  test('hydration query fetches label/content for a window of row ids', () => {
    const { a, b } = buildTree()
    const stmt = db.prepare(buildHydrationQuery(matrixId, [a.rowId, b.rowId]))
    const byId = new Map<number, { label: string; content: string | null }>()
    while (stmt.step()) {
      const row = stmt.get({}) as { id: number; label: string; content: string | null }
      byId.set(row.id, { label: row.label, content: row.content })
    }
    stmt.finalize()
    expect(byId.get(a.rowId)!.label).toContain('A')
    expect(byId.get(a.rowId)!.content).toBeNull()
    expect(byId.get(b.rowId)!.label).toContain('B')
  })

  test('returns correct depth for each row', () => {
    buildTree()
    const sql = buildPaginatedOutlineQuery()
    const rows = runQuery(sql)
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 2, 1, 0, 0])
  })

  test('returns correct has_children flag', () => {
    buildTree()
    const sql = buildPaginatedOutlineQuery()
    const rows = runQuery(sql)
    expect(rows.map((r) => r.has_children)).toEqual([1, 1, 0, 0, 0, 0, 0])
  })

  test('focus root filter limits to subtree', () => {
    const { a, b, c, d, e } = buildTree()
    const sql = buildPaginatedOutlineQuery({ focusRootHex: a.hex })
    const rows = runQuery(sql)
    expect(rows.map((r) => r.row_id)).toEqual([a.rowId, b.rowId, c.rowId, d.rowId, e.rowId])
  })

  test('excludes collapsed subtree', () => {
    const { a, b, e, f, g } = buildTree()
    const sql = buildPaginatedOutlineQuery({ collapsedKeyHexes: [b.hex] })
    const rows = runQuery(sql)
    expect(rows.map((r) => r.row_id)).toEqual([a.rowId, b.rowId, e.rowId, f.rowId, g.rowId])
  })

  test('limit restricts row count', () => {
    buildTree()
    const sql = buildPaginatedOutlineQuery({ limit: 3 })
    const rows = runQuery(sql)
    expect(rows).toHaveLength(3)
  })

  test('offset skips initial rows', () => {
    const { c, d, e, f, g } = buildTree()
    const sql = buildPaginatedOutlineQuery({ limit: 10, offset: 2 })
    const rows = runQuery(sql)
    expect(rows.map((r) => r.row_id)).toEqual([c.rowId, d.rowId, e.rowId, f.rowId, g.rowId])
  })

  test('count matches window query row count', () => {
    const { a, b } = buildTree()
    const opts = { focusRootHex: a.hex, collapsedKeyHexes: [b.hex] }
    const windowRows = runQuery(buildPaginatedOutlineQuery(opts))
    const count = runCount(buildOutlineCountQuery(opts))
    expect(count).toBe(windowRows.length)
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

  type AncestorRow = {
    for_matrix_id: number
    for_row_id: number
    matrix_id: number
    row_id: number
    label: string | null
    depth: number
  }

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

    const rows = runQuery(buildAncestryForRowsQuery(matrixId, [{ matrixId, rowId: c }]))
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

    const rows = runQuery(
      buildAncestryForRowsQuery(matrixId, [
        { matrixId, rowId: b },
        { matrixId, rowId: c },
      ]),
    )
    const forB = rows.filter((r) => r.for_row_id === b).map((r) => r.row_id)
    const forC = rows.filter((r) => r.for_row_id === c).map((r) => r.row_id)
    expect(forB).toEqual([a])
    expect(forC).toEqual([a, b])
  })

  test('returns no rows for a top-level descendant', () => {
    const a = insertDataRow(db, matrixId, { label: makeLabel('A'), content: null })
    createTreePosition(db, matrixId, a)

    const rows = runQuery(buildAncestryForRowsQuery(matrixId, [{ matrixId, rowId: a }]))
    expect(rows).toHaveLength(0)
  })

  test('uses the traversed appearance key for portal ancestry', () => {
    const homeParent = insertDataRow(db, matrixId, { label: makeLabel('Home'), content: null })
    createTreePosition(db, matrixId, homeParent)
    const portalHost = insertDataRow(db, matrixId, {
      label: makeLabel('Portal host'),
      content: null,
    })
    createTreePosition(db, matrixId, portalHost)
    const target = insertDataRow(db, matrixId, { label: makeLabel('Target'), content: null })
    createTreePosition(db, matrixId, target, {
      parent: { matrixId, rowId: homeParent },
    })
    addPortal(db, { matrixId, rowId: portalHost }, { matrixId, rowId: target })

    const homeKey = getGlobalKey(db, matrixId, target)!
    const portalKey = positionsOf(db, { matrixId, rowId: target }).find(
      (position) =>
        position.key.length !== homeKey.length ||
        position.key.some((byte, index) => byte !== homeKey[index]),
    )!.key
    const rows = runQuery(
      buildAncestryForRowsQuery(matrixId, [{ matrixId, rowId: target, key: portalKey }]),
    )

    expect(rows.map((row) => row.row_id)).toEqual([portalHost])
    expect(rows[0]!.label).toContain('Portal host')
  })

  // Phase 9.5 boundary hop: a descendant in a *foreign* matrix whose own-parent is a
  // workspace bullet. The chain climbs back into the workspace matrix; workspace
  // ancestor labels resolve via the workspace-conditioned LEFT JOIN.
  test('returns the cross-matrix chain for a foreign descendant', () => {
    const a = insertDataRow(db, matrixId, { label: makeLabel('A'), content: null })
    createTreePosition(db, matrixId, a)
    const b = insertDataRow(db, matrixId, { label: makeLabel('B'), content: null })
    createTreePosition(db, matrixId, b, { parent: { matrixId, rowId: a } })

    // A foreign matrix (no `label` column) with a row owned by workspace bullet B.
    const subMatrixId = createMatrix(db, 'Sub', [
      { name: 'title', type: 'TEXT', role: 'label' },
    ])
    const t = insertDataRow(db, subMatrixId, { title: 'T' })
    createTreePosition(db, subMatrixId, t, { parent: { matrixId, rowId: b } })

    const rows = runQuery(
      buildAncestryForRowsQuery(matrixId, [{ matrixId: subMatrixId, rowId: t }]),
    )
    // T's chain is [A, B] — both workspace rows, resolved with correct labels.
    expect(rows.map((r) => ({ m: r.matrix_id, r: r.row_id }))).toEqual([
      { m: matrixId, r: a },
      { m: matrixId, r: b },
    ])
    expect(rows.every((r) => r.for_matrix_id === subMatrixId && r.for_row_id === t)).toBe(true)
    expect(rows[0]!.label).toContain('A')
    expect(rows[1]!.label).toContain('B')
  })
})

// -- Child count query --------------------------------------------------------

describe('Workspace child count query', () => {
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

  const count = (mid: number, rowId: number): number => {
    const stmt = db.prepare(buildChildCountQuery(mid, rowId))
    stmt.step()
    const cnt = (stmt.get({}) as { cnt: number }).cnt
    stmt.finalize()
    return cnt
  }

  test('counts same-matrix own-children', () => {
    const a = insertDataRow(db, matrixId, { label: null, content: null })
    createTreePosition(db, matrixId, a)
    const b = insertDataRow(db, matrixId, { label: null, content: null })
    createTreePosition(db, matrixId, b, { parent: { matrixId, rowId: a } })
    expect(count(matrixId, a)).toBe(1)
    expect(count(matrixId, b)).toBe(0)
  })

  // Phase 9.5: a boundary-hop row's children may live in another matrix; the count
  // must include them (the gated children panel is already cross-matrix).
  test('counts foreign-matrix own-children too', () => {
    const a = insertDataRow(db, matrixId, { label: null, content: null })
    createTreePosition(db, matrixId, a)
    const subMatrixId = createMatrix(db, 'Sub', [
      { name: 'title', type: 'TEXT', role: 'label' },
    ])
    const t = insertDataRow(db, subMatrixId, { title: 'T' })
    createTreePosition(db, subMatrixId, t, { parent: { matrixId, rowId: a } })
    expect(count(matrixId, a)).toBe(1)
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
