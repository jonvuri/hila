import type { Database } from '@sqlite.org/sqlite-wasm'

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
    BEGIN
      INSERT INTO _sync_changelog (device_id, table_name, row_id, operation, data)
      VALUES ('${escapedDeviceId}', '${escapedTableName}', NEW.rowid, 'INSERT', ${insertJson});
    END;
  `)

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS "_sync_track_${tableName}_UPDATE"
    AFTER UPDATE ON ${quotedTable}
    BEGIN
      INSERT INTO _sync_changelog (device_id, table_name, row_id, operation, data)
      VALUES ('${escapedDeviceId}', '${escapedTableName}', NEW.rowid, 'UPDATE', ${updateJson});
    END;
  `)

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS "_sync_track_${tableName}_DELETE"
    AFTER DELETE ON ${quotedTable}
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
  matrix: [
    { name: 'id', type: 'INTEGER' },
    { name: 'title', type: 'TEXT' },
  ],
  matrix_columns: [
    { name: 'matrix_id', type: 'INTEGER' },
    { name: 'name', type: 'TEXT' },
    { name: 'type', type: 'TEXT' },
    { name: 'order', type: 'INTEGER' },
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
