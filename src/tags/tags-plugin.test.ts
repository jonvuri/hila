import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { initMatrixSchema, getColumns, updateRow } from '../core/matrix'
import { registerPlugin, getPlugin } from '../core/plugin'
import { registerFaceType, getFaceType, clearFaceTypeRegistry } from '../core/face-registry'
import { getFaceConfigsForMatrix } from '../core/face-config'
import { tableFaceTypeDefinition } from '../table/table-plugin'
import { workspacePlugin } from '../workspace/workspace-plugin'

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
const testWorkspacePlugin = { ...workspacePlugin, init: undefined }

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
    await registerPlugin(db, testWorkspacePlugin)
    await registerPlugin(db, testTagsPlugin)

    const plugin = getPlugin(db, 'hila.tags')
    expect(plugin).not.toBeNull()
    expect(plugin!.name).toBe('Tags')
    expect(plugin!.version).toBe('1.0.0')
  })

  test('registering the tags plugin has no matrixes (registry dissolved)', async () => {
    await registerPlugin(db, testWorkspacePlugin)
    const ctx = await registerPlugin(db, testTagsPlugin)
    expect(Object.keys(ctx.matrixIds)).toHaveLength(0)
  })

  test('re-registering the tags plugin is idempotent', async () => {
    await registerPlugin(db, testWorkspacePlugin)
    const ctx1 = await registerPlugin(db, testTagsPlugin)
    const ctx2 = await registerPlugin(db, testTagsPlugin)
    expect(ctx1).toEqual(ctx2)
  })
})

describe('Tag type registry (type-node model)', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
    registerFaceType(tableFaceTypeDefinition)

    await registerPlugin(db, testWorkspacePlugin)
    await registerPlugin(db, testTagsPlugin)
  })

  test('createTagType creates a tag type with a matrix', () => {
    const tagType = createTagType(db, 'task')

    expect(tagType.id).toBeTypeOf('number')
    expect(tagType.name).toBe('task')
    expect(tagType.matrixId).toBeTypeOf('number')
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

  test('createTagType sets matrix.owner to the type-node', () => {
    const tagType = createTagType(db, 'task')

    const stmt = db.prepare('SELECT owner_matrix_id, owner_row_id FROM matrix WHERE id = ?')
    stmt.bind([tagType.matrixId])
    expect(stmt.step()).toBe(true)
    const row = stmt.get({}) as { owner_matrix_id: number; owner_row_id: number }
    stmt.finalize()

    expect(row.owner_row_id).toBe(tagType.id)
  })

  test('createTagType rejects duplicate name (case-insensitive)', () => {
    createTagType(db, 'task')
    expect(() => createTagType(db, 'task')).toThrow('already exists')
    expect(() => createTagType(db, 'Task')).toThrow('already exists')
    expect(() => createTagType(db, 'TASK')).toThrow('already exists')
  })

  test('updateTagType rejects renaming to an existing name (case-insensitive)', () => {
    createTagType(db, 'task')
    const review = createTagType(db, 'review')

    expect(() => updateTagType(db, review.id, { name: 'task' })).toThrow('already exists')
    expect(() => updateTagType(db, review.id, { name: 'Task' })).toThrow('already exists')

    // Renaming to (a recasing of) its own name is allowed
    expect(() => updateTagType(db, review.id, { name: 'Review' })).not.toThrow()
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

  test('updateTagType updates the name', () => {
    const created = createTagType(db, 'task')
    updateTagType(db, created.id, { name: 'todo' })

    const updated = getTagTypeById(db, created.id)
    expect(updated!.name).toBe('todo')
  })

  test('renaming the type-node label via plain updateRow renames the tag type', () => {
    // The outline editor writes the label column directly -- the label is the
    // canonical name, and core syncs the owned matrix's derived title from it.
    const created = createTagType(db, 'task')

    const metaStmt = db.prepare("SELECT metadata FROM plugins WHERE id = 'hila.workspace'")
    metaStmt.step()
    const wsMatrixId = (
      JSON.parse((metaStmt.get({}) as { metadata: string }).metadata) as {
        matrixIds: Record<string, number>
      }
    ).matrixIds['root']!
    metaStmt.finalize()

    updateRow(db, {
      matrixId: wsMatrixId,
      rowId: created.id,
      values: {
        label: JSON.stringify({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'todo' }] }],
        }),
      },
    })

    expect(getTagType(db, 'todo')!.matrixId).toBe(created.matrixId)
    expect(getTagType(db, 'task')).toBeNull()
    expect(getAllTagTypes(db).map((t) => t.name)).toEqual(['todo'])
  })

  test('updateTagType with no changes is a no-op', () => {
    const created = createTagType(db, 'task')
    updateTagType(db, created.id, {})

    const unchanged = getTagTypeById(db, created.id)
    expect(unchanged!.name).toBe('task')
  })

  test('deleteTagType removes the type-node and cascades the owned matrix', () => {
    const created = createTagType(db, 'task')
    const matrixId = created.matrixId
    deleteTagType(db, created.id)

    expect(getTagTypeById(db, created.id)).toBeNull()
    expect(getTagType(db, 'task')).toBeNull()

    // The owned matrix is cascade-dropped
    const stmt = db.prepare('SELECT 1 FROM matrix WHERE id = ?')
    stmt.bind([matrixId])
    expect(stmt.step()).toBe(false)
    stmt.finalize()
  })
})
