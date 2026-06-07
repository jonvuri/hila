import { beforeEach, describe, expect, test, vi } from 'vitest'
import initSqliteWasm from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'

import { initMatrixSchema, createMatrix } from './matrix'
import { registerPlugin, unregisterPlugin, getPlugin, getAllPlugins } from './plugin'
import { getFaceType, clearFaceTypeRegistry } from './face-registry'
import type { PluginDefinition } from './plugin-types'
import type { FaceTypeDefinition } from './face-types'

const makeDefinition = (overrides: Partial<PluginDefinition> = {}): PluginDefinition => ({
  id: 'test-plugin',
  name: 'Test Plugin',
  version: '1.0.0',
  matrixes: [],
  namedQueries: {},
  namedMutations: {},
  faceBindings: [],
  ...overrides,
})

describe('Plugin system', () => {
  let db: Database

  beforeEach(async () => {
    const sqlite3 = await initSqliteWasm({
      print: () => {},
      printErr: () => {},
    })
    db = new sqlite3.oo1.DB(':memory:', 'c')
    initMatrixSchema(db)
  })

  // -- plugins table existence ------------------------------------------------

  test('plugins table exists after schema init', () => {
    const stmt = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='plugins'`,
    )
    expect(stmt.step()).toBe(true)
    stmt.finalize()
  })

  // -- registerPlugin ---------------------------------------------------------

  test('register a plugin creates a plugins table row', async () => {
    const def = makeDefinition()
    await registerPlugin(db, def)

    const row = getPlugin(db, 'test-plugin')
    expect(row).not.toBeNull()
    expect(row!.id).toBe('test-plugin')
    expect(row!.name).toBe('Test Plugin')
    expect(row!.version).toBe('1.0.0')
    expect(row!.enabled).toBe(1)
  })

  test('register a plugin with matrixes creates them and returns matrixIds', async () => {
    const def = makeDefinition({
      matrixes: [
        { key: 'notes', title: 'Notes', columns: [{ name: 'content', type: 'TEXT' }] },
        {
          key: 'tags',
          title: 'Tags',
          columns: [
            { name: 'label', type: 'TEXT' },
            { name: 'color', type: 'TEXT' },
          ],
        },
      ],
    })

    const ctx = await registerPlugin(db, def)

    expect(ctx.matrixIds['notes']).toBeTypeOf('number')
    expect(ctx.matrixIds['tags']).toBeTypeOf('number')
    expect(ctx.matrixIds['notes']).not.toBe(ctx.matrixIds['tags'])

    // Verify matrixes exist in the registry
    const checkStmt = db.prepare('SELECT id, title FROM matrix WHERE id = ?')

    checkStmt.bind([ctx.matrixIds['notes']!])
    expect(checkStmt.step()).toBe(true)
    expect((checkStmt.get({}) as { title: string }).title).toBe('Notes')
    checkStmt.reset()

    checkStmt.bind([ctx.matrixIds['tags']!])
    expect(checkStmt.step()).toBe(true)
    expect((checkStmt.get({}) as { title: string }).title).toBe('Tags')
    checkStmt.finalize()
  })

  test('source_plugin_id is set on plugin-created matrixes', async () => {
    const def = makeDefinition({
      matrixes: [{ key: 'data', title: 'Data', columns: [{ name: 'val', type: 'TEXT' }] }],
    })

    const ctx = await registerPlugin(db, def)

    const stmt = db.prepare('SELECT source_plugin_id FROM matrix WHERE id = ?')
    stmt.bind([ctx.matrixIds['data']!])
    expect(stmt.step()).toBe(true)
    expect((stmt.get({}) as { source_plugin_id: string }).source_plugin_id).toBe('test-plugin')
    stmt.finalize()
  })

  test('register the same plugin twice is idempotent (no duplicate matrixes)', async () => {
    const def = makeDefinition({
      matrixes: [
        { key: 'notes', title: 'Notes', columns: [{ name: 'content', type: 'TEXT' }] },
      ],
    })

    const ctx1 = await registerPlugin(db, def)
    const ctx2 = await registerPlugin(db, def)

    // Same matrix IDs returned
    expect(ctx2.matrixIds['notes']).toBe(ctx1.matrixIds['notes'])

    // Only one matrix exists with this title from this plugin
    const stmt = db.prepare('SELECT COUNT(*) as count FROM matrix WHERE source_plugin_id = ?')
    stmt.bind(['test-plugin'])
    stmt.step()
    expect((stmt.get({}) as { count: number }).count).toBe(1)
    stmt.finalize()
  })

  test('re-registration updates name and version', async () => {
    await registerPlugin(db, makeDefinition())

    await registerPlugin(db, makeDefinition({ name: 'Updated Plugin', version: '2.0.0' }))

    const row = getPlugin(db, 'test-plugin')
    expect(row!.name).toBe('Updated Plugin')
    expect(row!.version).toBe('2.0.0')
  })

  test('init lifecycle hook is called with PluginContext', async () => {
    const initFn = vi.fn()
    const def = makeDefinition({
      matrixes: [{ key: 'data', title: 'Data', columns: [{ name: 'val', type: 'TEXT' }] }],
      init: initFn,
    })

    const ctx = await registerPlugin(db, def)

    expect(initFn).toHaveBeenCalledOnce()
    expect(initFn).toHaveBeenCalledWith(ctx)
  })

  // -- unregisterPlugin -------------------------------------------------------

  test('unregister a plugin removes the plugins row', async () => {
    await registerPlugin(db, makeDefinition())
    expect(getPlugin(db, 'test-plugin')).not.toBeNull()

    await unregisterPlugin(db, 'test-plugin')
    expect(getPlugin(db, 'test-plugin')).toBeNull()
  })

  test('unregister a plugin does NOT delete its matrixes', async () => {
    const def = makeDefinition({
      matrixes: [
        { key: 'notes', title: 'Notes', columns: [{ name: 'content', type: 'TEXT' }] },
      ],
    })
    const ctx = await registerPlugin(db, def)
    const matrixId = ctx.matrixIds['notes']!

    await unregisterPlugin(db, 'test-plugin')

    // Matrix should still exist
    const stmt = db.prepare('SELECT id, title FROM matrix WHERE id = ?')
    stmt.bind([matrixId])
    expect(stmt.step()).toBe(true)
    expect((stmt.get({}) as { title: string }).title).toBe('Notes')
    stmt.finalize()
  })

  test('unregister sets source_plugin_id to NULL (ON DELETE SET NULL)', async () => {
    const def = makeDefinition({
      matrixes: [{ key: 'data', title: 'Data', columns: [{ name: 'val', type: 'TEXT' }] }],
    })
    const ctx = await registerPlugin(db, def)
    const matrixId = ctx.matrixIds['data']!

    await unregisterPlugin(db, 'test-plugin')

    const stmt = db.prepare('SELECT source_plugin_id FROM matrix WHERE id = ?')
    stmt.bind([matrixId])
    expect(stmt.step()).toBe(true)
    expect((stmt.get({}) as { source_plugin_id: string | null }).source_plugin_id).toBeNull()
    stmt.finalize()
  })

  test('unregister calls destroy lifecycle hook', async () => {
    const destroyFn = vi.fn()
    await registerPlugin(db, makeDefinition())

    await unregisterPlugin(db, 'test-plugin', destroyFn)

    expect(destroyFn).toHaveBeenCalledOnce()
  })

  // -- getPlugin / getAllPlugins -----------------------------------------------

  test('getPlugin returns null for non-existent plugin', () => {
    expect(getPlugin(db, 'nonexistent')).toBeNull()
  })

  test('getAllPlugins returns empty array with no plugins', () => {
    expect(getAllPlugins(db)).toEqual([])
  })

  test('getAllPlugins returns all registered plugins', async () => {
    await registerPlugin(db, makeDefinition({ id: 'alpha', name: 'Alpha' }))
    await registerPlugin(db, makeDefinition({ id: 'beta', name: 'Beta' }))

    const plugins = getAllPlugins(db)
    expect(plugins).toHaveLength(2)
    expect(plugins[0]!.name).toBe('Alpha')
    expect(plugins[1]!.name).toBe('Beta')
  })

  // -- Edge cases -------------------------------------------------------------

  test('user-created matrixes have null source_plugin_id', () => {
    const matrixId = createMatrix(db, 'User Matrix')

    const stmt = db.prepare('SELECT source_plugin_id FROM matrix WHERE id = ?')
    stmt.bind([matrixId])
    expect(stmt.step()).toBe(true)
    expect((stmt.get({}) as { source_plugin_id: string | null }).source_plugin_id).toBeNull()
    stmt.finalize()
  })

  test('registering multiple plugins with separate matrixes', async () => {
    const plugin1 = makeDefinition({
      id: 'plugin-a',
      name: 'Plugin A',
      matrixes: [{ key: 'data', title: 'A Data', columns: [{ name: 'val', type: 'TEXT' }] }],
    })
    const plugin2 = makeDefinition({
      id: 'plugin-b',
      name: 'Plugin B',
      matrixes: [{ key: 'data', title: 'B Data', columns: [{ name: 'val', type: 'TEXT' }] }],
    })

    const ctx1 = await registerPlugin(db, plugin1)
    const ctx2 = await registerPlugin(db, plugin2)

    expect(ctx1.matrixIds['data']).not.toBe(ctx2.matrixIds['data'])

    // Verify each matrix is attributed to the correct plugin
    const stmt = db.prepare('SELECT source_plugin_id FROM matrix WHERE id = ?')

    stmt.bind([ctx1.matrixIds['data']!])
    stmt.step()
    expect((stmt.get({}) as { source_plugin_id: string }).source_plugin_id).toBe('plugin-a')
    stmt.reset()

    stmt.bind([ctx2.matrixIds['data']!])
    stmt.step()
    expect((stmt.get({}) as { source_plugin_id: string }).source_plugin_id).toBe('plugin-b')
    stmt.finalize()
  })

  // -- faceTypes registration --------------------------------------------------

  test('registering a plugin with faceTypes registers them in the face registry', async () => {
    clearFaceTypeRegistry()

    const testFace: FaceTypeDefinition = {
      id: 'test.custom-face',
      name: 'Custom Face',
      slots: [{ name: 'content', preferredType: 'richtext', required: true }],
      overflowBehavior: 'none',
    }

    const def = makeDefinition({
      faceTypes: [testFace],
    })

    await registerPlugin(db, def)

    const registered = getFaceType('test.custom-face')
    expect(registered).toBeDefined()
    expect(registered!.name).toBe('Custom Face')
    expect(registered!.slots).toHaveLength(1)
  })

  test('faceTypes registration is idempotent across re-registration', async () => {
    clearFaceTypeRegistry()

    const testFace: FaceTypeDefinition = {
      id: 'test.idempotent-face',
      name: 'Idempotent Face',
      slots: [],
      overflowBehavior: 'none',
    }

    const def = makeDefinition({
      id: 'idempotent-plugin',
      faceTypes: [testFace],
    })

    await registerPlugin(db, def)
    await registerPlugin(db, def)

    const registered = getFaceType('test.idempotent-face')
    expect(registered).toBeDefined()
    expect(registered!.name).toBe('Idempotent Face')
  })

  test('plugin without faceTypes works as before', async () => {
    const def = makeDefinition({
      id: 'no-faces',
      name: 'No Faces Plugin',
    })

    const ctx = await registerPlugin(db, def)

    const row = getPlugin(db, 'no-faces')
    expect(row).not.toBeNull()
    expect(row!.name).toBe('No Faces Plugin')
    expect(Object.keys(ctx.matrixIds)).toHaveLength(0)
  })
})
