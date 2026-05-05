import type { Database } from '@sqlite.org/sqlite-wasm'

import { createMatrix, insertRow, updateRow, deleteRow } from '../core/matrix'
import { applyFaceToMatrix } from '../core/face-config'
import { getFaceType } from '../core/face-registry'
import { ensureTrait } from '../core/traits'
import { withTransaction } from '../core/transaction'

export type TagType = {
  id: number
  name: string
  matrixId: number
  color: string | null
  icon: string | null
}

const TABLE_FACE_TYPE_ID = 'hila.table'

const getRegistryMatrixIdFromDb = (db: Database): number => {
  const stmt = db.prepare("SELECT metadata FROM plugins WHERE id = 'hila.tags'")
  if (!stmt.step()) {
    stmt.finalize()
    throw new Error('Tags plugin not registered')
  }
  const row = stmt.get({}) as { metadata: string }
  stmt.finalize()
  const parsed = JSON.parse(row.metadata) as { matrixIds: Record<string, number> }
  return parsed.matrixIds['registry']!
}

export const createTagType = (
  db: Database,
  name: string,
  columns?: { name: string; type: string }[],
): TagType => {
  return withTransaction(db, () => {
    const registryMatrixId = getRegistryMatrixIdFromDb(db)

    const checkStmt = db.prepare(
      `SELECT 1 FROM "mx_${registryMatrixId}_data" WHERE LOWER(name) = LOWER(?)`,
    )
    checkStmt.bind([name])
    const exists = checkStmt.step()
    checkStmt.finalize()
    if (exists) throw new Error(`Tag type "${name}" already exists`)

    const matrixColumns = columns ?? [{ name: 'label', type: 'TEXT' }]
    const matrixId = createMatrix(db, name, matrixColumns)

    db.exec('UPDATE matrix SET source_plugin_id = ? WHERE id = ?', {
      bind: ['hila.tags', matrixId],
    })

    ensureTrait(db, 'rank', matrixId)

    const { rowId } = insertRow(db, registryMatrixId, {
      values: { name, matrix_id: matrixId },
    })

    if (getFaceType(TABLE_FACE_TYPE_ID)) {
      applyFaceToMatrix(db, TABLE_FACE_TYPE_ID, matrixId, 'hila.tags')
    }

    return {
      id: rowId,
      name,
      matrixId,
      color: null,
      icon: null,
    }
  })
}

type RegistryRow = {
  id: number
  name: string
  matrix_id: number
  color: string | null
  icon: string | null
}

const toTagType = (row: RegistryRow): TagType => ({
  id: row.id,
  name: row.name,
  matrixId: row.matrix_id,
  color: row.color,
  icon: row.icon,
})

export const getTagType = (db: Database, name: string): TagType | null => {
  const registryMatrixId = getRegistryMatrixIdFromDb(db)
  const stmt = db.prepare(
    `SELECT id, name, matrix_id, color, icon FROM "mx_${registryMatrixId}_data" WHERE name = ?`,
  )
  stmt.bind([name])

  if (!stmt.step()) {
    stmt.finalize()
    return null
  }

  const row = stmt.get({}) as RegistryRow
  stmt.finalize()
  return toTagType(row)
}

export const getTagTypeById = (db: Database, id: number): TagType | null => {
  const registryMatrixId = getRegistryMatrixIdFromDb(db)
  const stmt = db.prepare(
    `SELECT id, name, matrix_id, color, icon FROM "mx_${registryMatrixId}_data" WHERE id = ?`,
  )
  stmt.bind([id])

  if (!stmt.step()) {
    stmt.finalize()
    return null
  }

  const row = stmt.get({}) as RegistryRow
  stmt.finalize()
  return toTagType(row)
}

export const getTagTypeByMatrixId = (db: Database, matrixId: number): TagType | null => {
  const registryMatrixId = getRegistryMatrixIdFromDb(db)
  const stmt = db.prepare(
    `SELECT id, name, matrix_id, color, icon FROM "mx_${registryMatrixId}_data" WHERE matrix_id = ?`,
  )
  stmt.bind([matrixId])

  if (!stmt.step()) {
    stmt.finalize()
    return null
  }

  const row = stmt.get({}) as RegistryRow
  stmt.finalize()
  return toTagType(row)
}

export const getAllTagTypes = (db: Database): TagType[] => {
  const registryMatrixId = getRegistryMatrixIdFromDb(db)
  const stmt = db.prepare(
    `SELECT id, name, matrix_id, color, icon FROM "mx_${registryMatrixId}_data" ORDER BY name`,
  )
  const results: TagType[] = []

  while (stmt.step()) {
    results.push(toTagType(stmt.get({}) as RegistryRow))
  }
  stmt.finalize()

  return results
}

export const updateTagType = (
  db: Database,
  id: number,
  updates: { name?: string; color?: string | null; icon?: string | null },
): void => {
  const values: Record<string, unknown> = {}

  if (updates.name !== undefined) {
    const registryMatrixId = getRegistryMatrixIdFromDb(db)
    const checkStmt = db.prepare(
      `SELECT 1 FROM "mx_${registryMatrixId}_data" WHERE LOWER(name) = LOWER(?) AND id != ?`,
    )
    checkStmt.bind([updates.name, id])
    const conflict = checkStmt.step()
    checkStmt.finalize()
    if (conflict) throw new Error(`Tag type "${updates.name}" already exists`)

    values.name = updates.name
  }
  if (updates.color !== undefined) values.color = updates.color
  if (updates.icon !== undefined) values.icon = updates.icon

  if (Object.keys(values).length === 0) return

  const registryMatrixId = getRegistryMatrixIdFromDb(db)
  updateRow(db, { matrixId: registryMatrixId, rowId: id, values })
}

export const deleteTagType = (db: Database, id: number): void => {
  const registryMatrixId = getRegistryMatrixIdFromDb(db)
  deleteRow(db, registryMatrixId, id)
}
