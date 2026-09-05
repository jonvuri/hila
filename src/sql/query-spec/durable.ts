import type { Database } from '@sqlite.org/sqlite-wasm'
import { traverse } from 'sqlite3-parser'

import type { ColumnDefinition } from '../../core/matrix'
import { parseSingleStatement, quoteSqlIdentifier, type SqlAstNode } from '../sql-statement'

import { createQueryCatalog, type QueryCatalog } from './catalog'
import { materializeQuerySpec } from './materialize'
import { recognizeQuerySpec } from './recognize'

export type StrandedOpaqueLeaf = {
  markerMatrixId: number
  markerRowId: number
  leafIndex: number
  columnName: string
  sql: string
}

export type RenameHealingReport = {
  healedViewCount: number
  strandedOpaqueLeaves: StrandedOpaqueLeaf[]
}

const readColumns = (db: Database, matrixId: number): ColumnDefinition[] =>
  db.selectObjects(
    `SELECT id, name, type, display_type AS displayType, "order", options, formula,
            constraints, managed_by AS managedBy, role
     FROM matrix_columns
     WHERE matrix_id = ?
     ORDER BY "order"`,
    [matrixId],
  ) as unknown as ColumnDefinition[]

const readNodeIdentities = (db: Database): { matrixId: number; rowId: number }[] => {
  const matrices = db.selectObjects('SELECT id FROM matrix') as unknown as { id: number }[]
  const nodes: { matrixId: number; rowId: number }[] = []
  for (const { id: matrixId } of matrices) {
    const tableName = `mx_${matrixId}_data`
    const exists = db.selectValue(
      `SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?`,
      [tableName],
    )
    if (!exists) continue
    const rows = db.selectObjects(
      `SELECT id FROM ${quoteSqlIdentifier(tableName)}`,
    ) as unknown as { id: number }[]
    nodes.push(...rows.map(({ id: rowId }) => ({ matrixId, rowId })))
  }
  return nodes
}

const catalogFor = (
  matrixId: number,
  columns: readonly ColumnDefinition[],
  nodes: QueryCatalog['nodes'],
): QueryCatalog => createQueryCatalog({ matrices: [{ id: matrixId, columns }], nodes })

const opaqueReferencesColumn = (sql: string, columnName: string): boolean => {
  const parsed = parseSingleStatement(`SELECT 1 WHERE ${sql}`)
  if (!parsed.ok) return false
  let found = false
  traverse(parsed.statement.root as SqlAstNode, {
    nodes: {
      QualifiedExpr(node: SqlAstNode) {
        if (String(node.column?.text).toLowerCase() === columnName.toLowerCase()) found = true
      },
      Id(node: SqlAstNode) {
        if (String(node.name).toLowerCase() === columnName.toLowerCase()) found = true
      },
    },
  })
  return found
}

/**
 * Recompile recognized views through stable column IDs after a physical rename.
 * Opaque WHERE leaves remain byte-identical; references they own cannot be
 * healed safely and are returned to the caller as a stated report.
 */
export const healDialectViewsForColumnRename = (
  db: Database,
  matrixId: number,
  beforeColumns: readonly ColumnDefinition[],
  oldColumnName: string,
): RenameHealingReport => {
  const nodes = readNodeIdentities(db)
  const beforeCatalog = catalogFor(matrixId, beforeColumns, nodes)
  const afterCatalog = catalogFor(matrixId, readColumns(db, matrixId), nodes)
  const views = db.selectObjects(
    `SELECT marker_matrix_id AS markerMatrixId, marker_row_id AS markerRowId, sql
     FROM block_sources
     WHERE kind = 'view'`,
  ) as unknown as { markerMatrixId: number; markerRowId: number; sql: string }[]

  let healedViewCount = 0
  const strandedOpaqueLeaves: StrandedOpaqueLeaf[] = []
  for (const view of views) {
    const recognition = recognizeQuerySpec(view.sql, beforeCatalog)
    if (recognition.type === 'custom-sql') continue

    recognition.spec.where.forEach((leaf, leafIndex) => {
      if (leaf.type === 'opaque' && opaqueReferencesColumn(leaf.sql, oldColumnName)) {
        strandedOpaqueLeaves.push({
          markerMatrixId: view.markerMatrixId,
          markerRowId: view.markerRowId,
          leafIndex,
          columnName: oldColumnName,
          sql: leaf.sql,
        })
      }
    })

    const healedSql = materializeQuerySpec(recognition.spec, afterCatalog)
    if (healedSql === view.sql) continue
    db.exec(
      'UPDATE block_sources SET sql = ? WHERE marker_matrix_id = ? AND marker_row_id = ?',
      { bind: [healedSql, view.markerMatrixId, view.markerRowId] },
    )
    healedViewCount++
  }

  return { healedViewCount, strandedOpaqueLeaves }
}
