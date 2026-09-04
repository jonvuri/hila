import { beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { getFaceConfig } from './face-config'
import {
  createMatrix,
  getOrCreateDeviceId,
  initMatrixSchema,
  insertDataRow,
  resetDeviceIdCache,
} from './matrix'
import { applyRemoteChanges, getLocalChanges, installCoreTableTriggers } from './sync'
import type { ChangeEntry, Changeset } from './sync-types'

const REMOTE_DEVICE_ID = 'remote-stage-2'

const makeChangeset = (entries: ChangeEntry[], toSeq = 100): Changeset => ({
  deviceId: REMOTE_DEVICE_ID,
  fromSeq: 0,
  toSeq,
  entries,
})

const matrixColumnData = (
  id: number,
  matrixId: number,
  name: string,
  order: number,
  formula: string | null = null,
): Record<string, unknown> => ({
  id,
  matrix_id: matrixId,
  name,
  type: 'TEXT',
  display_type: 'text',
  order,
  options: null,
  formula,
  constraints: null,
  managed_by: null,
  role: order === 0 ? 'label' : null,
})

describe('Phase 11 Stage 2 sync repair', () => {
  let db: Database
  let deviceId: string

  beforeEach(async () => {
    resetDeviceIdCache()
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    deviceId = getOrCreateDeviceId(db)
    installCoreTableTriggers(db, deviceId)
  })

  test('manifest-generated triggers cover repaired columns and composite deletes', () => {
    const matrixId = createMatrix(db, 'Tracked')
    const rowId = insertDataRow(db, matrixId, { title: 'Owner' })
    db.exec('DELETE FROM _sync_changelog')

    db.exec('UPDATE matrix SET owner_matrix_id = ?, owner_row_id = ? WHERE id = ?', {
      bind: [matrixId, rowId, matrixId],
    })
    db.exec('INSERT INTO promoted_nodes (matrix_id, row_id) VALUES (?, ?)', {
      bind: [matrixId, rowId],
    })
    db.exec(
      "INSERT INTO block_sources (marker_matrix_id, marker_row_id, kind, sql) VALUES (?, ?, 'view', 'SELECT 1')",
      { bind: [matrixId, rowId] },
    )
    db.exec(
      "UPDATE block_sources SET sql = 'SELECT 2' WHERE marker_matrix_id = ? AND marker_row_id = ?",
      {
        bind: [matrixId, rowId],
      },
    )
    db.exec('DELETE FROM promoted_nodes WHERE matrix_id = ? AND row_id = ?', {
      bind: [matrixId, rowId],
    })
    db.exec('DELETE FROM block_sources WHERE marker_matrix_id = ? AND marker_row_id = ?', {
      bind: [matrixId, rowId],
    })

    const changes = getLocalChanges(db, 0).entries
    expect(changes.find((entry) => entry.table === 'matrix')?.data).toMatchObject({
      owner_matrix_id: matrixId,
      owner_row_id: rowId,
    })
    expect(changes.filter((entry) => entry.table === 'promoted_nodes')).toHaveLength(2)
    expect(changes.filter((entry) => entry.table === 'block_sources')).toHaveLength(3)
    expect(
      changes.find((entry) => entry.table === 'promoted_nodes' && entry.operation === 'DELETE')
        ?.data,
    ).toEqual({ matrix_id: matrixId, row_id: rowId })
    expect(
      changes.find((entry) => entry.table === 'block_sources' && entry.operation === 'DELETE')
        ?.data,
    ).toMatchObject({ marker_matrix_id: matrixId, marker_row_id: rowId })
  })

  test('face tracking excludes derived JSON and covers stable ordered filters', () => {
    const matrixId = createMatrix(db, 'Faces')
    const columnId = db.selectValue(
      'SELECT id FROM matrix_columns WHERE matrix_id = ? LIMIT 1',
      [matrixId],
    ) as number
    db.exec('DELETE FROM _sync_changelog')

    db.exec(
      "INSERT INTO plugins (id, name, version, metadata) VALUES ('plugin.face', 'Face', '1', '{}')",
    )
    db.exec("UPDATE plugins SET metadata = '{\"matrix\":1}' WHERE id = 'plugin.face'")
    db.exec(
      `INSERT INTO face_configs
       (id, face_type_id, matrix_id, slot_bindings, settings, created_by_plugin)
       VALUES ('face-a', 'hila.table', ?, '{"legacy":1}', NULL, 'plugin.face')`,
      { bind: [matrixId] },
    )
    db.exec(
      "INSERT INTO face_slot_bindings (face_config_id, slot_name, column_id) VALUES ('face-a', 'title', ?)",
      { bind: [columnId] },
    )
    db.exec(
      "INSERT INTO face_sort_config (face_config_id, column_id, direction) VALUES ('face-a', ?, 'ASC')",
      { bind: [columnId] },
    )
    db.exec(
      "INSERT INTO face_filter_configs (id, face_config_id, column_id, operator, value, \"order\") VALUES ('filter-a', 'face-a', ?, '=', 'x', 0)",
      { bind: [columnId] },
    )
    db.exec("UPDATE face_filter_configs SET value = 'y', \"order\" = 1 WHERE id = 'filter-a'")

    const changes = getLocalChanges(db, 0).entries
    const face = changes.find((entry) => entry.table === 'face_configs')
    const filter = changes.find((entry) => entry.table === 'face_filter_configs')
    expect(face?.data).not.toHaveProperty('slot_bindings')
    expect(face?.data).not.toHaveProperty('query')
    expect(filter?.data).toMatchObject({ id: 'filter-a', order: 0 })
    expect(
      changes.find((entry) => entry.table === 'plugins' && entry.operation === 'UPDATE')?.data,
    ).toHaveProperty('metadata', '{"matrix":1}')
    expect(changes.some((entry) => entry.table === 'face_slot_bindings')).toBe(true)
    expect(changes.some((entry) => entry.table === 'face_sort_config')).toBe(true)
    expect(
      changes.find(
        (entry) => entry.table === 'face_filter_configs' && entry.operation === 'UPDATE',
      )?.data,
    ).toMatchObject({ id: 'filter-a', value: 'y', order: 1 })
  })

  test('ordered remote state materializes a matrix, rows, view, face, and derived indexes without echo', () => {
    const matrixId = 7001
    const titleColumnId = 7101
    const formulaColumnId = 7102
    const rowId = 7201
    const entries: ChangeEntry[] = [
      {
        table: 'face_slot_bindings',
        rowId: 91,
        operation: 'INSERT',
        timestamp: '2026-01-01 00:00:07',
        data: { face_config_id: 'face-remote', slot_name: 'title', column_id: titleColumnId },
      },
      {
        table: 'face_filter_configs',
        rowId: 95,
        operation: 'INSERT',
        timestamp: '2026-01-01 00:00:09',
        data: {
          id: 'filter-remote',
          face_config_id: 'face-remote',
          column_id: titleColumnId,
          operator: 'LIKE',
          value: 'Remote',
          order: 0,
        },
      },
      {
        table: 'face_sort_config',
        rowId: 96,
        operation: 'INSERT',
        timestamp: '2026-01-01 00:00:08',
        data: {
          face_config_id: 'face-remote',
          column_id: titleColumnId,
          direction: 'ASC',
        },
      },
      {
        table: `mx_${matrixId}_data`,
        rowId: 999999,
        operation: 'INSERT',
        timestamp: '2026-01-01 00:00:03',
        data: { id: rowId, title: 'Remote view' },
      },
      {
        table: 'block_sources',
        rowId: 92,
        operation: 'INSERT',
        timestamp: '2026-01-01 00:00:05',
        data: {
          marker_matrix_id: matrixId,
          marker_row_id: rowId,
          kind: 'view',
          sql: `SELECT * FROM mx_${matrixId}_data`,
        },
      },
      {
        table: 'face_configs',
        rowId: 93,
        operation: 'INSERT',
        timestamp: '2026-01-01 00:00:06',
        data: {
          id: 'face-remote',
          face_type_id: 'hila.table',
          matrix_id: matrixId,
          settings: null,
          created_by_plugin: null,
        },
      },
      {
        table: 'joins',
        rowId: 94,
        operation: 'INSERT',
        timestamp: '2026-01-01 00:00:04',
        data: {
          source_matrix_id: 0,
          source_row_id: 0,
          target_matrix_id: matrixId,
          target_row_id: rowId,
          kind: 'own',
          edge_key: '8000',
        },
      },
      {
        table: 'matrix_columns',
        rowId: formulaColumnId,
        operation: 'INSERT',
        timestamp: '2026-01-01 00:00:02',
        data: matrixColumnData(
          formulaColumnId,
          matrixId,
          'decorated',
          1,
          `{{${titleColumnId}}} || '!'`,
        ),
      },
      {
        table: 'matrix',
        rowId: matrixId,
        operation: 'INSERT',
        timestamp: '2026-01-01 00:00:00',
        data: {
          id: matrixId,
          title: 'Remote matrix',
          source_plugin_id: null,
          owner_matrix_id: null,
          owner_row_id: null,
        },
      },
      {
        table: 'matrix_columns',
        rowId: titleColumnId,
        operation: 'INSERT',
        timestamp: '2026-01-01 00:00:01',
        data: {
          ...matrixColumnData(titleColumnId, matrixId, 'title', 0),
          constraints: 'UNIQUE',
        },
      },
    ]

    const sourceOrderedEntries = entries.toSorted((left, right) =>
      left.timestamp.localeCompare(right.timestamp),
    )
    const result = applyRemoteChanges(db, makeChangeset(sourceOrderedEntries))
    expect(result.applied).toBe(sourceOrderedEntries.length)
    expect(getLocalChanges(db, 0).entries).toEqual([])

    expect(
      db.selectValue(`SELECT title FROM "mx_${matrixId}_data" WHERE id = ?`, [rowId]),
    ).toBe('Remote view')
    expect(() => insertDataRow(db, matrixId, { title: 'Remote view' })).toThrow()
    expect(
      db.selectValue(
        `SELECT COUNT(*) FROM pragma_table_info('mx_${matrixId}_data') WHERE name = 'decorated'`,
      ),
    ).toBe(0)
    expect(
      db.selectValue(
        'SELECT COUNT(*) FROM formula_column_deps WHERE formula_col_id = ? AND dep_col_id = ?',
        [formulaColumnId, titleColumnId],
      ),
    ).toBe(1)
    expect(
      db.selectValue('SELECT COUNT(*) FROM scroll_index WHERE matrix_id = ? AND row_id = ?', [
        matrixId,
        rowId,
      ]),
    ).toBe(1)

    const face = getFaceConfig(db, 'face-remote')
    expect(face?.slotBindings).toEqual({ title: titleColumnId })
    expect(face?.sort).toEqual({ columnId: titleColumnId, direction: 'ASC' })
    expect(face?.filters).toEqual([
      {
        id: 'filter-remote',
        columnId: titleColumnId,
        operator: 'LIKE',
        value: 'Remote',
        order: 0,
      },
    ])
    expect(
      db.selectValue("SELECT slot_bindings FROM face_configs WHERE id = 'face-remote'"),
    ).toBe('{}')

    insertDataRow(db, matrixId, { title: 'Tracked locally' })
    const localRow = getLocalChanges(db, 0).entries.find(
      (entry) => entry.table === `mx_${matrixId}_data`,
    )
    expect(localRow?.data).toHaveProperty('title', 'Tracked locally')
  })

  test('remote updates and deletes use stable text, composite, and integer identities', () => {
    db.exec(
      "INSERT INTO plugins (id, name, version, metadata) VALUES ('plugin.stable', 'Local', '1', '{}')",
    )
    const matrixId = createMatrix(db, 'Logical IDs')
    const rowId = insertDataRow(db, matrixId, { title: 'Before' })
    db.exec(
      "INSERT INTO block_sources (marker_matrix_id, marker_row_id, kind, sql) VALUES (?, ?, 'view', 'SELECT 1')",
      { bind: [matrixId, rowId] },
    )
    db.exec(`INSERT INTO promoted_nodes (matrix_id, row_id) VALUES (?, ?)`, {
      bind: [matrixId, rowId],
    })
    db.exec('DELETE FROM _sync_changelog')
    db.exec(
      `INSERT INTO _sync_state (key, value) VALUES ('last_acked_seq_${REMOTE_DEVICE_ID}', '99999')`,
    )

    applyRemoteChanges(
      db,
      makeChangeset([
        {
          table: 'plugins',
          rowId: 999001,
          operation: 'UPDATE',
          timestamp: '2026-01-01 00:00:00',
          data: {
            id: 'plugin.stable',
            name: 'Remote',
            version: '2',
            enabled: 1,
            metadata: '{"remote":true}',
          },
        },
        {
          table: `mx_${matrixId}_data`,
          rowId: 999002,
          operation: 'UPDATE',
          timestamp: '2026-01-01 00:00:01',
          data: { id: rowId, title: 'After' },
        },
        {
          table: 'promoted_nodes',
          rowId: 999003,
          operation: 'DELETE',
          timestamp: '2026-01-01 00:00:02',
          data: { matrix_id: matrixId, row_id: rowId },
        },
        {
          table: 'block_sources',
          rowId: 999004,
          operation: 'DELETE',
          timestamp: '2026-01-01 00:00:03',
          data: { marker_matrix_id: matrixId, marker_row_id: rowId },
        },
      ]),
    )

    expect(db.selectValue("SELECT name FROM plugins WHERE id = 'plugin.stable'")).toBe('Remote')
    expect(
      db.selectValue(`SELECT title FROM "mx_${matrixId}_data" WHERE id = ?`, [rowId]),
    ).toBe('After')
    expect(db.selectValue('SELECT COUNT(*) FROM promoted_nodes')).toBe(0)
    expect(db.selectValue('SELECT COUNT(*) FROM block_sources')).toBe(0)
    expect(getLocalChanges(db, 0).entries).toEqual([])
  })

  test('remote apply preserves sequential insert and delete lifecycle', () => {
    const matrixId = createMatrix(db, 'Sequential lifecycle')
    const rowId = 7301
    db.exec('DELETE FROM _sync_changelog')
    db.exec(
      `INSERT INTO _sync_state (key, value) VALUES ('last_acked_seq_${REMOTE_DEVICE_ID}', '99999')`,
    )

    const result = applyRemoteChanges(
      db,
      makeChangeset([
        {
          table: `mx_${matrixId}_data`,
          rowId,
          operation: 'INSERT',
          timestamp: '2026-01-01 00:00:00',
          data: { id: rowId, title: 'Temporary' },
        },
        {
          table: `mx_${matrixId}_data`,
          rowId,
          operation: 'DELETE',
          timestamp: '2026-01-01 00:00:01',
          data: { id: rowId, title: 'Temporary' },
        },
      ]),
    )

    expect(result.applied).toBe(2)
    expect(
      db.selectValue(`SELECT COUNT(*) FROM "mx_${matrixId}_data" WHERE id = ?`, [rowId]),
    ).toBe(0)
    expect(getLocalChanges(db, 0).entries).toEqual([])
  })

  test('remote apply preserves row edits that precede a column rename', () => {
    const matrixId = createMatrix(db, 'Sequential schema')
    const columnId = db.selectValue(
      'SELECT id FROM matrix_columns WHERE matrix_id = ? AND name = ?',
      [matrixId, 'title'],
    ) as number
    const rowId = insertDataRow(db, matrixId, { title: 'Before' })
    db.exec('DELETE FROM _sync_changelog')
    db.exec(
      `INSERT INTO _sync_state (key, value) VALUES ('last_acked_seq_${REMOTE_DEVICE_ID}', '99999')`,
    )

    applyRemoteChanges(
      db,
      makeChangeset([
        {
          table: `mx_${matrixId}_data`,
          rowId,
          operation: 'UPDATE',
          timestamp: '2026-01-01 00:00:00',
          data: { id: rowId, title: 'Edited first' },
        },
        {
          table: 'matrix_columns',
          rowId: columnId,
          operation: 'UPDATE',
          timestamp: '2026-01-01 00:00:01',
          data: matrixColumnData(columnId, matrixId, 'heading', 0),
        },
      ]),
    )

    expect(
      db.selectValue(`SELECT heading FROM "mx_${matrixId}_data" WHERE id = ?`, [rowId]),
    ).toBe('Edited first')
    expect(getLocalChanges(db, 0).entries).toEqual([])
  })

  test('conflict detection matches stable text identity instead of replica rowid', () => {
    db.exec(
      "INSERT INTO plugins (id, name, version, metadata) VALUES ('plugin.conflict', 'Initial', '1', '{}')",
    )
    db.exec("UPDATE plugins SET name = 'Local winner' WHERE id = 'plugin.conflict'")

    const result = applyRemoteChanges(
      db,
      makeChangeset([
        {
          table: 'plugins',
          rowId: 123456789,
          operation: 'UPDATE',
          timestamp: '2000-01-01 00:00:00',
          data: {
            id: 'plugin.conflict',
            name: 'Remote loser',
            version: '2',
            enabled: 1,
            metadata: '{}',
          },
        },
      ]),
    )

    expect(result.applied).toBe(0)
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]?.winner).toBe('local')
    expect(db.selectValue("SELECT name FROM plugins WHERE id = 'plugin.conflict'")).toBe(
      'Local winner',
    )
  })

  test('remote column rename evolves the physical table and reinstalls complete tracking', () => {
    const matrixId = createMatrix(db, 'Rename')
    const columnId = db.selectValue(
      'SELECT id FROM matrix_columns WHERE matrix_id = ? AND name = ?',
      [matrixId, 'title'],
    ) as number
    db.exec('DELETE FROM _sync_changelog')
    db.exec(
      `INSERT INTO _sync_state (key, value) VALUES ('last_acked_seq_${REMOTE_DEVICE_ID}', '99999')`,
    )

    applyRemoteChanges(
      db,
      makeChangeset([
        {
          table: 'matrix_columns',
          rowId: 999999,
          operation: 'UPDATE',
          timestamp: '2026-01-01 00:00:00',
          data: matrixColumnData(columnId, matrixId, 'heading', 0),
        },
      ]),
    )

    expect(getLocalChanges(db, 0).entries).toEqual([])
    insertDataRow(db, matrixId, { heading: 'Renamed remotely' })
    const rowChange = getLocalChanges(db, 0).entries.find(
      (entry) => entry.table === `mx_${matrixId}_data`,
    )
    expect(rowChange?.data).toHaveProperty('heading', 'Renamed remotely')
    expect(rowChange?.data).not.toHaveProperty('title')
  })
})
