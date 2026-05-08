import type { Database } from '@sqlite.org/sqlite-wasm'

import type { FaceConfig, FaceConfigRow } from './face-types'
import { getFaceType } from './face-registry'
import { resolveSlotBindings } from './slot-binding'
import { getColumns } from './matrix'
import { rebuildClosure } from './tree'
import { ensureTrait, hasTrait } from './traits'
import { withTransaction } from './transaction'

/**
 * Assemble a FaceConfig from a face_configs row plus the normalized tables.
 */
const loadFaceConfig = (db: Database, row: FaceConfigRow): FaceConfig => {
  // Load slot bindings
  const slotBindings: Record<string, number | null> = {}
  const sbStmt = db.prepare(
    'SELECT slot_name, column_id FROM face_slot_bindings WHERE face_config_id = ?',
  )
  sbStmt.bind([row.id])
  while (sbStmt.step()) {
    const sb = sbStmt.get({}) as { slot_name: string; column_id: number | null }
    slotBindings[sb.slot_name] = sb.column_id
  }
  sbStmt.finalize()

  // Load sort config
  let sort: FaceConfig['sort'] = null
  const sortStmt = db.prepare(
    'SELECT column_id, direction FROM face_sort_config WHERE face_config_id = ?',
  )
  sortStmt.bind([row.id])
  if (sortStmt.step()) {
    const s = sortStmt.get({}) as { column_id: number; direction: 'ASC' | 'DESC' }
    sort = { columnId: s.column_id, direction: s.direction }
  }
  sortStmt.finalize()

  // Load filter configs
  const filters: FaceConfig['filters'] = []
  const filterStmt = db.prepare(
    'SELECT column_id, operator, value FROM face_filter_configs WHERE face_config_id = ? ORDER BY id',
  )
  filterStmt.bind([row.id])
  while (filterStmt.step()) {
    const f = filterStmt.get({}) as { column_id: number; operator: string; value: string }
    filters.push({ columnId: f.column_id, operator: f.operator, value: f.value })
  }
  filterStmt.finalize()

  return {
    id: row.id,
    faceTypeId: row.face_type_id,
    matrixId: row.matrix_id,
    query: row.query,
    slotBindings,
    settings: row.settings ? (JSON.parse(row.settings) as Record<string, unknown>) : {},
    createdByPlugin: row.created_by_plugin,
    sort,
    filters,
  }
}

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

    const slotBindings: Record<string, number | null> = {}
    for (const b of bindings) {
      slotBindings[b.slotName] = b.columnId
    }

    const config: FaceConfig = {
      id: crypto.randomUUID(),
      faceTypeId,
      matrixId,
      query: `SELECT * FROM "mx_${matrixId}_data"`,
      slotBindings,
      settings: {},
      createdByPlugin: pluginId ?? null,
      sort: null,
      filters: [],
    }

    saveFaceConfig(db, config)
    return config
  })
}

/** Insert or replace a face configuration (writes normalized tables). */
export const saveFaceConfig = (db: Database, config: FaceConfig): void => {
  // Upsert the main face_configs row (slot_bindings kept as empty JSON for backward compat)
  db.exec(
    `INSERT OR REPLACE INTO face_configs
       (id, face_type_id, matrix_id, query, slot_bindings, settings, created_by_plugin)
     VALUES (?, ?, ?, ?, '{}', ?, ?)`,
    {
      bind: [
        config.id,
        config.faceTypeId,
        config.matrixId,
        config.query,
        Object.keys(config.settings).length > 0 ? JSON.stringify(config.settings) : null,
        config.createdByPlugin ?? null,
      ],
    },
  )

  // Write slot bindings
  db.exec('DELETE FROM face_slot_bindings WHERE face_config_id = ?', {
    bind: [config.id],
  })
  for (const [slotName, columnId] of Object.entries(config.slotBindings)) {
    db.exec(
      'INSERT INTO face_slot_bindings (face_config_id, slot_name, column_id) VALUES (?, ?, ?)',
      { bind: [config.id, slotName, columnId] },
    )
  }

  // Write sort config
  db.exec('DELETE FROM face_sort_config WHERE face_config_id = ?', {
    bind: [config.id],
  })
  if (config.sort) {
    db.exec(
      'INSERT INTO face_sort_config (face_config_id, column_id, direction) VALUES (?, ?, ?)',
      { bind: [config.id, config.sort.columnId, config.sort.direction] },
    )
  }

  // Write filter configs
  db.exec('DELETE FROM face_filter_configs WHERE face_config_id = ?', {
    bind: [config.id],
  })
  for (const f of config.filters) {
    db.exec(
      'INSERT INTO face_filter_configs (face_config_id, column_id, operator, value) VALUES (?, ?, ?, ?)',
      { bind: [config.id, f.columnId, f.operator, f.value] },
    )
  }
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
    return loadFaceConfig(db, row)
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
    configs.push(loadFaceConfig(db, stmt.get({}) as FaceConfigRow))
  }
  stmt.finalize()
  return configs
}
