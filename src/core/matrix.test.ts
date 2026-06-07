import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  initMatrixSchema,
  createMatrix,
  addSampleRowsToMatrix,
  insertDataRow,
  insertRow,
  deleteRow,
  updateRow,
  ensureRootMatrix,
  insertJoin,
  deleteJoin,
  getTargets,
  getSources,
  createRefJoin,
  createDependentRow,
  deleteOwnedTarget,
  deleteJoinByTarget,
  removeInlineRefFromDoc,
  getColumns,
  addColumn,
  addFormulaColumn,
  removeColumn,
  renameColumn,
  reorderColumns,
  updateColumnRole,
  renameMatrix,
  getOrCreateDeviceId,
  resetDeviceIdCache,
  ConstraintViolationError,
  ROOT_MATRIX_ID,
  ROOT_ROW_ID,
} from './matrix'
import {
  createTreePosition,
  reparentRow,
  deleteSubtree,
  getOwnChildren,
  getOwnEdge,
  type NodeRef,
} from './tree'
import { ensureTrait } from './traits'

/** Create a matrix with default rank + closure traits provisioned. */
const createMatrixWithTraits = (
  db: Database,
  title: string,
  columns?: { name: string; type: string }[],
): number => {
  const matrixId = createMatrix(db, title, columns)
  ensureTrait(db, 'rank', matrixId)
  ensureTrait(db, 'closure', matrixId)
  return matrixId
}

describe('Root Matrix Initialization', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {}, // Suppress logs in tests
      printErr: () => {},
    })

    // Use in-memory database for tests
    db = new sqlite3.oo1.DB(':memory:', 'c')

    // Initialize the matrix schema
    initMatrixSchema(db)
  })

  test('ensureRootMatrix should create root matrix with ID = 1', () => {
    const rootId = ensureRootMatrix(db)

    // Verify root matrix has ID = 1
    expect(rootId).toBe(1)

    // Verify the matrix exists in the database
    const checkStmt = db.prepare('SELECT id, title FROM matrix WHERE id = 1')
    expect(checkStmt.step()).toBe(true)
    const result = checkStmt.get({}) as { id: number; title: string }
    expect(result.id).toBe(1)
    expect(result.title).toBe('Root')
    checkStmt.finalize()
  })

  test('ensureRootMatrix should create data table with content column', () => {
    ensureRootMatrix(db)

    // Verify data table exists
    const dataTableExists = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='mx_1_data'`,
    )
    expect(dataTableExists.step()).toBe(true)
    dataTableExists.finalize()

    // Verify data table schema has 'id' and 'content' columns
    const schemaStmt = db.prepare(`PRAGMA table_info(mx_1_data)`)
    const columns: { name: string; type: string }[] = []
    while (schemaStmt.step()) {
      const col = schemaStmt.get({}) as { name: string; type: string }
      columns.push({ name: col.name, type: col.type })
    }
    schemaStmt.finalize()

    expect(columns).toHaveLength(2)
    expect(columns[0]).toEqual({ name: 'id', type: 'INTEGER' })
    expect(columns[1]).toEqual({ name: 'content', type: 'TEXT' })
  })

  test('ensureRootMatrix should create closure table', () => {
    ensureRootMatrix(db)

    // Verify closure table exists
    const closureTableExists = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='mx_1_closure'`,
    )
    expect(closureTableExists.step()).toBe(true)
    closureTableExists.finalize()
  })

  test('ensureRootMatrix should be idempotent', () => {
    // Call ensureRootMatrix twice
    const rootId1 = ensureRootMatrix(db)
    const rootId2 = ensureRootMatrix(db)

    // Both should return ID = 1
    expect(rootId1).toBe(1)
    expect(rootId2).toBe(1)

    // Verify only one matrix with ID = 1 exists
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM matrix WHERE id = 1')
    countStmt.step()
    const count = (countStmt.get({}) as { count: number }).count
    expect(count).toBe(1)
    countStmt.finalize()
  })
})

describe('Matrix Operations', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {}, // Suppress logs in tests
      printErr: () => {},
    })

    // Use in-memory database for tests
    db = new sqlite3.oo1.DB(':memory:', 'c')

    // Initialize the matrix schema
    initMatrixSchema(db)
  })

  test('createMatrix should create a new matrix and return its ID', () => {
    // Test creating a matrix
    const matrixId = createMatrix(db, 'Test Matrix')

    // Verify the matrix was created
    expect(matrixId).toBeTypeOf('number')
    expect(matrixId).toBeGreaterThan(0)

    // Verify the matrix exists in the database
    const checkStmt = db.prepare('SELECT id, title FROM matrix WHERE id = ?')
    checkStmt.bind([matrixId])
    expect(checkStmt.step()).toBe(true)
    const result = checkStmt.get({}) as { id: number; title: string }
    expect(result.id).toBe(matrixId)
    expect(result.title).toBe('Test Matrix')
    checkStmt.finalize()

    // Verify data table was created
    const dataTableExists = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='mx_${matrixId}_data'`,
    )
    expect(dataTableExists.step()).toBe(true)
    dataTableExists.finalize()

    // Closure table is NOT created by createMatrix -- it's created on demand via ensureTrait
    const closureTableExists = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='mx_${matrixId}_closure'`,
    )
    expect(closureTableExists.step()).toBe(false)
    closureTableExists.finalize()
  })

  test('createMatrix should handle multiple matrices', () => {
    const matrix1Id = createMatrix(db, 'First Matrix')
    const matrix2Id = createMatrix(db, 'Second Matrix')

    expect(matrix1Id).not.toBe(matrix2Id)

    // Verify both matrices exist
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM matrix')
    countStmt.step()
    const count = (countStmt.get({}) as { count: number }).count
    expect(count).toBe(2)
    countStmt.finalize()
  })

  test('addSampleRowsToMatrix should add rows with proper relationships', () => {
    const matrixId = createMatrixWithTraits(db, 'Test Matrix')

    // Add sample rows
    addSampleRowsToMatrix(db, matrixId)

    // Verify data was added to the data table
    const dataStmt = db.prepare(`SELECT COUNT(*) as count FROM "mx_${matrixId}_data"`)
    dataStmt.step()
    const dataCount = (dataStmt.get({}) as { count: number }).count
    expect(dataCount).toBeGreaterThanOrEqual(2)
    expect(dataCount).toBeLessThanOrEqual(3)
    dataStmt.finalize()

    // Verify an own-edge was created for each row.
    const edgeStmt = db.prepare(
      `SELECT COUNT(*) as count FROM joins WHERE target_matrix_id = ? AND kind = 'own'`,
    )
    edgeStmt.bind([matrixId])
    edgeStmt.step()
    const edgeCount = (edgeStmt.get({}) as { count: number }).count
    expect(edgeCount).toBe(dataCount)
    edgeStmt.finalize()
  })

  test('addSampleRowsToMatrix should create hierarchical relationships on subsequent calls', () => {
    const matrixId = createMatrixWithTraits(db, 'Test Matrix')

    // Add first batch of sample rows
    addSampleRowsToMatrix(db, matrixId)

    // Add second batch (should nest at least one row under an existing row)
    addSampleRowsToMatrix(db, matrixId)

    // A nested row is an own-edge whose source is a real row in this matrix
    // (rather than the root sentinel).
    const nestedStmt = db.prepare(
      `SELECT COUNT(*) as count FROM joins
       WHERE source_matrix_id = ? AND kind = 'own'`,
    )
    nestedStmt.bind([matrixId])
    nestedStmt.step()
    const hierarchicalCount = (nestedStmt.get({}) as { count: number }).count
    expect(hierarchicalCount).toBeGreaterThan(0) // Should have some parent-child relationships
    nestedStmt.finalize()
  })
})

describe('renameMatrix', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('updates the matrix title', () => {
    const matrixId = createMatrix(db, 'Original Title')
    renameMatrix(db, matrixId, 'New Title')

    const stmt = db.prepare('SELECT title FROM matrix WHERE id = ?')
    stmt.bind([matrixId])
    expect(stmt.step()).toBe(true)
    expect((stmt.get({}) as { title: string }).title).toBe('New Title')
    stmt.finalize()
  })

  test('title is queryable after rename', () => {
    const matrixId = createMatrix(db, 'Before')
    renameMatrix(db, matrixId, 'After')

    const stmt = db.prepare('SELECT title FROM matrix WHERE id = ?')
    stmt.bind([matrixId])
    stmt.step()
    const row = stmt.get({}) as { title: string }
    stmt.finalize()
    expect(row.title).toBe('After')
  })

  test('does not affect other matrixes', () => {
    const id1 = createMatrix(db, 'Matrix A')
    const id2 = createMatrix(db, 'Matrix B')
    renameMatrix(db, id1, 'Renamed A')

    const stmt = db.prepare('SELECT title FROM matrix WHERE id = ?')
    stmt.bind([id2])
    stmt.step()
    const row = stmt.get({}) as { title: string }
    stmt.finalize()
    expect(row.title).toBe('Matrix B')
  })
})

describe('tree position (own-edges)', () => {
  let db: Database
  let matrixId: number

  const SENTINEL: NodeRef = { matrixId: ROOT_MATRIX_ID, rowId: ROOT_ROW_ID }

  type Made = { rowId: number; edgeKey: Uint8Array; ref: NodeRef }

  const makeRow = (
    title: string,
    opts: { parent?: NodeRef; prevSiblingKey?: Uint8Array; nextSiblingKey?: Uint8Array } = {},
  ): Made => {
    const rowId = insertDataRow(db, matrixId, { title })
    const edgeKey = createTreePosition(db, matrixId, rowId, {
      parent: opts.parent,
      prevSiblingKey: opts.prevSiblingKey,
      nextSiblingKey: opts.nextSiblingKey,
    })
    return { rowId, edgeKey, ref: { matrixId, rowId } }
  }

  const childRowIds = (parent: NodeRef): number[] =>
    getOwnChildren(db, parent).map((c) => c.rowId)

  const parentRefOf = (rowId: number): NodeRef | null => {
    const edge = getOwnEdge(db, matrixId, rowId)
    if (!edge) return null
    if (edge.parent.matrixId === ROOT_MATRIX_ID && edge.parent.rowId === ROOT_ROW_ID)
      return null
    return edge.parent
  }

  const edgeKeyOf = (rowId: number): Uint8Array => getOwnEdge(db, matrixId, rowId)!.edgeKey

  const dataRowCount = (): number => {
    const stmt = db.prepare(`SELECT COUNT(*) AS n FROM "mx_${matrixId}_data"`)
    stmt.step()
    const n = (stmt.get({}) as { n: number }).n
    stmt.finalize()
    return n
  }

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    matrixId = createMatrixWithTraits(db, 'Test')
  })

  // -- insert positioning ---------------------------------------------------

  test('insertRow appends top-level rows under the sentinel in order', () => {
    const a = makeRow('A')
    const b = makeRow('B', { prevSiblingKey: a.edgeKey })
    const c = makeRow('C', { prevSiblingKey: b.edgeKey })
    expect(childRowIds(SENTINEL)).toEqual([a.rowId, b.rowId, c.rowId])
  })

  test('insertRow places a row between two siblings', () => {
    const a = makeRow('A')
    const c = makeRow('C', { prevSiblingKey: a.edgeKey })
    const b = makeRow('B', { prevSiblingKey: a.edgeKey, nextSiblingKey: c.edgeKey })
    expect(childRowIds(SENTINEL)).toEqual([a.rowId, b.rowId, c.rowId])
  })

  test('insertRow nests children under a parent', () => {
    const p = makeRow('Parent')
    const c1 = makeRow('C1', { parent: p.ref })
    const c2 = makeRow('C2', { parent: p.ref, prevSiblingKey: c1.edgeKey })
    expect(childRowIds(p.ref)).toEqual([c1.rowId, c2.rowId])
    expect(parentRefOf(c1.rowId)).toEqual(p.ref)
  })

  test('the unified insertRow wrapper attaches every row to the forest', () => {
    const { rowId, edgeKey } = insertRow(db, matrixId, { values: { title: 'X' } })
    expect(edgeKey.length).toBeGreaterThan(0)
    expect(parentRefOf(rowId)).toBeNull() // top-level (sentinel)
  })

  // -- reparent -------------------------------------------------------------

  test('reparent moves a node under a new parent', () => {
    const root1 = makeRow('Root 1')
    const root2 = makeRow('Root 2', { prevSiblingKey: root1.edgeKey })
    const child = makeRow('Child', { parent: root1.ref })

    reparentRow(db, { matrixId, rowId: child.rowId, newParent: root2.ref })

    expect(childRowIds(root1.ref)).toEqual([])
    expect(childRowIds(root2.ref)).toEqual([child.rowId])
  })

  test('reparent to root makes a row top-level', () => {
    const root = makeRow('Root')
    const child = makeRow('Child', { parent: root.ref })

    reparentRow(db, { matrixId, rowId: child.rowId })

    expect(parentRefOf(child.rowId)).toBeNull()
  })

  test('reparent re-points one edge and leaves descendant keys byte-identical', () => {
    const root1 = makeRow('Root 1')
    const root2 = makeRow('Root 2', { prevSiblingKey: root1.edgeKey })
    const child = makeRow('Child', { parent: root1.ref })
    const gc = makeRow('Grandchild', { parent: child.ref })

    const gcKeyBefore = edgeKeyOf(gc.rowId)
    reparentRow(db, { matrixId, rowId: child.rowId, newParent: root2.ref })
    const gcKeyAfter = edgeKeyOf(gc.rowId)

    expect(Array.from(gcKeyAfter)).toEqual(Array.from(gcKeyBefore))
    expect(childRowIds(child.ref)).toEqual([gc.rowId])
  })

  test('reparent positions among new siblings', () => {
    const parent = makeRow('Parent')
    const c1 = makeRow('C1', { parent: parent.ref })
    const c2 = makeRow('C2', { parent: parent.ref, prevSiblingKey: c1.edgeKey })
    const loner = makeRow('Loner', { prevSiblingKey: parent.edgeKey })

    reparentRow(db, {
      matrixId,
      rowId: loner.rowId,
      newParent: parent.ref,
      prevSiblingKey: c1.edgeKey,
      nextSiblingKey: c2.edgeKey,
    })

    expect(childRowIds(parent.ref)).toEqual([c1.rowId, loner.rowId, c2.rowId])
  })

  test('reparent under own descendant throws and rolls back', () => {
    const root = makeRow('Root')
    const child = makeRow('Child', { parent: root.ref })
    const gc = makeRow('Grandchild', { parent: child.ref })

    expect(() => reparentRow(db, { matrixId, rowId: root.rowId, newParent: gc.ref })).toThrow(
      'Cannot reparent a node under one of its own descendants',
    )

    expect(parentRefOf(root.rowId)).toBeNull()
    expect(parentRefOf(child.rowId)).toEqual(root.ref)
  })

  test('reparent leaves the data table untouched', () => {
    const root1 = makeRow('Root 1')
    const root2 = makeRow('Root 2', { prevSiblingKey: root1.edgeKey })
    const child = makeRow('Child', { parent: root1.ref })

    reparentRow(db, { matrixId, rowId: child.rowId, newParent: root2.ref })

    expect(dataRowCount()).toBe(3)
  })

  // -- deleteRow (single node) ---------------------------------------------

  test('deleteRow removes a leaf', () => {
    const a = makeRow('A')
    makeRow('B', { prevSiblingKey: a.edgeKey })

    deleteRow(db, matrixId, a.rowId)

    expect(getOwnEdge(db, matrixId, a.rowId)).toBeNull()
    expect(dataRowCount()).toBe(1)
  })

  test('deleteRow promotes children to the grandparent', () => {
    const parent = makeRow('Parent')
    const child = makeRow('Child', { parent: parent.ref })
    const gc = makeRow('Grandchild', { parent: child.ref })

    deleteRow(db, matrixId, parent.rowId)

    // child promoted to root; grandchild still under child.
    expect(parentRefOf(child.rowId)).toBeNull()
    expect(childRowIds(child.ref)).toEqual([gc.rowId])
    expect(dataRowCount()).toBe(2)
  })

  // -- deleteSubtree --------------------------------------------------------

  test('deleteSubtree removes a node and all its descendants', () => {
    const root = makeRow('Root')
    const child = makeRow('Child', { parent: root.ref })
    makeRow('GC', { parent: child.ref })

    deleteSubtree(db, { matrixId, rowId: child.rowId })

    expect(childRowIds(root.ref)).toEqual([])
    expect(dataRowCount()).toBe(1) // only root
  })

  test('deleteSubtree leaves sibling subtrees intact', () => {
    const root = makeRow('Root')
    const c1 = makeRow('C1', { parent: root.ref })
    const c2 = makeRow('C2', { parent: root.ref, prevSiblingKey: c1.edgeKey })
    makeRow('GC', { parent: c1.ref })

    deleteSubtree(db, { matrixId, rowId: c1.rowId })

    expect(childRowIds(root.ref)).toEqual([c2.rowId])
    expect(dataRowCount()).toBe(2)
  })

  // -- getOwnChildren / getOwnEdge -----------------------------------------

  test('getOwnChildren returns direct children in sibling order', () => {
    const p = makeRow('P')
    const c1 = makeRow('c1', { parent: p.ref })
    const c2 = makeRow('c2', { parent: p.ref, prevSiblingKey: c1.edgeKey })
    const c3 = makeRow('c3', { parent: p.ref, prevSiblingKey: c2.edgeKey })
    expect(childRowIds(p.ref)).toEqual([c1.rowId, c2.rowId, c3.rowId])
  })

  test('getOwnEdge returns the inbound own-edge or null for a missing row', () => {
    const p = makeRow('P')
    const c = makeRow('c', { parent: p.ref })
    expect(getOwnEdge(db, matrixId, c.rowId)?.parent).toEqual(p.ref)
    expect(getOwnEdge(db, matrixId, 999999)).toBeNull()
  })
})

