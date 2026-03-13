import type { Database } from '@sqlite.org/sqlite-wasm'

import type { FaceConfig, FaceConfigRow } from './face-types'
import { getFaceType } from './face-registry'
import { resolveSlotBindings } from './slot-binding'
import { getColumns } from './matrix'
import { rebuildClosure } from './sync'
import { ensureTrait, hasTrait } from './traits'
import { withTransaction } from './transaction'

const rowToFaceConfig = (row: FaceConfigRow): FaceConfig => ({
  id: row.id,
  faceTypeId: row.face_type_id,
  matrixId: row.matrix_id,
  query: row.query,
  slotBindings: JSON.parse(row.slot_bindings) as Record<string, string>,
  settings: row.settings ? (JSON.parse(row.settings) as Record<string, unknown>) : {},
  createdByPlugin: row.created_by_plugin,
})

/**
 * Apply a face type to a matrix: provisions required traits,
 * auto-resolves slot bindings, creates a default FaceConfig, and persists it.
 */
export const applyFaceToMatrix = (
  db: Database,
  faceTypeId: string,
  matrixId: number,
  pluginId?: string,
): FaceConfig => {
  const faceType = getFaceType(faceTypeId)
  if (!faceType) {
    throw new Error(`Unknown face type: "${faceTypeId}"`)
  }

  return withTransaction(db, () => {
    for (const req of faceType.traitRequirements) {
      const alreadyExists = hasTrait(db, matrixId, req.type)
      ensureTrait(db, req.type, matrixId)
      if (!alreadyExists && req.type === 'closure') {
        rebuildClosure(db, matrixId)
      }
    }

    const columns = getColumns(db, matrixId)
    const { bindings } = resolveSlotBindings(faceType, columns)

    const slotBindings: Record<string, string> = {}
    for (const b of bindings) {
      slotBindings[b.slotName] = b.columnName
    }

    const config: FaceConfig = {
      id: crypto.randomUUID(),
      faceTypeId,
      matrixId,
      query: `SELECT * FROM "mx_${matrixId}_data"`,
      slotBindings,
      settings: {},
      createdByPlugin: pluginId ?? null,
    }

    saveFaceConfig(db, config)
    return config
  })
}

/** Insert or replace a face configuration. */
export const saveFaceConfig = (db: Database, config: FaceConfig): void => {
  db.exec(
    `INSERT OR REPLACE INTO face_configs
       (id, face_type_id, matrix_id, query, slot_bindings, settings, created_by_plugin)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    {
      bind: [
        config.id,
        config.faceTypeId,
        config.matrixId,
        config.query,
        JSON.stringify(config.slotBindings),
        Object.keys(config.settings).length > 0 ? JSON.stringify(config.settings) : null,
        config.createdByPlugin ?? null,
      ],
    },
  )
}

/** Retrieve a single face config by ID, or null if not found. */
export const getFaceConfig = (db: Database, id: string): FaceConfig | null => {
  const stmt = db.prepare(
    `SELECT id, face_type_id, matrix_id, query, slot_bindings, settings, created_by_plugin
     FROM face_configs WHERE id = ?`,
  )
  stmt.bind([id])

  if (stmt.step()) {
    const row = stmt.get({}) as FaceConfigRow
    stmt.finalize()
    return rowToFaceConfig(row)
  }

  stmt.finalize()
  return null
}

/** Retrieve all face configurations for a given matrix. */
export const getFaceConfigsForMatrix = (db: Database, matrixId: number): FaceConfig[] => {
  const stmt = db.prepare(
    `SELECT id, face_type_id, matrix_id, query, slot_bindings, settings, created_by_plugin
     FROM face_configs WHERE matrix_id = ?`,
  )
  stmt.bind([matrixId])

  const configs: FaceConfig[] = []
  while (stmt.step()) {
    configs.push(rowToFaceConfig(stmt.get({}) as FaceConfigRow))
  }
  stmt.finalize()
  return configs
}
