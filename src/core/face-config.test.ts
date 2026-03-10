import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import type { FaceConfig } from './face-types'
import {
  applyFaceToMatrix,
  saveFaceConfig,
  getFaceConfig,
  getFaceConfigsForMatrix,
} from './face-config'
import { registerFaceType, clearFaceTypeRegistry } from './face-registry'
import { initMatrixSchema, createMatrix } from './matrix'
import { getTraits } from './traits'

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

  test('saveFaceConfig and getFaceConfig round-trip', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'title', type: 'TEXT' }])

    const config: FaceConfig = {
      id: 'cfg-1',
      faceTypeId: 'hila.table',
      matrixId,
      query: `SELECT * FROM "mx_${matrixId}_data"`,
      slotBindings: { title: 'title' },
      settings: { sortBy: 'title' },
      createdByPlugin: null,
    }

    saveFaceConfig(db, config)
    const loaded = getFaceConfig(db, 'cfg-1')

    expect(loaded).not.toBeNull()
    expect(loaded!.id).toBe('cfg-1')
    expect(loaded!.faceTypeId).toBe('hila.table')
    expect(loaded!.matrixId).toBe(matrixId)
    expect(loaded!.slotBindings).toEqual({ title: 'title' })
    expect(loaded!.settings).toEqual({ sortBy: 'title' })
  })

  test('saveFaceConfig overwrites existing config with same ID', () => {
    const matrixId = createMatrix(db, 'Test', [{ name: 'title', type: 'TEXT' }])

    const config: FaceConfig = {
      id: 'cfg-1',
      faceTypeId: 'hila.table',
      matrixId,
      query: 'SELECT 1',
      slotBindings: {},
      settings: {},
    }

    saveFaceConfig(db, config)
    saveFaceConfig(db, { ...config, query: 'SELECT 2' })

    const loaded = getFaceConfig(db, 'cfg-1')
    expect(loaded!.query).toBe('SELECT 2')
  })

  test('getFaceConfig returns null for nonexistent ID', () => {
    expect(getFaceConfig(db, 'nonexistent')).toBeNull()
  })

  test('getFaceConfigsForMatrix returns configs for a specific matrix', () => {
    const m1 = createMatrix(db, 'M1', [{ name: 'a', type: 'TEXT' }])
    const m2 = createMatrix(db, 'M2', [{ name: 'b', type: 'TEXT' }])

    saveFaceConfig(db, {
      id: 'cfg-a',
      faceTypeId: 'hila.table',
      matrixId: m1,
      query: 'SELECT 1',
      slotBindings: {},
      settings: {},
    })
    saveFaceConfig(db, {
      id: 'cfg-b',
      faceTypeId: 'hila.outline',
      matrixId: m1,
      query: 'SELECT 2',
      slotBindings: {},
      settings: {},
    })
    saveFaceConfig(db, {
      id: 'cfg-c',
      faceTypeId: 'hila.table',
      matrixId: m2,
      query: 'SELECT 3',
      slotBindings: {},
      settings: {},
    })

    const m1Configs = getFaceConfigsForMatrix(db, m1)
    expect(m1Configs).toHaveLength(2)
    expect(m1Configs.map((c) => c.id).sort()).toEqual(['cfg-a', 'cfg-b'])

    const m2Configs = getFaceConfigsForMatrix(db, m2)
    expect(m2Configs).toHaveLength(1)
    expect(m2Configs[0]!.id).toBe('cfg-c')
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
      traitRequirements: [],
      overflowBehavior: 'property-panel',
    })

    const matrixId = createMatrix(db, 'Notes', [
      { name: 'title', type: 'TEXT' },
      { name: 'body', type: 'TEXT' },
    ])

    const config = applyFaceToMatrix(db, 'hila.note', matrixId)

    expect(config.faceTypeId).toBe('hila.note')
    expect(config.matrixId).toBe(matrixId)
    expect(config.slotBindings).toEqual({ title: 'title', body: 'body' })
    expect(config.id).toBeTruthy()

    // Verify persisted
    const loaded = getFaceConfig(db, config.id)
    expect(loaded).not.toBeNull()
    expect(loaded!.slotBindings).toEqual({ title: 'title', body: 'body' })
  })

  test('applyFaceToMatrix provisions required traits', () => {
    registerFaceType({
      id: 'hila.outline',
      name: 'Outline',
      slots: [{ name: 'primary_content', preferredType: 'richtext', required: true }],
      traitRequirements: [{ type: 'rank' }, { type: 'closure' }],
      overflowBehavior: 'side-columns',
    })

    const matrixId = createMatrix(db, 'Data', [{ name: 'content', type: 'TEXT' }])

    // Before: no traits
    expect(getTraits(db, matrixId)).toHaveLength(0)

    applyFaceToMatrix(db, 'hila.outline', matrixId)

    // After: rank and closure provisioned
    const traits = getTraits(db, matrixId)
    expect(traits).toHaveLength(2)
    expect(traits.map((t) => t.trait_type).sort()).toEqual(['closure', 'rank'])
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
      traitRequirements: [],
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
      query: 'SELECT 1',
      slotBindings: {},
      settings: {},
    })

    const loaded = getFaceConfig(db, 'cfg-null-settings')
    expect(loaded!.settings).toEqual({})
  })
})