describe('Join table', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })

    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('joins table and index exist after schema init', () => {
    const tableStmt = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='joins'`,
    )
    expect(tableStmt.step()).toBe(true)
    tableStmt.finalize()

    const indexStmt = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='index' AND name='joins_by_target'`,
    )
    expect(indexStmt.step()).toBe(true)
    indexStmt.finalize()
  })

  test('insertJoin creates a join and getTargets returns it', () => {
    const m1 = createMatrix(db, 'Source')
    const m2 = createMatrix(db, 'Target')

    insertJoin(db, m1, 1, m2, 10)

    const targets = getTargets(db, m1, 1)
    expect(targets).toEqual([{ targetMatrixId: m2, targetRowId: 10, kind: 'ref' }])
  })

  test('getTargets returns empty array when no joins exist', () => {
    const m1 = createMatrix(db, 'Source')
    expect(getTargets(db, m1, 1)).toEqual([])
  })

  test('getSources returns reverse lookup results', () => {
    const m1 = createMatrix(db, 'Source')
    const m2 = createMatrix(db, 'Target')

    insertJoin(db, m1, 1, m2, 10)

    const sources = getSources(db, m2, 10)
    expect(sources).toEqual([{ sourceMatrixId: m1, sourceRowId: 1, kind: 'ref' }])
  })

  test('getSources returns empty array when no joins exist', () => {
    const m2 = createMatrix(db, 'Target')
    expect(getSources(db, m2, 10)).toEqual([])
  })

  test('deleteJoin removes a join', () => {
    const m1 = createMatrix(db, 'Source')
    const m2 = createMatrix(db, 'Target')

    insertJoin(db, m1, 1, m2, 10)
    expect(getTargets(db, m1, 1)).toHaveLength(1)

    deleteJoin(db, m1, 1, m2, 10)
    expect(getTargets(db, m1, 1)).toEqual([])
    expect(getSources(db, m2, 10)).toEqual([])
  })

  test('deleteJoin on non-existent join is a no-op', () => {
    const m1 = createMatrix(db, 'Source')
    const m2 = createMatrix(db, 'Target')

    // Should not throw
    deleteJoin(db, m1, 1, m2, 10)
  })

  test('duplicate insertJoin is idempotent (no error, single row)', () => {
    const m1 = createMatrix(db, 'Source')
    const m2 = createMatrix(db, 'Target')

    insertJoin(db, m1, 1, m2, 10)
    insertJoin(db, m1, 1, m2, 10)

    const targets = getTargets(db, m1, 1)
    expect(targets).toEqual([{ targetMatrixId: m2, targetRowId: 10, kind: 'ref' }])
  })

  test('many-to-many: one source row can reference multiple targets', () => {
    const m1 = createMatrix(db, 'Notes')
    const m2 = createMatrix(db, 'Tags')
    const m3 = createMatrix(db, 'People')

    insertJoin(db, m1, 1, m2, 10)
    insertJoin(db, m1, 1, m2, 20)
    insertJoin(db, m1, 1, m3, 5)

    const targets = getTargets(db, m1, 1)
    expect(targets).toHaveLength(3)
    expect(targets).toContainEqual({ targetMatrixId: m2, targetRowId: 10, kind: 'ref' })
    expect(targets).toContainEqual({ targetMatrixId: m2, targetRowId: 20, kind: 'ref' })
    expect(targets).toContainEqual({ targetMatrixId: m3, targetRowId: 5, kind: 'ref' })
  })

  test('many-to-many: one target row can be referenced by multiple sources', () => {
    const m1 = createMatrix(db, 'Notes A')
    const m2 = createMatrix(db, 'Notes B')
    const mTag = createMatrix(db, 'Tags')

    insertJoin(db, m1, 1, mTag, 10)
    insertJoin(db, m1, 2, mTag, 10)
    insertJoin(db, m2, 5, mTag, 10)

    const sources = getSources(db, mTag, 10)
    expect(sources).toHaveLength(3)
    expect(sources).toContainEqual({ sourceMatrixId: m1, sourceRowId: 1, kind: 'ref' })
    expect(sources).toContainEqual({ sourceMatrixId: m1, sourceRowId: 2, kind: 'ref' })
    expect(sources).toContainEqual({ sourceMatrixId: m2, sourceRowId: 5, kind: 'ref' })
  })

  test('deleting one join does not affect other joins from the same source', () => {
    const m1 = createMatrix(db, 'Source')
    const m2 = createMatrix(db, 'Target')

    insertJoin(db, m1, 1, m2, 10)
    insertJoin(db, m1, 1, m2, 20)

    deleteJoin(db, m1, 1, m2, 10)

    const targets = getTargets(db, m1, 1)
    expect(targets).toEqual([{ targetMatrixId: m2, targetRowId: 20, kind: 'ref' }])
  })

  test('joins between different source rows are independent', () => {
    const m1 = createMatrix(db, 'Source')
    const m2 = createMatrix(db, 'Target')

    insertJoin(db, m1, 1, m2, 10)
    insertJoin(db, m1, 2, m2, 20)

    expect(getTargets(db, m1, 1)).toEqual([
      { targetMatrixId: m2, targetRowId: 10, kind: 'ref' },
    ])
    expect(getTargets(db, m1, 2)).toEqual([
      { targetMatrixId: m2, targetRowId: 20, kind: 'ref' },
    ])
  })

  test('insertJoin with kind = "own" persists the kind', () => {
    const m1 = createMatrix(db, 'Source')
    const m2 = createMatrix(db, 'Target')

    insertJoin(db, m1, 1, m2, 10, 'own')

    const targets = getTargets(db, m1, 1)
    expect(targets).toEqual([{ targetMatrixId: m2, targetRowId: 10, kind: 'own' }])

    const sources = getSources(db, m2, 10)
    expect(sources).toEqual([{ sourceMatrixId: m1, sourceRowId: 1, kind: 'own' }])
  })

  test('insertJoin defaults to kind = "ref"', () => {
    const m1 = createMatrix(db, 'Source')
    const m2 = createMatrix(db, 'Target')

    insertJoin(db, m1, 1, m2, 10)

    const targets = getTargets(db, m1, 1)
    expect(targets[0]!.kind).toBe('ref')
  })

  test('createRefJoin inserts a ref-kind join', () => {
    const m1 = createMatrix(db, 'Source')
    const m2 = createMatrix(db, 'Target')

    createRefJoin(db, m1, 1, m2, 10)

    const targets = getTargets(db, m1, 1)
    expect(targets).toEqual([{ targetMatrixId: m2, targetRowId: 10, kind: 'ref' }])
  })

  test('mixed ref and own joins coexist and return correct kinds', () => {
    const m1 = createMatrix(db, 'Source')
    const m2 = createMatrix(db, 'Target A')
    const m3 = createMatrix(db, 'Target B')

    insertJoin(db, m1, 1, m2, 10, 'ref')
    insertJoin(db, m1, 1, m3, 20, 'own')

    const targets = getTargets(db, m1, 1)
    expect(targets).toHaveLength(2)
    expect(targets).toContainEqual({ targetMatrixId: m2, targetRowId: 10, kind: 'ref' })
    expect(targets).toContainEqual({ targetMatrixId: m3, targetRowId: 20, kind: 'own' })
  })

  test('migration adds kind column to existing joins table', () => {
    // Simulate an old database without the kind column by verifying
    // that calling initMatrixSchema again (migration path) succeeds
    // and the kind column is functional.
    initMatrixSchema(db)

    const m1 = createMatrix(db, 'Source')
    const m2 = createMatrix(db, 'Target')
    insertJoin(db, m1, 1, m2, 10)

    const targets = getTargets(db, m1, 1)
    expect(targets[0]!.kind).toBe('ref')
  })

  test('joins table has kind column in schema', () => {
    const stmt = db.prepare(`PRAGMA table_info(joins)`)
    const columns: string[] = []
    while (stmt.step()) {
      const row = stmt.get({}) as { name: string }
      columns.push(row.name)
    }
    stmt.finalize()
    expect(columns).toContain('kind')
  })

  test('createDependentRow creates both the row and the own join atomically', () => {
    const source = createMatrix(db, 'Source', [{ name: 'title', type: 'TEXT' }])
    const target = createMatrix(db, 'Target', [{ name: 'title', type: 'TEXT' }])
    const sourceRowId = insertDataRow(db, source, { title: 'Parent' })

    const targetRowId = createDependentRow(db, source, sourceRowId, target, {
      title: 'Owned child',
    })

    expect(targetRowId).toBeGreaterThan(0)

    const dataStmt = db.prepare(`SELECT title FROM "mx_${target}_data" WHERE id = ?`)
    dataStmt.bind([targetRowId])
    expect(dataStmt.step()).toBe(true)
    expect((dataStmt.get({}) as { title: string }).title).toBe('Owned child')
    dataStmt.finalize()

    const targets = getTargets(db, source, sourceRowId)
    expect(targets).toEqual([{ targetMatrixId: target, targetRowId, kind: 'own' }])
  })

  test('deleting the source row cascade-deletes the owned target', () => {
    const source = createMatrix(db, 'Source', [{ name: 'title', type: 'TEXT' }])
    const target = createMatrix(db, 'Target', [{ name: 'title', type: 'TEXT' }])
    const sourceRowId = insertDataRow(db, source, { title: 'Parent' })
    const targetRowId = createDependentRow(db, source, sourceRowId, target, {
      title: 'Owned',
    })

    deleteRow(db, source, sourceRowId)

    const checkStmt = db.prepare(`SELECT 1 FROM "mx_${target}_data" WHERE id = ?`)
    checkStmt.bind([targetRowId])
    expect(checkStmt.step()).toBe(false)
    checkStmt.finalize()

    expect(getTargets(db, source, sourceRowId)).toEqual([])
  })

  test('deleting a source row with multiple owned targets cascades all of them', () => {
    const source = createMatrix(db, 'Source', [{ name: 'title', type: 'TEXT' }])
    const target = createMatrix(db, 'Target', [{ name: 'title', type: 'TEXT' }])
    const sourceRowId = insertDataRow(db, source, { title: 'Parent' })

    const t1 = createDependentRow(db, source, sourceRowId, target, { title: 'T1' })
    const t2 = createDependentRow(db, source, sourceRowId, target, { title: 'T2' })
    const t3 = createDependentRow(db, source, sourceRowId, target, { title: 'T3' })

    deleteRow(db, source, sourceRowId)

    for (const tid of [t1, t2, t3]) {
      const s = db.prepare(`SELECT 1 FROM "mx_${target}_data" WHERE id = ?`)
      s.bind([tid])
      expect(s.step()).toBe(false)
      s.finalize()
    }
  })

  test('recursive cascade: A owns B, B owns C; deleting A deletes B and C', () => {
    const mA = createMatrix(db, 'A', [{ name: 'title', type: 'TEXT' }])
    const mB = createMatrix(db, 'B', [{ name: 'title', type: 'TEXT' }])
    const mC = createMatrix(db, 'C', [{ name: 'title', type: 'TEXT' }])

    const rowA = insertDataRow(db, mA, { title: 'A' })
    const rowB = createDependentRow(db, mA, rowA, mB, { title: 'B' })
    const rowC = createDependentRow(db, mB, rowB, mC, { title: 'C' })

    deleteRow(db, mA, rowA)

    const checkB = db.prepare(`SELECT 1 FROM "mx_${mB}_data" WHERE id = ?`)
    checkB.bind([rowB])
    expect(checkB.step()).toBe(false)
    checkB.finalize()

    const checkC = db.prepare(`SELECT 1 FROM "mx_${mC}_data" WHERE id = ?`)
    checkC.bind([rowC])
    expect(checkC.step()).toBe(false)
    checkC.finalize()
  })

  test('deleteOwnedTarget deletes the target row and its cascades', () => {
    const source = createMatrix(db, 'Source', [{ name: 'title', type: 'TEXT' }])
    const target = createMatrix(db, 'Target', [{ name: 'title', type: 'TEXT' }])
    const sourceRowId = insertDataRow(db, source, { title: 'Parent' })
    const targetRowId = createDependentRow(db, source, sourceRowId, target, {
      title: 'Owned',
    })

    deleteJoin(db, source, sourceRowId, target, targetRowId)
    deleteOwnedTarget(db, target, targetRowId)

    const s = db.prepare(`SELECT 1 FROM "mx_${target}_data" WHERE id = ?`)
    s.bind([targetRowId])
    expect(s.step()).toBe(false)
    s.finalize()
  })

  test('deleteJoinByTarget returns the correct join info', () => {
    const source = createMatrix(db, 'Source', [{ name: 'title', type: 'TEXT' }])
    const target = createMatrix(db, 'Target', [{ name: 'title', type: 'TEXT' }])
    const sourceRowId = insertDataRow(db, source, { title: 'Parent' })
    const targetRowId = createDependentRow(db, source, sourceRowId, target, {
      title: 'Owned',
    })

    const result = deleteJoinByTarget(db, target, targetRowId)

    expect(result).toEqual({
      source_matrix_id: source,
      source_row_id: sourceRowId,
      target_matrix_id: target,
      target_row_id: targetRowId,
      kind: 'own',
    })

    expect(getTargets(db, source, sourceRowId)).toEqual([])
  })

  test('deleteJoinByTarget returns null when no own-kind join exists', () => {
    const source = createMatrix(db, 'Source', [{ name: 'title', type: 'TEXT' }])
    const target = createMatrix(db, 'Target', [{ name: 'title', type: 'TEXT' }])
    const sourceRowId = insertDataRow(db, source, { title: 'Parent' })
    const targetRowId = insertDataRow(db, target, { title: 'Target' })

    insertJoin(db, source, sourceRowId, target, targetRowId, 'ref')

    const result = deleteJoinByTarget(db, target, targetRowId)
    expect(result).toBeNull()

    expect(getTargets(db, source, sourceRowId)).toEqual([
      { targetMatrixId: target, targetRowId, kind: 'ref' },
    ])
  })

  test('single-ownership invariant: a second own-edge to the same target is rejected', () => {
    const s1 = createMatrix(db, 'Source1', [{ name: 'title', type: 'TEXT' }])
    const s2 = createMatrix(db, 'Source2', [{ name: 'title', type: 'TEXT' }])
    const target = createMatrix(db, 'Target', [{ name: 'title', type: 'TEXT' }])
    const rowS1 = insertDataRow(db, s1, { title: 'S1' })
    const rowS2 = insertDataRow(db, s2, { title: 'S2' })
    const targetRowId = insertDataRow(db, target, { title: 'T' })

    insertJoin(db, s1, rowS1, target, targetRowId, 'own')

    // The partial unique index joins_single_owner enforces single-parent at the
    // schema level: a second own-edge to the same target (from any source) is
    // a silent no-op under INSERT OR IGNORE. Only the first owner survives.
    insertJoin(db, s2, rowS2, target, targetRowId, 'own')

    const ownSources = getSources(db, target, targetRowId).filter((s) => s.kind === 'own')
    expect(ownSources).toEqual([{ sourceMatrixId: s1, sourceRowId: rowS1, kind: 'own' }])
  })

  test('ref joins are not cascade-deleted when source row is deleted', () => {
    const source = createMatrix(db, 'Source', [{ name: 'title', type: 'TEXT' }])
    const target = createMatrix(db, 'Target', [{ name: 'title', type: 'TEXT' }])
    const sourceRowId = insertDataRow(db, source, { title: 'S' })
    const targetRowId = insertDataRow(db, target, { title: 'T' })

    insertJoin(db, source, sourceRowId, target, targetRowId, 'ref')
    deleteRow(db, source, sourceRowId)

    const s = db.prepare(`SELECT 1 FROM "mx_${target}_data" WHERE id = ?`)
    s.bind([targetRowId])
    expect(s.step()).toBe(true)
    s.finalize()
  })
})

