import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  initMatrixSchema,
  createMatrix,
  addSampleRowsToMatrix,
  insertDataRow,
  insertJoin,
  getColumns,
} from '../core/matrix'
import { registerPlugin, getAllPlugins } from '../core/plugin'
import { applyFaceToMatrix, getFaceConfigsForMatrix } from '../core/face-config'
import { registerFaceType, clearFaceTypeRegistry } from '../core/face-registry'
import type { PluginDefinition } from '../core/plugin-types'

afterEach(() => {
  clearFaceTypeRegistry()
})

const makePlugin = (overrides: Partial<PluginDefinition> = {}): PluginDefinition => ({
  id: 'test-plugin',
  name: 'Test Plugin',
  version: '1.0.0',
  matrixes: [],
  namedQueries: {},
  namedMutations: {},
  faceBindings: [],
  ...overrides,
})

describe('Matrix browser data queries', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  // -- Matrix listing with source_plugin_id -----------------------------------

  test('plugin-created matrixes have correct source_plugin_id', async () => {
    const def = makePlugin({
      matrixes: [{ key: 'notes', title: 'Notes', columns: [{ name: 'title', type: 'TEXT' }] }],
    })

    const ctx = await registerPlugin(db, def)
    const matrixId = ctx.matrixIds['notes']!

    const stmt = db.prepare('SELECT id, title, source_plugin_id FROM matrix WHERE id = ?')
    stmt.bind([matrixId])
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { id: number; title: string; source_plugin_id: string }
    stmt.finalize()

    expect(row.title).toBe('Notes')
    expect(row.source_plugin_id).toBe('test-plugin')
  })

  test('user-created matrixes have null source_plugin_id', () => {
    const matrixId = createMatrix(db, 'User Matrix')

    const stmt = db.prepare('SELECT id, title, source_plugin_id FROM matrix WHERE id = ?')
    stmt.bind([matrixId])
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { id: number; title: string; source_plugin_id: string | null }
    stmt.finalize()

    expect(row.source_plugin_id).toBeNull()
  })

  test('matrix listing query returns all matrixes with metadata', async () => {
    const userMatrix = createMatrix(db, 'User Tasks')
    await registerPlugin(
      db,
      makePlugin({
        matrixes: [
          { key: 'data', title: 'Plugin Data', columns: [{ name: 'val', type: 'TEXT' }] },
        ],
      }),
    )

    const stmt = db.prepare('SELECT id, title, source_plugin_id FROM matrix ORDER BY id')
    const matrices: { id: number; title: string; source_plugin_id: string | null }[] = []
    while (stmt.step()) {
      matrices.push(
        stmt.get({}) as { id: number; title: string; source_plugin_id: string | null },
      )
    }
    stmt.finalize()

    expect(matrices.length).toBe(2)
    const user = matrices.find((m) => m.id === userMatrix)!
    expect(user.source_plugin_id).toBeNull()
    const plugin = matrices.find((m) => m.id !== userMatrix)!
    expect(plugin.source_plugin_id).toBe('test-plugin')
  })

  // -- Plugin filter data -----------------------------------------------------

  test('plugins query populates filter dropdown', async () => {
    await registerPlugin(db, makePlugin({ id: 'alpha', name: 'Alpha Plugin' }))
    await registerPlugin(db, makePlugin({ id: 'beta', name: 'Beta Plugin' }))

    const plugins = getAllPlugins(db)
    expect(plugins).toHaveLength(2)
    expect(plugins.map((p) => p.name)).toEqual(['Alpha Plugin', 'Beta Plugin'])
  })

  test('own-forest edges show data after adding sample rows', () => {
    const matrixId = createMatrix(db, 'Sample Test')

    addSampleRowsToMatrix(db, matrixId)

    const edgeStmt = db.prepare(
      `SELECT source_matrix_id, source_row_id, target_row_id, edge_key FROM joins
       WHERE target_matrix_id = ? AND kind = 'own' ORDER BY edge_key`,
    )
    edgeStmt.bind([matrixId])
    const edges: unknown[] = []
    while (edgeStmt.step()) edges.push(edgeStmt.get({}))
    edgeStmt.finalize()
    expect(edges.length).toBeGreaterThan(0)
  })

  // -- Join state display -----------------------------------------------------

  test('forward and reverse joins are queryable per matrix', () => {
    const m1 = createMatrix(db, 'Source')
    const m2 = createMatrix(db, 'Target')
    const row1 = insertDataRow(db, m1, { title: 'A' })
    const row2 = insertDataRow(db, m2, { title: 'B' })

    insertJoin(db, m1, row1, m2, row2)

    const fwdStmt = db.prepare(
      'SELECT source_row_id, target_matrix_id, target_row_id FROM joins WHERE source_matrix_id = ?',
    )
    fwdStmt.bind([m1])
    const fwd: unknown[] = []
    while (fwdStmt.step()) fwd.push(fwdStmt.get({}))
    fwdStmt.finalize()
    expect(fwd).toHaveLength(1)

    const revStmt = db.prepare(
      'SELECT source_matrix_id, source_row_id, target_row_id FROM joins WHERE target_matrix_id = ?',
    )
    revStmt.bind([m2])
    const rev: unknown[] = []
    while (revStmt.step()) rev.push(revStmt.get({}))
    revStmt.finalize()
    expect(rev).toHaveLength(1)
  })

  // -- Face config display ----------------------------------------------------

  test('face configs are listed for a matrix', () => {
    registerFaceType({
      id: 'hila.table',
      name: 'Table',
      slots: [],
      overflowBehavior: 'none',
    })

    const matrixId = createMatrix(db, 'Faced')
    applyFaceToMatrix(db, 'hila.table', matrixId)

    const configs = getFaceConfigsForMatrix(db, matrixId)
    expect(configs).toHaveLength(1)
    expect(configs[0]!.faceTypeId).toBe('hila.table')
    expect(configs[0]!.matrixId).toBe(matrixId)
  })

  // -- Schema (column) display ------------------------------------------------

  test('column definitions are returned for a matrix', () => {
    const matrixId = createMatrix(db, 'Schema Test', [
      { name: 'name', type: 'TEXT' },
      { name: 'age', type: 'INTEGER' },
    ])

    const cols = getColumns(db, matrixId)
    expect(cols).toHaveLength(2)
    expect(cols[0]!.name).toBe('name')
    expect(cols[0]!.type).toBe('TEXT')
    expect(cols[1]!.name).toBe('age')
    expect(cols[1]!.type).toBe('INTEGER')
  })

  // -- Column count aggregate -------------------------------------------------

  test('column count aggregate query works', () => {
    const m1 = createMatrix(db, 'One Col')
    const m2 = createMatrix(db, 'Two Col', [
      { name: 'a', type: 'TEXT' },
      { name: 'b', type: 'TEXT' },
    ])

    const stmt = db.prepare(
      'SELECT matrix_id, COUNT(*) as col_count FROM matrix_columns GROUP BY matrix_id',
    )
    const counts = new Map<number, number>()
    while (stmt.step()) {
      const row = stmt.get({}) as { matrix_id: number; col_count: number }
      counts.set(row.matrix_id, row.col_count)
    }
    stmt.finalize()

    expect(counts.get(m1)).toBe(1)
    expect(counts.get(m2)).toBe(2)
  })

  // -- Data tab displays all rows ---------------------------------------------

  test('data table query returns all rows', () => {
    const matrixId = createMatrix(db, 'Data Test')
    insertDataRow(db, matrixId, { title: 'First' })
    insertDataRow(db, matrixId, { title: 'Second' })

    const stmt = db.prepare(`SELECT * FROM "mx_${matrixId}_data" ORDER BY id`)
    const rows: unknown[] = []
    while (stmt.step()) rows.push(stmt.get({}))
    stmt.finalize()

    expect(rows).toHaveLength(2)
  })
})
