import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  initMatrixSchema,
  createMatrix,
  getColumns,
  addColumn,
  addFormulaColumn,
  removeColumn,
  renameColumn,
  insertDataRow,
  updateRow,
  insertJoin,
  deleteJoin,
  getTargets,
  deleteOwnedTarget,
} from '../core/matrix'
import { registerFaceType, clearFaceTypeRegistry } from '../core/face-registry'
import { applyFaceToMatrix, getFaceConfig } from '../core/face-config'
import type { ColumnDefinition } from '../core/matrix'

import {
  buildTableQuery,
  compileFormula,
  compileFaceQuery,
  parseFormulaRefs,
  type SortConfig,
  type FilterConfig,
} from './table-query'
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

const makeCol = (id: number, name: string, type = 'TEXT'): ColumnDefinition => ({
  id,
  name,
  type,
  displayType: 'text',
  order: id,
  options: null,
  formula: null,
  constraints: null,
  managedBy: null,
})

describe('buildTableQuery', () => {
  const cols = [
    makeCol(1, 'name'),
    makeCol(2, 'age', 'INTEGER'),
    makeCol(3, 'active', 'INTEGER'),
  ]

  test('builds a basic SELECT * query with no sort or filters', () => {
    const q = buildTableQuery(42, null, [], cols)
    expect(q).toBe('SELECT * FROM "mx_42_data"')
  })

  test('adds ORDER BY when sort is specified', () => {
    const sort: SortConfig = { columnId: 1, direction: 'ASC' }
    const q = buildTableQuery(42, sort, [], cols)
    expect(q).toBe('SELECT * FROM "mx_42_data" ORDER BY "name" ASC')
  })

  test('adds ORDER BY DESC', () => {
    const sort: SortConfig = { columnId: 2, direction: 'DESC' }
    const q = buildTableQuery(42, sort, [], cols)
    expect(q).toBe('SELECT * FROM "mx_42_data" ORDER BY "age" DESC')
  })

  test('adds WHERE clause for filters', () => {
    const filters: FilterConfig[] = [{ columnId: 2, operator: '>', value: '30' }]
    const q = buildTableQuery(42, null, filters, cols)
    expect(q).toBe(`SELECT * FROM "mx_42_data" WHERE "age" > '30'`)
  })

  test('combines multiple filters with AND', () => {
    const filters: FilterConfig[] = [
      { columnId: 2, operator: '>', value: '30' },
      { columnId: 1, operator: '=', value: 'Alice' },
    ]
    const q = buildTableQuery(42, null, filters, cols)
    expect(q).toBe(`SELECT * FROM "mx_42_data" WHERE "age" > '30' AND "name" = 'Alice'`)
  })

  test('handles LIKE operator with wrapping', () => {
    const filters: FilterConfig[] = [{ columnId: 1, operator: 'LIKE', value: 'Ali' }]
    const q = buildTableQuery(42, null, filters, cols)
    expect(q).toBe(`SELECT * FROM "mx_42_data" WHERE "name" LIKE '%' || 'Ali' || '%'`)
  })

  test('combines filters and sort', () => {
    const sort: SortConfig = { columnId: 1, direction: 'ASC' }
    const filters: FilterConfig[] = [{ columnId: 3, operator: '=', value: '1' }]
    const q = buildTableQuery(42, sort, filters, cols)
    expect(q).toBe(`SELECT * FROM "mx_42_data" WHERE "active" = '1' ORDER BY "name" ASC`)
  })

  test('escapes single quotes in filter values', () => {
    const filters: FilterConfig[] = [{ columnId: 1, operator: '=', value: "O'Brien" }]
    const q = buildTableQuery(42, null, filters, cols)
    expect(q).toBe(`SELECT * FROM "mx_42_data" WHERE "name" = 'O''Brien'`)
  })

  test('escapes double quotes in column names', () => {
    const specialCols = [makeCol(99, 'my"col')]
    const sort: SortConfig = { columnId: 99, direction: 'ASC' }
    const q = buildTableQuery(42, sort, [], specialCols)
    expect(q).toBe('SELECT * FROM "mx_42_data" ORDER BY "my""col" ASC')
  })

  test('ignores sort/filter referencing unknown column IDs', () => {
    const sort: SortConfig = { columnId: 999, direction: 'ASC' }
    const filters: FilterConfig[] = [{ columnId: 888, operator: '=', value: 'x' }]
    const q = buildTableQuery(42, sort, filters, cols)
    expect(q).toBe('SELECT * FROM "mx_42_data"')
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
    expect(config.sort).toBeNull()
    expect(config.filters).toEqual([])

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

// -- Formula column references ({{columnId}} syntax) --------------------------

describe('compileFormula', () => {
  const cols: ColumnDefinition[] = [
    makeCol(100, 'price', 'REAL'),
    makeCol(200, 'tax', 'REAL'),
    makeCol(300, 'name'),
  ]

  test('resolves {{id}} to quoted column names', () => {
    expect(compileFormula('{{100}} * 2 + {{200}}', cols)).toBe('"price" * 2 + "tax"')
  })

  test('passes through expressions with no refs unchanged', () => {
    expect(compileFormula('length("name")', cols)).toBe('length("name")')
  })

  test('throws on unknown column ID', () => {
    expect(() => compileFormula('{{999}}', cols)).toThrow('unknown column ID 999')
  })

  test('handles column names with double quotes', () => {
    const quotedCols = [makeCol(50, 'my"col')]
    expect(compileFormula('{{50}} + 1', quotedCols)).toBe('"my""col" + 1')
  })

  test('ignores {{id}} inside SQL string literals', () => {
    expect(compileFormula("'prefix {{100}} suffix'", cols)).toBe("'prefix {{100}} suffix'")
  })

  test('resolves ref before a string literal but not inside it', () => {
    expect(compileFormula("{{100}} || ' has {{200}} in text'", cols)).toBe(
      '"price" || \' has {{200}} in text\'',
    )
  })

  test('handles escaped single quotes in SQL strings', () => {
    expect(compileFormula("'it''s {{100}} here'", cols)).toBe("'it''s {{100}} here'")
  })

  test('resumes parsing refs after a string literal ends', () => {
    expect(compileFormula("'literal' || {{100}}", cols)).toBe('\'literal\' || "price"')
  })
})

describe('parseFormulaRefs', () => {
  test('extracts all referenced column IDs', () => {
    expect(parseFormulaRefs('{{100}} * 2 + {{200}}')).toEqual([100, 200])
  })

  test('returns empty array for no refs', () => {
    expect(parseFormulaRefs('length("name")')).toEqual([])
  })

  test('handles duplicate refs', () => {
    expect(parseFormulaRefs('{{100}} + {{100}}')).toEqual([100, 100])
  })

  test('ignores {{id}} inside SQL string literals', () => {
    expect(parseFormulaRefs("'{{100}}' || {{200}}")).toEqual([200])
  })

  test('handles escaped quotes inside SQL strings', () => {
    expect(parseFormulaRefs("'it''s {{100}}' || {{200}}")).toEqual([200])
  })
})

describe('buildTableQuery with {{id}} formulas', () => {
  test('compiles formula {{id}} references to column names at query time', () => {
    const cols: ColumnDefinition[] = [
      makeCol(10, 'price', 'REAL'),
      makeCol(20, 'tax', 'REAL'),
      { ...makeCol(30, 'total'), formula: '{{10}} + {{20}}' },
    ]
    const q = buildTableQuery(42, null, [], cols)
    expect(q).toBe('SELECT *, ("price" + "tax") AS "total" FROM "mx_42_data"')
  })

  test('handles raw SQL formulas (no {{id}} refs) unchanged', () => {
    const cols: ColumnDefinition[] = [
      makeCol(10, 'title'),
      { ...makeCol(20, 'title_len'), formula: 'length("title")' },
    ]
    const q = buildTableQuery(42, null, [], cols)
    expect(q).toBe('SELECT *, (length("title")) AS "title_len" FROM "mx_42_data"')
  })
})

describe('Formula column deps (DB integration)', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  test('addFormulaColumn with {{id}} references populates formula_column_deps', () => {
    const matrixId = createMatrix(db, 'Test', [
      { name: 'price', type: 'REAL' },
      { name: 'tax', type: 'REAL' },
    ])

    const cols = getColumns(db, matrixId)
    const priceCol = cols.find((c) => c.name === 'price')!
    const taxCol = cols.find((c) => c.name === 'tax')!

    const formulaColId = addFormulaColumn(
      db,
      matrixId,
      'total',
      `{{${priceCol.id}}} + {{${taxCol.id}}}`,
    )

    const deps = db.selectArrays(
      'SELECT formula_col_id, dep_col_id FROM formula_column_deps WHERE formula_col_id = ? ORDER BY dep_col_id',
      [formulaColId],
    )
    const depColIds = deps.map((d) => d[1])
    expect(depColIds).toContain(priceCol.id)
    expect(depColIds).toContain(taxCol.id)
    expect(deps).toHaveLength(2)
  })

  test('addFormulaColumn validates referenced column IDs exist', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'price', type: 'REAL' }])

    expect(() => addFormulaColumn(db, matrixId, 'bad', '{{999999}} + 1')).toThrow(
      'unknown column ID 999999',
    )
  })

  test('addFormulaColumn with no {{id}} refs stores raw formula and creates no deps', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'title', type: 'TEXT' }])
    const colId = addFormulaColumn(db, matrixId, 'title_len', 'length("title")')

    const deps = db.selectArrays('SELECT * FROM formula_column_deps WHERE formula_col_id = ?', [
      colId,
    ])
    expect(deps).toHaveLength(0)

    const formulaCol = getColumns(db, matrixId).find((c) => c.name === 'title_len')!
    expect(formulaCol.formula).toBe('length("title")')
  })

  test('removeColumn on a formula dependency rejects with RESTRICT error', () => {
    const matrixId = createMatrix(db, 'Test', [
      { name: 'price', type: 'REAL' },
      { name: 'tax', type: 'REAL' },
    ])

    const cols = getColumns(db, matrixId)
    const priceCol = cols.find((c) => c.name === 'price')!

    addFormulaColumn(db, matrixId, 'total', `{{${priceCol.id}}} * 2`)

    expect(() => removeColumn(db, matrixId, 'price')).toThrow(
      /cannot be removed because formula column "total" depends on it/,
    )
  })

  test('removing the formula column itself succeeds and cleans up deps via CASCADE', () => {
    const matrixId = createMatrix(db, 'Test', [
      { name: 'price', type: 'REAL' },
      { name: 'tax', type: 'REAL' },
    ])

    const cols = getColumns(db, matrixId)
    const priceCol = cols.find((c) => c.name === 'price')!

    const formulaColId = addFormulaColumn(db, matrixId, 'total', `{{${priceCol.id}}} * 2`)

    // Verify deps exist
    let deps = db.selectArrays('SELECT * FROM formula_column_deps WHERE formula_col_id = ?', [
      formulaColId,
    ])
    expect(deps).toHaveLength(1)

    // Remove the formula column
    removeColumn(db, matrixId, 'total')

    // Verify deps cleaned up
    deps = db.selectArrays('SELECT * FROM formula_column_deps WHERE formula_col_id = ?', [
      formulaColId,
    ])
    expect(deps).toHaveLength(0)

    // Now the dependency column can be removed too
    removeColumn(db, matrixId, 'price')
    const remaining = getColumns(db, matrixId)
    expect(remaining.find((c) => c.name === 'price')).toBeUndefined()
  })

  test('rename a column, verify formula still works (ID is stable, compiled name updates)', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'price', type: 'REAL' }])

    const cols = getColumns(db, matrixId)
    const priceCol = cols.find((c) => c.name === 'price')!

    addFormulaColumn(db, matrixId, 'double_price', `{{${priceCol.id}}} * 2`)
    insertDataRow(db, matrixId, { price: 50 })

    // Rename the column
    renameColumn(db, matrixId, 'price', 'unit_price')

    // The formula column should still compile correctly with the new name
    const updatedCols = getColumns(db, matrixId)
    const formulaCol = updatedCols.find((c) => c.name === 'double_price')!
    expect(formulaCol.formula).toBe(`{{${priceCol.id}}} * 2`)

    // compileFormula should now resolve to the new column name
    const compiled = compileFormula(formulaCol.formula!, updatedCols)
    expect(compiled).toBe('"unit_price" * 2')

    // buildTableQuery should produce valid SQL
    const q = buildTableQuery(matrixId, null, [], updatedCols)
    expect(q).toContain('"unit_price" * 2')

    // Actually run the query
    const stmt = db.prepare(q)
    const results: Record<string, unknown>[] = []
    while (stmt.step()) {
      results.push(stmt.get({}) as Record<string, unknown>)
    }
    stmt.finalize()
    expect(results).toHaveLength(1)
    expect(results[0]!.double_price).toBe(100)
  })

  test('formula with {{id}} computes correct values via buildTableQuery', () => {
    const matrixId = createMatrix(db, 'Test', [
      { name: 'price', type: 'REAL' },
      { name: 'qty', type: 'INTEGER' },
    ])

    const cols = getColumns(db, matrixId)
    const priceCol = cols.find((c) => c.name === 'price')!
    const qtyCol = cols.find((c) => c.name === 'qty')!

    addFormulaColumn(db, matrixId, 'subtotal', `{{${priceCol.id}}} * {{${qtyCol.id}}}`)

    insertDataRow(db, matrixId, { price: 10.5, qty: 3 })
    insertDataRow(db, matrixId, { price: 20, qty: 5 })

    const allCols = getColumns(db, matrixId)
    const q = buildTableQuery(matrixId, null, [], allCols)
    const stmt = db.prepare(q)
    const results: Record<string, unknown>[] = []
    while (stmt.step()) {
      results.push(stmt.get({}) as Record<string, unknown>)
    }
    stmt.finalize()

    expect(results).toHaveLength(2)
    const subtotals = results.map((r) => r.subtotal as number).sort((a, b) => a - b)
    expect(subtotals).toEqual([31.5, 100])
  })
})

// -- Face query compilation (compileFaceQuery) --------------------------------

describe('compileFaceQuery', () => {
  const cols: ColumnDefinition[] = [makeCol(10, 'price', 'REAL'), makeCol(20, 'status')]

  test('resolves {{id}} references in a face query', () => {
    const query = "SELECT * FROM t WHERE {{10}} > 100 AND {{20}} = 'active'"
    expect(compileFaceQuery(query, cols)).toBe(
      'SELECT * FROM t WHERE "price" > 100 AND "status" = \'active\'',
    )
  })

  test('passes through queries with no refs unchanged', () => {
    const query = 'SELECT * FROM "mx_42_data" ORDER BY title'
    expect(compileFaceQuery(query, cols)).toBe(query)
  })

  test('is the same function as compileFormula', () => {
    expect(compileFaceQuery).toBe(compileFormula)
  })
})