describe('Owned join lifecycle: end-to-end with PM content', () => {
  let db: Database

  const makePmDoc = (...inlineContent: unknown[]) =>
    JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: inlineContent }],
    })

  const makeTextNode = (text: string) => ({ type: 'text', text })

  const makeInlineRef = (
    targetMatrixId: number,
    targetRowId: number,
    kind: 'ref' | 'own' = 'own',
    cachedTitle = 'tag',
  ) => ({
    type: 'inlineref',
    attrs: { targetMatrixId, targetRowId, kind, cachedTitle },
  })

  const rowExists = (matrixId: number, rowId: number): boolean => {
    const s = db.prepare(`SELECT 1 FROM "mx_${matrixId}_data" WHERE id = ?`)
    s.bind([rowId])
    const exists = s.step()
    s.finalize()
    return exists
  }

  const getContent = (matrixId: number, rowId: number): string | null => {
    const s = db.prepare(`SELECT content FROM "mx_${matrixId}_data" WHERE id = ?`)
    s.bind([rowId])
    if (!s.step()) {
      s.finalize()
      return null
    }
    const row = s.get({}) as { content: string }
    s.finalize()
    return row.content
  }

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  // -- Forward lifecycle -------------------------------------------------------

  test('forward: delete source row cascade-deletes owned aspect rows', () => {
    const source = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])
    const tagA = createMatrix(db, 'TagA', [{ name: 'label', type: 'TEXT' }])
    const tagB = createMatrix(db, 'TagB', [{ name: 'label', type: 'TEXT' }])

    const aspectA = createDependentRow(db, source, 1, tagA)
    const aspectB = createDependentRow(db, source, 1, tagB)

    const doc = makePmDoc(
      makeTextNode('Hello '),
      makeInlineRef(tagA, aspectA),
      makeTextNode(' world '),
      makeInlineRef(tagB, aspectB),
    )
    insertDataRow(db, source, { content: doc })

    deleteRow(db, source, 1)

    expect(rowExists(tagA, aspectA)).toBe(false)
    expect(rowExists(tagB, aspectB)).toBe(false)
  })

  test('forward: delete source row with two tags cascade-deletes both aspect rows', () => {
    const source = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])
    const tagMx = createMatrix(db, 'Task', [{ name: 'label', type: 'TEXT' }])

    const sourceRowId = insertDataRow(db, source, { content: '{}' })
    const asp1 = createDependentRow(db, source, sourceRowId, tagMx)
    const asp2 = createDependentRow(db, source, sourceRowId, tagMx)

    expect(rowExists(tagMx, asp1)).toBe(true)
    expect(rowExists(tagMx, asp2)).toBe(true)

    deleteRow(db, source, sourceRowId)

    expect(rowExists(tagMx, asp1)).toBe(false)
    expect(rowExists(tagMx, asp2)).toBe(false)
    expect(getTargets(db, source, sourceRowId)).toEqual([])
  })

  // -- Reverse lifecycle -------------------------------------------------------

  test('reverse: delete aspect row removes inlineref node from source content', () => {
    const source = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])
    const tagMx = createMatrix(db, 'Task', [{ name: 'label', type: 'TEXT' }])

    const sourceRowId = insertDataRow(db, source, { content: '{}' })
    const aspectRowId = createDependentRow(db, source, sourceRowId, tagMx)

    const doc = makePmDoc(makeTextNode('Buy groceries '), makeInlineRef(tagMx, aspectRowId))
    updateRow(db, { matrixId: source, rowId: sourceRowId, values: { content: doc } })

    deleteRow(db, tagMx, aspectRowId)

    const updatedContent = getContent(source, sourceRowId)
    expect(updatedContent).not.toBeNull()
    const parsed = JSON.parse(updatedContent!)
    expect(parsed.type).toBe('doc')

    const paragraph = parsed.content[0]
    expect(paragraph.type).toBe('paragraph')
    const inlinerefNodes = (paragraph.content ?? []).filter(
      (n: { type: string }) => n.type === 'inlineref',
    )
    expect(inlinerefNodes).toHaveLength(0)

    const textNodes = (paragraph.content ?? []).filter(
      (n: { type: string }) => n.type === 'text',
    )
    expect(textNodes).toHaveLength(1)
    expect(textNodes[0].text).toBe('Buy groceries ')
  })

  test('reverse: remaining content is preserved when inlineref is removed', () => {
    const source = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])
    const tagMx = createMatrix(db, 'Task', [{ name: 'label', type: 'TEXT' }])

    const sourceRowId = insertDataRow(db, source, { content: '{}' })
    const aspectRowId = createDependentRow(db, source, sourceRowId, tagMx)

    const doc = makePmDoc(
      makeTextNode('Start '),
      makeInlineRef(tagMx, aspectRowId),
      makeTextNode(' end'),
    )
    updateRow(db, { matrixId: source, rowId: sourceRowId, values: { content: doc } })

    deleteRow(db, tagMx, aspectRowId)

    const parsed = JSON.parse(getContent(source, sourceRowId)!)
    const paragraph = parsed.content[0]
    const texts = (paragraph.content ?? []).map((n: { text?: string }) => n.text)
    expect(texts).toEqual(['Start ', ' end'])
  })

  test('reverse: only the matching inlineref is removed; others are preserved', () => {
    const source = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])
    const tagA = createMatrix(db, 'TagA', [{ name: 'label', type: 'TEXT' }])
    const tagB = createMatrix(db, 'TagB', [{ name: 'label', type: 'TEXT' }])

    const sourceRowId = insertDataRow(db, source, { content: '{}' })
    const aspectA = createDependentRow(db, source, sourceRowId, tagA)
    const aspectB = createDependentRow(db, source, sourceRowId, tagB)

    const doc = makePmDoc(
      makeTextNode('Hello '),
      makeInlineRef(tagA, aspectA, 'own', 'tagA'),
      makeTextNode(' middle '),
      makeInlineRef(tagB, aspectB, 'own', 'tagB'),
      makeTextNode(' end'),
    )
    updateRow(db, { matrixId: source, rowId: sourceRowId, values: { content: doc } })

    deleteRow(db, tagA, aspectA)

    const parsed = JSON.parse(getContent(source, sourceRowId)!)
    const paragraph = parsed.content[0]

    const inlinerefs = (paragraph.content ?? []).filter(
      (n: { type: string }) => n.type === 'inlineref',
    )
    expect(inlinerefs).toHaveLength(1)
    expect(inlinerefs[0].attrs.targetMatrixId).toBe(tagB)
    expect(inlinerefs[0].attrs.targetRowId).toBe(aspectB)

    expect(rowExists(tagB, aspectB)).toBe(true)
  })

  test('reverse: no-op when source has no rich text column', () => {
    const source = createMatrix(db, 'Data', [{ name: 'title', type: 'TEXT' }])
    const tagMx = createMatrix(db, 'Task', [{ name: 'label', type: 'TEXT' }])

    const sourceRowId = insertDataRow(db, source, { title: 'Hello' })
    const aspectRowId = createDependentRow(db, source, sourceRowId, tagMx)

    deleteRow(db, tagMx, aspectRowId)

    const s = db.prepare(`SELECT title FROM "mx_${source}_data" WHERE id = ?`)
    s.bind([sourceRowId])
    expect(s.step()).toBe(true)
    const row = s.get({}) as { title: string }
    s.finalize()
    expect(row.title).toBe('Hello')
  })

  test('reverse: no-op when source content has no matching inlineref', () => {
    const source = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])
    const tagMx = createMatrix(db, 'Task', [{ name: 'label', type: 'TEXT' }])

    const doc = makePmDoc(makeTextNode('Just text, no tags'))
    const sourceRowId = insertDataRow(db, source, { content: doc })
    const aspectRowId = createDependentRow(db, source, sourceRowId, tagMx)

    const originalContent = getContent(source, sourceRowId)
    deleteRow(db, tagMx, aspectRowId)

    expect(getContent(source, sourceRowId)).toBe(originalContent)
  })

  test('reverse: works with body column (notes)', () => {
    const source = createMatrix(db, 'Notes', [
      { name: 'title', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
    ])
    const tagMx = createMatrix(db, 'Task', [{ name: 'label', type: 'TEXT' }])

    const bodyDoc = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Note body ' },
            {
              type: 'inlineref',
              attrs: {
                targetMatrixId: tagMx,
                targetRowId: 999,
                kind: 'own',
                cachedTitle: 'task',
              },
            },
          ],
        },
      ],
    })
    const sourceRowId = insertDataRow(db, source, { title: 'My Note', body: bodyDoc })
    insertJoin(db, source, sourceRowId, tagMx, 999, 'own')
    insertDataRow(db, tagMx, { label: 'task instance' })

    // Use removeInlineRefFromDoc directly since the row ID (999) may not match
    // the actual inserted row — test the function in isolation
    removeInlineRefFromDoc(db, source, sourceRowId, tagMx, 999)

    const s = db.prepare(`SELECT body FROM "mx_${source}_data" WHERE id = ?`)
    s.bind([sourceRowId])
    expect(s.step()).toBe(true)
    const row = s.get({}) as { body: string }
    s.finalize()

    const parsed = JSON.parse(row.body)
    const paragraph = parsed.content[0]
    const inlinerefs = (paragraph.content ?? []).filter(
      (n: { type: string }) => n.type === 'inlineref',
    )
    expect(inlinerefs).toHaveLength(0)
  })

  // -- Recursive cascade -------------------------------------------------------

  test('recursive cascade: source owns A, A owns B; delete source deletes A and B', () => {
    const mSource = createMatrix(db, 'Source', [{ name: 'content', type: 'TEXT' }])
    const mA = createMatrix(db, 'A', [{ name: 'content', type: 'TEXT' }])
    const mB = createMatrix(db, 'B', [{ name: 'label', type: 'TEXT' }])

    const sourceRowId = insertDataRow(db, mSource, { content: '{}' })
    const rowA = createDependentRow(db, mSource, sourceRowId, mA)

    const rowB = createDependentRow(db, mA, rowA, mB)

    // A has an inlineref to B in its content
    const docA = makePmDoc(makeTextNode('A content '), makeInlineRef(mB, rowB))
    updateRow(db, { matrixId: mA, rowId: rowA, values: { content: docA } })

    deleteRow(db, mSource, sourceRowId)

    expect(rowExists(mA, rowA)).toBe(false)
    expect(rowExists(mB, rowB)).toBe(false)
  })

  // -- removeInlineRefFromDoc unit tests ---------------------------------------

  test('removeInlineRefFromDoc is a no-op for non-JSON content', () => {
    const source = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])
    const sourceRowId = insertDataRow(db, source, { content: 'plain text, not JSON' })

    removeInlineRefFromDoc(db, source, sourceRowId, 999, 888)

    expect(getContent(source, sourceRowId)).toBe('plain text, not JSON')
  })

  test('removeInlineRefFromDoc is a no-op when source row does not exist', () => {
    const source = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])

    // Should not throw
    removeInlineRefFromDoc(db, source, 999999, 1, 1)
  })
})

