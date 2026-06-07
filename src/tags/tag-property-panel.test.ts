import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  initMatrixSchema,
  createMatrix,
  insertDataRow,
  getColumns,
  updateRow,
  createDependentRow,
} from '../core/matrix'
import { createTreePosition } from '../core/tree'
import { registerPlugin } from '../core/plugin'
import { registerFaceType, clearFaceTypeRegistry } from '../core/face-registry'
import { tableFaceTypeDefinition } from '../table/table-plugin'

import { tagsPlugin } from './tags-plugin'
import { createTagType, getTagTypeByMatrixId } from './tag-types'

const testTagsPlugin = { ...tagsPlugin, init: undefined }

describe('Tag property panel data layer', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    registerFaceType(tableFaceTypeDefinition)
    await registerPlugin(db, testTagsPlugin)
  })

  afterEach(() => {
    clearFaceTypeRegistry()
  })

  test('aspect row columns are queryable from the tag matrix', () => {
    const tagType = createTagType(db, 'task', [
      { name: 'status', type: 'TEXT' },
      { name: 'priority', type: 'TEXT' },
      { name: 'due_date', type: 'TEXT' },
    ])

    const columns = getColumns(db, tagType.matrixId)
    const colNames = columns.map((c) => c.name)
    expect(colNames).toContain('status')
    expect(colNames).toContain('priority')
    expect(colNames).toContain('due_date')
  })

  test('aspect row data can be read via SELECT from the data table', () => {
    const tagType = createTagType(db, 'task', [
      { name: 'status', type: 'TEXT' },
      { name: 'priority', type: 'TEXT' },
    ])

    const outlineMatrixId = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])
    const sourceRowId = insertDataRow(db, outlineMatrixId, { content: '{}' })
    createTreePosition(db, outlineMatrixId, sourceRowId)

    const aspectRowId = createDependentRow(db, outlineMatrixId, sourceRowId, tagType.matrixId)

    const stmt = db.prepare(`SELECT * FROM "mx_${tagType.matrixId}_data" WHERE id = ?`)
    stmt.bind([aspectRowId])
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as Record<string, unknown>
    stmt.finalize()

    expect(row.id).toBe(aspectRowId)
  })

  test('editing a text field persists via updateDataRow', () => {
    const tagType = createTagType(db, 'task', [
      { name: 'status', type: 'TEXT' },
      { name: 'priority', type: 'TEXT' },
    ])

    const outlineMatrixId = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])
    const sourceRowId = insertDataRow(db, outlineMatrixId, { content: '{}' })
    createTreePosition(db, outlineMatrixId, sourceRowId)

    const aspectRowId = createDependentRow(db, outlineMatrixId, sourceRowId, tagType.matrixId)

    updateRow(db, {
      matrixId: tagType.matrixId,
      rowId: aspectRowId,
      values: { status: 'in-progress' },
    })

    const stmt = db.prepare(`SELECT status FROM "mx_${tagType.matrixId}_data" WHERE id = ?`)
    stmt.bind([aspectRowId])
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { status: string }
    stmt.finalize()

    expect(row.status).toBe('in-progress')
  })

  test('editing a select field persists via updateRow', () => {
    const tagType = createTagType(db, 'task', [{ name: 'priority', type: 'TEXT' }])

    const outlineMatrixId = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])
    const sourceRowId = insertDataRow(db, outlineMatrixId, { content: '{}' })
    createTreePosition(db, outlineMatrixId, sourceRowId)

    const aspectRowId = createDependentRow(db, outlineMatrixId, sourceRowId, tagType.matrixId)

    updateRow(db, {
      matrixId: tagType.matrixId,
      rowId: aspectRowId,
      values: { priority: 'high' },
    })

    const stmt = db.prepare(`SELECT priority FROM "mx_${tagType.matrixId}_data" WHERE id = ?`)
    stmt.bind([aspectRowId])
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { priority: string }
    stmt.finalize()

    expect(row.priority).toBe('high')
  })

  test('reactive updates: editing in identity face reflects in data queries', () => {
    const tagType = createTagType(db, 'task', [{ name: 'status', type: 'TEXT' }])

    const outlineMatrixId = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])
    const sourceRowId = insertDataRow(db, outlineMatrixId, { content: '{}' })
    createTreePosition(db, outlineMatrixId, sourceRowId)

    const aspectRowId = createDependentRow(db, outlineMatrixId, sourceRowId, tagType.matrixId)

    updateRow(db, {
      matrixId: tagType.matrixId,
      rowId: aspectRowId,
      values: { status: 'todo' },
    })

    const stmt1 = db.prepare(`SELECT status FROM "mx_${tagType.matrixId}_data" WHERE id = ?`)
    stmt1.bind([aspectRowId])
    stmt1.step()
    const before = stmt1.get({}) as { status: string }
    stmt1.finalize()
    expect(before.status).toBe('todo')

    updateRow(db, {
      matrixId: tagType.matrixId,
      rowId: aspectRowId,
      values: { status: 'done' },
    })

    const stmt2 = db.prepare(`SELECT status FROM "mx_${tagType.matrixId}_data" WHERE id = ?`)
    stmt2.bind([aspectRowId])
    stmt2.step()
    const after = stmt2.get({}) as { status: string }
    stmt2.finalize()
    expect(after.status).toBe('done')
  })

  test('the id column is skippable for property panel display', () => {
    const tagType = createTagType(db, 'task', [{ name: 'status', type: 'TEXT' }])

    const columns = getColumns(db, tagType.matrixId)
    const editableColumns = columns.filter((c) => c.name !== 'id' && c.formula == null)

    expect(editableColumns.every((c) => c.name !== 'id')).toBe(true)
    expect(editableColumns.some((c) => c.name === 'status')).toBe(true)
  })

  test('tag type metadata can be resolved for panel rendering', () => {
    const tagType = createTagType(db, 'task')

    const meta = getTagTypeByMatrixId(db, tagType.matrixId)
    expect(meta).not.toBeNull()
    expect(meta!.name).toBe('task')
  })

  test('multiple column types are supported for property panel', () => {
    const tagType = createTagType(db, 'task', [
      { name: 'status', type: 'TEXT' },
      { name: 'count', type: 'INTEGER' },
      { name: 'due_date', type: 'TEXT' },
      { name: 'active', type: 'INTEGER' },
    ])

    const columns = getColumns(db, tagType.matrixId)
    expect(columns).toHaveLength(4)

    const types = columns.map((c) => ({ name: c.name, displayType: c.displayType }))
    expect(types).toContainEqual({ name: 'status', displayType: 'text' })
    expect(types).toContainEqual({ name: 'count', displayType: 'number' })
  })

  test('key properties: first 1-2 non-label columns with values', () => {
    const tagType = createTagType(db, 'task', [
      { name: 'status', type: 'TEXT' },
      { name: 'priority', type: 'TEXT' },
      { name: 'notes', type: 'TEXT' },
    ])

    const outlineMatrixId = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])
    const sourceRowId = insertDataRow(db, outlineMatrixId, { content: '{}' })
    createTreePosition(db, outlineMatrixId, sourceRowId)

    const aspectRowId = createDependentRow(db, outlineMatrixId, sourceRowId, tagType.matrixId)

    updateRow(db, {
      matrixId: tagType.matrixId,
      rowId: aspectRowId,
      values: { status: 'in-progress', priority: 'high', notes: 'some detail' },
    })

    const columns = getColumns(db, tagType.matrixId)
    const LABEL_COLUMNS = new Set(['id', 'label', 'title', 'name'])
    const keyPropCols = columns
      .filter((c) => !LABEL_COLUMNS.has(c.name) && c.formula == null)
      .slice(0, 2)

    expect(keyPropCols).toHaveLength(2)
    expect(keyPropCols[0]!.name).toBe('status')
    expect(keyPropCols[1]!.name).toBe('priority')

    const stmt = db.prepare(`SELECT * FROM "mx_${tagType.matrixId}_data" WHERE id = ?`)
    stmt.bind([aspectRowId])
    stmt.step()
    const row = stmt.get({}) as Record<string, unknown>
    stmt.finalize()

    const keyProps = keyPropCols
      .map((c) => ({ label: c.name, value: row[c.name] }))
      .filter((kp) => kp.value != null && kp.value !== '')

    expect(keyProps).toHaveLength(2)
    expect(keyProps[0]).toEqual({ label: 'status', value: 'in-progress' })
    expect(keyProps[1]).toEqual({ label: 'priority', value: 'high' })
  })
})
