import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  initMatrixSchema,
  getOrCreateDeviceId,
  resetDeviceIdCache,
  createMatrix,
  insertDataRow,
  updateRow,
  deleteRow,
  insertRow,
  addColumn,
  removeColumn,
  renameColumn,
  getColumns,
} from './matrix'
import { installCoreTableTriggers } from './sync'

type ChangelogEntry = {
  seq: number
  device_id: string
  timestamp: string
  table_name: string
  row_id: number
  operation: string
  data: string | null
}

describe('Change tracking infrastructure', () => {
  let db: Database
  let deviceId: string

  beforeEach(async () => {
    resetDeviceIdCache()

    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })

    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    deviceId = getOrCreateDeviceId(db)
    installCoreTableTriggers(db, deviceId)
  })

  const getChangelog = (): ChangelogEntry[] => {
    const stmt = db.prepare(
      'SELECT seq, device_id, timestamp, table_name, row_id, operation, data FROM _sync_changelog ORDER BY seq',
    )
    const entries: ChangelogEntry[] = []
    while (stmt.step()) {
      entries.push(stmt.get({}) as unknown as ChangelogEntry)
    }
    stmt.finalize()
    return entries
  }

  const clearChangelog = () => {
    db.exec('DELETE FROM _sync_changelog')
  }

  // -- _sync_changelog table existence --

  test('_sync_changelog table exists after schema init', () => {
    const stmt = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='_sync_changelog'",
    )
    expect(stmt.step()).toBe(true)
    stmt.finalize()
  })

  // -- Data table INSERT tracking --

  test('INSERT into data table logs changelog entry with correct fields', () => {
    const matrixId = createMatrix(db, 'Test')
    clearChangelog()

    const rowId = insertDataRow(db, matrixId, { title: 'Hello' })

    const log = getChangelog()
    expect(log).toHaveLength(1)

    const entry = log[0]!
    expect(entry.table_name).toBe(`mx_${matrixId}_data`)
    expect(entry.row_id).toBe(rowId)
    expect(entry.operation).toBe('INSERT')
    expect(entry.device_id).toBe(deviceId)
    expect(entry.timestamp).toBeTruthy()

    const data = JSON.parse(entry.data!) as Record<string, unknown>
    expect(data.id).toBe(rowId)
    expect(data.title).toBe('Hello')
  })

  // -- Data table UPDATE tracking --

  test('UPDATE on data table logs changelog entry with full NEW row', () => {
    const matrixId = createMatrix(db, 'Test')
    const rowId = insertDataRow(db, matrixId, { title: 'Before' })
    clearChangelog()

    updateRow(db, { matrixId, rowId, values: { title: 'After' } })

    const log = getChangelog()
    expect(log).toHaveLength(1)

    const entry = log[0]!
    expect(entry.table_name).toBe(`mx_${matrixId}_data`)
    expect(entry.row_id).toBe(rowId)
    expect(entry.operation).toBe('UPDATE')

    const data = JSON.parse(entry.data!) as Record<string, unknown>
    expect(data.id).toBe(rowId)
    expect(data.title).toBe('After')
  })

  // -- Data table DELETE tracking --

  test('DELETE on data table logs changelog entry with data=NULL', () => {
    const matrixId = createMatrix(db, 'Test')
    const rowId = insertDataRow(db, matrixId, { title: 'Doomed' })
    const key = insertRow(db, { matrixId, rowKind: 0, rowId })
    clearChangelog()

    deleteRow(db, { matrixId, key })

    const log = getChangelog()
    const deleteEntries = log.filter((e) => e.operation === 'DELETE')
    const dataDelete = deleteEntries.find((e) => e.table_name === `mx_${matrixId}_data`)

    expect(dataDelete).toBeDefined()
    expect(dataDelete!.row_id).toBe(rowId)
    expect(dataDelete!.data).toBeNull()
  })

  // -- device_id correctness --

  test('device_id in changelog matches the configured device', () => {
    const matrixId = createMatrix(db, 'Test')
    clearChangelog()

    insertDataRow(db, matrixId, { title: 'Check device' })

    const log = getChangelog()
    expect(log).toHaveLength(1)
    expect(log[0]!.device_id).toBe(deviceId)
  })

  // -- seq monotonicity --

  test('changelog seq values are monotonically increasing', () => {
    const matrixId = createMatrix(db, 'Test')
    clearChangelog()

    insertDataRow(db, matrixId, { title: 'A' })
    insertDataRow(db, matrixId, { title: 'B' })
    insertDataRow(db, matrixId, { title: 'C' })

    const log = getChangelog()
    expect(log).toHaveLength(3)
    expect(log[0]!.seq).toBeLessThan(log[1]!.seq)
    expect(log[1]!.seq).toBeLessThan(log[2]!.seq)
  })

  // -- Column change: addColumn triggers reflect new schema --

  test('addColumn reinstalls triggers so new column appears in changelog JSON', () => {
    const matrixId = createMatrix(db, 'Test')
    addColumn(db, matrixId, { name: 'score', type: 'INTEGER' })
    clearChangelog()

    const rowId = insertDataRow(db, matrixId, { title: 'Row', score: 42 })

    const log = getChangelog()
    expect(log).toHaveLength(1)

    const data = JSON.parse(log[0]!.data!) as Record<string, unknown>
    expect(data.id).toBe(rowId)
    expect(data.title).toBe('Row')
    expect(data.score).toBe(42)
  })

  // -- removeColumn triggers reflect updated schema --

  test('removeColumn reinstalls triggers so removed column is absent from changelog JSON', () => {
    const matrixId = createMatrix(db, 'Test', [
      { name: 'a', type: 'TEXT' },
      { name: 'b', type: 'TEXT' },
    ])
    removeColumn(db, matrixId, 'b')
    clearChangelog()

    const rowId = insertDataRow(db, matrixId, { a: 'kept' })

    const log = getChangelog()
    expect(log).toHaveLength(1)

    const data = JSON.parse(log[0]!.data!) as Record<string, unknown>
    expect(data.id).toBe(rowId)
    expect(data.a).toBe('kept')
    expect(data).not.toHaveProperty('b')
  })

  // -- renameColumn triggers reflect updated schema --

  test('renameColumn reinstalls triggers so renamed column appears with new name', () => {
    const matrixId = createMatrix(db, 'Test')
    renameColumn(db, matrixId, 'title', 'label')
    clearChangelog()

    const rowId = insertDataRow(db, matrixId, { label: 'Renamed' })

    const log = getChangelog()
    expect(log).toHaveLength(1)

    const data = JSON.parse(log[0]!.data!) as Record<string, unknown>
    expect(data.id).toBe(rowId)
    expect(data.label).toBe('Renamed')
    expect(data).not.toHaveProperty('title')
  })

  // -- Core table tracking --

  test('INSERT into matrix table is tracked', () => {
    clearChangelog()

    const matrixId = createMatrix(db, 'Tracked Matrix')

    const log = getChangelog()
    const matrixInsert = log.find((e) => e.table_name === 'matrix' && e.operation === 'INSERT')

    expect(matrixInsert).toBeDefined()
    const data = JSON.parse(matrixInsert!.data!) as Record<string, unknown>
    expect(data.id).toBe(matrixId)
    expect(data.title).toBe('Tracked Matrix')
  })

  test('INSERT into matrix_columns table is tracked', () => {
    clearChangelog()

    const matrixId = createMatrix(db, 'M', [
      { name: 'name', type: 'TEXT' },
      { name: 'age', type: 'INTEGER' },
    ])

    const log = getChangelog()
    const colInserts = log.filter(
      (e) => e.table_name === 'matrix_columns' && e.operation === 'INSERT',
    )

    expect(colInserts).toHaveLength(2)

    const colData = colInserts.map((e) => JSON.parse(e.data!) as Record<string, unknown>)
    expect(colData).toContainEqual(
      expect.objectContaining({ matrix_id: matrixId, name: 'name', type: 'TEXT' }),
    )
    expect(colData).toContainEqual(
      expect.objectContaining({ matrix_id: matrixId, name: 'age', type: 'INTEGER' }),
    )
  })

  test('INSERT into rank table is tracked with hex-encoded key', () => {
    const matrixId = createMatrix(db, 'Test')
    const rowId = insertDataRow(db, matrixId, { title: 'Ranked' })
    clearChangelog()

    insertRow(db, { matrixId, rowKind: 0, rowId })

    const log = getChangelog()
    const rankInsert = log.find((e) => e.table_name === 'rank' && e.operation === 'INSERT')

    expect(rankInsert).toBeDefined()
    const data = JSON.parse(rankInsert!.data!) as Record<string, unknown>
    expect(data.matrix_id).toBe(matrixId)
    expect(data.row_kind).toBe(0)
    expect(data.row_id).toBe(rowId)
    expect(typeof data.key).toBe('string')
    expect((data.key as string).length).toBeGreaterThan(0)
  })

  // -- Closure tables are NOT tracked --

  test('no triggers are installed on closure tables', () => {
    const matrixId = createMatrix(db, 'Test')

    const stmt = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name = ?`,
    )
    stmt.bind([`mx_${matrixId}_closure`])

    const triggers: string[] = []
    while (stmt.step()) {
      triggers.push((stmt.get({}) as { name: string }).name)
    }
    stmt.finalize()

    expect(triggers).toHaveLength(0)
  })

  // -- Existing column operations still work with change tracking --

  test('getColumns still returns correct columns after trigger installation', () => {
    const matrixId = createMatrix(db, 'Test', [
      { name: 'x', type: 'TEXT' },
      { name: 'y', type: 'INTEGER' },
    ])

    const cols = getColumns(db, matrixId)
    expect(cols.map((c) => c.name)).toEqual(['x', 'y'])
  })

  // -- Multiple operations produce ordered changelog --

  test('mixed insert/update/delete produces ordered changelog', () => {
    const matrixId = createMatrix(db, 'Test')
    clearChangelog()

    const rowId = insertDataRow(db, matrixId, { title: 'Created' })
    updateRow(db, { matrixId, rowId, values: { title: 'Updated' } })

    const key = insertRow(db, { matrixId, rowKind: 0, rowId })
    deleteRow(db, { matrixId, key })

    const log = getChangelog()
    const dataOps = log.filter((e) => e.table_name === `mx_${matrixId}_data`)

    expect(dataOps).toHaveLength(3)
    expect(dataOps[0]!.operation).toBe('INSERT')
    expect(dataOps[1]!.operation).toBe('UPDATE')
    expect(dataOps[2]!.operation).toBe('DELETE')

    expect(dataOps[0]!.seq).toBeLessThan(dataOps[1]!.seq)
    expect(dataOps[1]!.seq).toBeLessThan(dataOps[2]!.seq)
  })
})