describe('Column schema management', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })

    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  // -- getColumns / createMatrix integration ----------------------------------

  test('createMatrix stores column definitions in registry', () => {
    const id = createMatrix(db, 'M')
    const cols = getColumns(db, id)

    expect(cols).toEqual([
      expect.objectContaining({
        name: 'title',
        type: 'TEXT',
        displayType: 'text',
        order: 0,
        options: null,
        formula: null,
      }),
    ])
    expect(cols[0]!.id).toBeGreaterThan(0)
  })

  test('createMatrix with custom columns stores them correctly', () => {
    const id = createMatrix(db, 'Custom', [
      { name: 'name', type: 'TEXT' },
      { name: 'score', type: 'INTEGER' },
      { name: 'active', type: 'INTEGER' },
    ])

    const cols = getColumns(db, id)
    expect(cols).toEqual([
      expect.objectContaining({
        name: 'name',
        type: 'TEXT',
        displayType: 'text',
        order: 0,
        options: null,
        formula: null,
      }),
      expect.objectContaining({
        name: 'score',
        type: 'INTEGER',
        displayType: 'number',
        order: 1,
        options: null,
        formula: null,
      }),
      expect.objectContaining({
        name: 'active',
        type: 'INTEGER',
        displayType: 'number',
        order: 2,
        options: null,
        formula: null,
      }),
    ])
    for (const col of cols) {
      expect(col.id).toBeGreaterThan(0)
    }
    const ids = new Set(cols.map((c) => c.id))
    expect(ids.size).toBe(3)
  })

  test('createMatrix data table schema matches registry', () => {
    const id = createMatrix(db, 'M', [
      { name: 'a', type: 'TEXT' },
      { name: 'b', type: 'INTEGER' },
    ])

    const pragmaStmt = db.prepare(`PRAGMA table_info("mx_${id}_data")`)
    const tableCols: { name: string; type: string }[] = []
    while (pragmaStmt.step()) {
      const row = pragmaStmt.get({}) as { name: string; type: string }
      tableCols.push({ name: row.name, type: row.type })
    }
    pragmaStmt.finalize()

    expect(tableCols).toEqual([
      { name: 'id', type: 'INTEGER' },
      { name: 'a', type: 'TEXT' },
      { name: 'b', type: 'INTEGER' },
    ])
  })

  test('ensureRootMatrix stores column definitions', () => {
    ensureRootMatrix(db)
    const cols = getColumns(db, 1)
    expect(cols).toEqual([
      expect.objectContaining({
        name: 'content',
        type: 'TEXT',
        displayType: 'text',
        order: 0,
        options: null,
        formula: null,
      }),
    ])
    expect(cols[0]!.id).toBeGreaterThan(0)
  })

  test('getColumns throws for non-existent matrix', () => {
    expect(() => getColumns(db, 999)).toThrow('Matrix 999 not found')
  })

  test('getColumns returns columns sorted by order', () => {
    const id = createMatrix(db, 'M')

    // Clear default column and insert out-of-order rows to verify sorting
    db.exec('DELETE FROM matrix_columns WHERE matrix_id = ?', { bind: [id] })
    db.exec(
      `INSERT INTO matrix_columns (matrix_id, name, type, "order") VALUES (?, 'z', 'TEXT', 2)`,
      { bind: [id] },
    )
    db.exec(
      `INSERT INTO matrix_columns (matrix_id, name, type, "order") VALUES (?, 'a', 'TEXT', 0)`,
      { bind: [id] },
    )
    db.exec(
      `INSERT INTO matrix_columns (matrix_id, name, type, "order") VALUES (?, 'm', 'TEXT', 1)`,
      { bind: [id] },
    )

    const cols = getColumns(db, id)
    expect(cols.map((c) => c.name)).toEqual(['a', 'm', 'z'])
  })

  // -- addColumn --------------------------------------------------------------

  test('addColumn adds column to data table and registry', () => {
    const id = createMatrix(db, 'M')

    const colId = addColumn(db, id, { name: 'notes', type: 'TEXT' })
    expect(colId).toBeGreaterThan(0)

    const cols = getColumns(db, id)
    expect(cols).toEqual([
      expect.objectContaining({
        name: 'title',
        type: 'TEXT',
        displayType: 'text',
        order: 0,
        options: null,
        formula: null,
      }),
      expect.objectContaining({
        id: colId,
        name: 'notes',
        type: 'TEXT',
        displayType: 'text',
        order: 1,
        options: null,
        formula: null,
      }),
    ])

    // Verify actual table schema
    const pragmaStmt = db.prepare(`PRAGMA table_info("mx_${id}_data")`)
    const names: string[] = []
    while (pragmaStmt.step()) {
      names.push((pragmaStmt.get({}) as { name: string }).name)
    }
    pragmaStmt.finalize()

    expect(names).toContain('notes')
  })

  test('addColumn preserves existing data', () => {
    const id = createMatrix(db, 'M')

    db.exec(`INSERT INTO "mx_${id}_data" (title) VALUES ('hello')`)

    addColumn(db, id, { name: 'extra', type: 'TEXT' })

    const stmt = db.prepare(`SELECT title, extra FROM "mx_${id}_data"`)
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { title: string; extra: string | null }
    expect(row.title).toBe('hello')
    expect(row.extra).toBeNull()
    stmt.finalize()
  })

  test('addColumn throws on duplicate column name', () => {
    const id = createMatrix(db, 'M')

    expect(() => addColumn(db, id, { name: 'title', type: 'TEXT' })).toThrow(
      'Column "title" already exists',
    )
  })

  // -- removeColumn -----------------------------------------------------------

  test('removeColumn removes column from data table and registry', () => {
    const id = createMatrix(db, 'M', [
      { name: 'a', type: 'TEXT' },
      { name: 'b', type: 'INTEGER' },
      { name: 'c', type: 'TEXT' },
    ])

    removeColumn(db, id, 'b')

    const cols = getColumns(db, id)
    expect(cols.map((c) => c.name)).toEqual(['a', 'c'])

    // Verify actual table schema
    const pragmaStmt = db.prepare(`PRAGMA table_info("mx_${id}_data")`)
    const names: string[] = []
    while (pragmaStmt.step()) {
      names.push((pragmaStmt.get({}) as { name: string }).name)
    }
    pragmaStmt.finalize()

    expect(names).toContain('a')
    expect(names).toContain('c')
    expect(names).not.toContain('b')
  })

  test('removeColumn preserves data in remaining columns', () => {
    const id = createMatrix(db, 'M', [
      { name: 'keep', type: 'TEXT' },
      { name: 'drop', type: 'TEXT' },
    ])

    db.exec(`INSERT INTO "mx_${id}_data" ("keep", "drop") VALUES ('yes', 'no')`)

    removeColumn(db, id, 'drop')

    const stmt = db.prepare(`SELECT "keep" FROM "mx_${id}_data"`)
    expect(stmt.step()).toBe(true)
    expect((stmt.get({}) as { keep: string }).keep).toBe('yes')
    stmt.finalize()
  })

  test('removeColumn throws for non-existent column', () => {
    const id = createMatrix(db, 'M')

    expect(() => removeColumn(db, id, 'nope')).toThrow('Column "nope" not found')
  })

  // -- renameColumn -----------------------------------------------------------

  test('renameColumn renames column in data table and registry', () => {
    const id = createMatrix(db, 'M')
    const originalId = getColumns(db, id)[0]!.id

    renameColumn(db, id, 'title', 'name')

    const cols = getColumns(db, id)
    expect(cols).toEqual([
      expect.objectContaining({
        id: originalId,
        name: 'name',
        type: 'TEXT',
        displayType: 'text',
        order: 0,
        options: null,
        formula: null,
      }),
    ])

    // Verify actual table schema
    const pragmaStmt = db.prepare(`PRAGMA table_info("mx_${id}_data")`)
    const names: string[] = []
    while (pragmaStmt.step()) {
      names.push((pragmaStmt.get({}) as { name: string }).name)
    }
    pragmaStmt.finalize()

    expect(names).toContain('name')
    expect(names).not.toContain('title')
  })

  test('renameColumn preserves data', () => {
    const id = createMatrix(db, 'M')

    db.exec(`INSERT INTO "mx_${id}_data" (title) VALUES ('kept')`)

    renameColumn(db, id, 'title', 'label')

    const stmt = db.prepare(`SELECT label FROM "mx_${id}_data"`)
    expect(stmt.step()).toBe(true)
    expect((stmt.get({}) as { label: string }).label).toBe('kept')
    stmt.finalize()
  })

  test('renameColumn preserves order', () => {
    const id = createMatrix(db, 'M', [
      { name: 'a', type: 'TEXT' },
      { name: 'b', type: 'TEXT' },
      { name: 'c', type: 'TEXT' },
    ])

    renameColumn(db, id, 'b', 'beta')

    const cols = getColumns(db, id)
    expect(cols.map((c) => c.name)).toEqual(['a', 'beta', 'c'])
    expect(cols[1]!.order).toBe(1)
  })

  test('renameColumn throws for non-existent old name', () => {
    const id = createMatrix(db, 'M')

    expect(() => renameColumn(db, id, 'nope', 'x')).toThrow('Column "nope" not found')
  })

  test('renameColumn throws when new name already exists', () => {
    const id = createMatrix(db, 'M', [
      { name: 'a', type: 'TEXT' },
      { name: 'b', type: 'TEXT' },
    ])

    expect(() => renameColumn(db, id, 'a', 'b')).toThrow('Column "b" already exists')
  })

  // -- Combined operations ----------------------------------------------------

  test('add then remove column round-trips cleanly', () => {
    const id = createMatrix(db, 'M')
    const originalId = getColumns(db, id)[0]!.id

    addColumn(db, id, { name: 'temp', type: 'INTEGER' })
    expect(getColumns(db, id)).toHaveLength(2)

    removeColumn(db, id, 'temp')
    expect(getColumns(db, id)).toEqual([
      expect.objectContaining({
        id: originalId,
        name: 'title',
        type: 'TEXT',
        displayType: 'text',
        order: 0,
        options: null,
        formula: null,
      }),
    ])
  })

  test('multiple addColumn calls assign incrementing order', () => {
    const id = createMatrix(db, 'M')

    addColumn(db, id, { name: 'x', type: 'TEXT' })
    addColumn(db, id, { name: 'y', type: 'INTEGER' })
    addColumn(db, id, { name: 'z', type: 'REAL' })

    const cols = getColumns(db, id)
    expect(cols.map((c) => c.order)).toEqual([0, 1, 2, 3])
    expect(cols.map((c) => c.name)).toEqual(['title', 'x', 'y', 'z'])
  })

  test('data survives add, insert, rename, remove sequence', () => {
    const id = createMatrix(db, 'M')

    addColumn(db, id, { name: 'score', type: 'INTEGER' })
    db.exec(`INSERT INTO "mx_${id}_data" (title, score) VALUES ('row1', 42)`)

    renameColumn(db, id, 'score', 'points')

    const stmt1 = db.prepare(`SELECT title, points FROM "mx_${id}_data"`)
    expect(stmt1.step()).toBe(true)
    const r1 = stmt1.get({}) as { title: string; points: number }
    expect(r1.title).toBe('row1')
    expect(r1.points).toBe(42)
    stmt1.finalize()

    addColumn(db, id, { name: 'tag', type: 'TEXT' })
    removeColumn(db, id, 'tag')

    const stmt2 = db.prepare(`SELECT title, points FROM "mx_${id}_data"`)
    expect(stmt2.step()).toBe(true)
    const r2 = stmt2.get({}) as { title: string; points: number }
    expect(r2.title).toBe('row1')
    expect(r2.points).toBe(42)
    stmt2.finalize()
  })
})

