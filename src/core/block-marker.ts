import type { Database } from '@sqlite.org/sqlite-wasm'

import { insertDataRow } from './matrix'
import { deleteHomeGhostingPortals } from './portal'
import { createTreePosition, type NodeRef } from './tree'
import { withTransaction } from './transaction'

const DEFAULT_VIEW_NAME = 'Untitled view'

const textToPmJson = (text: string): string =>
  JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
  })

const getLabelColumnName = (db: Database, matrixId: number): string => {
  const stmt = db.prepare(
    `SELECT name FROM matrix_columns
     WHERE matrix_id = ? AND role = 'label' AND formula IS NULL
     LIMIT 1`,
  )
  stmt.bind([matrixId])
  if (!stmt.step()) {
    stmt.finalize()
    throw new Error(`Cannot create a named view in matrix ${matrixId}: no writable label field`)
  }
  const name = (stmt.get({}) as { name: string }).name
  stmt.finalize()
  return name
}

const quoteIdent = (value: string): string => `"${value.replaceAll('"', '""')}"`

/**
 * Block markers (Phase 9.7 Stage B; see context/Phase-9.7.md §3, §6).
 *
 * The convergence unifies the three former bands into three child-sourcing
 * modes (`loose` / `container` / `view`). A block marker is a **real
 * `scroll_index` participant** — an own-forest node — that stands in for a
 * gather-positioned region (a `view` result, or a shared `container`'s extent).
 * Of the three modes, only a `view` persists anything beyond its position: its
 * SQL, in `block_sources` keyed by the marker node's identity. A `container`
 * persists nothing new (`matrix.owner` + membership suffice).
 *
 * This module owns the `view`-block lifecycle: minting the marker node under its
 * focal parent (so its `edge_key` carries position — the former `bands.order`),
 * recording its SQL, and tearing both down. The marker node is excluded from the
 * loose outline scan (`buildPaginatedOutlineQuery`) — its content is drawn via
 * count+slice flattening (`src/workspace/window-flatten.ts`), not as a plain
 * row. Wiring that inline render is the renderer stage (Stage C); until then the
 * marker's SQL is rendered in the focus panel's query-band section.
 */

export type ViewBlockRow = {
  marker_matrix_id: number
  marker_row_id: number
  name: string
  sql: string
}

/**
 * Create a `view` block marker under `focal`: mint a marker node (own-child of
 * focal, so its `edge_key` positions it), and record its SQL in `block_sources`.
 * Returns the marker's node identity.
 */
export const createViewBlock = (
  db: Database,
  focal: NodeRef,
  sql: string,
  name = DEFAULT_VIEW_NAME,
): NodeRef =>
  withTransaction(db, () => {
    // The marker is a normal named row in the focal's matrix. Its label-role
    // field is the view's name; block_sources owns only the SQL.
    const labelColumn = getLabelColumnName(db, focal.matrixId)
    const markerRowId = insertDataRow(db, focal.matrixId, {
      [labelColumn]: textToPmJson(name.trim() || DEFAULT_VIEW_NAME),
    })
    createTreePosition(db, focal.matrixId, markerRowId, { parent: focal })
    db.exec(
      `INSERT INTO block_sources (marker_matrix_id, marker_row_id, kind, sql)
       VALUES (?, ?, 'view', ?)`,
      { bind: [focal.matrixId, markerRowId, sql] },
    )
    return { matrixId: focal.matrixId, rowId: markerRowId }
  })

/** Replace a view-block marker's SQL. */
export const updateViewBlockSql = (db: Database, marker: NodeRef, sql: string): void => {
  db.exec('UPDATE block_sources SET sql = ? WHERE marker_matrix_id = ? AND marker_row_id = ?', {
    bind: [sql, marker.matrixId, marker.rowId],
  })
}

/**
 * Delete a view-block marker: drop its SQL row and remove the marker node from
 * the forest (its own-edge, scroll_index entry, and data row).
 */
export const deleteViewBlock = (db: Database, marker: NodeRef): void => {
  withTransaction(db, () => {
    // Normal place deletion removes the home and source while preserving any
    // portal appearances as ghosts. The shared home-delete path cleans the
    // block_sources row before deleting marker data.
    deleteHomeGhostingPortals(db, marker)
  })
}

/** List a focal node's view-block markers in position (`edge_key`) order. */
export const getViewBlocksForNode = (db: Database, focal: NodeRef): ViewBlockRow[] => {
  const labelColumn = quoteIdent(getLabelColumnName(db, focal.matrixId))
  const stmt = db.prepare(
    `SELECT bs.marker_matrix_id, bs.marker_row_id, d.${labelColumn} AS name, bs.sql
     FROM block_sources bs
     JOIN joins j
       ON j.kind = 'own'
      AND j.target_matrix_id = bs.marker_matrix_id
      AND j.target_row_id = bs.marker_row_id
     JOIN "mx_${focal.matrixId}_data" d
       ON d.id = bs.marker_row_id AND bs.marker_matrix_id = ${focal.matrixId}
     WHERE j.source_matrix_id = ? AND j.source_row_id = ?
     ORDER BY j.edge_key`,
  )
  stmt.bind([focal.matrixId, focal.rowId])
  const rows: ViewBlockRow[] = []
  while (stmt.step()) rows.push(stmt.get({}) as unknown as ViewBlockRow)
  stmt.finalize()
  return rows
}
