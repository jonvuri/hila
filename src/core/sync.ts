import type { Database } from '@sqlite.org/sqlite-wasm'

import { parseFormulaRefs } from '../table/formula'

import type { ApplyResult, ChangeEntry, Changeset, ConflictRecord } from './sync-types'
import { rebuildClosure } from './closure'
import {
  DYNAMIC_DATA_TABLE_PATTERN,
  getReplicatedTableDefinitions,
  getTableDurabilityPolicy,
} from './durability-policy'
import { rebuildScrollIndex } from './scroll-index'
import { assertSemanticRoleEligible, type SemanticColumnRole } from './semantic-role'
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
  options: { recordOldOnDelete?: boolean } = {},
): void => {
  const quotedTable = quoteIdent(tableName)
  const escapedDeviceId = deviceId.replace(/'/g, "''")
  const escapedTableName = tableName.replace(/'/g, "''")

  const insertJson = buildJsonObjectExpr(columns, 'NEW')
  const updateJson = buildJsonObjectExpr(columns, 'NEW')
  // Every delete carries OLD data so remote apply and conflict detection can
  // use the manifest's logical identity. SQLite rowid is replica-local.
  const deleteData = options.recordOldOnDelete ? buildJsonObjectExpr(columns, 'OLD') : 'NULL'

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
      VALUES ('${escapedDeviceId}', '${escapedTableName}', OLD.rowid, 'DELETE', ${deleteData});
    END;
  `)
}

export const dropChangeTrackingTriggers = (db: Database, tableName: string): void => {
  db.exec(`DROP TRIGGER IF EXISTS "_sync_track_${tableName}_INSERT"`)
  db.exec(`DROP TRIGGER IF EXISTS "_sync_track_${tableName}_UPDATE"`)
  db.exec(`DROP TRIGGER IF EXISTS "_sync_track_${tableName}_DELETE"`)
}

/** Install change-tracking triggers on the core tables (drop+recreate to pick up column changes). */
export const installCoreTableTriggers = (db: Database, deviceId: string): void => {
  for (const { tableName, columns } of getReplicatedTableDefinitions()) {
    dropChangeTrackingTriggers(db, tableName)
    installChangeTrackingTriggers(db, tableName, deviceId, columns, {
      recordOldOnDelete: true,
    })
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
  installChangeTrackingTriggers(db, tableName, deviceId, allColumns, {
    recordOldOnDelete: true,
  })
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
 * Update the per-device high-water mark in `_sync_state`.
 */
const setDeviceHighWaterMark = (db: Database, remoteDeviceId: string, seq: number): void => {
  const key = `last_acked_seq_${remoteDeviceId}`
  db.exec(
    'INSERT INTO _sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    { bind: [key, String(seq)] },
  )
}

/** Local changelog boundary from the last apply by one remote device. */
const getLocalSeqAtRemoteApply = (db: Database, remoteDeviceId: string): number => {
  const key = `last_local_seq_at_apply_${remoteDeviceId}`
  const stmt = db.prepare('SELECT value FROM _sync_state WHERE key = ?')
  stmt.bind([key])
  let result = 0
  if (stmt.step()) {
    result = Number((stmt.get({}) as { value: string }).value)
  }
  stmt.finalize()
  return result
}

const setLocalSeqAtRemoteApply = (db: Database, remoteDeviceId: string, seq: number): void => {
  const key = `last_local_seq_at_apply_${remoteDeviceId}`
  db.exec(
    'INSERT INTO _sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    { bind: [key, String(seq)] },
  )
}

const getIdentityColumns = (tableName: string): readonly string[] => {
  const policy = getTableDurabilityPolicy(tableName)
  if (!policy || policy.durability !== 'replicated-source') {
    throw new Error(`Remote changes cannot target unreplicated table "${tableName}"`)
  }
  return policy.identity
}

const getIdentityData = (entry: ChangeEntry): Record<string, unknown> => {
  const identity = getIdentityColumns(entry.table)
  if (entry.data && identity.every((column) => column in entry.data!)) return entry.data
  if (identity.length === 1 && identity[0] === 'id') return { id: entry.rowId }
  throw new Error(`Remote ${entry.operation} for ${entry.table} lacks its logical identity`)
}

const hasSameIdentity = (
  tableName: string,
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean => {
  // An own-edge's parent is mutable, so concurrent reparents conflict by the
  // single-owned target rather than by the row's full composite primary key.
  if (tableName === 'joins' && left.kind === 'own' && right.kind === 'own') {
    return (
      left.target_matrix_id === right.target_matrix_id &&
      left.target_row_id === right.target_row_id
    )
  }
  return getIdentityColumns(tableName).every((column) => left[column] === right[column])
}

/** Find the newest local mutation with the same manifest-defined logical identity. */
const findLocalConflict = (
  db: Database,
  entry: ChangeEntry,
  localDeviceId: string,
  sinceSeq: number,
): { timestamp: string; data: string | null; operation: string } | null => {
  const remoteIdentity = getIdentityData(entry)
  const stmt = db.prepare(
    `SELECT timestamp, data, operation, row_id FROM _sync_changelog
     WHERE table_name = ? AND device_id = ? AND seq > ?
     ORDER BY seq DESC`,
  )
  stmt.bind([entry.table, localDeviceId, sinceSeq])
  let result: { timestamp: string; data: string | null; operation: string } | null = null
  while (stmt.step()) {
    const row = stmt.get({}) as {
      timestamp: string
      data: string | null
      operation: string
      row_id: number
    }
    const localData = row.data ? (JSON.parse(row.data) as Record<string, unknown>) : null
    const comparableData = localData ?? { id: row.row_id }
    if (hasSameIdentity(entry.table, remoteIdentity, comparableData)) {
      result = { timestamp: row.timestamp, data: row.data, operation: row.operation }
      break
    }
  }
  stmt.finalize()
  return result
}

const buildUpsertSql = (
  tableName: string,
  data: Record<string, unknown>,
): { sql: string; values: (string | number | Uint8Array | null)[] } => {
  const identity = getIdentityColumns(tableName)
  const columns = Object.keys(data)
  const updates = columns.filter((column) => !identity.includes(column))
  const conflictAction =
    updates.length > 0 ?
      `DO UPDATE SET ${updates
        .map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`)
        .join(', ')}`
    : 'DO NOTHING'
  return {
    sql: `INSERT INTO ${quoteIdent(tableName)} (${columns.map(quoteIdent).join(', ')})
          VALUES (${columns.map(() => '?').join(', ')})
          ON CONFLICT (${identity.map(quoteIdent).join(', ')}) ${conflictAction}`,
    values: columns.map((column) => data[column] as string | number | Uint8Array | null),
  }
}

const buildDeleteSql = (
  tableName: string,
  data: Record<string, unknown>,
): { sql: string; values: (string | number | Uint8Array | null)[] } => {
  const identity = getIdentityColumns(tableName)
  return {
    sql: `DELETE FROM ${quoteIdent(tableName)} WHERE ${identity
      .map((column) => `${quoteIdent(column)} = ?`)
      .join(' AND ')}`,
    values: identity.map((column) => data[column] as string | number | Uint8Array | null),
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
 * `joins.edge_key` is a hex-encoded BLOB that needs conversion to Uint8Array.
 */
const prepareDataForTable = (
  tableName: string,
  data: Record<string, unknown>,
): Record<string, unknown> => {
  const policy = getTableDurabilityPolicy(tableName)
  const sourceData =
    policy && !DYNAMIC_DATA_TABLE_PATTERN.test(tableName) ?
      Object.fromEntries(
        Object.entries(data).filter(([column]) => {
          const columnPolicy = policy.columns[column as keyof typeof policy.columns]
          return columnPolicy?.durability === 'replicated-source'
        }),
      )
    : data
  if (tableName === 'joins' && typeof sourceData.edge_key === 'string') {
    return {
      ...sourceData,
      edge_key: sourceData.edge_key === '' ? null : hexToBytes(sourceData.edge_key),
    }
  }
  return sourceData
}

type MatrixColumnSnapshot = {
  id: number
  matrix_id: number
  name: string
  type: string
  formula: string | null
}

const getMatrixColumnSnapshot = (
  db: Database,
  columnId: number,
): MatrixColumnSnapshot | null => {
  const stmt = db.prepare(
    'SELECT id, matrix_id, name, type, formula FROM matrix_columns WHERE id = ?',
  )
  stmt.bind([columnId])
  const result = stmt.step() ? (stmt.get({}) as MatrixColumnSnapshot) : null
  stmt.finalize()
  return result
}

const getPhysicalColumns = (
  db: Database,
  matrixId: number,
): { name: string; type: string; constraints: string | null }[] => {
  const stmt = db.prepare(
    'SELECT name, type, constraints FROM matrix_columns WHERE matrix_id = ? AND formula IS NULL ORDER BY "order", id',
  )
  stmt.bind([matrixId])
  const columns: { name: string; type: string; constraints: string | null }[] = []
  while (stmt.step()) {
    columns.push(stmt.get({}) as { name: string; type: string; constraints: string | null })
  }
  stmt.finalize()
  return columns
}

const tableExists = (db: Database, tableName: string): boolean => {
  const stmt = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
  stmt.bind([tableName])
  const exists = stmt.step()
  stmt.finalize()
  return exists
}

const reconcileDataTable = (db: Database, matrixId: number, deviceId: string): void => {
  const tableName = `mx_${matrixId}_data`
  const desired = getPhysicalColumns(db, matrixId)
  dropChangeTrackingTriggers(db, tableName)

  if (!tableExists(db, tableName)) {
    const columnSql = desired
      .map((column) => {
        const definition = `${quoteIdent(column.name)} ${column.type}`
        return column.constraints ? `${definition} ${column.constraints}` : definition
      })
      .join(', ')
    db.exec(
      `CREATE TABLE ${quoteIdent(tableName)} (
         id INTEGER PRIMARY KEY DEFAULT ((abs(random()) >> 10) + 1)
         ${columnSql ? `, ${columnSql}` : ''}
       ) STRICT`,
    )
  }

  const infoStmt = db.prepare(`PRAGMA table_info(${quoteIdent(tableName)})`)
  const actual = new Set<string>()
  while (infoStmt.step()) actual.add((infoStmt.get({}) as { name: string }).name)
  infoStmt.finalize()

  const desiredNames = new Set(['id', ...desired.map((column) => column.name)])
  for (const name of actual) {
    if (name !== 'id' && !desiredNames.has(name)) {
      db.exec(`ALTER TABLE ${quoteIdent(tableName)} DROP COLUMN ${quoteIdent(name)}`)
    }
  }
  for (const column of desired) {
    if (!actual.has(column.name)) {
      db.exec(
        `ALTER TABLE ${quoteIdent(tableName)} ADD COLUMN ${quoteIdent(column.name)} ${column.type}`,
      )
    }
  }

  installDataTableTriggers(db, matrixId, deviceId, desired)
}

const rebuildFormulaDependencies = (db: Database): void => {
  db.exec('DELETE FROM formula_column_deps')
  const stmt = db.prepare('SELECT id, formula FROM matrix_columns WHERE formula IS NOT NULL')
  const rows: { id: number; formula: string }[] = []
  while (stmt.step()) rows.push(stmt.get({}) as { id: number; formula: string })
  stmt.finalize()

  for (const row of rows) {
    for (const dependencyId of new Set(parseFormulaRefs(row.formula))) {
      db.exec(
        `INSERT INTO formula_column_deps (formula_col_id, dep_col_id)
         SELECT ?, ? WHERE EXISTS (SELECT 1 FROM matrix_columns WHERE id = ?)`,
        { bind: [row.id, dependencyId, dependencyId] },
      )
    }
  }
}

/**
 * Apply a remote changeset to the local database.
 *
 * For each entry:
 * - Checks for local conflicts (same row modified since last sync with remote device)
 * - Resolves conflicts via LWW (last-write-wins by timestamp)
 * - Saves conflict records with both versions
 * - Suppresses change-tracking triggers during apply
 *
 * Preserves the source sequence so later mutations supersede earlier ones.
 * Source operations are already dependency-valid because they committed in
 * this order. Dynamic data tables reconcile as metadata and row entries arrive.
 * Derived indexes rebuild inside the suppression window.
 */
export const applyRemoteChanges = (db: Database, changeset: Changeset): ApplyResult => {
  const localDeviceId = getLocalDeviceId(db)
  const localSeqAtLastApply = getLocalSeqAtRemoteApply(db, changeset.deviceId)
  const conflicts: ConflictRecord[] = []
  let applied = 0
  let joinsModified = false
  const dirtyMatrixIds = new Set<number>()
  const matrixColumnsModified = changeset.entries.some(
    (entry) => entry.table === 'matrix_columns',
  )

  withTransaction(db, () => {
    db.exec('INSERT INTO _sync_applying (flag) VALUES (1)')
    if (matrixColumnsModified) db.exec('DELETE FROM formula_column_deps')

    for (const entry of changeset.entries) {
      const localConflict = findLocalConflict(db, entry, localDeviceId, localSeqAtLastApply)

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

      const preparedData = entry.data ? prepareDataForTable(entry.table, entry.data) : null
      const identityData = prepareDataForTable(entry.table, getIdentityData(entry))
      const oldColumn =
        entry.table === 'matrix_columns' ?
          getMatrixColumnSnapshot(db, identityData.id as number)
        : null

      if (
        entry.table === 'matrix_columns' &&
        entry.operation !== 'DELETE' &&
        preparedData?.role != null
      ) {
        assertSemanticRoleEligible(
          {
            name: String(preparedData.name),
            type: String(preparedData.type),
            formula: preparedData.formula == null ? null : String(preparedData.formula),
          },
          preparedData.role as SemanticColumnRole,
        )
      }

      if (entry.table === 'matrix' && entry.operation === 'DELETE') {
        const matrixId = identityData.id as number
        dirtyMatrixIds.delete(matrixId)
        dropChangeTrackingTriggers(db, `mx_${matrixId}_data`)
        db.exec(`DROP TABLE IF EXISTS ${quoteIdent(`mx_${matrixId}_data`)}`)
      }

      if (
        entry.table === 'matrix_columns' &&
        entry.operation === 'UPDATE' &&
        preparedData &&
        oldColumn?.formula === null &&
        preparedData.formula == null &&
        oldColumn.name !== preparedData.name
      ) {
        const tableName = `mx_${oldColumn.matrix_id}_data`
        dropChangeTrackingTriggers(db, tableName)
        db.exec(
          `ALTER TABLE ${quoteIdent(tableName)} RENAME COLUMN ${quoteIdent(oldColumn.name)} TO ${quoteIdent(String(preparedData.name))}`,
        )
      }

      if (DYNAMIC_DATA_TABLE_PATTERN.test(entry.table)) {
        const matrixId = Number(entry.table.slice(3, -5))
        reconcileDataTable(db, matrixId, localDeviceId)
        dirtyMatrixIds.delete(matrixId)
      }

      if ((entry.operation === 'INSERT' || entry.operation === 'UPDATE') && preparedData) {
        if (entry.table === 'joins') {
          if (preparedData.kind === 'own') {
            db.exec(
              `DELETE FROM joins
               WHERE target_matrix_id = ? AND target_row_id = ? AND kind = 'own'`,
              {
                bind: [
                  preparedData.target_matrix_id as number,
                  preparedData.target_row_id as number,
                ],
              },
            )
          }
        }
        const { sql, values } = buildUpsertSql(entry.table, preparedData)
        db.exec(sql, { bind: values })
        applied++
      } else if (entry.operation === 'DELETE') {
        if (entry.table === 'joins' && identityData.kind === 'own') {
          db.exec(
            `DELETE FROM joins
             WHERE target_matrix_id = ? AND target_row_id = ? AND kind = 'own'`,
            {
              bind: [
                identityData.target_matrix_id as number,
                identityData.target_row_id as number,
              ],
            },
          )
        } else {
          const { sql, values } = buildDeleteSql(entry.table, identityData)
          db.exec(sql, { bind: values })
        }
        applied++
      }

      if (entry.table === 'joins') joinsModified = true

      if (entry.table === 'matrix' && entry.operation !== 'DELETE') {
        dirtyMatrixIds.add(identityData.id as number)
      } else if (entry.table === 'matrix_columns') {
        const matrixId = (preparedData?.matrix_id ?? oldColumn?.matrix_id) as number
        dirtyMatrixIds.add(matrixId)
      }
    }

    for (const matrixId of dirtyMatrixIds) {
      reconcileDataTable(db, matrixId, localDeviceId)
    }

    if (joinsModified) {
      rebuildClosure(db)
      rebuildScrollIndex(db)
    }
    if (matrixColumnsModified) rebuildFormulaDependencies(db)

    db.exec('DELETE FROM _sync_applying')

    // Update per-device high-water mark
    setDeviceHighWaterMark(db, changeset.deviceId, changeset.toSeq)
    setLocalSeqAtRemoteApply(db, changeset.deviceId, getLastSeq(db))
  })

  return { applied, conflicts }
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
