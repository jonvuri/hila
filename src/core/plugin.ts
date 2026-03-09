import type { Database } from '@sqlite.org/sqlite-wasm'

import type { PluginContext, PluginDefinition, PluginRow } from './plugin-types'
import { createMatrix } from './matrix'
import { withTransaction } from './transaction'

/**
 * Register a plugin: upsert its `plugins` row, create declared matrixes
 * (skipping any that already exist from a prior registration), and
 * optionally call the `init` lifecycle hook.
 *
 * Idempotent: re-registering the same plugin ID updates metadata but
 * does not recreate existing matrixes.
 */
export const registerPlugin = async (
  db: Database,
  definition: PluginDefinition,
): Promise<PluginContext> => {
  const matrixIds: Record<string, number> = {}

  withTransaction(db, () => {
    // Check if plugin already exists (for idempotency)
    const existingStmt = db.prepare('SELECT metadata FROM plugins WHERE id = ?')
    existingStmt.bind([definition.id])
    let existingMatrixIds: Record<string, number> | undefined
    if (existingStmt.step()) {
      const row = existingStmt.get({}) as { metadata: string | null }
      if (row.metadata) {
        const parsed = JSON.parse(row.metadata) as { matrixIds?: Record<string, number> }
        existingMatrixIds = parsed.matrixIds
      }
    }
    existingStmt.finalize()

    // Upsert plugins row so the FK constraint on source_plugin_id is satisfied
    db.exec(
      `INSERT INTO plugins (id, name, version, enabled, metadata)
       VALUES (?, ?, ?, 1, NULL)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         version = excluded.version`,
      { bind: [definition.id, definition.name, definition.version] },
    )

    // Create or look up matrixes (createMatrix nests its own savepoint)
    for (const spec of definition.matrixes) {
      const existingId = existingMatrixIds?.[spec.key]

      if (existingId !== undefined) {
        const checkStmt = db.prepare('SELECT 1 FROM matrix WHERE id = ?')
        checkStmt.bind([existingId])
        if (checkStmt.step()) {
          matrixIds[spec.key] = existingId
          checkStmt.finalize()
          continue
        }
        checkStmt.finalize()
      }

      const matrixId = createMatrix(db, spec.title, spec.columns)
      db.exec('UPDATE matrix SET source_plugin_id = ? WHERE id = ?', {
        bind: [definition.id, matrixId],
      })
      matrixIds[spec.key] = matrixId
    }

    // Persist the key→matrixId mapping in the metadata column
    const metadata = JSON.stringify({ matrixIds })
    db.exec('UPDATE plugins SET metadata = ? WHERE id = ?', {
      bind: [metadata, definition.id],
    })

    // TODO: Request traits via ensureTrait (not yet implemented)
    // TODO: Store named queries/mutations (in-memory, future task)
    // TODO: Resolve face bindings (face system, future task)
  })

  const ctx: PluginContext = { matrixIds }

  if (definition.init) {
    await definition.init(ctx)
  }

  return ctx
}

/**
 * Unregister a plugin: call the optional `destroy` hook, then remove its
 * `plugins` row. Matrixes and traits are intentionally preserved.
 */
export const unregisterPlugin = async (
  db: Database,
  pluginId: string,
  destroy?: () => void | Promise<void>,
): Promise<void> => {
  if (destroy) {
    await destroy()
  }
  db.exec('DELETE FROM plugins WHERE id = ?', { bind: [pluginId] })
}

/** Retrieve a single plugin row by ID, or null if not found. */
export const getPlugin = (db: Database, pluginId: string): PluginRow | null => {
  const stmt = db.prepare(
    'SELECT id, name, version, enabled, metadata FROM plugins WHERE id = ?',
  )
  stmt.bind([pluginId])

  if (stmt.step()) {
    const row = stmt.get({}) as PluginRow
    stmt.finalize()
    return row
  }

  stmt.finalize()
  return null
}

/** Return all registered plugins ordered by name. */
export const getAllPlugins = (db: Database): PluginRow[] => {
  const stmt = db.prepare(
    'SELECT id, name, version, enabled, metadata FROM plugins ORDER BY name',
  )
  const plugins: PluginRow[] = []
  while (stmt.step()) {
    plugins.push(stmt.get({}) as PluginRow)
  }
  stmt.finalize()
  return plugins
}
