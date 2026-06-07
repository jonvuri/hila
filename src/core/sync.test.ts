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
  addColumn,
  removeColumn,
  renameColumn,
  getColumns,
  updateColumnRole,
} from './matrix'
import { createTreePosition, removeTreePosition } from './tree'
import { ensureTrait } from './traits'
import {
  installCoreTableTriggers,
  getLocalChanges,
  getLastSeq,
  getLastUploadedSeq,
  setLastUploadedSeq,
  applyRemoteChanges,
  compactChangelog,
} from './sync'
import type { Changeset } from './sync-types'

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
    const matrixId = createMatrixWithTraits(db, 'Test')
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
    const matrixId = createMatrixWithTraits(db, 'Test')
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
    const matrixId = createMatrixWithTraits(db, 'Test')
    const rowId = insertDataRow(db, matrixId, { title: 'Doomed' })
    createTreePosition(db, matrixId, rowId)
    clearChangelog()

    removeTreePosition(db, matrixId, rowId)
    db.exec(`DELETE FROM "mx_${matrixId}_data" WHERE id = ?`, { bind: [rowId] })

    const log = getChangelog()
    const deleteEntries = log.filter((e) => e.operation === 'DELETE')
    const dataDelete = deleteEntries.find((e) => e.table_name === `mx_${matrixId}_data`)

    expect(dataDelete).toBeDefined()
    expect(dataDelete!.row_id).toBe(rowId)
    expect(dataDelete!.data).toBeNull()
  })

  // -- device_id correctness --

  test('device_id in changelog matches the configured device', () => {
    const matrixId = createMatrixWithTraits(db, 'Test')
    clearChangelog()

    insertDataRow(db, matrixId, { title: 'Check device' })

    const log = getChangelog()
    expect(log).toHaveLength(1)
    expect(log[0]!.device_id).toBe(deviceId)
  })

  // -- seq monotonicity --

  test('changelog seq values are monotonically increasing', () => {
    const matrixId = createMatrixWithTraits(db, 'Test')
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
    const matrixId = createMatrixWithTraits(db, 'Test')
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
    const matrixId = createMatrixWithTraits(db, 'Test', [
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
    const matrixId = createMatrixWithTraits(db, 'Test')
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

    const matrixId = createMatrixWithTraits(db, 'Tracked Matrix')

    const log = getChangelog()
    const matrixInsert = log.find((e) => e.table_name === 'matrix' && e.operation === 'INSERT')

    expect(matrixInsert).toBeDefined()
    const data = JSON.parse(matrixInsert!.data!) as Record<string, unknown>
    expect(data.id).toBe(matrixId)
    expect(data.title).toBe('Tracked Matrix')
  })

  test('INSERT into matrix_columns table is tracked', () => {
    clearChangelog()

    const matrixId = createMatrixWithTraits(db, 'M', [
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

  test('UPDATE to matrix_columns role is tracked in changelog', () => {
    const matrixId = createMatrixWithTraits(db, 'M', [
      { name: 'label', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
    ])
    clearChangelog()

    updateColumnRole(db, matrixId, 'label', 'label')

    const log = getChangelog()
    const colUpdates = log.filter(
      (e) => e.table_name === 'matrix_columns' && e.operation === 'UPDATE',
    )

    expect(colUpdates).toHaveLength(1)

    const data = JSON.parse(colUpdates[0]!.data!) as Record<string, unknown>
    expect(data.name).toBe('label')
    expect(data.role).toBe('label')
    expect(data.matrix_id).toBe(matrixId)
  })

  test('INSERT of an own-edge into joins is tracked with hex-encoded edge_key', () => {
    const matrixId = createMatrixWithTraits(db, 'Test')
    const rowId = insertDataRow(db, matrixId, { title: 'Ranked' })
    clearChangelog()

    createTreePosition(db, matrixId, rowId)

    const log = getChangelog()
    const joinInsert = log.find((e) => e.table_name === 'joins' && e.operation === 'INSERT')

    expect(joinInsert).toBeDefined()
    const data = JSON.parse(joinInsert!.data!) as Record<string, unknown>
    expect(data.target_matrix_id).toBe(matrixId)
    expect(data.target_row_id).toBe(rowId)
    expect(data.kind).toBe('own')
    expect(typeof data.edge_key).toBe('string')
    expect((data.edge_key as string).length).toBeGreaterThan(0)
  })

  test('DELETE of an own-edge records the old composite key (not just the rowid)', () => {
    const matrixId = createMatrixWithTraits(db, 'Test')
    const parent = insertDataRow(db, matrixId, { title: 'P' })
    createTreePosition(db, matrixId, parent)
    const child = insertDataRow(db, matrixId, { title: 'C' })
    createTreePosition(db, matrixId, child, { parent: { matrixId, rowId: parent } })
    clearChangelog()

    // Sever the own-edge.
    db.exec(
      `DELETE FROM joins WHERE target_matrix_id = ? AND target_row_id = ? AND kind = 'own'`,
      {
        bind: [matrixId, child],
      },
    )

    const log = getChangelog()
    const del = log.find((e) => e.table_name === 'joins' && e.operation === 'DELETE')
    expect(del).toBeDefined()
    // The old row's logical key must be recorded so a remote apply can locate
    // the edge by composite key rather than the replica-unstable rowid.
    const data = JSON.parse(del!.data!) as Record<string, unknown>
    expect(data.source_row_id).toBe(parent)
    expect(data.target_matrix_id).toBe(matrixId)
    expect(data.target_row_id).toBe(child)
    expect(data.kind).toBe('own')
  })

  // -- Closure tables are NOT tracked --

  test('no triggers are installed on closure tables', () => {
    const matrixId = createMatrixWithTraits(db, 'Test')

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
    const matrixId = createMatrixWithTraits(db, 'Test', [
      { name: 'x', type: 'TEXT' },
      { name: 'y', type: 'INTEGER' },
    ])

    const cols = getColumns(db, matrixId)
    expect(cols.map((c) => c.name)).toEqual(['x', 'y'])
  })

  // -- Multiple operations produce ordered changelog --

  test('mixed insert/update/delete produces ordered changelog', () => {
    const matrixId = createMatrixWithTraits(db, 'Test')
    clearChangelog()

    const rowId = insertDataRow(db, matrixId, { title: 'Created' })
    updateRow(db, { matrixId, rowId, values: { title: 'Updated' } })

    createTreePosition(db, matrixId, rowId)
    removeTreePosition(db, matrixId, rowId)
    db.exec(`DELETE FROM "mx_${matrixId}_data" WHERE id = ?`, { bind: [rowId] })

    const log = getChangelog()
    const dataOps = log.filter((e) => e.table_name === `mx_${matrixId}_data`)

    expect(dataOps).toHaveLength(3)
    expect(dataOps[0]!.operation).toBe('INSERT')
    expect(dataOps[1]!.operation).toBe('UPDATE')
    expect(dataOps[2]!.operation).toBe('DELETE')

    expect(dataOps[0]!.seq).toBeLessThan(dataOps[1]!.seq)
    expect(dataOps[1]!.seq).toBeLessThan(dataOps[2]!.seq)
  })

  // -- Changeset abstraction --

  describe('Changeset abstraction', () => {
    test('getLocalChanges(0) returns all entries in order', () => {
      const m1 = createMatrixWithTraits(db, 'Alpha')
      const m2 = createMatrixWithTraits(db, 'Beta')
      clearChangelog()

      insertDataRow(db, m1, { title: 'A1' })
      insertDataRow(db, m2, { title: 'B1' })
      insertDataRow(db, m1, { title: 'A2' })

      const cs = getLocalChanges(db, 0)

      expect(cs.deviceId).toBe(deviceId)
      expect(cs.fromSeq).toBe(0)
      expect(cs.toSeq).toBeGreaterThan(0)
      expect(cs.entries).toHaveLength(3)

      expect(cs.entries[0]!.table).toBe(`mx_${m1}_data`)
      expect(cs.entries[0]!.operation).toBe('INSERT')
      expect(cs.entries[0]!.data!.title).toBe('A1')

      expect(cs.entries[1]!.table).toBe(`mx_${m2}_data`)
      expect(cs.entries[1]!.data!.title).toBe('B1')

      expect(cs.entries[2]!.table).toBe(`mx_${m1}_data`)
      expect(cs.entries[2]!.data!.title).toBe('A2')
    })

    test('getLocalChanges(N) returns only entries after N', () => {
      const matrixId = createMatrixWithTraits(db, 'Test')
      clearChangelog()

      insertDataRow(db, matrixId, { title: 'First' })
      insertDataRow(db, matrixId, { title: 'Second' })

      const midSeq = getLastSeq(db)

      insertDataRow(db, matrixId, { title: 'Third' })
      insertDataRow(db, matrixId, { title: 'Fourth' })

      const firstSeq = getLocalChanges(db, 0).entries[0]!
      expect(firstSeq.data!.title).toBe('First')

      const cs = getLocalChanges(db, midSeq)
      expect(cs.fromSeq).toBe(midSeq)
      expect(cs.toSeq).toBeGreaterThan(midSeq)
      expect(cs.entries).toHaveLength(2)
      expect(cs.entries[0]!.data!.title).toBe('Third')
      expect(cs.entries[1]!.data!.title).toBe('Fourth')
    })

    test('getLastSeq returns correct max seq value', () => {
      clearChangelog()
      expect(getLastSeq(db)).toBe(0)

      const matrixId = createMatrixWithTraits(db, 'Test')
      clearChangelog()

      insertDataRow(db, matrixId, { title: 'One' })
      const seq1 = getLastSeq(db)
      expect(seq1).toBeGreaterThan(0)

      insertDataRow(db, matrixId, { title: 'Two' })
      const seq2 = getLastSeq(db)
      expect(seq2).toBeGreaterThan(seq1)
    })

    test('getLocalChanges with no entries returns empty changeset', () => {
      clearChangelog()

      const cs = getLocalChanges(db, 0)
      expect(cs.deviceId).toBe(deviceId)
      expect(cs.fromSeq).toBe(0)
      expect(cs.toSeq).toBe(0)
      expect(cs.entries).toHaveLength(0)
    })

    test('getLocalChanges includes DELETE entries with null data', () => {
      const matrixId = createMatrixWithTraits(db, 'Test')
      const rowId = insertDataRow(db, matrixId, { title: 'Gone' })
      createTreePosition(db, matrixId, rowId)
      clearChangelog()

      removeTreePosition(db, matrixId, rowId)
      db.exec(`DELETE FROM "mx_${matrixId}_data" WHERE id = ?`, { bind: [rowId] })

      const cs = getLocalChanges(db, 0)
      const dataDelete = cs.entries.find(
        (e) => e.table === `mx_${matrixId}_data` && e.operation === 'DELETE',
      )

      expect(dataDelete).toBeDefined()
      expect(dataDelete!.data).toBeNull()
    })

    test('changeset entries have parsed data objects, not JSON strings', () => {
      const matrixId = createMatrixWithTraits(db, 'Test')
      clearChangelog()

      insertDataRow(db, matrixId, { title: 'Parsed' })

      const cs = getLocalChanges(db, 0)
      const entry = cs.entries.find((e) => e.table === `mx_${matrixId}_data`)!
      expect(typeof entry.data).toBe('object')
      expect(entry.data!.title).toBe('Parsed')
    })
  })

  // -- last_uploaded_seq tracking --

  describe('last_uploaded_seq tracking', () => {
    test('getLastUploadedSeq defaults to 0', () => {
      expect(getLastUploadedSeq(db)).toBe(0)
    })

    test('setLastUploadedSeq persists and is retrievable', () => {
      setLastUploadedSeq(db, 42)
      expect(getLastUploadedSeq(db)).toBe(42)
    })

    test('setLastUploadedSeq overwrites previous value', () => {
      setLastUploadedSeq(db, 10)
      setLastUploadedSeq(db, 25)
      expect(getLastUploadedSeq(db)).toBe(25)
    })
  })

  // -- Conflict detection and resolution --

  describe('Conflict detection and resolution', () => {
    const REMOTE_DEVICE_ID = 'remote-device-aaaa-bbbb-ccccddddeeee'

    const makeRemoteChangeset = (
      entries: Changeset['entries'],
      fromSeq = 0,
      toSeq = 100,
    ): Changeset => ({
      deviceId: REMOTE_DEVICE_ID,
      fromSeq,
      toSeq,
      entries,
    })

    // -- _sync_conflicts table existence --

    test('_sync_conflicts table exists after schema init', () => {
      const stmt = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='_sync_conflicts'",
      )
      expect(stmt.step()).toBe(true)
      stmt.finalize()
    })

    test('_sync_applying table exists after schema init', () => {
      const stmt = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='_sync_applying'",
      )
      expect(stmt.step()).toBe(true)
      stmt.finalize()
    })

    // -- Remote INSERT for a row that doesn't exist locally --

    test('apply remote INSERT creates a new row', () => {
      const matrixId = createMatrixWithTraits(db, 'Test')
      clearChangelog()

      const remoteRowId = 999888777
      const result = applyRemoteChanges(
        db,
        makeRemoteChangeset([
          {
            table: `mx_${matrixId}_data`,
            rowId: remoteRowId,
            operation: 'INSERT',
            timestamp: '2025-01-01 12:00:00',
            data: { id: remoteRowId, title: 'Remote row' },
          },
        ]),
      )

      expect(result.applied).toBe(1)
      expect(result.conflicts).toHaveLength(0)

      // Verify the row exists
      const stmt = db.prepare(`SELECT id, title FROM mx_${matrixId}_data WHERE id = ?`)
      stmt.bind([remoteRowId])
      expect(stmt.step()).toBe(true)
      const row = stmt.get({}) as { id: number; title: string }
      expect(row.title).toBe('Remote row')
      stmt.finalize()
    })

    // -- Remote UPDATE with no local modifications --

    test('apply remote UPDATE with no local conflict updates the row', () => {
      const matrixId = createMatrixWithTraits(db, 'Test')
      const rowId = insertDataRow(db, matrixId, { title: 'Original' })
      clearChangelog()

      // Set a high-water mark so the local insert isn't seen as a conflict
      db.exec(
        `INSERT INTO _sync_state (key, value) VALUES ('last_acked_seq_${REMOTE_DEVICE_ID}', '99999')`,
      )

      const result = applyRemoteChanges(
        db,
        makeRemoteChangeset([
          {
            table: `mx_${matrixId}_data`,
            rowId,
            operation: 'UPDATE',
            timestamp: '2025-01-01 13:00:00',
            data: { id: rowId, title: 'Updated remotely' },
          },
        ]),
      )

      expect(result.applied).toBe(1)
      expect(result.conflicts).toHaveLength(0)

      const stmt = db.prepare(`SELECT title FROM mx_${matrixId}_data WHERE id = ?`)
      stmt.bind([rowId])
      expect(stmt.step()).toBe(true)
      expect((stmt.get({}) as { title: string }).title).toBe('Updated remotely')
      stmt.finalize()
    })

    // -- Remote UPDATE conflicts with local modification, remote wins (LWW) --

    test('conflict: remote UPDATE wins when remote timestamp is newer', () => {
      const matrixId = createMatrixWithTraits(db, 'Test')
      const rowId = insertDataRow(db, matrixId, { title: 'Original' })

      // Local modification (tracked in changelog)
      updateRow(db, { matrixId, rowId, values: { title: 'Local edit' } })

      const result = applyRemoteChanges(
        db,
        makeRemoteChangeset([
          {
            table: `mx_${matrixId}_data`,
            rowId,
            operation: 'UPDATE',
            timestamp: '2099-01-01 00:00:00', // Far future — remote wins
            data: { id: rowId, title: 'Remote edit' },
          },
        ]),
      )

      expect(result.applied).toBe(1)
      expect(result.conflicts).toHaveLength(1)

      const conflict = result.conflicts[0]!
      expect(conflict.winner).toBe('remote')
      expect(conflict.tableName).toBe(`mx_${matrixId}_data`)
      expect(conflict.rowId).toBe(rowId)

      // Losing data should be the local version
      const losingData = JSON.parse(conflict.losingData) as Record<string, unknown>
      expect(losingData.title).toBe('Local edit')

      // Winning data should be the remote version
      const winningData = JSON.parse(conflict.winningData) as Record<string, unknown>
      expect(winningData.title).toBe('Remote edit')

      // The row should have the remote value
      const stmt = db.prepare(`SELECT title FROM mx_${matrixId}_data WHERE id = ?`)
      stmt.bind([rowId])
      expect(stmt.step()).toBe(true)
      expect((stmt.get({}) as { title: string }).title).toBe('Remote edit')
      stmt.finalize()
    })

    // -- Remote UPDATE conflicts with local modification, local wins (LWW) --

    test('conflict: local UPDATE wins when local timestamp is newer', () => {
      const matrixId = createMatrixWithTraits(db, 'Test')
      const rowId = insertDataRow(db, matrixId, { title: 'Original' })

      // Local modification (tracked in changelog)
      updateRow(db, { matrixId, rowId, values: { title: 'Local edit' } })

      const result = applyRemoteChanges(
        db,
        makeRemoteChangeset([
          {
            table: `mx_${matrixId}_data`,
            rowId,
            operation: 'UPDATE',
            timestamp: '2000-01-01 00:00:00', // Far past — local wins
            data: { id: rowId, title: 'Remote edit' },
          },
        ]),
      )

      expect(result.applied).toBe(0)
      expect(result.conflicts).toHaveLength(1)

      const conflict = result.conflicts[0]!
      expect(conflict.winner).toBe('local')

      // Losing data should be the remote version
      const losingData = JSON.parse(conflict.losingData) as Record<string, unknown>
      expect(losingData.title).toBe('Remote edit')

      // Winning data should be the local version
      const winningData = JSON.parse(conflict.winningData) as Record<string, unknown>
      expect(winningData.title).toBe('Local edit')

      // The row should still have the local value
      const stmt = db.prepare(`SELECT title FROM mx_${matrixId}_data WHERE id = ?`)
      stmt.bind([rowId])
      expect(stmt.step()).toBe(true)
      expect((stmt.get({}) as { title: string }).title).toBe('Local edit')
      stmt.finalize()
    })

    // -- Remote DELETE for a row edited locally --

    test('conflict: remote DELETE vs local edit detects conflict', () => {
      const matrixId = createMatrixWithTraits(db, 'Test')
      const rowId = insertDataRow(db, matrixId, { title: 'Will be contested' })

      // Local modification
      updateRow(db, { matrixId, rowId, values: { title: 'Local edit' } })

      const result = applyRemoteChanges(
        db,
        makeRemoteChangeset([
          {
            table: `mx_${matrixId}_data`,
            rowId,
            operation: 'DELETE',
            timestamp: '2099-01-01 00:00:00', // Remote wins
            data: null,
          },
        ]),
      )

      expect(result.conflicts).toHaveLength(1)
      expect(result.conflicts[0]!.winner).toBe('remote')

      // Row should be deleted
      const stmt = db.prepare(`SELECT id FROM mx_${matrixId}_data WHERE id = ?`)
      stmt.bind([rowId])
      expect(stmt.step()).toBe(false)
      stmt.finalize()
    })

    // -- Remote changes do NOT appear in _sync_changelog (trigger suppression) --

    test('remote changes do not appear in _sync_changelog', () => {
      const matrixId = createMatrixWithTraits(db, 'Test')
      clearChangelog()

      const remoteRowId = 111222333
      applyRemoteChanges(
        db,
        makeRemoteChangeset([
          {
            table: `mx_${matrixId}_data`,
            rowId: remoteRowId,
            operation: 'INSERT',
            timestamp: '2025-01-01 12:00:00',
            data: { id: remoteRowId, title: 'Remote only' },
          },
        ]),
      )

      const log = getChangelog()
      const remoteEntries = log.filter(
        (e) => e.table_name === `mx_${matrixId}_data` && e.row_id === remoteRowId,
      )
      expect(remoteEntries).toHaveLength(0)
    })

    // -- Per-device high-water marks are updated --

    test('per-device high-water mark is updated after apply', () => {
      const matrixId = createMatrixWithTraits(db, 'Test')

      const remoteRowId = 444555666
      applyRemoteChanges(
        db,
        makeRemoteChangeset(
          [
            {
              table: `mx_${matrixId}_data`,
              rowId: remoteRowId,
              operation: 'INSERT',
              timestamp: '2025-01-01 12:00:00',
              data: { id: remoteRowId, title: 'HWM test' },
            },
          ],
          50,
          150,
        ),
      )

      const stmt = db.prepare(
        `SELECT value FROM _sync_state WHERE key = 'last_acked_seq_${REMOTE_DEVICE_ID}'`,
      )
      expect(stmt.step()).toBe(true)
      expect((stmt.get({}) as { value: string }).value).toBe('150')
      stmt.finalize()
    })

    // -- Remote DELETE operation --

    test('apply remote DELETE removes the row', () => {
      const matrixId = createMatrixWithTraits(db, 'Test')
      const rowId = insertDataRow(db, matrixId, { title: 'To be deleted' })

      // Set high-water mark high so no conflict
      db.exec(
        `INSERT INTO _sync_state (key, value) VALUES ('last_acked_seq_${REMOTE_DEVICE_ID}', '99999')`,
      )
      clearChangelog()

      const result = applyRemoteChanges(
        db,
        makeRemoteChangeset([
          {
            table: `mx_${matrixId}_data`,
            rowId,
            operation: 'DELETE',
            timestamp: '2025-01-01 12:00:00',
            data: null,
          },
        ]),
      )

      expect(result.applied).toBe(1)
      expect(result.conflicts).toHaveLength(0)

      const stmt = db.prepare(`SELECT id FROM mx_${matrixId}_data WHERE id = ?`)
      stmt.bind([rowId])
      expect(stmt.step()).toBe(false)
      stmt.finalize()
    })

    // -- Remote own-forest structural changes (joins) apply by logical key --

    const ownSourcesOf = (matrixId: number, rowId: number): number[] => {
      const stmt = db.prepare(
        `SELECT source_row_id FROM joins
         WHERE target_matrix_id = ? AND target_row_id = ? AND kind = 'own'
         ORDER BY source_row_id`,
      )
      stmt.bind([matrixId, rowId])
      const out: number[] = []
      while (stmt.step()) out.push((stmt.get({}) as { source_row_id: number }).source_row_id)
      stmt.finalize()
      return out
    }

    test('apply remote reparent (joins UPDATE) re-homes the own-edge by target, not rowid', () => {
      const matrixId = createMatrixWithTraits(db, 'Test')
      const p1 = insertDataRow(db, matrixId, { title: 'P1' })
      createTreePosition(db, matrixId, p1)
      const p2 = insertDataRow(db, matrixId, { title: 'P2' })
      createTreePosition(db, matrixId, p2)
      const child = insertDataRow(db, matrixId, { title: 'C' })
      createTreePosition(db, matrixId, child, { parent: { matrixId, rowId: p1 } })
      clearChangelog()

      // Local edge is P1 -> child. A remote replica reparented child under P2.
      expect(ownSourcesOf(matrixId, child)).toEqual([p1])

      const result = applyRemoteChanges(
        db,
        makeRemoteChangeset([
          {
            table: 'joins',
            // Deliberately bogus rowid: a replica-stable apply must ignore it.
            rowId: 99999999,
            operation: 'UPDATE',
            timestamp: '2025-01-01 12:00:00',
            data: {
              source_matrix_id: matrixId,
              source_row_id: p2,
              target_matrix_id: matrixId,
              target_row_id: child,
              kind: 'own',
              edge_key: '8000', // hex-encoded [0x80, 0x00]
            },
          },
        ]),
      )

      expect(result.applied).toBe(1)
      // The own-edge now originates from P2; the old P1 edge is gone (single-owner).
      expect(ownSourcesOf(matrixId, child)).toEqual([p2])
    })

    test('apply remote joins DELETE removes the own-edge by composite key, not rowid', () => {
      const matrixId = createMatrixWithTraits(db, 'Test')
      const parent = insertDataRow(db, matrixId, { title: 'P' })
      createTreePosition(db, matrixId, parent)
      const child = insertDataRow(db, matrixId, { title: 'C' })
      createTreePosition(db, matrixId, child, { parent: { matrixId, rowId: parent } })
      clearChangelog()

      expect(ownSourcesOf(matrixId, child)).toEqual([parent])

      const result = applyRemoteChanges(
        db,
        makeRemoteChangeset([
          {
            table: 'joins',
            rowId: 88888888, // bogus rowid
            operation: 'DELETE',
            timestamp: '2025-01-01 12:00:00',
            data: {
              source_matrix_id: matrixId,
              source_row_id: parent,
              target_matrix_id: matrixId,
              target_row_id: child,
              kind: 'own',
            },
          },
        ]),
      )

      expect(result.applied).toBe(1)
      expect(ownSourcesOf(matrixId, child)).toEqual([])
    })

    // -- Trigger suppression flag is cleaned up after error --

    test('trigger suppression flag is cleaned up after error', () => {
      // Apply a changeset that will fail (invalid table)
      expect(() =>
        applyRemoteChanges(
          db,
          makeRemoteChangeset([
            {
              table: 'nonexistent_table',
              rowId: 1,
              operation: 'INSERT',
              timestamp: '2025-01-01 12:00:00',
              data: { id: 1, value: 'test' },
            },
          ]),
        ),
      ).toThrow()

      // Verify the _sync_applying table is empty (flag cleared)
      const stmt = db.prepare('SELECT COUNT(*) AS cnt FROM _sync_applying')
      stmt.step()
      expect((stmt.get({}) as { cnt: number }).cnt).toBe(0)
      stmt.finalize()

      // Verify normal change tracking still works
      const matrixId = createMatrixWithTraits(db, 'Test')
      clearChangelog()
      insertDataRow(db, matrixId, { title: 'After error' })
      const log = getChangelog()
      expect(log.length).toBeGreaterThan(0)
    })
  })
})

describe('Changelog retention (compactChangelog)', () => {
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

  const setDeviceHwm = (remoteDeviceId: string, seq: number) => {
    const key = `last_acked_seq_${remoteDeviceId}`
    db.exec(
      'INSERT INTO _sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      { bind: [key, String(seq)] },
    )
  }

  test('no compaction when no devices have high-water marks', () => {
    const matrixId = createMatrixWithTraits(db, 'Test')
    for (let i = 0; i < 15; i++) {
      insertDataRow(db, matrixId, { title: `Row ${i}` })
    }

    const beforeCount = getChangelog().length
    expect(beforeCount).toBeGreaterThan(0)

    const deleted = compactChangelog(db)
    expect(deleted).toBe(0)
    expect(getChangelog().length).toBe(beforeCount)
  })

  test('compacts entries exceeding per-row cap when all conditions met', () => {
    const matrixId = createMatrixWithTraits(db, 'Test')
    const rowId = insertDataRow(db, matrixId, { title: 'Row 1' })

    // Update the same row many times to exceed the per-row cap
    for (let i = 0; i < 15; i++) {
      updateRow(db, { matrixId, rowId, values: { title: `Update ${i}` } })
    }

    // Total data table entries for this row: 1 INSERT + 15 UPDATEs = 16
    const dataEntries = getChangelog().filter(
      (e) => e.table_name === `mx_${matrixId}_data` && e.row_id === rowId,
    )
    expect(dataEntries.length).toBe(16)

    const maxSeq = Math.max(...getChangelog().map((e) => e.seq))

    // Set a device high-water mark above all entries
    setDeviceHwm('remote-device-1', maxSeq + 100)

    // Backdate all entries to be outside the retention window
    db.exec(
      "UPDATE _sync_changelog SET timestamp = datetime('now', '-60 days') WHERE table_name = ?",
      { bind: [`mx_${matrixId}_data`] },
    )

    const deleted = compactChangelog(db, { perRowCap: 10 })
    expect(deleted).toBeGreaterThan(0)

    // Should keep exactly 10 entries for this row (the newest 10)
    const remaining = getChangelog().filter(
      (e) => e.table_name === `mx_${matrixId}_data` && e.row_id === rowId,
    )
    expect(remaining.length).toBe(10)

    // Verify the kept entries are the newest ones (highest seq values)
    const keptSeqs = remaining.map((e) => e.seq)
    const originalSeqs = dataEntries.map((e) => e.seq)
    const expectedKept = originalSeqs.slice(-10)
    expect(keptSeqs).toEqual(expectedKept)
  })

  test('preserves entries within the retention window regardless of count', () => {
    const matrixId = createMatrixWithTraits(db, 'Test')
    const rowId = insertDataRow(db, matrixId, { title: 'Row 1' })

    // Update the same row many times to exceed the per-row cap
    for (let i = 0; i < 15; i++) {
      updateRow(db, { matrixId, rowId, values: { title: `Update ${i}` } })
    }

    const dataEntries = getChangelog().filter(
      (e) => e.table_name === `mx_${matrixId}_data` && e.row_id === rowId,
    )
    expect(dataEntries.length).toBe(16)

    const maxSeq = Math.max(...getChangelog().map((e) => e.seq))
    setDeviceHwm('remote-device-1', maxSeq + 100)

    // Don't backdate — entries are within the default 30-day retention window
    const deleted = compactChangelog(db, { perRowCap: 10 })
    expect(deleted).toBe(0)

    // All entries preserved because they're within the retention window
    const remaining = getChangelog().filter(
      (e) => e.table_name === `mx_${matrixId}_data` && e.row_id === rowId,
    )
    expect(remaining.length).toBe(16)
  })

  test('preserves entries above a device high-water mark', () => {
    const matrixId = createMatrixWithTraits(db, 'Test')
    const rowId = insertDataRow(db, matrixId, { title: 'Row 1' })

    // Update the same row many times
    for (let i = 0; i < 15; i++) {
      updateRow(db, { matrixId, rowId, values: { title: `Update ${i}` } })
    }

    const dataEntries = getChangelog().filter(
      (e) => e.table_name === `mx_${matrixId}_data` && e.row_id === rowId,
    )
    expect(dataEntries.length).toBe(16)

    // Set device high-water mark in the middle of our entries
    // Only entries at or below this mark are eligible for compaction
    const midSeq = dataEntries[7]!.seq
    setDeviceHwm('remote-device-1', midSeq)

    // Backdate all entries
    db.exec("UPDATE _sync_changelog SET timestamp = datetime('now', '-60 days')")

    compactChangelog(db, { perRowCap: 10 })

    // Entries above midSeq are preserved (device hasn't seen them yet)
    const remaining = getChangelog().filter(
      (e) => e.table_name === `mx_${matrixId}_data` && e.row_id === rowId,
    )

    // All entries with seq > midSeq are preserved (8 entries: indices 8-15)
    const aboveHwm = remaining.filter((e) => e.seq > midSeq)
    expect(aboveHwm.length).toBe(8)

    // For entries at or below midSeq, we can only delete those exceeding the per-row cap
    // considering ALL entries for that row (not just the ones below hwm).
    // We had 16 total, 8 are above hwm. The 8 below hwm: only those that
    // have >= 10 newer entries get deleted. Entry at index 0-5 have 10-15 newer entries (deletable).
    // Entries at index 6-7 have 9 and 8 newer entries (kept, below cap threshold).
    // So we expect 6 deleted: remaining = 16 - 6 = 10? Let me verify...
    // Actually entries below hwm: indices 0-7 (8 entries), seq values dataEntries[0..7].seq
    // For each: count of entries with same (table,row) and higher seq
    //   index 0: 15 newer -> >= 10, eligible
    //   index 1: 14 newer -> eligible
    //   index 2: 13 newer -> eligible
    //   index 3: 12 newer -> eligible
    //   index 4: 11 newer -> eligible
    //   index 5: 10 newer -> eligible
    //   index 6: 9 newer -> not eligible (< 10)
    //   index 7: 8 newer -> not eligible
    // So 6 deleted, 10 remain
    expect(remaining.length).toBe(10)
  })

  test('respects minimum high-water mark across multiple devices', () => {
    const matrixId = createMatrixWithTraits(db, 'Test')
    const rowId = insertDataRow(db, matrixId, { title: 'Row 1' })

    for (let i = 0; i < 15; i++) {
      updateRow(db, { matrixId, rowId, values: { title: `Update ${i}` } })
    }

    const allEntries = getChangelog()
    const maxSeq = Math.max(...allEntries.map((e) => e.seq))
    const midSeq = allEntries[5]!.seq

    // Device A has seen everything, device B has only seen up to midSeq
    setDeviceHwm('device-a', maxSeq + 100)
    setDeviceHwm('device-b', midSeq)

    // Backdate all entries
    db.exec("UPDATE _sync_changelog SET timestamp = datetime('now', '-60 days')")

    compactChangelog(db, { perRowCap: 10 })

    // No entry above midSeq should be deleted (device-b hasn't seen them)
    const remaining = getChangelog()
    const aboveMid = remaining.filter((e) => e.seq > midSeq)
    const originalAboveMid = allEntries.filter((e) => e.seq > midSeq)
    expect(aboveMid.length).toBe(originalAboveMid.length)
  })

  test('configurable retention days', () => {
    const matrixId = createMatrixWithTraits(db, 'Test')
    const rowId = insertDataRow(db, matrixId, { title: 'Row 1' })

    for (let i = 0; i < 15; i++) {
      updateRow(db, { matrixId, rowId, values: { title: `Update ${i}` } })
    }

    const maxSeq = Math.max(...getChangelog().map((e) => e.seq))
    setDeviceHwm('remote-device-1', maxSeq + 100)

    // Backdate entries to 10 days ago (within default 30-day window but outside 5-day window)
    db.exec("UPDATE _sync_changelog SET timestamp = datetime('now', '-10 days')")

    // With default 30 days, nothing should be deleted
    const deleted30 = compactChangelog(db, { retentionDays: 30, perRowCap: 10 })
    expect(deleted30).toBe(0)

    // With 5-day retention, entries exceeding cap should be deleted
    const deleted5 = compactChangelog(db, { retentionDays: 5, perRowCap: 10 })
    expect(deleted5).toBeGreaterThan(0)
  })

  test('handles multiple rows independently', () => {
    const matrixId = createMatrixWithTraits(db, 'Test')
    const rowId1 = insertDataRow(db, matrixId, { title: 'Row 1' })
    const rowId2 = insertDataRow(db, matrixId, { title: 'Row 2' })

    // Update row1 many times, row2 only a few
    for (let i = 0; i < 15; i++) {
      updateRow(db, { matrixId, rowId: rowId1, values: { title: `Row1 Update ${i}` } })
    }
    for (let i = 0; i < 3; i++) {
      updateRow(db, { matrixId, rowId: rowId2, values: { title: `Row2 Update ${i}` } })
    }

    const maxSeq = Math.max(...getChangelog().map((e) => e.seq))
    setDeviceHwm('remote-device-1', maxSeq + 100)

    // Backdate all entries
    db.exec(
      "UPDATE _sync_changelog SET timestamp = datetime('now', '-60 days') WHERE table_name = ?",
      { bind: [`mx_${matrixId}_data`] },
    )

    compactChangelog(db, { perRowCap: 10 })

    const tableName = `mx_${matrixId}_data`
    const row1Entries = getChangelog().filter(
      (e) => e.table_name === tableName && e.row_id === rowId1,
    )
    const row2Entries = getChangelog().filter(
      (e) => e.table_name === tableName && e.row_id === rowId2,
    )

    // Row1 had 16 entries, should be capped at 10
    expect(row1Entries.length).toBe(10)
    // Row2 had 4 entries (1 INSERT + 3 UPDATEs), all below cap, all preserved
    expect(row2Entries.length).toBe(4)
  })
})
