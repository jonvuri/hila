import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  initMatrixSchema,
  createMatrix,
  getColumns,
  addColumn,
  insertDataRow,
} from '../core/matrix'
import { registerFaceType, clearFaceTypeRegistry } from '../core/face-registry'
import { applyFaceToMatrix, getFaceConfig } from '../core/face-config'

import { buildTableQuery, type SortConfig, type FilterConfig } from './table-query'
import { getColumnTypeInfo } from './TableFace'
import { tableFaceTypeDefinition } from './table-plugin'

afterEach(() => {
  clearFaceTypeRegistry()
})

// -- Query builder tests ------------------------------------------------------

describe('buildTableQuery', () => {
  test('builds a basic SELECT * query with no sort or filters', () => {
    const q = buildTableQuery(42, null, [])
    expect(q).toBe('SELECT * FROM "mx_42_data"')
  })

  test('adds ORDER BY when sort is specified', () => {
    const sort: SortConfig = { column: 'name', direction: 'ASC' }
    const q = buildTableQuery(42, sort, [])
    expect(q).toBe('SELECT * FROM "mx_42_data" ORDER BY "name" ASC')
  })

  test('adds ORDER BY DESC', () => {
    const sort: SortConfig = { column: 'age', direction: 'DESC' }
    const q = buildTableQuery(42, sort, [])
    expect(q).toBe('SELECT * FROM "mx_42_data" ORDER BY "age" DESC')
  })

  test('adds WHERE clause for filters', () => {
    const filters: FilterConfig[] = [{ column: 'age', operator: '>', value: '30' }]
    const q = buildTableQuery(42, null, filters)
    expect(q).toBe(`SELECT * FROM "mx_42_data" WHERE "age" > '30'`)
  })

  test('combines multiple filters with AND', () => {
    const filters: FilterConfig[] = [
      { column: 'age', operator: '>', value: '30' },
      { column: 'name', operator: '=', value: 'Alice' },
    ]
    const q = buildTableQuery(42, null, filters)
    expect(q).toBe(`SELECT * FROM "mx_42_data" WHERE "age" > '30' AND "name" = 'Alice'`)
  })

  test('handles LIKE operator with wrapping', () => {
    const filters: FilterConfig[] = [{ column: 'name', operator: 'LIKE', value: 'Ali' }]
    const q = buildTableQuery(42, null, filters)
    expect(q).toBe(`SELECT * FROM "mx_42_data" WHERE "name" LIKE '%' || 'Ali' || '%'`)
  })

  test('combines filters and sort', () => {
    const sort: SortConfig = { column: 'name', direction: 'ASC' }
    const filters: FilterConfig[] = [{ column: 'active', operator: '=', value: '1' }]
    const q = buildTableQuery(42, sort, filters)
    expect(q).toBe(`SELECT * FROM "mx_42_data" WHERE "active" = '1' ORDER BY "name" ASC`)
  })

  test('escapes single quotes in filter values', () => {
    const filters: FilterConfig[] = [{ column: 'name', operator: '=', value: "O'Brien" }]
    const q = buildTableQuery(42, null, filters)
    expect(q).toBe(`SELECT * FROM "mx_42_data" WHERE "name" = 'O''Brien'`)
  })

  test('escapes double quotes in column names', () => {
    const sort: SortConfig = { column: 'my"col', direction: 'ASC' }
    const q = buildTableQuery(42, sort, [])
    expect(q).toBe('SELECT * FROM "mx_42_data" ORDER BY "my""col" ASC')
  })
})

// -- Column type rendering dispatch -------------------------------------------