// ---------------------------------------------------------------------------
// Column stable IDs (Phase 5b stage 1)
// ---------------------------------------------------------------------------
describe('Column stable IDs', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })

    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('createMatrix assigns unique non-zero IDs to each column', () => {
    const id = createMatrix(db, 'M', [
      { name: 'a', type: 'TEXT' },
      { name: 'b', type: 'INTEGER' },
      { name: 'c', type: 'TEXT' },
    ])
    const cols = getColumns(db, id)
    expect(cols).toHaveLength(3)
    for (const col of cols) {
      expect(col.id).toBeGreaterThan(0)
    }
    const ids = new Set(cols.map((c) => c.id))
    expect(ids.size).toBe(3)
  })

  test('column ID is preserved across renameColumn', () => {
    const id = createMatrix(db, 'M')
    const before = getColumns(db, id)
    const originalId = before[0]!.id

    renameColumn(db, id, 'title', 'label')

    const after = getColumns(db, id)
    expect(after[0]!.id).toBe(originalId)
    expect(after[0]!.name).toBe('label')
  })

  test('column ID returned by getColumns matches what was assigned', () => {
    const id = createMatrix(db, 'M')
    const cols = getColumns(db, id)
    expect(cols[0]!.id).toEqual(expect.any(Number))
    expect(cols[0]!.id).toBeGreaterThan(0)
  })

  test('addColumn assigns a new unique ID', () => {
    const id = createMatrix(db, 'M')
    const before = getColumns(db, id)
    const existingIds = new Set(before.map((c) => c.id))

    const newColId = addColumn(db, id, { name: 'extra', type: 'TEXT' })
    expect(newColId).toBeGreaterThan(0)
    expect(existingIds.has(newColId)).toBe(false)

    const after = getColumns(db, id)
    const extraCol = after.find((c) => c.name === 'extra')
    expect(extraCol!.id).toBe(newColId)
  })

  test('addFormulaColumn assigns a new unique ID', () => {
    const id = createMatrix(db, 'M')
    const before = getColumns(db, id)
    const existingIds = new Set(before.map((c) => c.id))

    const newColId = addFormulaColumn(db, id, 'computed', 'length(title)')
    expect(newColId).toBeGreaterThan(0)
    expect(existingIds.has(newColId)).toBe(false)

    const after = getColumns(db, id)
    const computedCol = after.find((c) => c.name === 'computed')
    expect(computedCol!.id).toBe(newColId)
  })

  test('no regression: existing column operations work with stable IDs', () => {
    const id = createMatrix(db, 'M', [
      { name: 'first', type: 'TEXT' },
      { name: 'second', type: 'INTEGER' },
    ])

    // Add
    const thirdId = addColumn(db, id, { name: 'third', type: 'TEXT' })
    expect(getColumns(db, id)).toHaveLength(3)

    // Remove
    removeColumn(db, id, 'second')
    const afterRemove = getColumns(db, id)
    expect(afterRemove).toHaveLength(2)
    expect(afterRemove.map((c) => c.name)).toEqual(['first', 'third'])

    // Rename preserves ID
    const firstId = afterRemove[0]!.id
    renameColumn(db, id, 'first', 'primary')
    const afterRename = getColumns(db, id)
    expect(afterRename[0]!.id).toBe(firstId)
    expect(afterRename[0]!.name).toBe('primary')

    // The added column still has its original ID
    expect(afterRename[1]!.id).toBe(thirdId)

    // Reorder doesn't affect IDs
    reorderColumns(db, id, ['third', 'primary'])
    const afterReorder = getColumns(db, id)
    expect(afterReorder[0]!.name).toBe('third')
    expect(afterReorder[0]!.id).toBe(thirdId)
    expect(afterReorder[1]!.name).toBe('primary')
    expect(afterReorder[1]!.id).toBe(firstId)
  })
})

// ---------------------------------------------------------------------------
// Formula columns
// ---------------------------------------------------------------------------
describe('Formula columns', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })

    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('addFormulaColumn registers a formula column in getColumns', () => {
    const id = createMatrix(db, 'M')

    const formulaColId = addFormulaColumn(db, id, 'title_len', 'length(title)')
    expect(formulaColId).toBeGreaterThan(0)

    const cols = getColumns(db, id)
    expect(cols).toEqual([
      expect.objectContaining({
        name: 'title',
        type: 'TEXT',
        displayType: 'text',
        order: 0,
        options: null,
        formula: null,
      }),
      expect.objectContaining({
        id: formulaColId,
        name: 'title_len',
        type: 'TEXT',
        displayType: 'text',
        order: 1,
        options: null,
        formula: 'length(title)',
      }),
    ])
  })

  test('formula column does not create a physical column', () => {
    const id = createMatrix(db, 'M')

    addFormulaColumn(db, id, 'computed', 'length(title)')

    const pragmaStmt = db.prepare(`PRAGMA table_info("mx_${id}_data")`)
    const names: string[] = []
    while (pragmaStmt.step()) {
      names.push((pragmaStmt.get({}) as { name: string }).name)
    }
    pragmaStmt.finalize()

    expect(names).toContain('title')
    expect(names).not.toContain('computed')
  })

  test('formula column values appear in query results', () => {
    const id = createMatrix(db, 'M')

    db.exec(`INSERT INTO "mx_${id}_data" (title) VALUES ('hello')`)
    db.exec(`INSERT INTO "mx_${id}_data" (title) VALUES ('world!')`)

    addFormulaColumn(db, id, 'title_len', 'length(title)')

    const stmt = db.prepare(
      `SELECT *, (length(title)) AS "title_len" FROM "mx_${id}_data" ORDER BY id`,
    )
    const results: { title: string; title_len: number }[] = []
    while (stmt.step()) {
      results.push(stmt.get({}) as { title: string; title_len: number })
    }
    stmt.finalize()

    expect(results[0]!.title_len).toBe(5)
    expect(results[1]!.title_len).toBe(6)
  })

  test('addFormulaColumn rejects invalid formula expressions', () => {
    const id = createMatrix(db, 'M')

    expect(() => addFormulaColumn(db, id, 'bad', 'INVALID_FUNCTION(title)')).toThrow(
      'Invalid formula expression',
    )
  })

  test('addFormulaColumn rejects duplicate name', () => {
    const id = createMatrix(db, 'M')

    expect(() => addFormulaColumn(db, id, 'title', 'length(title)')).toThrow(
      'Column "title" already exists',
    )
  })

  test('removeColumn works for formula columns', () => {
    const id = createMatrix(db, 'M')

    addFormulaColumn(db, id, 'title_len', 'length(title)')
    expect(getColumns(db, id).map((c) => c.name)).toEqual(['title', 'title_len'])

    removeColumn(db, id, 'title_len')
    expect(getColumns(db, id).map((c) => c.name)).toEqual(['title'])
  })

  test('removeColumn for formula column does not affect data table', () => {
    const id = createMatrix(db, 'M')

    db.exec(`INSERT INTO "mx_${id}_data" (title) VALUES ('keep')`)
    addFormulaColumn(db, id, 'computed', 'length(title)')
    removeColumn(db, id, 'computed')

    const stmt = db.prepare(`SELECT title FROM "mx_${id}_data"`)
    expect(stmt.step()).toBe(true)
    expect((stmt.get({}) as { title: string }).title).toBe('keep')
    stmt.finalize()
  })

  test('updateRow rejects writes to formula columns', () => {
    const id = createMatrix(db, 'M')
    const rowId = insertDataRow(db, id, { title: 'hello' })

    addFormulaColumn(db, id, 'title_len', 'length(title)')

    expect(() => updateRow(db, { matrixId: id, rowId, values: { title_len: 42 } })).toThrow(
      'Column "title_len" is a formula column and cannot be edited',
    )
  })

  test('formula with arithmetic expression', () => {
    const id = createMatrix(db, 'Prices', [
      { name: 'price', type: 'REAL' },
      { name: 'quantity', type: 'INTEGER' },
    ])

    db.exec(`INSERT INTO "mx_${id}_data" (price, quantity) VALUES (9.99, 3)`)
    db.exec(`INSERT INTO "mx_${id}_data" (price, quantity) VALUES (4.50, 10)`)

    addFormulaColumn(db, id, 'total', 'price * quantity')

    const stmt = db.prepare(
      `SELECT *, (price * quantity) AS "total" FROM "mx_${id}_data" ORDER BY id`,
    )
    const results: { total: number }[] = []
    while (stmt.step()) {
      results.push(stmt.get({}) as { total: number })
    }
    stmt.finalize()

    expect(results[0]!.total).toBeCloseTo(29.97)
    expect(results[1]!.total).toBeCloseTo(45.0)
  })

  test('formula with date expression', () => {
    const id = createMatrix(db, 'M')

    db.exec(`INSERT INTO "mx_${id}_data" (title) VALUES ('test')`)

    addFormulaColumn(db, id, 'today', "date('now')")

    const stmt = db.prepare(`SELECT (date('now')) AS "today" FROM "mx_${id}_data"`)
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { today: string }
    stmt.finalize()

    expect(row.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('insertDataRow', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('inserts a row with values and returns rowId', () => {
    const matrixId = createMatrix(db, 'M')
    const rowId = insertDataRow(db, matrixId, { title: 'Hello' })

    expect(rowId).toBeTypeOf('number')

    const stmt = db.prepare(`SELECT id, title FROM "mx_${matrixId}_data" WHERE id = ?`)
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { id: number; title: string }
    expect(row.id).toBe(rowId)
    expect(row.title).toBe('Hello')
    stmt.finalize()
  })

  test('inserts a row with no values (DEFAULT VALUES)', () => {
    const matrixId = createMatrix(db, 'M')
    const rowId = insertDataRow(db, matrixId)

    expect(rowId).toBeTypeOf('number')

    const stmt = db.prepare(`SELECT id, title FROM "mx_${matrixId}_data" WHERE id = ?`)
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { id: number; title: string | null }
    expect(row.id).toBe(rowId)
    expect(row.title).toBeNull()
    stmt.finalize()
  })

  test('inserts a row with empty values object (DEFAULT VALUES)', () => {
    const matrixId = createMatrix(db, 'M')
    const rowId = insertDataRow(db, matrixId, {})

    expect(rowId).toBeTypeOf('number')
  })

  test('inserts multiple rows with unique IDs', () => {
    const matrixId = createMatrix(db, 'M')
    const id1 = insertDataRow(db, matrixId, { title: 'First' })
    const id2 = insertDataRow(db, matrixId, { title: 'Second' })
    const id3 = insertDataRow(db, matrixId, { title: 'Third' })

    const ids = new Set([id1, id2, id3])
    expect(ids.size).toBe(3)
  })
})

describe('updateRow', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('updates a single column value', () => {
    const matrixId = createMatrix(db, 'M')
    const rowId = insertDataRow(db, matrixId, { title: 'Original' })

    updateRow(db, { matrixId, rowId, values: { title: 'Updated' } })

    const stmt = db.prepare(`SELECT title FROM "mx_${matrixId}_data" WHERE id = ?`)
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    expect((stmt.get({}) as { title: string }).title).toBe('Updated')
    stmt.finalize()
  })

  test('updates multiple columns', () => {
    const matrixId = createMatrix(db, 'M', [
      { name: 'title', type: 'TEXT' },
      { name: 'score', type: 'INTEGER' },
    ])
    const rowId = insertDataRow(db, matrixId, { title: 'Row', score: 10 })

    updateRow(db, { matrixId, rowId, values: { title: 'New', score: 99 } })

    const stmt = db.prepare(`SELECT title, score FROM "mx_${matrixId}_data" WHERE id = ?`)
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { title: string; score: number }
    expect(row.title).toBe('New')
    expect(row.score).toBe(99)
    stmt.finalize()
  })

  test('no-ops with empty values', () => {
    const matrixId = createMatrix(db, 'M')
    const rowId = insertDataRow(db, matrixId, { title: 'Stays' })

    updateRow(db, { matrixId, rowId, values: {} })

    const stmt = db.prepare(`SELECT title FROM "mx_${matrixId}_data" WHERE id = ?`)
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    expect((stmt.get({}) as { title: string }).title).toBe('Stays')
    stmt.finalize()
  })

  test('does not affect other rows', () => {
    const matrixId = createMatrix(db, 'M')
    const row1 = insertDataRow(db, matrixId, { title: 'One' })
    const row2 = insertDataRow(db, matrixId, { title: 'Two' })

    updateRow(db, { matrixId, rowId: row2, values: { title: 'Changed' } })

    const stmt = db.prepare(`SELECT title FROM "mx_${matrixId}_data" WHERE id = ?`)
    stmt.bind([row1])
    expect(stmt.step()).toBe(true)
    expect((stmt.get({}) as { title: string }).title).toBe('One')
    stmt.finalize()
  })

  test('can set a column to null', () => {
    const matrixId = createMatrix(db, 'M')
    const rowId = insertDataRow(db, matrixId, { title: 'Has value' })

    updateRow(db, { matrixId, rowId, values: { title: null } })

    const stmt = db.prepare(`SELECT title FROM "mx_${matrixId}_data" WHERE id = ?`)
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    expect((stmt.get({}) as { title: string | null }).title).toBeNull()
    stmt.finalize()
  })

  test('partial update leaves other columns unchanged', () => {
    const matrixId = createMatrix(db, 'M', [
      { name: 'title', type: 'TEXT' },
      { name: 'score', type: 'INTEGER' },
      { name: 'tag', type: 'TEXT' },
    ])
    const rowId = insertDataRow(db, matrixId, { title: 'Row', score: 10, tag: 'a' })

    updateRow(db, { matrixId, rowId, values: { score: 42 } })

    const stmt = db.prepare(`SELECT title, score, tag FROM "mx_${matrixId}_data" WHERE id = ?`)
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { title: string; score: number; tag: string }
    expect(row.title).toBe('Row')
    expect(row.score).toBe(42)
    expect(row.tag).toBe('a')
    stmt.finalize()
  })

  test('throws on unknown column name', () => {
    const matrixId = createMatrix(db, 'M')
    const rowId = insertDataRow(db, matrixId, { title: 'Row' })

    expect(() => updateRow(db, { matrixId, rowId, values: { nonexistent: 'x' } })).toThrow(
      'Column "nonexistent" does not exist in matrix',
    )
  })

  test('throws when any one of multiple columns is unknown', () => {
    const matrixId = createMatrix(db, 'M')
    const rowId = insertDataRow(db, matrixId, { title: 'Row' })

    expect(() =>
      updateRow(db, { matrixId, rowId, values: { title: 'ok', ghost: 'bad' } }),
    ).toThrow('Column "ghost" does not exist in matrix')
  })
})

describe('Content column and row data model', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    ensureRootMatrix(db)
  })

  const EMPTY_DOC = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })

  test('insertDataRow with no content produces null content', () => {
    const rowId = insertDataRow(db, 1)

    const stmt = db.prepare('SELECT content FROM "mx_1_data" WHERE id = ?')
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    expect((stmt.get({}) as { content: string | null }).content).toBeNull()
    stmt.finalize()
  })

  test('insertDataRow with explicit content stores it correctly', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    }
    const rowId = insertDataRow(db, 1, { content: JSON.stringify(doc) })

    const stmt = db.prepare('SELECT content FROM "mx_1_data" WHERE id = ?')
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    const stored = (stmt.get({}) as { content: string }).content
    stmt.finalize()

    expect(JSON.parse(stored)).toEqual(doc)
  })

  test('updateRow on content column persists JSON and round-trips', () => {
    const rowId = insertDataRow(db, 1)
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Updated' }] }],
    }

    updateRow(db, { matrixId: 1, rowId, values: { content: JSON.stringify(doc) } })

    const stmt = db.prepare('SELECT content FROM "mx_1_data" WHERE id = ?')
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    const stored = (stmt.get({}) as { content: string }).content
    stmt.finalize()

    expect(JSON.parse(stored)).toEqual(doc)
  })

  test('updateRow with invalid column throws, leaving content unchanged', () => {
    const rowId = insertDataRow(db, 1, { content: EMPTY_DOC })

    expect(() => updateRow(db, { matrixId: 1, rowId, values: { badcol: 'x' } })).toThrow(
      'Column "badcol" does not exist in matrix',
    )

    // Content should be unchanged
    const stmt = db.prepare('SELECT content FROM "mx_1_data" WHERE id = ?')
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    expect((stmt.get({}) as { content: string }).content).toBe(EMPTY_DOC)
    stmt.finalize()
  })

  test('multiple update round-trips preserve latest value', () => {
    const rowId = insertDataRow(db, 1, { content: EMPTY_DOC })
    const doc1 = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'v1' }] }],
    }
    const doc2 = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'v2' }] }],
    }

    updateRow(db, { matrixId: 1, rowId, values: { content: JSON.stringify(doc1) } })
    updateRow(db, { matrixId: 1, rowId, values: { content: JSON.stringify(doc2) } })

    const stmt = db.prepare('SELECT content FROM "mx_1_data" WHERE id = ?')
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    expect(JSON.parse((stmt.get({}) as { content: string }).content)).toEqual(doc2)
    stmt.finalize()
  })
})

