import type { Database } from '@sqlite.org/sqlite-wasm'

import {
  createOwnedMatrix,
  insertRow,
  updateRow,
  deleteRow,
  promoteNode,
  ConstraintViolationError,
} from '../core/matrix'
import { applyFaceToMatrix } from '../core/face-config'
import { getFaceType } from '../core/face-registry'
import { withTransaction } from '../core/transaction'
import type { NodeRef } from '../core/tree'

/** Wrap a plain text string as a minimal ProseMirror doc JSON. */
const textToPmJson = (text: string): string =>
  JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })

export type TagType = {
  id: number
  name: string
  matrixId: number
}

const TABLE_FACE_TYPE_ID = 'hila.table'

/**
 * Get the workspace matrix ID by looking up the workspace plugin metadata.
 */
const getWorkspaceMatrixId = (db: Database): number => {
  const stmt = db.prepare("SELECT metadata FROM plugins WHERE id = 'hila.workspace'")
  if (!stmt.step()) {
    stmt.finalize()
    throw new Error(
      'Tag operations require the hila.workspace plugin to be registered first ' +
        '(type-nodes live in the workspace matrix)',
    )
  }
  const row = stmt.get({}) as { metadata: string }
  stmt.finalize()
  const parsed = JSON.parse(row.metadata) as { matrixIds: Record<string, number> }
  return parsed.matrixIds['root']!
}

/**
 * Get the label column name for a matrix (the column with role='label').
 * Falls back to 'label' if no role-tagged column exists.
 */
const getLabelColumnName = (db: Database, matrixId: number): string => {
  const stmt = db.prepare(
    `SELECT name FROM matrix_columns WHERE matrix_id = ? AND role = 'label'`,
  )
  stmt.bind([matrixId])
  let name = 'label'
  if (stmt.step()) {
    name = (stmt.get({}) as { name: string }).name
  }
  stmt.finalize()
  return name
}

/**
 * Create a new tag type. In the type-node model (Phase 8c):
 * 1. Creates a workspace-matrix row (the type-node) with label = tag name
 * 2. Creates an owned matrix for the type's instances
 * 3. Promotes the type-node for # autocomplete visibility
 */
export const createTagType = (
  db: Database,
  name: string,
  columns?: { name: string; type: string }[],
): TagType => {
  return withTransaction(db, () => {
    const wsMatrixId = getWorkspaceMatrixId(db)
    const labelCol = getLabelColumnName(db, wsMatrixId)

    // Check uniqueness (case-insensitive) via matrix.title
    const existingStmt = db.prepare(
      `SELECT p.row_id FROM promoted_nodes p
       JOIN matrix m ON m.owner_matrix_id = p.matrix_id AND m.owner_row_id = p.row_id
       WHERE p.matrix_id = ? AND m.title = ? COLLATE NOCASE`,
    )
    existingStmt.bind([wsMatrixId, name])
    if (existingStmt.step()) {
      existingStmt.finalize()
      throw new Error(`Tag type "${name}" already exists`)
    }
    existingStmt.finalize()

    // Create the type-node in the workspace matrix (label stored as PM JSON)
    const { rowId: typeNodeRowId } = insertRow(db, wsMatrixId, {
      values: { [labelCol]: textToPmJson(name) },
    })
    const typeNode: NodeRef = { matrixId: wsMatrixId, rowId: typeNodeRowId }

    // Create the owned matrix for this type's instances
    const matrixColumns = columns ?? [{ name: 'label', type: 'TEXT' }]
    const ownedMatrixId = createOwnedMatrix(db, typeNode, name, matrixColumns, {
      managedBy: 'hila.tags',
    })

    db.exec('UPDATE matrix SET source_plugin_id = ? WHERE id = ?', {
      bind: ['hila.tags', ownedMatrixId],
    })

    // Apply table face to the new matrix
    if (getFaceType(TABLE_FACE_TYPE_ID)) {
      applyFaceToMatrix(db, TABLE_FACE_TYPE_ID, ownedMatrixId, 'hila.tags')
    }

    // Promote the type-node for # autocomplete
    promoteNode(db, typeNode)

    return {
      id: typeNodeRowId,
      name,
      matrixId: ownedMatrixId,
    }
  })
}

type TypeNodeRow = {
  row_id: number
  name: string
  owned_matrix_id: number
}

const toTagType = (row: TypeNodeRow): TagType => ({
  id: row.row_id,
  name: row.name,
  matrixId: row.owned_matrix_id,
})

/**
 * Get a tag type by name. Uses matrix.title (case-insensitive) to find
 * the promoted type-node's owned matrix by name.
 */
