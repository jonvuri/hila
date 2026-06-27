import type { Database } from '@sqlite.org/sqlite-wasm'

import type { NodeRef } from './tree'

/**
 * Bands (Phase 9.3; see context/Phase-9.3.md).
 *
 * A band is a node-scoped live view persisted in the `bands` table, keyed by
 * the focal (matrix_id, row_id). The read slice covers query-binding bands: raw
 * SQL rendered read-only through the schema-adaptive renderer. The `face` and
 * `integration` columns carry the documented band tuple but have a single value
 * each this phase ('property-list' / 'query') — behavior is not yet dispatched
 * on them.
 *
 * The table is LOCAL-ONLY: it carries no sync/changelog triggers (see
 * initMatrixSchema). The SQLite update hook still fires for it, so `useQuery`
 * subscriptions over `bands` stay reactive.
 */

export type BandRow = {
  id: number
  focal_matrix_id: number
  focal_row_id: number
  sql: string
  face: string
  integration: string
  order: number
}

/**
 * Create a query-binding band on a focal node. Appends after existing bands
 * (order = max(order) + 1). Returns the new band's id.
 */
export const createBand = (db: Database, focal: NodeRef, sql: string): number => {
  const orderStmt = db.prepare(
    `SELECT COALESCE(MAX("order"), -1) + 1 AS next_order FROM bands
     WHERE focal_matrix_id = ? AND focal_row_id = ?`,
  )
  orderStmt.bind([focal.matrixId, focal.rowId])
  orderStmt.step()
  const nextOrder = (orderStmt.get({}) as { next_order: number }).next_order
  orderStmt.finalize()

  const stmt = db.prepare(
    `INSERT INTO bands (focal_matrix_id, focal_row_id, sql, "order")
     VALUES (?, ?, ?, ?) RETURNING id`,
  )
  stmt.bind([focal.matrixId, focal.rowId, sql, nextOrder])
  if (!stmt.step()) {
    stmt.finalize()
    throw new Error('Failed to insert band')
  }
  const bandId = (stmt.get({}) as { id: number }).id
  stmt.finalize()
  return bandId
}

/** Replace a band's SQL. */
export const updateBandSql = (db: Database, bandId: number, sql: string): void => {
  db.exec('UPDATE bands SET sql = ? WHERE id = ?', { bind: [sql, bandId] })
}

/** Delete a band by id. */
export const deleteBand = (db: Database, bandId: number): void => {
  db.exec('DELETE FROM bands WHERE id = ?', { bind: [bandId] })
}

/** List a focal node's bands in display order. */
export const getBandsForNode = (db: Database, focal: NodeRef): BandRow[] => {
  const stmt = db.prepare(
    `SELECT id, focal_matrix_id, focal_row_id, sql, face, integration, "order"
     FROM bands
     WHERE focal_matrix_id = ? AND focal_row_id = ?
     ORDER BY "order", id`,
  )
  stmt.bind([focal.matrixId, focal.rowId])
  const rows: BandRow[] = []
  while (stmt.step()) {
    rows.push(stmt.get({}) as unknown as BandRow)
  }
  stmt.finalize()
  return rows
}
