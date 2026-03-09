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
import {
  installCoreTableTriggers,
  getLocalChanges,
  getLastSeq,
  getLastUploadedSeq,
  setLastUploadedSeq,
  applyRemoteChanges,
} from './sync'
import type { Changeset } from './sync-types'

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

  // -- Changeset abstraction --

  describe('Changeset abstraction', () => {
    test('getLocalChanges(0) returns all entries in order', () => {
      const m1 = createMatrix(db, 'Alpha')
      const m2 = createMatrix(db, 'Beta')
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
      const matrixId = createMatrix(db, 'Test')
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

      const matrixId = createMatrix(db, 'Test')
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
      const matrixId = createMatrix(db, 'Test')
      const rowId = insertDataRow(db, matrixId, { title: 'Gone' })
      const key = insertRow(db, { matrixId, rowKind: 0, rowId })
      clearChangelog()

      deleteRow(db, { matrixId, key })

      const cs = getLocalChanges(db, 0)
      const dataDelete = cs.entries.find(
        (e) => e.table === `mx_${matrixId}_data` && e.operation === 'DELETE',
      )

      expect(dataDelete).toBeDefined()
      expect(dataDelete!.data).toBeNull()
    })

    test('changeset entries have parsed data objects, not JSON strings', () => {
      const matrixId = createMatrix(db, 'Test')
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
      const matrixId = createMatrix(db, 'Test')
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
      const matrixId = createMatrix(db, 'Test')
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
      const matrixId = createMatrix(db, 'Test')
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
      const matrixId = createMatrix(db, 'Test')
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
      const matrixId = createMatrix(db, 'Test')
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
      const matrixId = createMatrix(db, 'Test')
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
      const matrixId = createMatrix(db, 'Test')

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

    // -- Duplicate rank key collision --

    test('duplicate rank key collision is resolved: both rows present with correct order', () => {
      const matrixId = createMatrix(db, 'Test')
      const localRowId = insertDataRow(db, matrixId, { title: 'Local row' })
      const remoteRowId = 777888999

      // Insert the remote data row first (no rank yet)
      db.exec(`INSERT INTO mx_${matrixId}_data (id, title) VALUES (?, 'Remote row')`, {
        bind: [remoteRowId],
      })

      // Insert local row into rank with a known key
      const localKey = new Uint8Array([0x80, 0x00])
      db.exec('INSERT INTO rank (key, matrix_id, row_kind, row_id) VALUES (?, ?, 0, ?)', {
        bind: [localKey, matrixId, localRowId],
      })

      clearChangelog()

      // Remote device tries to insert with the SAME rank key
      const result = applyRemoteChanges(
        db,
        makeRemoteChangeset([
          {
            table: 'rank',
            rowId: remoteRowId,
            operation: 'INSERT',
            timestamp: '2025-01-01 12:00:00',
            data: {
              key: '8000', // hex-encoded [0x80, 0x00]
              matrix_id: matrixId,
              row_kind: 0,
              row_id: remoteRowId,
            },
          },
        ]),
      )

      expect(result.applied).toBe(1)

      // Both rows should exist in rank
      const countStmt = db.prepare('SELECT COUNT(*) AS cnt FROM rank WHERE matrix_id = ?')
      countStmt.bind([matrixId])
      countStmt.step()
      expect((countStmt.get({}) as { cnt: number }).cnt).toBe(2)
      countStmt.finalize()

      // Both rows should have different keys
      const keysStmt = db.prepare(
        'SELECT key, row_id FROM rank WHERE matrix_id = ? ORDER BY key',
      )
      keysStmt.bind([matrixId])
      const rankRows: { key: Uint8Array; row_id: number }[] = []
      while (keysStmt.step()) {
        const r = keysStmt.get({}) as { key: Uint8Array; row_id: number }
        rankRows.push({ key: new Uint8Array(r.key), row_id: r.row_id })
      }
      keysStmt.finalize()

      expect(rankRows).toHaveLength(2)
      // Keys should be different
      expect(rankRows[0]!.key).not.toEqual(rankRows[1]!.key)
      // Both row IDs should be present
      const rowIds = rankRows.map((r) => r.row_id).sort()
      expect(rowIds).toContain(localRowId)
      expect(rowIds).toContain(remoteRowId)
    })

    // -- No collision when rank keys differ (common case) --

    test('no rank key collision when keys differ', () => {
      const matrixId = createMatrix(db, 'Test')
      const localRowId = insertDataRow(db, matrixId, { title: 'Local' })
      const remoteRowId = 123456789

      db.exec(`INSERT INTO mx_${matrixId}_data (id, title) VALUES (?, 'Remote')`, {
        bind: [remoteRowId],
      })

      // Local row at key [0x40, 0x00]
      db.exec('INSERT INTO rank (key, matrix_id, row_kind, row_id) VALUES (?, ?, 0, ?)', {
        bind: [new Uint8Array([0x40, 0x00]), matrixId, localRowId],
      })

      clearChangelog()

      // Remote row at different key [0xC0, 0x00]
      const result = applyRemoteChanges(
        db,
        makeRemoteChangeset([
          {
            table: 'rank',
            rowId: remoteRowId,
            operation: 'INSERT',
            timestamp: '2025-01-01 12:00:00',
            data: {
              key: 'C000', // hex-encoded [0xC0, 0x00]
              matrix_id: matrixId,
              row_kind: 0,
              row_id: remoteRowId,
            },
          },
        ]),
      )

      expect(result.applied).toBe(1)
      expect(result.conflicts).toHaveLength(0)

      // Both rows in rank with their original keys
      const stmt = db.prepare(
        'SELECT key, row_id FROM rank WHERE matrix_id = ? ORDER BY key',
      )
      stmt.bind([matrixId])
      const rows: { key: Uint8Array; row_id: number }[] = []
      while (stmt.step()) {
        const r = stmt.get({}) as { key: Uint8Array; row_id: number }
        rows.push({ key: new Uint8Array(r.key), row_id: r.row_id })
      }
      stmt.finalize()

      expect(rows).toHaveLength(2)
      expect(rows[0]!.row_id).toBe(localRowId) // 0x40 < 0xC0
      expect(rows[1]!.row_id).toBe(remoteRowId)
    })

    // -- affectedRankMatrixIds tracking --

    test('affectedRankMatrixIds includes matrix IDs from rank changes', () => {
      const matrixId = createMatrix(db, 'Test')
      const remoteRowId = 555666777
      db.exec(`INSERT INTO mx_${matrixId}_data (id, title) VALUES (?, 'R')`, {
        bind: [remoteRowId],
      })
      clearChangelog()

      const result = applyRemoteChanges(
        db,
        makeRemoteChangeset([
          {
            table: 'rank',
            rowId: remoteRowId,
            operation: 'INSERT',
            timestamp: '2025-01-01 12:00:00',
            data: {
              key: '8000',
              matrix_id: matrixId,
              row_kind: 0,
              row_id: remoteRowId,
            },
          },
        ]),
      )

      expect(result.affectedRankMatrixIds.has(matrixId)).toBe(true)
    })

    // -- Remote DELETE operation --

    test('apply remote DELETE removes the row', () => {
      const matrixId = createMatrix(db, 'Test')
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
      const matrixId = createMatrix(db, 'Test')
      clearChangelog()
      insertDataRow(db, matrixId, { title: 'After error' })
      const log = getChangelog()
      expect(log.length).toBeGreaterThan(0)
    })
  })
})
