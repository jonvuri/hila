import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  initMatrixSchema,
  createMatrix,
  getColumns,
  addColumn,
  insertDataRow,
  updateRow,
  insertJoin,
  deleteJoin,
  getTargets,
  deleteOwnedTarget,
} from '../core/matrix'
import { registerFaceType, clearFaceTypeRegistry } from '../core/face-registry'
import { applyFaceToMatrix, getFaceConfig } from '../core/face-config'

import { buildTableQuery, type SortConfig, type FilterConfig } from './table-query'
import {
  getColumnTypeInfo,
  type ReferenceCellValue,
  type ReferenceColumnConfig,
} from './TableFace'
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

// -- Reference column type tests ----------------------------------------------

describe('getColumnTypeInfo reference', () => {
  test('returns correct info for reference type', () => {
    const info = getColumnTypeInfo('reference')
    expect(info.value).toBe('reference')
    expect(info.label).toBe('Reference')
    expect(info.icon).toBe('→')
    expect(info.sqliteType).toBe('TEXT')
  })
})

describe('Reference column schema', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('addColumn creates a reference column with options', () => {
    const sourceMatrixId = createMatrix(db, 'Source', [{ name: 'title', type: 'TEXT' }])
    const targetMatrixId = createMatrix(db, 'Target', [{ name: 'title', type: 'TEXT' }])

    const options = JSON.stringify({
      targetMatrixId,
      defaultKind: 'ref',
    } satisfies ReferenceColumnConfig)

    addColumn(db, sourceMatrixId, {
      name: 'link',
      type: 'TEXT',
      displayType: 'reference',
      options,
    })

    const cols = getColumns(db, sourceMatrixId)
    const refCol = cols.find((c) => c.name === 'link')
    expect(refCol).toBeDefined()
    expect(refCol!.displayType).toBe('reference')
    expect(refCol!.options).toBe(options)

    const parsed = JSON.parse(refCol!.options!) as ReferenceColumnConfig
    expect(parsed.targetMatrixId).toBe(targetMatrixId)
    expect(parsed.defaultKind).toBe('ref')
  })

  test('setting a reference cell creates a join entry', () => {
    const sourceMatrixId = createMatrix(db, 'Source', [
      { name: 'title', type: 'TEXT' },
      { name: 'link', type: 'TEXT' },
    ])
    const targetMatrixId = createMatrix(db, 'Target', [{ name: 'title', type: 'TEXT' }])

    const sourceRowId = insertDataRow(db, sourceMatrixId, { title: 'Source Row' })
    const targetRowId = insertDataRow(db, targetMatrixId, { title: 'Target Row' })

    const refValue: ReferenceCellValue = {
      targetMatrixId,
      targetRowId,
      kind: 'ref',
    }
    updateRow(db, {
      matrixId: sourceMatrixId,
      rowId: sourceRowId,
      values: { link: JSON.stringify(refValue) },
    })
    insertJoin(db, sourceMatrixId, sourceRowId, targetMatrixId, targetRowId, 'ref')

    const targets = getTargets(db, sourceMatrixId, sourceRowId)
    expect(targets).toHaveLength(1)
    expect(targets[0]!.targetMatrixId).toBe(targetMatrixId)
    expect(targets[0]!.targetRowId).toBe(targetRowId)
    expect(targets[0]!.kind).toBe('ref')

    const stmt = db.prepare(`SELECT link FROM "mx_${sourceMatrixId}_data" WHERE id = ?`)
    stmt.bind([sourceRowId])
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { link: string }
    const stored = JSON.parse(row.link) as ReferenceCellValue
    expect(stored.targetMatrixId).toBe(targetMatrixId)
    expect(stored.targetRowId).toBe(targetRowId)
    expect(stored.kind).toBe('ref')
    stmt.finalize()
  })

  test('clearing a reference cell removes the join entry', () => {
    const sourceMatrixId = createMatrix(db, 'Source', [
      { name: 'title', type: 'TEXT' },
      { name: 'link', type: 'TEXT' },
    ])
    const targetMatrixId = createMatrix(db, 'Target', [{ name: 'title', type: 'TEXT' }])

    const sourceRowId = insertDataRow(db, sourceMatrixId, { title: 'Source Row' })
    const targetRowId = insertDataRow(db, targetMatrixId, { title: 'Target Row' })

    const refValue: ReferenceCellValue = {
      targetMatrixId,
      targetRowId,
      kind: 'ref',
    }
    updateRow(db, {
      matrixId: sourceMatrixId,
      rowId: sourceRowId,
      values: { link: JSON.stringify(refValue) },
    })
    insertJoin(db, sourceMatrixId, sourceRowId, targetMatrixId, targetRowId, 'ref')

    expect(getTargets(db, sourceMatrixId, sourceRowId)).toHaveLength(1)

    deleteJoin(db, sourceMatrixId, sourceRowId, targetMatrixId, targetRowId)
    updateRow(db, {
      matrixId: sourceMatrixId,
      rowId: sourceRowId,
      values: { link: null },
    })

    expect(getTargets(db, sourceMatrixId, sourceRowId)).toHaveLength(0)

    const stmt = db.prepare(`SELECT link FROM "mx_${sourceMatrixId}_data" WHERE id = ?`)
    stmt.bind([sourceRowId])
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { link: string | null }
    expect(row.link).toBeNull()
    stmt.finalize()
  })

  test('the cell renders the target row title (title is resolvable)', () => {
    const sourceMatrixId = createMatrix(db, 'Source', [
      { name: 'title', type: 'TEXT' },
      { name: 'link', type: 'TEXT' },
    ])
    const targetMatrixId = createMatrix(db, 'Target', [{ name: 'title', type: 'TEXT' }])

    const targetRowId = insertDataRow(db, targetMatrixId, { title: 'My Target' })
    const sourceRowId = insertDataRow(db, sourceMatrixId, { title: 'Source Row' })

    const refValue: ReferenceCellValue = {
      targetMatrixId,
      targetRowId,
      kind: 'ref',
    }
    updateRow(db, {
      matrixId: sourceMatrixId,
      rowId: sourceRowId,
      values: { link: JSON.stringify(refValue) },
    })

    const stmt = db.prepare(`SELECT title FROM "mx_${targetMatrixId}_data" WHERE id = ?`)
    stmt.bind([targetRowId])
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { title: string }
    expect(row.title).toBe('My Target')
    stmt.finalize()
  })

  test('changing a reference removes old join and creates new join', () => {
    const sourceMatrixId = createMatrix(db, 'Source', [
      { name: 'title', type: 'TEXT' },
      { name: 'link', type: 'TEXT' },
    ])
    const targetMatrixId = createMatrix(db, 'Target', [{ name: 'title', type: 'TEXT' }])

    const sourceRowId = insertDataRow(db, sourceMatrixId, { title: 'Source Row' })
    const target1Id = insertDataRow(db, targetMatrixId, { title: 'Target 1' })
    const target2Id = insertDataRow(db, targetMatrixId, { title: 'Target 2' })

    const refValue1: ReferenceCellValue = {
      targetMatrixId,
      targetRowId: target1Id,
      kind: 'ref',
    }
    updateRow(db, {
      matrixId: sourceMatrixId,
      rowId: sourceRowId,
      values: { link: JSON.stringify(refValue1) },
    })
    insertJoin(db, sourceMatrixId, sourceRowId, targetMatrixId, target1Id, 'ref')

    let targets = getTargets(db, sourceMatrixId, sourceRowId)
    expect(targets).toHaveLength(1)
    expect(targets[0]!.targetRowId).toBe(target1Id)

    deleteJoin(db, sourceMatrixId, sourceRowId, targetMatrixId, target1Id)
    const refValue2: ReferenceCellValue = {
      targetMatrixId,
      targetRowId: target2Id,
      kind: 'ref',
    }
    updateRow(db, {
      matrixId: sourceMatrixId,
      rowId: sourceRowId,
      values: { link: JSON.stringify(refValue2) },
    })
    insertJoin(db, sourceMatrixId, sourceRowId, targetMatrixId, target2Id, 'ref')

    targets = getTargets(db, sourceMatrixId, sourceRowId)
    expect(targets).toHaveLength(1)
    expect(targets[0]!.targetRowId).toBe(target2Id)
  })

  test('clearing an own-kind reference cascades deletion to target', () => {
    const sourceMatrixId = createMatrix(db, 'Source', [
      { name: 'title', type: 'TEXT' },
      { name: 'link', type: 'TEXT' },
    ])
    const targetMatrixId = createMatrix(db, 'Target', [{ name: 'title', type: 'TEXT' }])

    const sourceRowId = insertDataRow(db, sourceMatrixId, { title: 'Source Row' })
    const targetRowId = insertDataRow(db, targetMatrixId, { title: 'Owned Target' })

    const refValue: ReferenceCellValue = {
      targetMatrixId,
      targetRowId,
      kind: 'own',
    }
    updateRow(db, {
      matrixId: sourceMatrixId,
      rowId: sourceRowId,
      values: { link: JSON.stringify(refValue) },
    })
    insertJoin(db, sourceMatrixId, sourceRowId, targetMatrixId, targetRowId, 'own')

    deleteJoin(db, sourceMatrixId, sourceRowId, targetMatrixId, targetRowId)
    deleteOwnedTarget(db, targetMatrixId, targetRowId)
    updateRow(db, {
      matrixId: sourceMatrixId,
      rowId: sourceRowId,
      values: { link: null },
    })

    expect(getTargets(db, sourceMatrixId, sourceRowId)).toHaveLength(0)

    const stmt = db.prepare(
      `SELECT COUNT(*) as cnt FROM "mx_${targetMatrixId}_data" WHERE id = ?`,
    )
    stmt.bind([targetRowId])
    stmt.step()
    const row = stmt.get({}) as { cnt: number }
    expect(row.cnt).toBe(0)
    stmt.finalize()
  })
})
