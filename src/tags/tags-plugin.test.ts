import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { initMatrixSchema, getColumns } from '../core/matrix'
import { registerPlugin, getPlugin } from '../core/plugin'
import { registerFaceType, getFaceType, clearFaceTypeRegistry } from '../core/face-registry'
import { getFaceConfigsForMatrix } from '../core/face-config'
import { getTraits } from '../core/traits'
import { tableFaceTypeDefinition } from '../table/table-plugin'

import { tagsPlugin, tagBrowserFaceTypeDefinition } from './tags-plugin'
import {
  createTagType,
  getTagType,
  getTagTypeById,
  getTagTypeByMatrixId,
  getAllTagTypes,
  updateTagType,
  deleteTagType,
} from './tag-types'

const testTagsPlugin = { ...tagsPlugin, init: undefined }

afterEach(() => {
  clearFaceTypeRegistry()
})

describe('Tag browser face type definition', () => {
  test('has the correct id', () => {
    expect(tagBrowserFaceTypeDefinition.id).toBe('hila.tag-browser')
  })

  test('has no slots (cross-matrix view)', () => {
    expect(tagBrowserFaceTypeDefinition.slots).toEqual([])
  })

  test('has no trait requirements', () => {
    expect(tagBrowserFaceTypeDefinition.traitRequirements).toEqual([])
  })

  test('has overflow behavior none', () => {
    expect(tagBrowserFaceTypeDefinition.overflowBehavior).toBe('none')
  })

  test('can be registered in the face registry', () => {
    registerFaceType(tagBrowserFaceTypeDefinition)
    const retrieved = getFaceType('hila.tag-browser')
    expect(retrieved).toBeDefined()
    expect(retrieved!.name).toBe('Tag Browser')
  })
})

describe('Tags plugin', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    registerFaceType(tableFaceTypeDefinition)
  })

  test('registering the tags plugin creates the plugin row', async () => {
    await registerPlugin(db, testTagsPlugin)

    const plugin = getPlugin(db, 'hila.tags')
    expect(plugin).not.toBeNull()
    expect(plugin!.name).toBe('Tags')
    expect(plugin!.version).toBe('1.0.0')
  })

  test('registering the tags plugin creates the registry matrix', async () => {
    const ctx = await registerPlugin(db, testTagsPlugin)
    expect(Object.keys(ctx.matrixIds)).toHaveLength(1)
    expect(ctx.matrixIds['registry']).toBeTypeOf('number')
  })

  test('re-registering the tags plugin is idempotent', async () => {
    const ctx1 = await registerPlugin(db, testTagsPlugin)
    const ctx2 = await registerPlugin(db, testTagsPlugin)
    expect(ctx1).toEqual(ctx2)
  })
})