describe('Row operations round-trip', () => {
  let db: Database
  let matrixId: number

  const SENTINEL: NodeRef = { matrixId: ROOT_MATRIX_ID, rowId: ROOT_ROW_ID }

  type Made = { rowId: number; edgeKey: Uint8Array; ref: NodeRef }

  const makeRow = (
    title: string,
    opts: { parent?: NodeRef; prevSiblingKey?: Uint8Array } = {},
  ): Made => {
    const rowId = insertDataRow(db, matrixId, { title })
    const edgeKey = createTreePosition(db, matrixId, rowId, {
      parent: opts.parent,
      prevSiblingKey: opts.prevSiblingKey,
    })
    return { rowId, edgeKey, ref: { matrixId, rowId } }
  }

  // Preorder DFS of the own-forest, reading each row's title.
  const queryTitles = (): string[] => {
    const titles: string[] = []
    const walk = (parent: NodeRef) => {
      for (const child of getOwnChildren(db, parent)) {
        const stmt = db.prepare(`SELECT title FROM "mx_${matrixId}_data" WHERE id = ?`)
        stmt.bind([child.rowId])
        stmt.step()
        titles.push((stmt.get({}) as { title: string }).title)
        stmt.finalize()
        walk(child)
      }
    }
    walk(SENTINEL)
    return titles
  }

  const childRowIds = (parent: NodeRef): number[] =>
    getOwnChildren(db, parent).map((c) => c.rowId)

  const parentRefOf = (rowId: number): NodeRef | null => {
    const edge = getOwnEdge(db, matrixId, rowId)
    if (!edge) return null
    if (edge.parent.matrixId === ROOT_MATRIX_ID && edge.parent.rowId === ROOT_ROW_ID)
      return null
    return edge.parent
  }

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    matrixId = createMatrixWithTraits(db, 'M')
  })

  test('insert data row + own-edge, then query both', () => {
    const rowId = insertDataRow(db, matrixId, { title: 'Test entry' })
    createTreePosition(db, matrixId, rowId)

    expect(queryTitles()).toEqual(['Test entry'])
    expect(parentRefOf(rowId)).toBeNull()
  })

  test('insert → update → query reflects updated value', () => {
    const rowId = insertDataRow(db, matrixId, { title: 'Before' })
    createTreePosition(db, matrixId, rowId)

    updateRow(db, { matrixId, rowId, values: { title: 'After' } })

    expect(queryTitles()).toEqual(['After'])
  })

  test('insert → reparent → query reflects new structure', () => {
    const parent = makeRow('Parent')
    const child = makeRow('Child', { prevSiblingKey: parent.edgeKey })

    reparentRow(db, { matrixId, rowId: child.rowId, newParent: parent.ref })

    expect(queryTitles()).toEqual(['Parent', 'Child'])
    expect(childRowIds(parent.ref)).toEqual([child.rowId])
  })

  // -- deleteRow (promotes children, then removes the node) --

  test('deleteRow on a leaf node just removes it', () => {
    const row1 = makeRow('Row 1')
    makeRow('Row 2', { prevSiblingKey: row1.edgeKey })

    deleteRow(db, matrixId, row1.rowId)

    expect(queryTitles()).toEqual(['Row 2'])
  })

  test('deleteRow re-parents children to root when deleting root parent', () => {
    const parent = makeRow('Parent')
    const child1 = makeRow('C1', { parent: parent.ref })
    makeRow('C2', { parent: parent.ref, prevSiblingKey: child1.edgeKey })

    deleteRow(db, matrixId, parent.rowId)

    expect(queryTitles()).toEqual(['C1', 'C2'])
    expect(childRowIds(SENTINEL).length).toBe(2)
  })

  test('deleteRow re-parents children to grandparent when deleting mid-level node', () => {
    const grandparent = makeRow('GP')
    const parent = makeRow('P', { parent: grandparent.ref })
    const child1 = makeRow('C1', { parent: parent.ref })
    makeRow('C2', { parent: parent.ref, prevSiblingKey: child1.edgeKey })

    deleteRow(db, matrixId, parent.rowId)

    expect(queryTitles()).toEqual(['GP', 'C1', 'C2'])
    expect(childRowIds(grandparent.ref)).toHaveLength(2)
  })

  test('deleteRow re-parents preserve children order with many children', () => {
    const parent = makeRow('P')
    const c1 = makeRow('C1', { parent: parent.ref })
    const c2 = makeRow('C2', { parent: parent.ref, prevSiblingKey: c1.edgeKey })
    const c3 = makeRow('C3', { parent: parent.ref, prevSiblingKey: c2.edgeKey })
    makeRow('C4', { parent: parent.ref, prevSiblingKey: c3.edgeKey })

    deleteRow(db, matrixId, parent.rowId)

    expect(queryTitles()).toEqual(['C1', 'C2', 'C3', 'C4'])
  })

  test('deleteRow on mid-level node preserves grandchildren under children', () => {
    const gp = makeRow('GP')
    const p = makeRow('P', { parent: gp.ref })
    const c = makeRow('C', { parent: p.ref })
    makeRow('GC', { parent: c.ref })

    deleteRow(db, matrixId, p.rowId)

    expect(queryTitles()).toEqual(['GP', 'C', 'GC'])
    expect(childRowIds(gp.ref)).toHaveLength(1)
    expect(childRowIds(c.ref)).toHaveLength(1)
  })

  test('deleteRow on node with no children and a parent leaves parent intact', () => {
    const parent = makeRow('Parent')
    const child = makeRow('Child', { parent: parent.ref })

    deleteRow(db, matrixId, child.rowId)

    expect(queryTitles()).toEqual(['Parent'])
    expect(childRowIds(parent.ref)).toHaveLength(0)
  })

  // -- deleteSubtree round-trips --

  test('insert → deleteSubtree → query reflects subtree removal', () => {
    const root1 = makeRow('Root 1')
    makeRow('Child', { parent: root1.ref })
    makeRow('Root 2', { prevSiblingKey: root1.edgeKey })

    deleteSubtree(db, { matrixId, rowId: root1.rowId })

    expect(queryTitles()).toEqual(['Root 2'])
  })

  // -- insertRow + query pattern --

  test('multiple inserts with positioning produce correct query order', () => {
    const r1 = makeRow('A')
    const r2 = makeRow('B', { prevSiblingKey: r1.edgeKey })
    makeRow('A.5', { prevSiblingKey: r1.edgeKey })
    makeRow('C', { prevSiblingKey: r2.edgeKey })

    expect(queryTitles()).toEqual(['A', 'A.5', 'B', 'C'])
  })

  test('insert child rows appear in correct query order', () => {
    const parent = makeRow('P')
    const c1 = makeRow('C1', { parent: parent.ref })
    makeRow('C2', { parent: parent.ref, prevSiblingKey: c1.edgeKey })
    makeRow('Sibling', { prevSiblingKey: parent.edgeKey })

    expect(queryTitles()).toEqual(['P', 'C1', 'C2', 'Sibling'])
  })
})

