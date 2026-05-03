import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  initMatrixSchema,
  createMatrix,
  insertDataRow,
  insertJoin,
  createDependentRow,
} from '../core/matrix'
import { createTreePosition } from '../core/tree'
import { ensureTrait } from '../core/traits'
import { registerPlugin } from '../core/plugin'
import { registerFaceType, clearFaceTypeRegistry } from '../core/face-registry'
import { tableFaceTypeDefinition } from '../table/table-plugin'

import { tagsPlugin } from './tags-plugin'
import { ensureTagTypesTable, createTagType, updateTagType } from './tag-types'
import {
  buildTagsForRowQuery,
  buildTaggedRowsQuery,
  buildAspectForRowQuery,
  buildTagTypesWithCountsQuery,
} from './tag-queries'

const testTagsPlugin = { ...tagsPlugin, init: undefined }

const execAll = (db: Database, sql: string): Record<string, unknown>[] => {
  const results: Record<string, unknown>[] = []
  const stmt = db.prepare(sql)
  while (stmt.step()) {
    results.push(stmt.get({}) as Record<string, unknown>)
  }
  stmt.finalize()
  return results
}

describe('Tag lookup queries', () => {
  let db: Database
  let outlineMatrixId: number

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({ print: () => {}, printErr: () => {} })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    registerFaceType(tableFaceTypeDefinition)
    await registerPlugin(db, testTagsPlugin)
    ensureTagTypesTable(db)

    outlineMatrixId = createMatrix(db, 'Outline', [{ name: 'content', type: 'TEXT' }])
    ensureTrait(db, 'rank', outlineMatrixId)
    ensureTrait(db, 'closure', outlineMatrixId)
  })

  afterEach(() => {
    clearFaceTypeRegistry()
  })

  const createSourceRow = (content = '{}'): number => {
    const rowId = insertDataRow(db, outlineMatrixId, { content })
    createTreePosition(db, outlineMatrixId, rowId)
    return rowId
  }

  describe('Forward lookup (row → its tags)', () => {
    test('returns all tag aspects for a row with multiple tags', () => {
      const taskTag = createTagType(db, 'task')
      const reviewTag = createTagType(db, 'review')
      updateTagType(db, reviewTag.id, { color: '#00ff00' })

      const sourceRowId = createSourceRow()
      createDependentRow(db, outlineMatrixId, sourceRowId, taskTag.matrixId)
      createDependentRow(db, outlineMatrixId, sourceRowId, reviewTag.matrixId)

      const sql = buildTagsForRowQuery(outlineMatrixId, sourceRowId)
      const results = execAll(db, sql)

      expect(results).toHaveLength(2)

      const names = results.map((r) => r.tag_type_name)
      expect(names).toContain('task')
      expect(names).toContain('review')

      const reviewResult = results.find((r) => r.tag_type_name === 'review')
      expect(reviewResult!.color).toBe('#00ff00')
    })

    test('returns empty when row has no tags', () => {
      const sourceRowId = createSourceRow()

      const sql = buildTagsForRowQuery(outlineMatrixId, sourceRowId)
      const results = execAll(db, sql)

      expect(results).toHaveLength(0)
    })

    test('excludes ref-kind joins', () => {
      const taskTag = createTagType(db, 'task')
      const sourceRowId = createSourceRow()

      createDependentRow(db, outlineMatrixId, sourceRowId, taskTag.matrixId)

      const otherMatrixId = createMatrix(db, 'Other', [{ name: 'title', type: 'TEXT' }])
      const otherRowId = insertDataRow(db, otherMatrixId, { title: 'ref target' })
      insertJoin(db, outlineMatrixId, sourceRowId, otherMatrixId, otherRowId, 'ref')

      const sql = buildTagsForRowQuery(outlineMatrixId, sourceRowId)
      const results = execAll(db, sql)

      expect(results).toHaveLength(1)
      expect(results[0]!.tag_type_name).toBe('task')
    })

    test('includes target_matrix_id and target_row_id in results', () => {
      const taskTag = createTagType(db, 'task')
      const sourceRowId = createSourceRow()
      const targetRowId = createDependentRow(db, outlineMatrixId, sourceRowId, taskTag.matrixId)

      const sql = buildTagsForRowQuery(outlineMatrixId, sourceRowId)
      const results = execAll(db, sql)

      expect(results).toHaveLength(1)
      expect(results[0]!.target_matrix_id).toBe(taskTag.matrixId)
      expect(results[0]!.target_row_id).toBe(targetRowId)
    })
  })

  describe('Reverse lookup (tag type → all tagged rows)', () => {
    test('returns all source rows tagged with a specific tag type', () => {
      const taskTag = createTagType(db, 'task')

      const row1 = createSourceRow('row 1')
      const row2 = createSourceRow('row 2')
      const row3 = createSourceRow('row 3')
      createDependentRow(db, outlineMatrixId, row1, taskTag.matrixId)
      createDependentRow(db, outlineMatrixId, row2, taskTag.matrixId)
      createDependentRow(db, outlineMatrixId, row3, taskTag.matrixId)

      const sql = buildTaggedRowsQuery(taskTag.matrixId, outlineMatrixId)
      const results = execAll(db, sql)

      expect(results).toHaveLength(3)
      const rowIds = results.map((r) => r.source_row_id)
      expect(rowIds).toContain(row1)
      expect(rowIds).toContain(row2)
      expect(rowIds).toContain(row3)
    })

    test('includes source row data columns', () => {
      const taskTag = createTagType(db, 'task')
      const sourceRowId = createSourceRow('test content')
      createDependentRow(db, outlineMatrixId, sourceRowId, taskTag.matrixId)

      const sql = buildTaggedRowsQuery(taskTag.matrixId, outlineMatrixId)
      const results = execAll(db, sql)

      expect(results).toHaveLength(1)
      expect(results[0]!.content).toBe('test content')
      expect(results[0]!.id).toBe(sourceRowId)
    })

    test('excludes source rows from a different matrix', () => {
      const taskTag = createTagType(db, 'task')

      const notesMatrixId = createMatrix(db, 'Notes', [
        { name: 'title', type: 'TEXT' },
        { name: 'body', type: 'TEXT' },
      ])
      ensureTrait(db, 'rank', notesMatrixId)

      const outlineRow = createSourceRow('outline row')
      createDependentRow(db, outlineMatrixId, outlineRow, taskTag.matrixId)

      const noteRowId = insertDataRow(db, notesMatrixId, { title: 'note', body: '{}' })
      createTreePosition(db, notesMatrixId, noteRowId)
      createDependentRow(db, notesMatrixId, noteRowId, taskTag.matrixId)

      const sqlOutline = buildTaggedRowsQuery(taskTag.matrixId, outlineMatrixId)
      const outlineResults = execAll(db, sqlOutline)
      expect(outlineResults).toHaveLength(1)
      expect(outlineResults[0]!.source_row_id).toBe(outlineRow)

      const sqlNotes = buildTaggedRowsQuery(taskTag.matrixId, notesMatrixId)
      const notesResults = execAll(db, sqlNotes)
      expect(notesResults).toHaveLength(1)
      expect(notesResults[0]!.source_row_id).toBe(noteRowId)
    })

    test('returns empty when no rows are tagged with the tag type', () => {
      const taskTag = createTagType(db, 'task')

      const sql = buildTaggedRowsQuery(taskTag.matrixId, outlineMatrixId)
      const results = execAll(db, sql)

      expect(results).toHaveLength(0)
    })
  })

  describe('Specific aspect lookup (source row + tag type → aspect row data)', () => {
    test('returns the aspect row data for a specific (source, tag type) pair', () => {
      const taskTag = createTagType(db, 'task', [
        { name: 'status', type: 'TEXT' },
        { name: 'priority', type: 'TEXT' },
      ])
      const sourceRowId = createSourceRow()
      const aspectRowId = createDependentRow(
        db,
        outlineMatrixId,
        sourceRowId,
        taskTag.matrixId,
        { status: 'open', priority: 'high' },
      )

      const sql = buildAspectForRowQuery(outlineMatrixId, sourceRowId, taskTag.matrixId)
      const results = execAll(db, sql)

      expect(results).toHaveLength(1)
      expect(results[0]!.id).toBe(aspectRowId)
      expect(results[0]!.status).toBe('open')
      expect(results[0]!.priority).toBe('high')
    })

    test('returns empty when no matching own join exists', () => {
      const taskTag = createTagType(db, 'task')
      const sourceRowId = createSourceRow()

      const sql = buildAspectForRowQuery(outlineMatrixId, sourceRowId, taskTag.matrixId)
      const results = execAll(db, sql)

      expect(results).toHaveLength(0)
    })

    test('returns only the aspect for the specified tag type when multiple tags exist', () => {
      const taskTag = createTagType(db, 'task', [{ name: 'status', type: 'TEXT' }])
      const reviewTag = createTagType(db, 'review', [{ name: 'rating', type: 'TEXT' }])

      const sourceRowId = createSourceRow()
      createDependentRow(db, outlineMatrixId, sourceRowId, taskTag.matrixId, { status: 'done' })
      const reviewAspectId = createDependentRow(
        db,
        outlineMatrixId,
        sourceRowId,
        reviewTag.matrixId,
        { rating: '5' },
      )

      const sql = buildAspectForRowQuery(outlineMatrixId, sourceRowId, reviewTag.matrixId)
      const results = execAll(db, sql)

      expect(results).toHaveLength(1)
      expect(results[0]!.id).toBe(reviewAspectId)
      expect(results[0]!.rating).toBe('5')
    })
  })

  describe('Tag types with counts (tag browser query)', () => {
    test('returns all tag types with instance counts', () => {
      const taskTag = createTagType(db, 'task')
      const reviewTag = createTagType(db, 'review')

      const row1 = createSourceRow()
      const row2 = createSourceRow()
      createDependentRow(db, outlineMatrixId, row1, taskTag.matrixId)
      createDependentRow(db, outlineMatrixId, row2, taskTag.matrixId)
      createDependentRow(db, outlineMatrixId, row1, reviewTag.matrixId)

      const sql = buildTagTypesWithCountsQuery()
      const results = execAll(db, sql)

      expect(results).toHaveLength(2)
      const byName = Object.fromEntries(results.map((r) => [r.name, r]))
      expect(byName['task']!.instance_count).toBe(2)
      expect(byName['review']!.instance_count).toBe(1)
    })

    test('returns zero instance count for tag types with no instances', () => {
      createTagType(db, 'empty-tag')

      const sql = buildTagTypesWithCountsQuery()
      const results = execAll(db, sql)

      expect(results).toHaveLength(1)
      expect(results[0]!.name).toBe('empty-tag')
      expect(results[0]!.instance_count).toBe(0)
    })

    test('returns empty array when no tag types exist', () => {
      const sql = buildTagTypesWithCountsQuery()
      const results = execAll(db, sql)
      expect(results).toHaveLength(0)
    })

    test('returns results sorted by name', () => {
      createTagType(db, 'zebra')
      createTagType(db, 'alpha')
      createTagType(db, 'middle')

      const sql = buildTagTypesWithCountsQuery()
      const results = execAll(db, sql)
      const names = results.map((r) => r.name)
      expect(names).toEqual(['alpha', 'middle', 'zebra'])
    })

    test('includes matrix_id and color in results', () => {
      const tag = createTagType(db, 'task')
      updateTagType(db, tag.id, { color: '#ff0000' })

      const sql = buildTagTypesWithCountsQuery()
      const results = execAll(db, sql)

      expect(results).toHaveLength(1)
      expect(results[0]!.matrix_id).toBe(tag.matrixId)
      expect(results[0]!.color).toBe('#ff0000')
    })

    test('count updates when instances are added', () => {
      const tag = createTagType(db, 'task')
      const row1 = createSourceRow()

      const sqlBefore = buildTagTypesWithCountsQuery()
      const before = execAll(db, sqlBefore)
      expect(before[0]!.instance_count).toBe(0)

      createDependentRow(db, outlineMatrixId, row1, tag.matrixId)

      const sqlAfter = buildTagTypesWithCountsQuery()
      const after = execAll(db, sqlAfter)
      expect(after[0]!.instance_count).toBe(1)
    })
  })
})