describe('Tag type registry', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    registerFaceType(tableFaceTypeDefinition)

    await registerPlugin(db, testTagsPlugin)
  })

  test('createTagType creates a tag type with a matrix', () => {
    const tagType = createTagType(db, 'task')

    expect(tagType.id).toBeTypeOf('number')
    expect(tagType.name).toBe('task')
    expect(tagType.matrixId).toBeTypeOf('number')
    expect(tagType.color).toBeNull()
    expect(tagType.icon).toBeNull()
  })

  test('createTagType creates a matrix with default label column', () => {
    const tagType = createTagType(db, 'task')

    const columns = getColumns(db, tagType.matrixId)
    const colNames = columns.map((c) => c.name)
    expect(colNames).toContain('label')
  })

  test('createTagType creates a matrix with custom columns', () => {
    const tagType = createTagType(db, 'task', [
      { name: 'status', type: 'TEXT' },
      { name: 'priority', type: 'INTEGER' },
      { name: 'due_date', type: 'TEXT' },
    ])

    const columns = getColumns(db, tagType.matrixId)
    const colNames = columns.map((c) => c.name)
    expect(colNames).toContain('status')
    expect(colNames).toContain('priority')
    expect(colNames).toContain('due_date')
    expect(colNames).not.toContain('label')
  })

  test('createTagType provisions the rank trait for the new matrix', () => {
    const tagType = createTagType(db, 'task')

    const traits = getTraits(db, tagType.matrixId)
    const traitTypes = traits.map((t) => t.trait_type)
    expect(traitTypes).toContain('rank')
  })

  test('createTagType sets source_plugin_id to hila.tags on the matrix', () => {
    const tagType = createTagType(db, 'task')

    const stmt = db.prepare('SELECT source_plugin_id FROM matrix WHERE id = ?')
    stmt.bind([tagType.matrixId])
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { source_plugin_id: string | null }
    stmt.finalize()

    expect(row.source_plugin_id).toBe('hila.tags')
  })

  test('createTagType creates identity face config (table face) for the matrix', () => {
    const tagType = createTagType(db, 'task')

    const configs = getFaceConfigsForMatrix(db, tagType.matrixId)
    const faceTypeIds = configs.map((c) => c.faceTypeId)
    expect(faceTypeIds).toContain('hila.table')
  })

  test('createTagType rejects duplicate name (case-insensitive)', () => {
    createTagType(db, 'task')
    expect(() => createTagType(db, 'Task')).toThrow()
    expect(() => createTagType(db, 'TASK')).toThrow()
  })

  test('getTagType retrieves a tag type by name', () => {
    createTagType(db, 'movie-review')

    const tagType = getTagType(db, 'movie-review')
    expect(tagType).not.toBeNull()
    expect(tagType!.name).toBe('movie-review')
  })

  test('getTagType returns null for nonexistent name', () => {
    expect(getTagType(db, 'nonexistent')).toBeNull()
  })

  test('getTagTypeById retrieves a tag type by ID', () => {
    const created = createTagType(db, 'task')

    const tagType = getTagTypeById(db, created.id)
    expect(tagType).not.toBeNull()
    expect(tagType!.name).toBe('task')
    expect(tagType!.matrixId).toBe(created.matrixId)
  })

  test('getTagTypeById returns null for nonexistent ID', () => {
    expect(getTagTypeById(db, 999999)).toBeNull()
  })

  test('getTagTypeByMatrixId retrieves a tag type by matrix ID', () => {
    const created = createTagType(db, 'task')

    const tagType = getTagTypeByMatrixId(db, created.matrixId)
    expect(tagType).not.toBeNull()
    expect(tagType!.name).toBe('task')
    expect(tagType!.id).toBe(created.id)
  })

  test('getTagTypeByMatrixId returns null for nonexistent matrix ID', () => {
    expect(getTagTypeByMatrixId(db, 999999)).toBeNull()
  })

  test('getAllTagTypes returns all registered tag types', () => {
    createTagType(db, 'task')
    createTagType(db, 'movie-review')
    createTagType(db, 'book')

    const tagTypes = getAllTagTypes(db)
    expect(tagTypes).toHaveLength(3)
    const names = tagTypes.map((t) => t.name)
    expect(names).toContain('task')
    expect(names).toContain('movie-review')
    expect(names).toContain('book')
  })

  test('getAllTagTypes returns empty array when no tag types exist', () => {
    expect(getAllTagTypes(db)).toEqual([])
  })

  test('getAllTagTypes returns results sorted by name', () => {
    createTagType(db, 'zebra')
    createTagType(db, 'alpha')
    createTagType(db, 'middle')

    const tagTypes = getAllTagTypes(db)
    const names = tagTypes.map((t) => t.name)
    expect(names).toEqual(['alpha', 'middle', 'zebra'])
  })

  test('updateTagType updates the color', () => {
    const created = createTagType(db, 'task')
    updateTagType(db, created.id, { color: '#ff0000' })

    const updated = getTagTypeById(db, created.id)
    expect(updated!.color).toBe('#ff0000')
  })

  test('updateTagType updates the name', () => {
    const created = createTagType(db, 'task')
    updateTagType(db, created.id, { name: 'todo' })

    const updated = getTagTypeById(db, created.id)
    expect(updated!.name).toBe('todo')
  })

  test('updateTagType updates the icon', () => {
    const created = createTagType(db, 'task')
    updateTagType(db, created.id, { icon: 'check' })

    const updated = getTagTypeById(db, created.id)
    expect(updated!.icon).toBe('check')
  })

  test('updateTagType with no changes is a no-op', () => {
    const created = createTagType(db, 'task')
    updateTagType(db, created.id, {})

    const unchanged = getTagTypeById(db, created.id)
    expect(unchanged!.name).toBe('task')
  })

  test('deleteTagType removes the registry row', () => {
    const created = createTagType(db, 'task')
    deleteTagType(db, created.id)

    expect(getTagTypeById(db, created.id)).toBeNull()
    expect(getTagType(db, 'task')).toBeNull()
  })

  test('deleteTagType does NOT delete the matrix', () => {
    const created = createTagType(db, 'task')
    const matrixId = created.matrixId
    deleteTagType(db, created.id)

    const stmt = db.prepare('SELECT 1 FROM matrix WHERE id = ?')
    stmt.bind([matrixId])
    expect(stmt.step()).toBe(true)
    stmt.finalize()
  })

  test('deleteTagType matrix still accessible via identity face', () => {
    const created = createTagType(db, 'task')
    const matrixId = created.matrixId
    deleteTagType(db, created.id)

    const configs = getFaceConfigsForMatrix(db, matrixId)
    expect(configs.length).toBeGreaterThan(0)
  })
})