describe('Globally unique random IDs', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('matrix IDs are non-sequential positive integers', () => {
    const ids: number[] = []
    for (let i = 0; i < 10; i++) {
      ids.push(createMatrix(db, `Matrix ${i}`))
    }

    for (const id of ids) {
      expect(id).toBeGreaterThan(0)
    }

    // Verify non-sequential: not all consecutive differences are 1
    const diffs = ids.slice(1).map((id, i) => Math.abs(id - ids[i]!))
    const allSequential = diffs.every((d) => d === 1)
    expect(allSequential).toBe(false)
  })

  test('matrix IDs are unique across many creations', () => {
    const ids = new Set<number>()
    for (let i = 0; i < 100; i++) {
      ids.add(createMatrix(db, `Matrix ${i}`))
    }
    expect(ids.size).toBe(100)
  })

  test('data row IDs are non-sequential positive integers', () => {
    const matrixId = createMatrix(db, 'Test')
    const ids: number[] = []
    for (let i = 0; i < 10; i++) {
      ids.push(insertDataRow(db, matrixId, { title: `Row ${i}` }))
    }

    for (const id of ids) {
      expect(id).toBeGreaterThan(0)
    }

    const diffs = ids.slice(1).map((id, i) => Math.abs(id - ids[i]!))
    const allSequential = diffs.every((d) => d === 1)
    expect(allSequential).toBe(false)
  })

  test('bulk-create 1000 data rows with no collisions', () => {
    const matrixId = createMatrix(db, 'Bulk')
    const ids = new Set<number>()
    for (let i = 0; i < 1000; i++) {
      ids.add(insertDataRow(db, matrixId, { title: `Row ${i}` }))
    }
    expect(ids.size).toBe(1000)
  })

  test('insertDataRow with DEFAULT VALUES returns random positive ID', () => {
    const matrixId = createMatrix(db, 'Test')
    const id = insertDataRow(db, matrixId)
    expect(id).toBeGreaterThan(0)
    expect(id).toBeTypeOf('number')
  })

  test('insertDataRow with values returns random positive ID', () => {
    const matrixId = createMatrix(db, 'Test')
    const id = insertDataRow(db, matrixId, { title: 'Hello' })
    expect(id).toBeGreaterThan(0)
    expect(id).toBeTypeOf('number')
  })

  test('createMatrix returns random positive ID', () => {
    const id = createMatrix(db, 'Test')
    expect(id).toBeGreaterThan(0)
    expect(id).toBeTypeOf('number')
  })

  test('existing operations work correctly with random IDs', () => {
    const matrixId = createMatrixWithTraits(db, 'Test')

    const rowId1 = insertDataRow(db, matrixId, { title: 'Row 1' })
    const key1 = createTreePosition(db, matrixId, rowId1)
    const ref1 = { matrixId, rowId: rowId1 }

    const rowId2 = insertDataRow(db, matrixId, { title: 'Row 2' })
    createTreePosition(db, matrixId, rowId2, { prevSiblingKey: key1 })
    const ref2 = { matrixId, rowId: rowId2 }

    // Verify children and parents work
    const rowId3 = insertDataRow(db, matrixId, { title: 'Child' })
    createTreePosition(db, matrixId, rowId3, { parent: ref1 })

    expect(getOwnChildren(db, ref1)).toHaveLength(1)
    expect(getOwnEdge(db, matrixId, rowId3)).not.toBeNull()

    // Reparent
    reparentRow(db, { matrixId, rowId: rowId3, newParent: ref2 })
    expect(getOwnChildren(db, ref1)).toHaveLength(0)
    expect(getOwnChildren(db, ref2)).toHaveLength(1)

    // Delete
    deleteRow(db, matrixId, rowId3)
    expect(getOwnChildren(db, ref2)).toHaveLength(0)
  })

  test('outline query works with random IDs', () => {
    const matrixId = createMatrixWithTraits(db, 'Test')

    const rowId1 = insertDataRow(db, matrixId, { title: 'Parent' })
    const key1 = createTreePosition(db, matrixId, rowId1)

    const rowId2 = insertDataRow(db, matrixId, { title: 'Child' })
    createTreePosition(db, matrixId, rowId2, { parent: { matrixId, rowId: rowId1 } })

    const rowId3 = insertDataRow(db, matrixId, { title: 'Sibling' })
    createTreePosition(db, matrixId, rowId3, { prevSiblingKey: key1 })

    // Preorder DFS of the own-forest.
    const titles: string[] = []
    const walk = (parent: { matrixId: number; rowId: number }) => {
      for (const child of getOwnChildren(db, parent)) {
        const stmt = db.prepare(`SELECT title FROM "mx_${matrixId}_data" WHERE id = ?`)
        stmt.bind([child.rowId])
        stmt.step()
        titles.push((stmt.get({}) as { title: string }).title)
        stmt.finalize()
        walk(child)
      }
    }
    walk({ matrixId: ROOT_MATRIX_ID, rowId: ROOT_ROW_ID })

    expect(titles).toEqual(['Parent', 'Child', 'Sibling'])
  })

  test('addSampleRowsToMatrix works with random IDs', () => {
    const matrixId = createMatrixWithTraits(db, 'Test')
    addSampleRowsToMatrix(db, matrixId)

    const dataStmt = db.prepare(`SELECT COUNT(*) as count FROM "mx_${matrixId}_data"`)
    dataStmt.step()
    const count = (dataStmt.get({}) as { count: number }).count
    expect(count).toBeGreaterThanOrEqual(2)
    dataStmt.finalize()
  })

  test('ensureRootMatrix still works with explicit ID 1', () => {
    const rootId = ensureRootMatrix(db)
    expect(rootId).toBe(1)

    const rowId = insertDataRow(db, 1, { content: 'test' })
    expect(rowId).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Device identity
// ---------------------------------------------------------------------------
describe('Device identity', () => {
  let db: Database

  beforeEach(async () => {
    resetDeviceIdCache()

    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('generates a device ID on first init', () => {
    const id = getOrCreateDeviceId(db)
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  test('device ID is a valid UUID', () => {
    const id = getOrCreateDeviceId(db)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    expect(id).toMatch(uuidRegex)
  })

  test('device ID persists across re-init calls', () => {
    const first = getOrCreateDeviceId(db)

    // Clear the in-process cache so the next call must read from DB
    resetDeviceIdCache()

    // Re-run schema init (idempotent CREATE IF NOT EXISTS)
    initMatrixSchema(db)

    const second = getOrCreateDeviceId(db)
    expect(second).toBe(first)
  })

  test('device ID is stored in _sync_state table', () => {
    const id = getOrCreateDeviceId(db)

    const stmt = db.prepare("SELECT value FROM _sync_state WHERE key = 'device_id'")
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { value: string }
    stmt.finalize()

    expect(row.value).toBe(id)
  })

  test('in-process cache returns same value without DB round-trip', () => {
    const first = getOrCreateDeviceId(db)
    const second = getOrCreateDeviceId(db)
    expect(second).toBe(first)
  })
})

// ---------------------------------------------------------------------------
// Column constraints
// ---------------------------------------------------------------------------
describe('Column constraints', () => {
  let db: Database

  beforeEach(async () => {
    resetDeviceIdCache()
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('createMatrix with NOT NULL constraint rejects null inserts', () => {
    const id = createMatrix(db, 'Constrained', [
      { name: 'title', type: 'TEXT', constraints: 'NOT NULL' },
    ])
    expect(() => insertDataRow(db, id, { title: null })).toThrow(ConstraintViolationError)
  })

  test('createMatrix with UNIQUE constraint rejects duplicate inserts', () => {
    const id = createMatrix(db, 'Unique', [
      { name: 'code', type: 'TEXT', constraints: 'UNIQUE' },
    ])
    insertDataRow(db, id, { code: 'AAA' })
    expect(() => insertDataRow(db, id, { code: 'AAA' })).toThrow(ConstraintViolationError)
  })

  test('createMatrix stores constraints in matrix_columns', () => {
    const id = createMatrix(db, 'WithConstraints', [
      { name: 'name', type: 'TEXT', constraints: 'NOT NULL UNIQUE COLLATE NOCASE' },
      { name: 'value', type: 'INTEGER' },
    ])
    const cols = getColumns(db, id)
    expect(cols[0]!.constraints).toBe('NOT NULL UNIQUE COLLATE NOCASE')
    expect(cols[1]!.constraints).toBeNull()
  })

  test('addColumn stores constraints in matrix_columns metadata', () => {
    // SQLite ALTER TABLE ADD COLUMN doesn't support UNIQUE/NOT NULL, so
    // addColumn only stores the constraint in matrix_columns for reference.
    const id = createMatrix(db, 'Base', [{ name: 'title', type: 'TEXT' }])
    addColumn(db, id, { name: 'code', type: 'TEXT', constraints: 'UNIQUE' })

    const cols = getColumns(db, id)
    const codeCol = cols.find((c) => c.name === 'code')!
    expect(codeCol.constraints).toBe('UNIQUE')
  })

  test('updateRow throws ConstraintViolationError on UNIQUE violation', () => {
    const id = createMatrix(db, 'U', [{ name: 'code', type: 'TEXT', constraints: 'UNIQUE' }])
    const r1 = insertDataRow(db, id, { code: 'A' })
    insertDataRow(db, id, { code: 'B' })
    expect(() => updateRow(db, { matrixId: id, rowId: r1, values: { code: 'B' } })).toThrow(
      ConstraintViolationError,
    )
  })

  test('COLLATE NOCASE UNIQUE rejects case-variant duplicates', () => {
    const id = createMatrix(db, 'CaseInsensitive', [
      { name: 'name', type: 'TEXT', constraints: 'NOT NULL UNIQUE COLLATE NOCASE' },
    ])
    insertDataRow(db, id, { name: 'Alpha' })
    expect(() => insertDataRow(db, id, { name: 'alpha' })).toThrow(ConstraintViolationError)
    expect(() => insertDataRow(db, id, { name: 'ALPHA' })).toThrow(ConstraintViolationError)
  })
})

// ---------------------------------------------------------------------------
// addColumn with role
// ---------------------------------------------------------------------------
describe('addColumn with role', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm()
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    resetDeviceIdCache()
  })

  test('addColumn with role: label succeeds and getColumns returns the role', () => {
    const id = createMatrix(db, 'M', [{ name: 'title', type: 'TEXT' }])
    addColumn(db, id, { name: 'heading', type: 'TEXT', role: 'label' })

    const cols = getColumns(db, id)
    const headingCol = cols.find((c) => c.name === 'heading')!
    expect(headingCol.role).toBe('label')
  })

  test('second label column on the same matrix fails with constraint violation', () => {
    const id = createMatrix(db, 'M', [{ name: 'title', type: 'TEXT' }])
    addColumn(db, id, { name: 'heading', type: 'TEXT', role: 'label' })

    expect(() => addColumn(db, id, { name: 'alt', type: 'TEXT', role: 'label' })).toThrow()
  })

  test('addColumn with role: content succeeds alongside an existing label column', () => {
    const id = createMatrix(db, 'M', [{ name: 'title', type: 'TEXT' }])
    addColumn(db, id, { name: 'heading', type: 'TEXT', role: 'label' })
    addColumn(db, id, { name: 'body', type: 'TEXT', role: 'content' })

    const cols = getColumns(db, id)
    expect(cols.find((c) => c.name === 'body')!.role).toBe('content')
  })

  test('addColumn with no role succeeds without uniqueness conflict', () => {
    const id = createMatrix(db, 'M', [{ name: 'title', type: 'TEXT' }])
    addColumn(db, id, { name: 'heading', type: 'TEXT', role: 'label' })
    addColumn(db, id, { name: 'extra', type: 'TEXT' })

    const cols = getColumns(db, id)
    const extraCol = cols.find((c) => c.name === 'extra')!
    expect(extraCol.role).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// updateColumnRole
// ---------------------------------------------------------------------------
describe('updateColumnRole', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm()
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    resetDeviceIdCache()
  })

  test('set a column role to label', () => {
    const id = createMatrix(db, 'M', [
      { name: 'title', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
    ])
    updateColumnRole(db, id, 'title', 'label')

    const cols = getColumns(db, id)
    expect(cols.find((c) => c.name === 'title')!.role).toBe('label')
  })

  test('change a column role from label to content', () => {
    const id = createMatrix(db, 'M', [{ name: 'title', type: 'TEXT' }])
    updateColumnRole(db, id, 'title', 'label')
    updateColumnRole(db, id, 'title', 'content')

    const cols = getColumns(db, id)
    expect(cols.find((c) => c.name === 'title')!.role).toBe('content')
  })

  test('clear a column role by setting to null', () => {
    const id = createMatrix(db, 'M', [{ name: 'title', type: 'TEXT' }])
    updateColumnRole(db, id, 'title', 'label')
    updateColumnRole(db, id, 'title', null)

    const cols = getColumns(db, id)
    expect(cols.find((c) => c.name === 'title')!.role).toBeNull()
  })

  test('setting duplicate role throws with conflicting column name', () => {
    const id = createMatrix(db, 'M', [
      { name: 'colA', type: 'TEXT' },
      { name: 'colB', type: 'TEXT' },
    ])
    updateColumnRole(db, id, 'colA', 'label')

    expect(() => updateColumnRole(db, id, 'colB', 'label')).toThrow(
      /Matrix already has a column with role 'label': colA/,
    )
  })

  test('swap roles between two columns', () => {
    const id = createMatrix(db, 'M', [
      { name: 'colA', type: 'TEXT' },
      { name: 'colB', type: 'TEXT' },
    ])
    updateColumnRole(db, id, 'colA', 'label')
    updateColumnRole(db, id, 'colB', 'content')

    // Swap: clear A, set B to label, set A to content
    updateColumnRole(db, id, 'colA', null)
    updateColumnRole(db, id, 'colB', 'label')
    updateColumnRole(db, id, 'colA', 'content')

    const cols = getColumns(db, id)
    expect(cols.find((c) => c.name === 'colA')!.role).toBe('content')
    expect(cols.find((c) => c.name === 'colB')!.role).toBe('label')
  })

  test('updateColumnRole on nonexistent column throws', () => {
    const id = createMatrix(db, 'M', [{ name: 'title', type: 'TEXT' }])

    expect(() => updateColumnRole(db, id, 'nonexistent', 'label')).toThrow(
      /Column "nonexistent" not found/,
    )
  })
})

// ---------------------------------------------------------------------------
// Plugin column ownership (managed_by)
// ---------------------------------------------------------------------------
describe('Plugin column ownership', () => {
  let db: Database

  beforeEach(async () => {
    resetDeviceIdCache()
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('createMatrix with managedBy sets managed_by on all columns', () => {
    db.exec("INSERT INTO plugins (id, name, version) VALUES ('test.plugin', 'Test', '1.0.0')")
    const id = createMatrix(db, 'Managed', [{ name: 'title', type: 'TEXT' }], {
      managedBy: 'test.plugin',
    })
    const cols = getColumns(db, id)
    expect(cols[0]!.managedBy).toBe('test.plugin')
  })

  test('createMatrix without managedBy leaves managed_by null', () => {
    const id = createMatrix(db, 'Unmanaged', [{ name: 'title', type: 'TEXT' }])
    const cols = getColumns(db, id)
    expect(cols[0]!.managedBy).toBeNull()
  })

  test('removeColumn rejects managed column without force', () => {
    db.exec("INSERT INTO plugins (id, name, version) VALUES ('test.plugin', 'Test', '1.0.0')")
    const id = createMatrix(
      db,
      'Managed',
      [
        { name: 'a', type: 'TEXT' },
        { name: 'b', type: 'TEXT' },
      ],
      { managedBy: 'test.plugin' },
    )
    expect(() => removeColumn(db, id, 'a')).toThrow('managed by plugin')
  })

  test('removeColumn succeeds on managed column with force: true', () => {
    db.exec("INSERT INTO plugins (id, name, version) VALUES ('test.plugin', 'Test', '1.0.0')")
    const id = createMatrix(
      db,
      'Managed',
      [
        { name: 'a', type: 'TEXT' },
        { name: 'b', type: 'TEXT' },
      ],
      { managedBy: 'test.plugin' },
    )
    removeColumn(db, id, 'a', { force: true })
    const cols = getColumns(db, id)
    expect(cols.map((c) => c.name)).toEqual(['b'])
  })

  test('renameColumn rejects managed column without force', () => {
    db.exec("INSERT INTO plugins (id, name, version) VALUES ('test.plugin', 'Test', '1.0.0')")
    const id = createMatrix(db, 'Managed', [{ name: 'title', type: 'TEXT' }], {
      managedBy: 'test.plugin',
    })
    expect(() => renameColumn(db, id, 'title', 'label')).toThrow('managed by plugin')
  })

  test('renameColumn succeeds on managed column with force: true', () => {
    db.exec("INSERT INTO plugins (id, name, version) VALUES ('test.plugin', 'Test', '1.0.0')")
    const id = createMatrix(db, 'Managed', [{ name: 'title', type: 'TEXT' }], {
      managedBy: 'test.plugin',
    })
    renameColumn(db, id, 'title', 'label', { force: true })
    const cols = getColumns(db, id)
    expect(cols[0]!.name).toBe('label')
  })

  test('user-added columns have null managed_by and can be removed freely', () => {
    db.exec("INSERT INTO plugins (id, name, version) VALUES ('test.plugin', 'Test', '1.0.0')")
    const id = createMatrix(db, 'Managed', [{ name: 'title', type: 'TEXT' }], {
      managedBy: 'test.plugin',
    })
    addColumn(db, id, { name: 'user_col', type: 'TEXT' })

    const cols = getColumns(db, id)
    const userCol = cols.find((c) => c.name === 'user_col')!
    expect(userCol.managedBy).toBeNull()

    removeColumn(db, id, 'user_col')
    expect(getColumns(db, id).map((c) => c.name)).toEqual(['title'])
  })

  test('user-added columns can be renamed freely', () => {
    const id = createMatrix(db, 'Base', [{ name: 'title', type: 'TEXT' }])
    addColumn(db, id, { name: 'user_col', type: 'TEXT' })
    renameColumn(db, id, 'user_col', 'renamed_col')
    const cols = getColumns(db, id)
    expect(cols.find((c) => c.name === 'renamed_col')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Tag type constraint integration
// ---------------------------------------------------------------------------
describe('Tag type constraint integration', () => {
  let db: Database

  beforeEach(async () => {
    resetDeviceIdCache()
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('tag registry matrix with NOCASE UNIQUE rejects case-insensitive duplicate names', () => {
    const registryId = createMatrix(db, 'Tag Types', [
      { name: 'name', type: 'TEXT', constraints: 'NOT NULL UNIQUE COLLATE NOCASE' },
      { name: 'matrix_id', type: 'INTEGER', constraints: 'NOT NULL' },
      { name: 'color', type: 'TEXT' },
      { name: 'icon', type: 'TEXT' },
    ])

    insertRow(db, registryId, { values: { name: 'Priority', matrix_id: 100 } })
    expect(() =>
      insertRow(db, registryId, { values: { name: 'priority', matrix_id: 200 } }),
    ).toThrow(ConstraintViolationError)
    expect(() =>
      insertRow(db, registryId, { values: { name: 'PRIORITY', matrix_id: 300 } }),
    ).toThrow(ConstraintViolationError)
  })

  test('tag registry matrix rejects null name', () => {
    const registryId = createMatrix(db, 'Tag Types', [
      { name: 'name', type: 'TEXT', constraints: 'NOT NULL UNIQUE COLLATE NOCASE' },
      { name: 'matrix_id', type: 'INTEGER', constraints: 'NOT NULL' },
    ])

    expect(() => insertRow(db, registryId, { values: { name: null, matrix_id: 100 } })).toThrow(
      ConstraintViolationError,
    )
  })
})

// Column display roles (Phase 6 stage 1)
// ---------------------------------------------------------------------------
describe('Column display roles — schema migration', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('role column exists on a fresh database', () => {
    const cols = db.exec('PRAGMA table_info(matrix_columns)', { returnValue: 'resultRows' })
    const names = cols.map((row) => row[1])
    expect(names).toContain('role')
  })

  test('migration is idempotent (initMatrixSchema runs twice without error)', () => {
    expect(() => initMatrixSchema(db)).not.toThrow()

    const cols = db.exec('PRAGMA table_info(matrix_columns)', { returnValue: 'resultRows' })
    const roleCount = cols.filter((row) => row[1] === 'role').length
    expect(roleCount).toBe(1)
  })

  test('CHECK constraint rejects invalid role values', () => {
    const matrixId = createMatrix(db, 'Test')
    expect(() =>
      db.exec(
        "INSERT INTO matrix_columns (matrix_id, name, type, display_type, \"order\", role) VALUES (?, 'extra', 'TEXT', 'text', 99, 'foo')",
        { bind: [matrixId] },
      ),
    ).toThrow()
  })

  test('CHECK constraint accepts valid role values', () => {
    const matrixId = createMatrix(db, 'Test')
    expect(() =>
      db.exec(
        "INSERT INTO matrix_columns (matrix_id, name, type, display_type, \"order\", role) VALUES (?, 'lbl', 'TEXT', 'text', 99, 'label')",
        { bind: [matrixId] },
      ),
    ).not.toThrow()
    expect(() =>
      db.exec(
        "INSERT INTO matrix_columns (matrix_id, name, type, display_type, \"order\", role) VALUES (?, 'cnt', 'TEXT', 'text', 100, 'content')",
        { bind: [matrixId] },
      ),
    ).not.toThrow()
  })

  test('partial unique index rejects a second label column in the same matrix', () => {
    const matrixId = createMatrix(db, 'Test')
    db.exec(
      "INSERT INTO matrix_columns (matrix_id, name, type, display_type, \"order\", role) VALUES (?, 'lbl', 'TEXT', 'text', 99, 'label')",
      { bind: [matrixId] },
    )
    expect(() =>
      db.exec(
        "INSERT INTO matrix_columns (matrix_id, name, type, display_type, \"order\", role) VALUES (?, 'lbl2', 'TEXT', 'text', 100, 'label')",
        { bind: [matrixId] },
      ),
    ).toThrow()
  })

  test('two different matrixes can each have a label column', () => {
    const m1 = createMatrix(db, 'M1')
    const m2 = createMatrix(db, 'M2')
    expect(() => {
      db.exec(
        "INSERT INTO matrix_columns (matrix_id, name, type, display_type, \"order\", role) VALUES (?, 'lbl', 'TEXT', 'text', 99, 'label')",
        { bind: [m1] },
      )
      db.exec(
        "INSERT INTO matrix_columns (matrix_id, name, type, display_type, \"order\", role) VALUES (?, 'lbl', 'TEXT', 'text', 99, 'label')",
        { bind: [m2] },
      )
    }).not.toThrow()
  })

  test('null roles are unrestricted (multiple columns with null role)', () => {
    const matrixId = createMatrix(db, 'Test')
    expect(() => {
      db.exec(
        "INSERT INTO matrix_columns (matrix_id, name, type, display_type, \"order\", role) VALUES (?, 'a', 'TEXT', 'text', 99, NULL)",
        { bind: [matrixId] },
      )
      db.exec(
        "INSERT INTO matrix_columns (matrix_id, name, type, display_type, \"order\", role) VALUES (?, 'b', 'TEXT', 'text', 100, NULL)",
        { bind: [matrixId] },
      )
      db.exec(
        "INSERT INTO matrix_columns (matrix_id, name, type, display_type, \"order\") VALUES (?, 'c', 'TEXT', 'text', 101)",
        { bind: [matrixId] },
      )
    }).not.toThrow()
  })
})

// Column display roles (Phase 6 stage 2)
// ---------------------------------------------------------------------------
describe('Column display roles — types and queries', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('getColumns returns role: null for columns without a role', () => {
    const matrixId = createMatrix(db, 'Test')
    const cols = getColumns(db, matrixId)
    expect(cols.length).toBeGreaterThan(0)
    for (const col of cols) {
      expect(col.role).toBeNull()
    }
  })

  test('getColumns returns the correct role when set via SQL', () => {
    const matrixId = createMatrix(db, 'Test')
    db.exec(
      "INSERT INTO matrix_columns (matrix_id, name, type, display_type, \"order\", role) VALUES (?, 'lbl', 'TEXT', 'text', 99, 'label')",
      { bind: [matrixId] },
    )
    db.exec(
      "INSERT INTO matrix_columns (matrix_id, name, type, display_type, \"order\", role) VALUES (?, 'cnt', 'TEXT', 'text', 100, 'content')",
      { bind: [matrixId] },
    )
    const cols = getColumns(db, matrixId)
    const labelCol = cols.find((c) => c.name === 'lbl')
    const contentCol = cols.find((c) => c.name === 'cnt')
    expect(labelCol?.role).toBe('label')
    expect(contentCol?.role).toBe('content')
  })

  test('ColumnDefinition shape matches getColumns result', () => {
    const matrixId = createMatrix(db, 'Test')
    const cols = getColumns(db, matrixId)
    const col = cols[0]!
    expect(col).toHaveProperty('id')
    expect(col).toHaveProperty('name')
    expect(col).toHaveProperty('type')
    expect(col).toHaveProperty('displayType')
    expect(col).toHaveProperty('order')
    expect(col).toHaveProperty('options')
    expect(col).toHaveProperty('formula')
    expect(col).toHaveProperty('constraints')
    expect(col).toHaveProperty('managedBy')
    expect(col).toHaveProperty('role')
  })
})

// Column display roles (Phase 6 stage 3)
// ---------------------------------------------------------------------------
describe('Column display roles — createMatrix stores roles', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('createMatrix stores role values for columns', () => {
    const matrixId = createMatrix(db, 'Roles Test', [
      { name: 'label', type: 'TEXT', role: 'label' },
      { name: 'content', type: 'TEXT', role: 'content' },
    ])
    const cols = getColumns(db, matrixId)
    const labelCol = cols.find((c) => c.name === 'label')
    const contentCol = cols.find((c) => c.name === 'content')
    expect(labelCol?.role).toBe('label')
    expect(contentCol?.role).toBe('content')
  })

  test('createMatrix stores null roles when no roles are specified', () => {
    const matrixId = createMatrix(db, 'No Roles', [
      { name: 'col_a', type: 'TEXT' },
      { name: 'col_b', type: 'INTEGER' },
    ])
    const cols = getColumns(db, matrixId)
    for (const col of cols) {
      expect(col.role).toBeNull()
    }
  })
})

// Column display roles (Phase 6 stage 6)
// ---------------------------------------------------------------------------
describe('Role survives column rename', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('renaming a column preserves its role', () => {
    const matrixId = createMatrix(db, 'Rename Role Test', [
      { name: 'title', type: 'TEXT', role: 'label' },
      { name: 'body', type: 'TEXT', role: 'content' },
    ])
    const colsBefore = getColumns(db, matrixId)
    const titleBefore = colsBefore.find((c) => c.name === 'title')!
    expect(titleBefore.role).toBe('label')

    renameColumn(db, matrixId, 'title', 'heading')

    const colsAfter = getColumns(db, matrixId)
    const headingAfter = colsAfter.find((c) => c.name === 'heading')!
    expect(headingAfter).toBeDefined()
    expect(headingAfter.id).toBe(titleBefore.id)
    expect(headingAfter.role).toBe('label')

    // content column should also be unaffected
    const bodyAfter = colsAfter.find((c) => c.name === 'body')!
    expect(bodyAfter.role).toBe('content')
  })
})
