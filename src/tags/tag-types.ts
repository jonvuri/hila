import type { Database } from '@sqlite.org/sqlite-wasm'

import { createMatrix, getOrCreateDeviceId } from '../core/matrix'
import { applyFaceToMatrix } from '../core/face-config'
import { getFaceType } from '../core/face-registry'
import { ensureTrait } from '../core/traits'
import { withTransaction } from '../core/transaction'
import { installChangeTrackingTriggers } from '../core/sync'

export type TagType = {
  id: number
  name: string
  matrixId: number
  color: string | null
  icon: string | null
}

const TAG_TYPES_TABLE_COLUMNS = [
  { name: 'id', type: 'INTEGER' },
  { name: 'name', type: 'TEXT' },
  { name: 'matrix_id', type: 'INTEGER' },
  { name: 'color', type: 'TEXT' },
  { name: 'icon', type: 'TEXT' },
  { name: 'created_at', type: 'TEXT' },
]

const TABLE_FACE_TYPE_ID = 'hila.table'

export const ensureTagTypesTable = (db: Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tag_types (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      matrix_id INTEGER NOT NULL REFERENCES matrix(id),
      color TEXT,
      icon TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    ) STRICT;
  `)

  const deviceId = getOrCreateDeviceId(db)
  installChangeTrackingTriggers(db, 'tag_types', deviceId, TAG_TYPES_TABLE_COLUMNS)
}

export const createTagType = (
  db: Database,
  name: string,
  columns?: { name: string; type: string }[],
): TagType => {
  return withTransaction(db, () => {
    const matrixColumns = columns ?? [{ name: 'label', type: 'TEXT' }]
    const matrixId = createMatrix(db, name, matrixColumns)

    db.exec('UPDATE matrix SET source_plugin_id = ? WHERE id = ?', {
      bind: ['hila.tags', matrixId],
    })

    ensureTrait(db, 'rank', matrixId)

    const insertStmt = db.prepare(
      'INSERT INTO tag_types (name, matrix_id) VALUES (?, ?) RETURNING id, name, matrix_id, color, icon',
    )
    insertStmt.bind([name, matrixId])
    if (!insertStmt.step()) {
      insertStmt.finalize()
      throw new Error(`Failed to create tag type "${name}"`)
    }
    const row = insertStmt.get({}) as {
      id: number
      name: string
      matrix_id: number
      color: string | null
      icon: string | null
    }
    insertStmt.finalize()

    if (getFaceType(TABLE_FACE_TYPE_ID)) {
      applyFaceToMatrix(db, TABLE_FACE_TYPE_ID, matrixId, 'hila.tags')
    }

    return {
      id: row.id,
      name: row.name,
      matrixId: row.matrix_id,
      color: row.color,
      icon: row.icon,
    }
  })
}

export const getTagType = (db: Database, name: string): TagType | null => {
  const stmt = db.prepare(
    'SELECT id, name, matrix_id, color, icon FROM tag_types WHERE name = ?',
  )
  stmt.bind([name])

  if (!stmt.step()) {
    stmt.finalize()
    return null
  }

  const row = stmt.get({}) as {
    id: number
    name: string
    matrix_id: number
    color: string | null
    icon: string | null
  }
  stmt.finalize()

  return {
    id: row.id,
    name: row.name,
    matrixId: row.matrix_id,
    color: row.color,
    icon: row.icon,
  }
}

export const getTagTypeById = (db: Database, id: number): TagType | null => {
  const stmt = db.prepare('SELECT id, name, matrix_id, color, icon FROM tag_types WHERE id = ?')
  stmt.bind([id])

  if (!stmt.step()) {
    stmt.finalize()
    return null
  }

  const row = stmt.get({}) as {
    id: number
    name: string
    matrix_id: number
    color: string | null
    icon: string | null
  }
  stmt.finalize()

  return {
    id: row.id,
    name: row.name,
    matrixId: row.matrix_id,
    color: row.color,
    icon: row.icon,
  }
}

export const getTagTypeByMatrixId = (db: Database, matrixId: number): TagType | null => {
  const stmt = db.prepare(
    'SELECT id, name, matrix_id, color, icon FROM tag_types WHERE matrix_id = ?',
  )
  stmt.bind([matrixId])

  if (!stmt.step()) {
    stmt.finalize()
    return null
  }

  const row = stmt.get({}) as {
    id: number
    name: string
    matrix_id: number
    color: string | null
    icon: string | null
  }
  stmt.finalize()

  return {
    id: row.id,
    name: row.name,
    matrixId: row.matrix_id,
    color: row.color,
    icon: row.icon,
  }
}

export const getAllTagTypes = (db: Database): TagType[] => {
  const stmt = db.prepare(
    'SELECT id, name, matrix_id, color, icon FROM tag_types ORDER BY name',
  )
  const results: TagType[] = []

  while (stmt.step()) {
    const row = stmt.get({}) as {
      id: number
      name: string
      matrix_id: number
      color: string | null
      icon: string | null
    }
    results.push({
      id: row.id,
      name: row.name,
      matrixId: row.matrix_id,
      color: row.color,
      icon: row.icon,
    })
  }
  stmt.finalize()

  return results
}

type SqlValue = string | number | null | Uint8Array | bigint

export const updateTagType = (
  db: Database,
  id: number,
  updates: { name?: string; color?: string | null; icon?: string | null },
): void => {
  const setClauses: string[] = []
  const values: SqlValue[] = []

  if (updates.name !== undefined) {
    setClauses.push('name = ?')
    values.push(updates.name)
  }
  if (updates.color !== undefined) {
    setClauses.push('color = ?')
    values.push(updates.color)
  }
  if (updates.icon !== undefined) {
    setClauses.push('icon = ?')
    values.push(updates.icon)
  }

  if (setClauses.length === 0) return

  values.push(id)
  db.exec(`UPDATE tag_types SET ${setClauses.join(', ')} WHERE id = ?`, {
    bind: values,
  })
}

export const deleteTagType = (db: Database, id: number): void => {
  db.exec('DELETE FROM tag_types WHERE id = ?', { bind: [id] })
}
