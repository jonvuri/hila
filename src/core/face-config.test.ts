import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import type { FaceConfig } from './face-types'
import {
  applyFaceToMatrix,
  saveFaceConfig,
  getFaceConfig,
  getFaceConfigForMatrix,
  getFaceConfigsForMatrix,
} from './face-config'
import { registerFaceType, clearFaceTypeRegistry } from './face-registry'
import { initMatrixSchema, createMatrix, getColumns } from './matrix'

afterEach(() => {
  clearFaceTypeRegistry()
})

describe('Face config', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  // -- FaceConfig CRUD ----------------------------------------------------------

  test('keeps SQL out of the forward recipe persistence path', () => {
    const columns = db.selectObjects('PRAGMA table_info(face_configs)') as unknown as {
      name: string
    }[]
    expect(columns.map(({ name }) => name)).not.toContain('query')
  })

  test('removes the pre-milestone legacy query column during schema initialization', () => {
    db.exec("ALTER TABLE face_configs ADD COLUMN query TEXT NOT NULL DEFAULT ''")
    initMatrixSchema(db)

    const columns = db.selectObjects('PRAGMA table_info(face_configs)') as unknown as {
      name: string
    }[]
    expect(columns.map(({ name }) => name)).not.toContain('query')
  })

  test('saveFaceConfig and getFaceConfig round-trip', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'title', type: 'TEXT' }])
    const cols = getColumns(db, matrixId)
    const titleColId = cols.find((c) => c.name === 'title')!.id

    const config: FaceConfig = {
      id: 'cfg-1',
      faceTypeId: 'hila.table',
      matrixId,
      slotBindings: { title: titleColId },
      settings: { sortBy: 'title' },
      createdByPlugin: null,
      sort: null,
      filters: [],
    }

    saveFaceConfig(db, config)
    const loaded = getFaceConfig(db, 'cfg-1')

    expect(loaded).not.toBeNull()
    expect(loaded!.id).toBe('cfg-1')
    expect(loaded!.faceTypeId).toBe('hila.table')
    expect(loaded!.matrixId).toBe(matrixId)
    expect(loaded!.slotBindings).toEqual({ title: titleColId })
    expect(loaded!.settings).toEqual({ sortBy: 'title' })
    expect(loaded!.sort).toBeNull()
    expect(loaded!.filters).toEqual([])
  })

  test('saveFaceConfig overwrites existing config with same ID', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'title', type: 'TEXT' }])

    const config: FaceConfig = {
      id: 'cfg-1',
      faceTypeId: 'hila.table',
      matrixId,
      slotBindings: {},
      settings: {},
      sort: null,
      filters: [],
    }

    saveFaceConfig(db, config)
    saveFaceConfig(db, { ...config, settings: { density: 'compact' } })

    const loaded = getFaceConfig(db, 'cfg-1')
    expect(loaded!.settings).toEqual({ density: 'compact' })
  })

  test('getFaceConfig returns null for nonexistent ID', () => {
    expect(getFaceConfig(db, 'nonexistent')).toBeNull()
  })

  test('stores at most one intentional recipe for a matrix', () => {
    const m1 = createMatrix(db, 'M1', [{ name: 'a', type: 'TEXT' }])
    const m2 = createMatrix(db, 'M2', [{ name: 'b', type: 'TEXT' }])

    saveFaceConfig(db, {
      id: 'cfg-a',
      faceTypeId: 'hila.table',
      matrixId: m1,
      slotBindings: {},
      settings: {},
      sort: null,
      filters: [],
    })
    expect(() =>
      saveFaceConfig(db, {
        id: 'cfg-b',
        faceTypeId: 'hila.outline',
        matrixId: m1,
        slotBindings: {},
        settings: {},
        sort: null,
        filters: [],
      }),
    ).toThrow('already has an intentional face recipe')
    saveFaceConfig(db, {
      id: 'cfg-c',
      faceTypeId: 'hila.table',
      matrixId: m2,
      slotBindings: {},
      settings: {},
      sort: null,
      filters: [],
    })

    const m1Configs = getFaceConfigsForMatrix(db, m1)
    expect(m1Configs.map((c) => c.id)).toEqual(['cfg-a'])
    expect(getFaceConfigForMatrix(db, m1)?.id).toBe('cfg-a')

    const m2Configs = getFaceConfigsForMatrix(db, m2)
    expect(m2Configs).toHaveLength(1)
    expect(m2Configs[0]!.id).toBe('cfg-c')
  })

  test('enforces one intentional recipe per matrix in storage', () => {
    const matrixId = createMatrix(db, 'M1')
    db.exec(
      `INSERT INTO face_configs
         (id, face_type_id, matrix_id, slot_bindings, settings, created_by_plugin)
       VALUES ('cfg-a', 'hila.table', ?, '{}', NULL, NULL)`,
      { bind: [matrixId] },
    )

    expect(() =>
      db.exec(
        `INSERT INTO face_configs
           (id, face_type_id, matrix_id, slot_bindings, settings, created_by_plugin)
         VALUES ('cfg-b', 'hila.note', ?, '{}', NULL, NULL)`,
        { bind: [matrixId] },
      ),
    ).toThrow()
  })

  test('converges reset-era duplicate recipes before enforcing uniqueness', () => {
    const matrixId = createMatrix(db, 'M1')
    db.exec('DROP INDEX face_configs_matrix_unique')
    db.exec(
      `INSERT INTO face_configs
         (id, face_type_id, matrix_id, slot_bindings, settings, created_by_plugin)
       VALUES ('cfg-old', 'hila.table', ?, '{}', NULL, NULL),
              ('cfg-new', 'hila.note', ?, '{}', NULL, NULL)`,
      { bind: [matrixId, matrixId] },
    )

    initMatrixSchema(db)

    expect(getFaceConfigsForMatrix(db, matrixId).map(({ id }) => id)).toEqual(['cfg-new'])
    expect(
      db.selectValue(
        `SELECT COUNT(*) FROM pragma_index_list('face_configs')
         WHERE name = 'face_configs_matrix_unique' AND "unique" = 1`,
      ),
    ).toBe(1)
  })

  test('rejects moving an intentional recipe between matrixes', () => {
    const m1 = createMatrix(db, 'M1')
    const m2 = createMatrix(db, 'M2')
    const config: FaceConfig = {
      id: 'cfg-stable',
      faceTypeId: 'hila.table',
      matrixId: m1,
      slotBindings: {},
      settings: {},
      sort: null,
      filters: [],
    }
    saveFaceConfig(db, config)

    expect(() => saveFaceConfig(db, { ...config, matrixId: m2 })).toThrow(
      'cannot move between matrixes',
    )
  })

  // -- applyFaceToMatrix --------------------------------------------------------

  test('applyFaceToMatrix creates a FaceConfig with auto-resolved bindings', () => {
    registerFaceType({
      id: 'hila.note',
      name: 'Note',
      slots: [
        { name: 'title', preferredType: 'text', required: true },
        { name: 'body', preferredType: 'richtext', required: true },
      ],
      overflowBehavior: 'property-panel',
    })

    const matrixId = createMatrix(db, 'Notes', [
      { name: 'title', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
    ])

    const cols = getColumns(db, matrixId)
    const titleColId = cols.find((c) => c.name === 'title')!.id
    const bodyColId = cols.find((c) => c.name === 'body')!.id

    const config = applyFaceToMatrix(db, 'hila.note', matrixId)

    expect(config.faceTypeId).toBe('hila.note')
    expect(config.matrixId).toBe(matrixId)
    expect(config.slotBindings).toEqual({ title: titleColId, body: bodyColId })
    expect(config.id).toBeTruthy()

    // Verify persisted
    const loaded = getFaceConfig(db, config.id)
    expect(loaded).not.toBeNull()
    expect(loaded!.slotBindings).toEqual({ title: titleColId, body: bodyColId })
  })

  test('same-face application preserves normalized presentation state', () => {
    registerFaceType({
      id: 'hila.table',
      name: 'Table',
      slots: [],
      overflowBehavior: 'none',
    })
    const matrixId = createMatrix(db, 'Data', [
      { name: 'title', type: 'TEXT' },
      { name: 'status', type: 'TEXT' },
    ])
    const columns = getColumns(db, matrixId)
    const titleColumnId = columns.find(({ name }) => name === 'title')!.id
    const statusColumnId = columns.find(({ name }) => name === 'status')!.id
    const created = applyFaceToMatrix(db, 'hila.table', matrixId)
    saveFaceConfig(db, {
      ...created,
      settings: { treatment: 'ledger' },
      sort: { columnId: titleColumnId, direction: 'ASC' },
      filters: [
        {
          id: 'stable-filter',
          columnId: statusColumnId,
          operator: '=',
          value: 'open',
          order: 0,
        },
      ],
    })

    const ensured = applyFaceToMatrix(db, 'hila.table', matrixId)

    expect(ensured).toMatchObject({
      id: created.id,
      settings: { treatment: 'ledger' },
      sort: { columnId: titleColumnId, direction: 'ASC' },
      filters: [{ id: 'stable-filter', columnId: statusColumnId, order: 0 }],
    })
    expect(getFaceConfigsForMatrix(db, matrixId)).toHaveLength(1)
  })

  test('replaces the intentional recipe in place', () => {
    registerFaceType({
      id: 'hila.table',
      name: 'Table',
      slots: [],
      overflowBehavior: 'none',
    })
    registerFaceType({
      id: 'hila.note',
      name: 'Note',
      slots: [{ name: 'title', preferredType: 'text', required: true }],
      overflowBehavior: 'property-panel',
    })
    const matrixId = createMatrix(db, 'Data', [{ name: 'title', type: 'TEXT' }])
    const first = applyFaceToMatrix(db, 'hila.table', matrixId)
    const replacement = applyFaceToMatrix(db, 'hila.note', matrixId)

    expect(replacement.id).toBe(first.id)
    expect(replacement.faceTypeId).toBe('hila.note')
    expect(replacement.sort).toBeNull()
    expect(replacement.filters).toEqual([])
    expect(getFaceConfigsForMatrix(db, matrixId)).toHaveLength(1)
  })

  test('applyFaceToMatrix throws for unknown face type', () => {
    const matrixId = createMatrix(db, 'Data', [{ name: 'val', type: 'TEXT' }])

    expect(() => applyFaceToMatrix(db, 'nonexistent', matrixId)).toThrow(
      'Unknown face type: "nonexistent"',
    )
  })

  test('applyFaceToMatrix records createdByPlugin when provided', () => {
    registerFaceType({
      id: 'hila.table',
      name: 'Table',
      slots: [],
      overflowBehavior: 'none',
    })

    // Register a plugin first so FK is satisfied
    db.exec(
      `INSERT INTO plugins (id, name, version, enabled) VALUES ('test-plugin', 'Test', '1.0.0', 1)`,
    )

    const matrixId = createMatrix(db, 'Data', [{ name: 'val', type: 'TEXT' }])
    const config = applyFaceToMatrix(db, 'hila.table', matrixId, 'test-plugin')

    expect(config.createdByPlugin).toBe('test-plugin')

    const loaded = getFaceConfig(db, config.id)
    expect(loaded!.createdByPlugin).toBe('test-plugin')
  })

  test('settings default to empty object when null in DB', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'val', type: 'TEXT' }])

    saveFaceConfig(db, {
      id: 'cfg-null-settings',
      faceTypeId: 'hila.table',
      matrixId,
      slotBindings: {},
      settings: {},
      sort: null,
      filters: [],
    })

    const loaded = getFaceConfig(db, 'cfg-null-settings')
    expect(loaded!.settings).toEqual({})
  })

  // -- Normalized tables (sort, filter, slot bindings) --------------------------

  test('saveFaceConfig persists sort config in normalized table', () => {
    const matrixId = createMatrix(db, 'Test', [
      { name: 'title', type: 'TEXT' },
      { name: 'age', type: 'INTEGER' },
    ])
    const cols = getColumns(db, matrixId)
    const ageColId = cols.find((c) => c.name === 'age')!.id

    const config: FaceConfig = {
      id: 'cfg-sort',
      faceTypeId: 'hila.table',
      matrixId,
      slotBindings: {},
      settings: {},
      createdByPlugin: null,
      sort: { columnId: ageColId, direction: 'DESC' },
      filters: [],
    }

    saveFaceConfig(db, config)
    const loaded = getFaceConfig(db, 'cfg-sort')

    expect(loaded!.sort).toEqual({ columnId: ageColId, direction: 'DESC' })
  })

  test('saveFaceConfig persists filter configs in normalized table', () => {
    const matrixId = createMatrix(db, 'Test', [
      { name: 'title', type: 'TEXT' },
      { name: 'age', type: 'INTEGER' },
    ])
    const cols = getColumns(db, matrixId)
    const titleColId = cols.find((c) => c.name === 'title')!.id
    const ageColId = cols.find((c) => c.name === 'age')!.id

    const config: FaceConfig = {
      id: 'cfg-filters',
      faceTypeId: 'hila.table',
      matrixId,
      slotBindings: {},
      settings: {},
      createdByPlugin: null,
      sort: null,
      filters: [
        { columnId: ageColId, operator: '>', value: '30' },
        { columnId: titleColId, operator: 'LIKE', value: 'test' },
      ],
    }

    saveFaceConfig(db, config)
    const loaded = getFaceConfig(db, 'cfg-filters')

    expect(loaded!.filters).toHaveLength(2)
    expect(loaded!.filters[0]).toEqual({
      id: expect.any(String),
      columnId: ageColId,
      operator: '>',
      value: '30',
      order: 0,
    })
    expect(loaded!.filters[1]).toEqual({
      id: expect.any(String),
      columnId: titleColId,
      operator: 'LIKE',
      value: 'test',
      order: 1,
    })

    const filterIds = loaded!.filters.map((filter) => filter.id)
    saveFaceConfig(db, config)
    expect(getFaceConfig(db, 'cfg-filters')!.filters.map((filter) => filter.id)).toEqual(
      filterIds,
    )
  })

  test('removing a sorted column cascade-deletes sort config', () => {
    const matrixId = createMatrix(db, 'Test', [
      { name: 'title', type: 'TEXT' },
      { name: 'age', type: 'INTEGER' },
    ])
    const cols = getColumns(db, matrixId)
    const ageColId = cols.find((c) => c.name === 'age')!.id

    saveFaceConfig(db, {
      id: 'cfg-cascade-sort',
      faceTypeId: 'hila.table',
      matrixId,
      slotBindings: {},
      settings: {},
      createdByPlugin: null,
      sort: { columnId: ageColId, direction: 'ASC' },
      filters: [],
    })

    // Remove the sorted column
    db.exec('DELETE FROM matrix_columns WHERE id = ?', { bind: [ageColId] })

    const loaded = getFaceConfig(db, 'cfg-cascade-sort')
    expect(loaded!.sort).toBeNull()
  })

  test('removing a filtered column cascade-deletes filter config', () => {
    const matrixId = createMatrix(db, 'Test', [
      { name: 'title', type: 'TEXT' },
      { name: 'age', type: 'INTEGER' },
    ])
    const cols = getColumns(db, matrixId)
    const titleColId = cols.find((c) => c.name === 'title')!.id
    const ageColId = cols.find((c) => c.name === 'age')!.id

    saveFaceConfig(db, {
      id: 'cfg-cascade-filter',
      faceTypeId: 'hila.table',
      matrixId,
      slotBindings: {},
      settings: {},
      createdByPlugin: null,
      sort: null,
      filters: [
        { columnId: ageColId, operator: '>', value: '30' },
        { columnId: titleColId, operator: '=', value: 'foo' },
      ],
    })

    // Remove the age column
    db.exec('DELETE FROM matrix_columns WHERE id = ?', { bind: [ageColId] })

    const loaded = getFaceConfig(db, 'cfg-cascade-filter')
    expect(loaded!.filters).toHaveLength(1)
    expect(loaded!.filters[0]!.columnId).toBe(titleColId)
  })

  test('removing a slot-bound column sets column_id to NULL', () => {
    const matrixId = createMatrix(db, 'Test', [
      { name: 'title', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
    ])
    const cols = getColumns(db, matrixId)
    const titleColId = cols.find((c) => c.name === 'title')!.id
    const bodyColId = cols.find((c) => c.name === 'body')!.id

    saveFaceConfig(db, {
      id: 'cfg-cascade-slot',
      faceTypeId: 'hila.note',
      matrixId,
      slotBindings: { title: titleColId, body: bodyColId },
      settings: {},
      createdByPlugin: null,
      sort: null,
      filters: [],
    })

    // Remove the title column
    db.exec('DELETE FROM matrix_columns WHERE id = ?', { bind: [titleColId] })

    const loaded = getFaceConfig(db, 'cfg-cascade-slot')
    expect(loaded!.slotBindings.title).toBeNull()
    expect(loaded!.slotBindings.body).toBe(bodyColId)
  })

  test('renaming a column does not affect slot bindings (ID-based)', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'title', type: 'TEXT' }])
    const cols = getColumns(db, matrixId)
    const titleColId = cols.find((c) => c.name === 'title')!.id

    saveFaceConfig(db, {
      id: 'cfg-rename',
      faceTypeId: 'hila.table',
      matrixId,
      slotBindings: { title: titleColId },
      settings: {},
      createdByPlugin: null,
      sort: { columnId: titleColId, direction: 'ASC' },
      filters: [],
    })

    // Rename the column
    db.exec('UPDATE matrix_columns SET name = ? WHERE id = ?', {
      bind: ['heading', titleColId],
    })

    const loaded = getFaceConfig(db, 'cfg-rename')
    expect(loaded!.slotBindings.title).toBe(titleColId)
    expect(loaded!.sort!.columnId).toBe(titleColId)
  })
})