export const getTagType = (db: Database, name: string): TagType | null => {
  const wsMatrixId = getWorkspaceMatrixId(db)

  const stmt = db.prepare(
    `SELECT p.row_id, m.title AS name, m.id AS owned_matrix_id
     FROM promoted_nodes p
     JOIN matrix m ON m.owner_matrix_id = p.matrix_id AND m.owner_row_id = p.row_id
     WHERE p.matrix_id = ? AND m.title = ? COLLATE NOCASE
     LIMIT 1`,
  )
  stmt.bind([wsMatrixId, name])

  if (!stmt.step()) {
    stmt.finalize()
    return null
  }

  const row = stmt.get({}) as TypeNodeRow
  stmt.finalize()
  return toTagType(row)
}

/**
 * Get a tag type by the type-node's row ID.
 */
export const getTagTypeById = (db: Database, id: number): TagType | null => {
  const wsMatrixId = getWorkspaceMatrixId(db)

  const stmt = db.prepare(
    `SELECT p.row_id, m.title AS name, m.id AS owned_matrix_id
     FROM promoted_nodes p
     JOIN matrix m ON m.owner_matrix_id = p.matrix_id AND m.owner_row_id = p.row_id
     WHERE p.matrix_id = ? AND p.row_id = ?
     LIMIT 1`,
  )
  stmt.bind([wsMatrixId, id])

  if (!stmt.step()) {
    stmt.finalize()
    return null
  }

  const row = stmt.get({}) as TypeNodeRow
  stmt.finalize()
  return toTagType(row)
}

/**
 * Get a tag type by its owned matrix ID.
 */
export const getTagTypeByMatrixId = (db: Database, matrixId: number): TagType | null => {
  const wsMatrixId = getWorkspaceMatrixId(db)

  const stmt = db.prepare(
    `SELECT p.row_id, m.title AS name, m.id AS owned_matrix_id
     FROM matrix m
     JOIN promoted_nodes p ON p.matrix_id = m.owner_matrix_id AND p.row_id = m.owner_row_id
     WHERE m.id = ? AND p.matrix_id = ?
     LIMIT 1`,
  )
  stmt.bind([matrixId, wsMatrixId])

  if (!stmt.step()) {
    stmt.finalize()
    return null
  }

  const row = stmt.get({}) as TypeNodeRow
  stmt.finalize()
  return toTagType(row)
}

/**
 * List all tag types: promoted type-nodes that own a matrix.
 */
export const getAllTagTypes = (db: Database): TagType[] => {
  const wsMatrixId = getWorkspaceMatrixId(db)

  const stmt = db.prepare(
    `SELECT p.row_id, m.title AS name, m.id AS owned_matrix_id
     FROM promoted_nodes p
     JOIN matrix m ON m.owner_matrix_id = p.matrix_id AND m.owner_row_id = p.row_id
     WHERE p.matrix_id = ?
     ORDER BY m.title`,
  )
  stmt.bind([wsMatrixId])
  const results: TagType[] = []

  while (stmt.step()) {
    results.push(toTagType(stmt.get({}) as TypeNodeRow))
  }
  stmt.finalize()

  return results
}

/**
 * Update a tag type's name. Writes the type-node's label column (the
 * canonical name); core's `updateRow` syncs the owned matrix's derived
 * `title` cache from it.
 */
export const updateTagType = (db: Database, id: number, updates: { name?: string }): void => {
  if (updates.name === undefined) return

  const wsMatrixId = getWorkspaceMatrixId(db)
  const labelCol = getLabelColumnName(db, wsMatrixId)

  // Check uniqueness (case-insensitive) via matrix.title
  const existingStmt = db.prepare(
    `SELECT p.row_id FROM promoted_nodes p
     JOIN matrix m ON m.owner_matrix_id = p.matrix_id AND m.owner_row_id = p.row_id
     WHERE p.matrix_id = ? AND m.title = ? COLLATE NOCASE AND p.row_id != ?`,
  )
  existingStmt.bind([wsMatrixId, updates.name, id])
  if (existingStmt.step()) {
    existingStmt.finalize()
    throw new Error(`Tag type "${updates.name}" already exists`)
  }
  existingStmt.finalize()

  try {
    updateRow(db, {
      matrixId: wsMatrixId,
      rowId: id,
      values: { [labelCol]: textToPmJson(updates.name) },
    })
  } catch (err) {
    if (err instanceof ConstraintViolationError) {
      throw new Error(`Tag type "${updates.name}" already exists`)
    }
    throw err
  }
}

/**
 * Delete a tag type: deleting the type-node cascades its owned matrixes via
 * deleteRow's matrix-drop cascade (Phase 8c §2), which also clears the node's
 * promotion.
 */
export const deleteTagType = (db: Database, id: number): void => {
  const wsMatrixId = getWorkspaceMatrixId(db)
  deleteRow(db, wsMatrixId, id)
}
