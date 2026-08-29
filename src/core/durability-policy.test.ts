import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  CORE_DURABILITY_POLICY,
  DYNAMIC_DATA_TABLE_PATTERN,
  getColumnDurabilityPolicy,
  getTableDurabilityPolicy,
} from './durability-policy'
import { ensureRootMatrix, initMatrixSchema, resetDeviceIdCache } from './matrix'

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
})
