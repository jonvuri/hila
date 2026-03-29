import type { Database } from '@sqlite.org/sqlite-wasm'

import { between } from './lexorank'
import type { ApplyResult, ChangeEntry, Changeset, ConflictRecord } from './sync-types'
import { rebuildClosure } from './tree'
import { withTransaction } from './transaction'

type TrackedColumn = {
  name: string
  type: string
}

const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`

const buildJsonObjectExpr = (columns: TrackedColumn[], prefix: string): string => {
  const args = columns.map((col) => {
    const quotedName = quoteIdent(col.name)
    const valueExpr =
      col.type === 'BLOB' ? `hex(${prefix}.${quotedName})` : `${prefix}.${quotedName}`
    return `'${col.name.replace(/'/g, "''")}', ${valueExpr}`
  })
  return `json_object(${args.join(', ')})`
}

/**
 * Install INSERT/UPDATE/DELETE change-tracking triggers on a table.
 * Idempotent: uses CREATE TRIGGER IF NOT EXISTS.
 * Trigger names follow `_sync_track_{tableName}_{operation}`.
 */
export const installChangeTrackingTriggers = (
  db: Database,
  tableName: string,
  deviceId: string,
  columns: TrackedColumn[],
): void => {
  const quotedTable = quoteIdent(tableName)
  const escapedDeviceId = deviceId.replace(/'/g, "''")
  const escapedTableName = tableName.replace(/'/g, "''")

  const insertJson = buildJsonObjectExpr(columns, 'NEW')
  const updateJson = buildJsonObjectExpr(columns, 'NEW')

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS "_sync_track_${tableName}_INSERT"
    AFTER INSERT ON ${quotedTable}
    WHEN NOT EXISTS (SELECT 1 FROM _sync_applying)
    BEGIN
      INSERT INTO _sync_changelog (device_id, table_name, row_id, operation, data)
      VALUES ('${escapedDeviceId}', '${escapedTableName}', NEW.rowid, 'INSERT', ${insertJson});
    END;
  `)

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS "_sync_track_${tableName}_UPDATE"
    AFTER UPDATE ON ${quotedTable}
    WHEN NOT EXISTS (SELECT 1 FROM _sync_applying)
    BEGIN
      INSERT INTO _sync_changelog (device_id, table_name, row_id, operation, data)
      VALUES ('${escapedDeviceId}', '${escapedTableName}', NEW.rowid, 'UPDATE', ${updateJson});
    END;
  `)

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS "_sync_track_${tableName}_DELETE"
    AFTER DELETE ON ${quotedTable}
    WHEN NOT EXISTS (SELECT 1 FROM _sync_applying)
    BEGIN
      INSERT INTO _sync_changelog (device_id, table_name, row_id, operation, data)
      VALUES ('${escapedDeviceId}', '${escapedTableName}', OLD.rowid, 'DELETE', NULL);
    END;
  `)
}

export const dropChangeTrackingTriggers = (db: Database, tableName: string): void => {
  db.exec(`DROP TRIGGER IF EXISTS "_sync_track_${tableName}_INSERT"`)
  db.exec(`DROP TRIGGER IF EXISTS "_sync_track_${tableName}_UPDATE"`)
  db.exec(`DROP TRIGGER IF EXISTS "_sync_track_${tableName}_DELETE"`)
}

const CORE_TABLE_COLUMNS: Record<string, TrackedColumn[]> = {
  plugins: [
    { name: 'id', type: 'TEXT' },
    { name: 'name', type: 'TEXT' },
    { name: 'version', type: 'TEXT' },
    { name: 'enabled', type: 'INTEGER' },
    { name: 'metadata', type: 'TEXT' },
  ],
  matrix: [
    { name: 'id', type: 'INTEGER' },
    { name: 'title', type: 'TEXT' },
    { name: 'source_plugin_id', type: 'TEXT' },
  ],
  matrix_columns: [
    { name: 'matrix_id', type: 'INTEGER' },
    { name: 'name', type: 'TEXT' },
    { name: 'type', type: 'TEXT' },
    { name: 'display_type', type: 'TEXT' },
    { name: 'order', type: 'INTEGER' },
    { name: 'options', type: 'TEXT' },
    { name: 'formula', type: 'TEXT' },
  ],
  matrix_traits: [
    { name: 'matrix_id', type: 'INTEGER' },
    { name: 'trait_type', type: 'TEXT' },
  ],
  rank: [
    { name: 'key', type: 'BLOB' },
    { name: 'matrix_id', type: 'INTEGER' },
    { name: 'row_kind', type: 'INTEGER' },
    { name: 'row_id', type: 'INTEGER' },
  ],
  joins: [
    { name: 'source_matrix_id', type: 'INTEGER' },
    { name: 'source_row_id', type: 'INTEGER' },
    { name: 'target_matrix_id', type: 'INTEGER' },
    { name: 'target_row_id', type: 'INTEGER' },
  ],
  face_configs: [
    { name: 'id', type: 'TEXT' },
    { name: 'face_type_id', type: 'TEXT' },
    { name: 'matrix_id', type: 'INTEGER' },
    { name: 'query', type: 'TEXT' },
    { name: 'slot_bindings', type: 'TEXT' },
    { name: 'settings', type: 'TEXT' },
    { name: 'created_by_plugin', type: 'TEXT' },
  ],
}

/** Install change-tracking triggers on the four core tables. */
export const installCoreTableTriggers = (db: Database, deviceId: string): void => {
  for (const [tableName, columns] of Object.entries(CORE_TABLE_COLUMNS)) {
    installChangeTrackingTriggers(db, tableName, deviceId, columns)
  }
}

/** Install change-tracking triggers on a matrix data table. */
export const installDataTableTriggers = (
  db: Database,
  matrixId: number,
  deviceId: string,
  columns: { name: string; type: string }[],
): void => {
  const tableName = `mx_${matrixId}_data`
  const allColumns: TrackedColumn[] = [{ name: 'id', type: 'INTEGER' }, ...columns]
  installChangeTrackingTriggers(db, tableName, deviceId, allColumns)
}

/** Drop and recreate data table triggers after a schema change. */
export const reinstallDataTableTriggers = (
  db: Database,
  matrixId: number,
  deviceId: string,
  columns: { name: string; type: string }[],
): void => {
  dropChangeTrackingTriggers(db, `mx_${matrixId}_data`)
  installDataTableTriggers(db, matrixId, deviceId, columns)
}

/**
 * Return the maximum seq value from `_sync_changelog`, or 0 if the table is empty.
 */
export const getLastSeq = (db: Database): number => {
  const stmt = db.prepare('SELECT MAX(seq) AS max_seq FROM _sync_changelog')
  let result = 0
  if (stmt.step()) {
    const row = stmt.get({}) as { max_seq: number | null }
    result = row.max_seq ?? 0
  }
  stmt.finalize()
  return result
}

/**
 * Build a `Changeset` from local changelog entries with `seq > sinceSeq`.
 * Reads the device_id from `_sync_state`.
 */
export const getLocalChanges = (db: Database, sinceSeq: number): Changeset => {
  const deviceStmt = db.prepare("SELECT value FROM _sync_state WHERE key = 'device_id'")
  let localDeviceId = ''
  if (deviceStmt.step()) {
    localDeviceId = (deviceStmt.get({}) as { value: string }).value
  }
  deviceStmt.finalize()

  const stmt = db.prepare(
    'SELECT seq, table_name, row_id, operation, timestamp, data FROM _sync_changelog WHERE seq > ? AND device_id = ? ORDER BY seq',
  )
  stmt.bind([sinceSeq, localDeviceId])

  const entries: ChangeEntry[] = []
  let maxSeq = sinceSeq
  while (stmt.step()) {
    const row = stmt.get({}) as {
      seq: number
      table_name: string
      row_id: number
      operation: 'INSERT' | 'UPDATE' | 'DELETE'
      timestamp: string
      data: string | null
    }
    entries.push({
      table: row.table_name,
      rowId: row.row_id,
      operation: row.operation,
      timestamp: row.timestamp,
      data: row.data ? (JSON.parse(row.data) as Record<string, unknown>) : null,
    })
    maxSeq = row.seq
  }
  stmt.finalize()

  return {
    deviceId: localDeviceId,
    fromSeq: sinceSeq,
    toSeq: entries.length > 0 ? maxSeq : sinceSeq,
    entries,
  }
}

/**
 * Read the `last_uploaded_seq` value from `_sync_state`, defaulting to 0.
 */
export const getLastUploadedSeq = (db: Database): number => {
  const stmt = db.prepare("SELECT value FROM _sync_state WHERE key = 'last_uploaded_seq'")
  let result = 0
  if (stmt.step()) {
    result = Number((stmt.get({}) as { value: string }).value)
  }
  stmt.finalize()
  return result
}

/**
 * Persist the `last_uploaded_seq` value in `_sync_state`.
 */
export const setLastUploadedSeq = (db: Database, seq: number): void => {
  db.exec(
    "INSERT INTO _sync_state (key, value) VALUES ('last_uploaded_seq', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    { bind: [String(seq)] },
  )
}

/**
 * Read the per-device high-water mark from `_sync_state`.
 * Returns 0 if no mark exists for this device.
 */
const getDeviceHighWaterMark = (db: Database, remoteDeviceId: string): number => {
  const key = `last_acked_seq_${remoteDeviceId}`
  const stmt = db.prepare('SELECT value FROM _sync_state WHERE key = ?')
  stmt.bind([key])
  let result = 0
  if (stmt.step()) {
    result = Number((stmt.get({}) as { value: string }).value)
  }
  stmt.finalize()
  return result
}

/**
 * Update the per-device high-water mark in `_sync_state`.
 */
const setDeviceHighWaterMark = (db: Database, remoteDeviceId: string, seq: number): void => {
  const key = `last_acked_seq_${remoteDeviceId}`
  db.exec(
    'INSERT INTO _sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    { bind: [key, String(seq)] },
  )
}

/**
 * Check if there are local modifications to the same (table_name, row_id)
 * since the last sync with the remote device.
 * Returns the most recent local changelog entry if a conflict exists, null otherwise.
 */
const findLocalConflict = (
  db: Database,
  tableName: string,
  rowId: number,
  localDeviceId: string,
  sinceSeq: number,
): { timestamp: string; data: string | null; operation: string } | null => {
  const stmt = db.prepare(
    `SELECT timestamp, data, operation FROM _sync_changelog
     WHERE table_name = ? AND row_id = ? AND device_id = ? AND seq > ?
     ORDER BY seq DESC LIMIT 1`,
  )
  stmt.bind([tableName, rowId, localDeviceId, sinceSeq])
  let result: { timestamp: string; data: string | null; operation: string } | null = null
  if (stmt.step()) {
    result = stmt.get({}) as { timestamp: string; data: string | null; operation: string }
  }
  stmt.finalize()
  return result
}

/**
 * Build column list from a data record for SQL operations.
 */
const buildInsertSql = (
  tableName: string,
  data: Record<string, unknown>,
): { sql: string; values: (string | number | Uint8Array | null)[] } => {
  const columns = Object.keys(data)
  const quotedCols = columns.map(quoteIdent).join(', ')
  const placeholders = columns.map(() => '?').join(', ')
  const values = columns.map((c) => data[c] as string | number | Uint8Array | null)
  return {
    sql: `INSERT OR REPLACE INTO ${quoteIdent(tableName)} (${quotedCols}) VALUES (${placeholders})`,
    values,
  }
}

const buildUpdateSql = (
  tableName: string,
  rowId: number,
  data: Record<string, unknown>,
): { sql: string; values: (string | number | Uint8Array | null)[] } => {
  const columns = Object.keys(data).filter((c) => c !== 'id' && c !== 'rowid')
  const setClauses = columns.map((c) => `${quoteIdent(c)} = ?`).join(', ')
  const values = [...columns.map((c) => data[c] as string | number | Uint8Array | null), rowId]
  return {
    sql: `UPDATE ${quoteIdent(tableName)} SET ${setClauses} WHERE rowid = ?`,
    values,
  }
}

/**
 * Decode a hex-encoded BLOB value back to a Uint8Array.
 */
const hexToBytes = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

/**
 * Convert data record values for SQL binding.
 * Rank table keys are hex-encoded BLOBs that need conversion back to Uint8Array.
 */
const prepareDataForTable = (
  tableName: string,
  data: Record<string, unknown>,
): Record<string, unknown> => {
  if (tableName === 'rank' && typeof data.key === 'string') {
    return { ...data, key: hexToBytes(data.key as string) }
  }
  return data
}

/**
 * Check for duplicate rank key collision when applying a remote rank change.
 * If a collision is found (same key, different row_id), re-rank one of the rows.
 * Deterministic tie-break: the row from the lower device_id keeps its key.
 */
const handleRankKeyCollision = (
  db: Database,
  data: Record<string, unknown>,
  remoteDeviceId: string,
  localDeviceId: string,
): void => {
  const incomingKey = data.key as Uint8Array
  const incomingRowId = data.row_id as number

  // Check if this key already exists for a different row
  const stmt = db.prepare('SELECT row_id, matrix_id FROM rank WHERE key = ?')
  stmt.bind([incomingKey])

  if (stmt.step()) {
    const existing = stmt.get({}) as { row_id: number; matrix_id: number }
    stmt.finalize()

    if (existing.row_id !== incomingRowId) {
      // Collision found! Determine who keeps the key.
      // Lower device_id keeps the key; the other gets re-ranked.
      const localKeepsKey = localDeviceId < remoteDeviceId

      // Find neighbors for re-ranking
      const matrixId = existing.matrix_id

      // Get the next key after the colliding key
      const nextStmt = db.prepare(
        'SELECT key FROM rank WHERE matrix_id = ? AND key > ? ORDER BY key ASC LIMIT 1',
      )
      nextStmt.bind([matrixId, incomingKey])
      let nextKey = new Uint8Array(0)
      if (nextStmt.step()) {
        nextKey = new Uint8Array((nextStmt.get({}) as { key: Uint8Array }).key)
      }
      nextStmt.finalize()

      const newKey = between(incomingKey, nextKey)

      if (localKeepsKey) {
        // Remote row gets re-ranked. We haven't inserted it yet, so just modify the data.
        data.key = newKey
      } else {
        // Local row gets re-ranked. Update the existing row's key.
        db.exec('UPDATE rank SET key = ? WHERE key = ?', { bind: [newKey, incomingKey] })
        // The incoming data keeps the original key (already set).
      }
    } else {
      stmt.finalize()
    }
  } else {
    stmt.finalize()
  }
}

/**
 * Apply a remote changeset to the local database.
 *
 * For each entry:
 * - Checks for local conflicts (same row modified since last sync with remote device)
 * - Resolves conflicts via LWW (last-write-wins by timestamp)
 * - Saves conflict records with both versions
 * - Handles duplicate rank key collisions
 * - Suppresses change-tracking triggers during apply
 *
 * Returns the set of matrix IDs whose rank entries were modified (for closure rebuild).
 */
export const applyRemoteChanges = (
  db: Database,
  changeset: Changeset,
): ApplyResult & { affectedRankMatrixIds: Set<number> } => {
  const localDeviceId = getLocalDeviceId(db)
  const lastAckedSeq = getDeviceHighWaterMark(db, changeset.deviceId)
  const conflicts: ConflictRecord[] = []
  let applied = 0
  const affectedRankMatrixIds = new Set<number>()

  withTransaction(db, () => {
    // Suppress change-tracking triggers
    db.exec('INSERT INTO _sync_applying (flag) VALUES (1)')

    for (const entry of changeset.entries) {
      const localConflict = findLocalConflict(
        db,
        entry.table,
        entry.rowId,
        localDeviceId,
        lastAckedSeq,
      )

      if (localConflict) {
        // Conflict detected — resolve via LWW
        const remoteTimestamp = entry.timestamp
        const localTimestamp = localConflict.timestamp

        const remoteWins = remoteTimestamp > localTimestamp

        const conflictRecord: ConflictRecord = {
          id: 0, // will be assigned by DB
          tableName: entry.table,
          rowId: entry.rowId,
          winner: remoteWins ? 'remote' : 'local',
          losingData:
            remoteWins ?
              (localConflict.data ?? JSON.stringify(null))
            : JSON.stringify(entry.data),
          winningData:
            remoteWins ?
              JSON.stringify(entry.data)
            : (localConflict.data ?? JSON.stringify(null)),
          detectedAt: '', // will be assigned by DB
          resolved: 0,
        }

        // Insert conflict record (with trigger suppression off for _sync_conflicts — it's not tracked)
        const insertConflictStmt = db.prepare(
          `INSERT INTO _sync_conflicts (table_name, row_id, winner, losing_data, winning_data)
           VALUES (?, ?, ?, ?, ?) RETURNING id, detected_at`,
        )
        insertConflictStmt.bind([
          conflictRecord.tableName,
          conflictRecord.rowId,
          conflictRecord.winner,
          conflictRecord.losingData,
          conflictRecord.winningData,
        ])
        if (insertConflictStmt.step()) {
          const row = insertConflictStmt.get({}) as { id: number; detected_at: string }
          conflictRecord.id = row.id
          conflictRecord.detectedAt = row.detected_at
        }
        insertConflictStmt.finalize()

        conflicts.push(conflictRecord)

        if (!remoteWins) {
          // Local wins — don't apply the remote change
          continue
        }
      }

      // Apply the change
      const preparedData = entry.data ? prepareDataForTable(entry.table, entry.data) : null

      if (entry.table === 'rank' && preparedData) {
        // Track affected matrix IDs for closure rebuild
        affectedRankMatrixIds.add(preparedData.matrix_id as number)
      }

      if (entry.operation === 'INSERT' && preparedData) {
        // Handle rank key collisions
        if (entry.table === 'rank') {
          handleRankKeyCollision(db, preparedData, changeset.deviceId, localDeviceId)
        }
        const { sql, values } = buildInsertSql(entry.table, preparedData)
        db.exec(sql, { bind: values })
        applied++
      } else if (entry.operation === 'UPDATE' && preparedData) {
        if (entry.table === 'rank') {
          handleRankKeyCollision(db, preparedData, changeset.deviceId, localDeviceId)
          // For rank updates, use INSERT OR REPLACE since key is the PK
          const { sql, values } = buildInsertSql(entry.table, preparedData)
          db.exec(sql, { bind: values })
        } else {
          const { sql, values } = buildUpdateSql(entry.table, entry.rowId, preparedData)
          db.exec(sql, { bind: values })
        }
        applied++
      } else if (entry.operation === 'DELETE') {
        if (entry.table === 'rank') {
          // Need to find the matrix_id before deleting for closure rebuild tracking
          const rankStmt = db.prepare('SELECT matrix_id FROM rank WHERE rowid = ?')
          rankStmt.bind([entry.rowId])
          if (rankStmt.step()) {
            affectedRankMatrixIds.add((rankStmt.get({}) as { matrix_id: number }).matrix_id)
          }
          rankStmt.finalize()
        }
        db.exec(`DELETE FROM ${quoteIdent(entry.table)} WHERE rowid = ?`, {
          bind: [entry.rowId],
        })
        applied++
      }
    }

    // Re-enable change-tracking triggers
    db.exec('DELETE FROM _sync_applying')

    // Rebuild closure tables for matrixes whose rank entries were modified
    for (const matrixId of affectedRankMatrixIds) {
      rebuildClosure(db, matrixId)
    }

    // Update per-device high-water mark
    setDeviceHighWaterMark(db, changeset.deviceId, changeset.toSeq)
  })

  return { applied, conflicts, affectedRankMatrixIds }
}

export type CompactChangelogOptions = {
  /** Keep all entries from the last N days (default 30). */
  retentionDays?: number
  /** Always keep the last M versions per (table_name, row_id) pair (default 10). */
  perRowCap?: number
}

/**
 * Compact the changelog by removing old entries that exceed the retention
 * window and per-row cap, provided all known devices have acknowledged them.
 *
 * An entry is deleted only if ALL of these conditions are met:
 * 1. Its seq is below all devices' acknowledged high-water marks.
 * 2. It is older than the retention window (retentionDays).
 * 3. It exceeds the per-row cap (more than perRowCap newer entries exist for the same table_name + row_id).
 */
export const compactChangelog = (
  db: Database,
  options: CompactChangelogOptions = {},
): number => {
  const retentionDays = options.retentionDays ?? 30
  const perRowCap = options.perRowCap ?? 10

  // Find the minimum high-water mark across all known devices.
  // Only compact entries that ALL devices have acknowledged.
  const hwmStmt = db.prepare(
    "SELECT MIN(CAST(value AS INTEGER)) AS min_hwm FROM _sync_state WHERE key LIKE 'last_acked_seq_%'",
  )
  let minHwm: number | null = null
  if (hwmStmt.step()) {
    const row = hwmStmt.get({}) as { min_hwm: number | null }
    minHwm = row.min_hwm
  }
  hwmStmt.finalize()

  // If no devices have high-water marks, nothing to compact
  // (no remote devices known, so no entries are safe to remove)
  if (minHwm === null) {
    return 0
  }

  // Delete entries that are:
  // 1. Below the minimum device high-water mark (all devices have seen them)
  // 2. Older than the retention window
  // 3. Exceeding the per-row cap (not among the last M entries for their row)
  //
  // We use a CTE to identify which entries to keep per (table_name, row_id)
  // and delete the rest that also satisfy conditions 1 and 2.
  const deleteSql = `
    DELETE FROM _sync_changelog
    WHERE seq IN (
      SELECT seq FROM _sync_changelog AS c
      WHERE c.seq <= ?
        AND c.timestamp < datetime('now', ?)
        AND (
          SELECT COUNT(*) FROM _sync_changelog AS c2
          WHERE c2.table_name = c.table_name
            AND c2.row_id = c.row_id
            AND c2.seq > c.seq
        ) >= ?
    )
  `

  const retentionModifier = `-${retentionDays} days`
  db.exec(deleteSql, { bind: [minHwm, retentionModifier, perRowCap] })

  return db.changes()
}

/**
 * Read the local device ID from `_sync_state`.
 */
const getLocalDeviceId = (db: Database): string => {
  const stmt = db.prepare("SELECT value FROM _sync_state WHERE key = 'device_id'")
  let result = ''
  if (stmt.step()) {
    result = (stmt.get({}) as { value: string }).value
  }
  stmt.finalize()
  return result
}