describe('getColumnTypeInfo', () => {
  test('returns correct info for text type', () => {
    const info = getColumnTypeInfo('text')
    expect(info.value).toBe('text')
    expect(info.label).toBe('Text')
    expect(info.sqliteType).toBe('TEXT')
  })

  test('returns correct info for number type', () => {
    const info = getColumnTypeInfo('number')
    expect(info.value).toBe('number')
    expect(info.label).toBe('Number')
    expect(info.sqliteType).toBe('REAL')
  })

  test('returns correct info for date type', () => {
    const info = getColumnTypeInfo('date')
    expect(info.value).toBe('date')
    expect(info.sqliteType).toBe('TEXT')
  })

  test('returns correct info for boolean type', () => {
    const info = getColumnTypeInfo('boolean')
    expect(info.value).toBe('boolean')
    expect(info.sqliteType).toBe('INTEGER')
  })

  test('returns correct info for select type', () => {
    const info = getColumnTypeInfo('select')
    expect(info.value).toBe('select')
    expect(info.sqliteType).toBe('TEXT')
  })

  test('falls back to text for unknown type', () => {
    const info = getColumnTypeInfo('unknown')
    expect(info.value).toBe('text')
  })
})

// -- Schema and DB integration tests ------------------------------------------

describe('Table face schema', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('matrix_columns includes display_type and options', () => {
    const matrixId = createMatrix(db, 'Test', [
      { name: 'title', type: 'TEXT' },
      { name: 'count', type: 'INTEGER' },
    ])

    const cols = getColumns(db, matrixId)
    expect(cols).toHaveLength(2)

    expect(cols[0]!.name).toBe('title')
    expect(cols[0]!.type).toBe('TEXT')
    expect(cols[0]!.displayType).toBe('text')
    expect(cols[0]!.options).toBeNull()

    expect(cols[1]!.name).toBe('count')
    expect(cols[1]!.type).toBe('INTEGER')
    expect(cols[1]!.displayType).toBe('number')
    expect(cols[1]!.options).toBeNull()
  })

  test('addColumn sets default display type from SQLite type', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'title', type: 'TEXT' }])
    addColumn(db, matrixId, { name: 'amount', type: 'REAL' })

    const cols = getColumns(db, matrixId)
    const amountCol = cols.find((c) => c.name === 'amount')
    expect(amountCol).toBeDefined()
    expect(amountCol!.displayType).toBe('number')
  })

  test('addColumn accepts explicit display type', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'title', type: 'TEXT' }])
    addColumn(db, matrixId, { name: 'due_date', type: 'TEXT', displayType: 'date' })

    const cols = getColumns(db, matrixId)
    const dateCol = cols.find((c) => c.name === 'due_date')
    expect(dateCol).toBeDefined()
    expect(dateCol!.displayType).toBe('date')
  })

  test('addColumn accepts options for select type', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'title', type: 'TEXT' }])
    const opts = JSON.stringify(['Low', 'Medium', 'High'])
    addColumn(db, matrixId, {
      name: 'priority',
      type: 'TEXT',
      displayType: 'select',
      options: opts,
    })

    const cols = getColumns(db, matrixId)
    const selCol = cols.find((c) => c.name === 'priority')
    expect(selCol).toBeDefined()
    expect(selCol!.displayType).toBe('select')
    expect(selCol!.options).toBe(opts)
  })

  test('insertDataRow creates a data row and returns its id', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'title', type: 'TEXT' }])
    const rowId = insertDataRow(db, matrixId, { title: 'Hello' })
    expect(typeof rowId).toBe('number')
    expect(rowId).toBeGreaterThan(0)

    const stmt = db.prepare(`SELECT title FROM "mx_${matrixId}_data" WHERE id = ?`)
    stmt.bind([rowId])
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { title: string }
    expect(row.title).toBe('Hello')
    stmt.finalize()
  })

  test('table face type can be applied to a matrix', () => {
    registerFaceType(tableFaceTypeDefinition)
    const matrixId = createMatrix(db, 'Test', [{ name: 'title', type: 'TEXT' }])
    const config = applyFaceToMatrix(db, 'hila.table', matrixId)

    expect(config.faceTypeId).toBe('hila.table')
    expect(config.matrixId).toBe(matrixId)
    expect(config.slotBindings).toEqual({})
    expect(config.query).toBe(`SELECT * FROM "mx_${matrixId}_data"`)

    const loaded = getFaceConfig(db, config.id)
    expect(loaded).not.toBeNull()
    expect(loaded!.faceTypeId).toBe('hila.table')
  })
})
