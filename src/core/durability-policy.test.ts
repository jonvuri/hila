import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  CORE_DURABILITY_POLICY,
  DYNAMIC_DATA_TABLE_PATTERN,
  getColumnDurabilityPolicy,
  getTableDurabilityPolicy,
} from './durability-policy'
import { auditDurabilityPolicy } from './durability-policy-audit'
import {
  addColumn,
  addFormulaColumn,
  createMatrix,
  ensureRootMatrix,
  getOrCreateDeviceId,
  initMatrixSchema,
  removeColumn,
  renameColumn,
  resetDeviceIdCache,
} from './matrix'
import {
  installChangeTrackingTriggers,
  installCoreTableTriggers,
  reinstallDataTableTriggers,
} from './sync'

type SchemaColumn = {
  name: string
  type: string
}

type SchemaTable = {
  name: string
  columns: SchemaColumn[]
}

const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`

const generateSchemaReport = (db: Database): SchemaTable[] => {
  const tableStmt = db.prepare(
    `SELECT name
     FROM sqlite_schema
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`,
  )
  const tableNames: string[] = []
  while (tableStmt.step()) {
    tableNames.push((tableStmt.get({}) as { name: string }).name)
  }
  tableStmt.finalize()

  return tableNames.map((name) => {
    const columnStmt = db.prepare(`PRAGMA table_info(${quoteIdent(name)})`)
    const columns: SchemaColumn[] = []
    while (columnStmt.step()) {
      const column = columnStmt.get({}) as SchemaColumn
      columns.push({ name: column.name, type: column.type })
    }
    columnStmt.finalize()
    return { name, columns }
  })
}

describe('durability policy inventory', () => {
  let db: Database
  let schemaReport: SchemaTable[]

  beforeAll(async () => {
    resetDeviceIdCache()
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    ensureRootMatrix(db)
    installCoreTableTriggers(db, getOrCreateDeviceId(db))
    schemaReport = generateSchemaReport(db)
  })

  afterAll(() => {
    db.close()
    resetDeviceIdCache()
  })

  test('generated fresh-schema report and manifest contain the same application table set', () => {
    const reportNames = schemaReport.map((table) => table.name)
    const dynamicNames = reportNames.filter((name) => DYNAMIC_DATA_TABLE_PATTERN.test(name))
    const policyNames = [...Object.keys(CORE_DURABILITY_POLICY), ...dynamicNames].sort()

    expect(reportNames).toEqual(policyNames)
    for (const table of schemaReport) {
      expect(getTableDurabilityPolicy(table.name)).not.toBeNull()
    }
  })

  test('every fresh-schema column is classified exactly once with its declared type', () => {
    for (const table of schemaReport) {
      const tablePolicy = getTableDurabilityPolicy(table.name)
      expect(tablePolicy, table.name).not.toBeNull()

      for (const column of table.columns) {
        const columnPolicy = getColumnDurabilityPolicy(table.name, column.name)
        expect(columnPolicy, `${table.name}.${column.name}`).not.toBeNull()
        if (!DYNAMIC_DATA_TABLE_PATTERN.test(table.name)) {
          expect(columnPolicy?.storageType, `${table.name}.${column.name}`).toBe(column.type)
        }
      }

      if (!DYNAMIC_DATA_TABLE_PATTERN.test(table.name)) {
        expect(Object.keys(tablePolicy!.columns).sort(), table.name).toEqual(
          table.columns.map((column) => column.name).sort(),
        )
      }
    }
  })

  test('dynamic data-table columns match their replicated matrix-column owners', () => {
    const dynamicTable = schemaReport.find((table) => table.name === 'mx_1_data')
    expect(dynamicTable).toBeDefined()

    const registryStmt = db.prepare(
      `SELECT name, type
       FROM matrix_columns
       WHERE matrix_id = 1 AND formula IS NULL
       ORDER BY "order"`,
    )
    const registryColumns: SchemaColumn[] = []
    while (registryStmt.step()) {
      registryColumns.push(registryStmt.get({}) as SchemaColumn)
    }
    registryStmt.finalize()

    expect(dynamicTable!.columns).toEqual([{ name: 'id', type: 'INTEGER' }, ...registryColumns])
    for (const column of dynamicTable!.columns) {
      expect(getColumnDurabilityPolicy(dynamicTable!.name, column.name)?.durability).toBe(
        'replicated-source',
      )
    }
  })

  test('fresh schema and installed tracking satisfy the durability contract', () => {
    expect(auditDurabilityPolicy(db)).toEqual([])
  })

  test('guard reports an unclassified table and column', () => {
    db.exec('SAVEPOINT durability_unclassified_fixture')
    try {
      db.exec('CREATE TABLE durability_fixture (id INTEGER PRIMARY KEY) STRICT')
      db.exec('ALTER TABLE matrix ADD COLUMN durability_fixture TEXT')

      expect(auditDurabilityPolicy(db)).toEqual(
        expect.arrayContaining([
          'Unclassified table: durability_fixture',
          'Unclassified column: matrix.durability_fixture',
        ]),
      )
    } finally {
      db.exec('ROLLBACK TO durability_unclassified_fixture')
      db.exec('RELEASE durability_unclassified_fixture')
    }
  })

  test('guard reports stale tracked columns', () => {
    db.exec('SAVEPOINT durability_stale_fixture')
    try {
      reinstallDataTableTriggers(db, 1, getOrCreateDeviceId(db), [])

      expect(auditDurabilityPolicy(db)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Tracked columns differ: mx_1_data.INSERT'),
          expect.stringContaining('Tracked columns differ: mx_1_data.UPDATE'),
          expect.stringContaining('Tracked columns differ: mx_1_data.DELETE'),
        ]),
      )
    } finally {
      db.exec('ROLLBACK TO durability_stale_fixture')
      db.exec('RELEASE durability_stale_fixture')
    }
  })

  test('guard reports a dynamic column absent from its matrix-column registry', () => {
    db.exec('SAVEPOINT durability_dynamic_registry_fixture')
    try {
      db.exec('ALTER TABLE mx_1_data ADD COLUMN durability_unregistered TEXT')
      reinstallDataTableTriggers(db, 1, getOrCreateDeviceId(db), [
        { name: 'content', type: 'TEXT' },
        { name: 'durability_unregistered', type: 'TEXT' },
      ])

      expect(auditDurabilityPolicy(db)).toContain(
        'Unregistered dynamic column: mx_1_data.durability_unregistered',
      )
    } finally {
      db.exec('ROLLBACK TO durability_dynamic_registry_fixture')
      db.exec('RELEASE durability_dynamic_registry_fixture')
    }
  })

  test('guard reports when a named trigger uses the wrong SQL operation', () => {
    db.exec('SAVEPOINT durability_trigger_operation_fixture')
    try {
      const triggerName = '_sync_track_matrix_INSERT'
      const stmt = db.prepare(
        "SELECT sql FROM sqlite_schema WHERE type = 'trigger' AND name = ?",
      )
      stmt.bind([triggerName])
      expect(stmt.step()).toBe(true)
      const triggerSql = (stmt.get({}) as { sql: string }).sql
      stmt.finalize()

      db.exec(`DROP TRIGGER "${triggerName}"`)
      db.exec(triggerSql.replace(/\bAFTER\s+INSERT\s+ON\b/i, 'AFTER UPDATE ON'))

      expect(auditDurabilityPolicy(db)).toContain(
        `Tracking trigger operation differs from name: ${triggerName} (name INSERT, SQL UPDATE)`,
      )
    } finally {
      db.exec('ROLLBACK TO durability_trigger_operation_fixture')
      db.exec('RELEASE durability_trigger_operation_fixture')
    }
  })

  test('guard reports tracking installed on a derived table', () => {
    db.exec('SAVEPOINT durability_derived_fixture')
    try {
      installChangeTrackingTriggers(db, 'closure', getOrCreateDeviceId(db), [
        { name: 'ancestor_matrix_id', type: 'INTEGER' },
      ])

      expect(auditDurabilityPolicy(db)).toContain('Non-replicated table is tracked: closure')
    } finally {
      db.exec('ROLLBACK TO durability_derived_fixture')
      db.exec('RELEASE durability_derived_fixture')
    }
  })

  test('dynamic schema mutations keep physical tracking complete', () => {
    const matrixId = createMatrix(db, 'Durability', [
      { name: 'title', type: 'TEXT' },
      { name: 'score', type: 'INTEGER' },
    ])
    expect(auditDurabilityPolicy(db)).toEqual([])

    addFormulaColumn(db, matrixId, 'computed', 'length(title)')
    addColumn(db, matrixId, { name: 'notes', type: 'TEXT' })
    expect(auditDurabilityPolicy(db)).toEqual([])

    removeColumn(db, matrixId, 'score')
    expect(auditDurabilityPolicy(db)).toEqual([])

    renameColumn(db, matrixId, 'notes', 'details')
    expect(auditDurabilityPolicy(db)).toEqual([])
  })
})
