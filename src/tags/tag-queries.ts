/**
 * Query builders for tag lookup operations.
 *
 * These return SQL strings for use with `useQuery` / `execQuery`.
 * Dynamic table names (`mx_{id}_data`) prevent parameterized binding,
 * so IDs are interpolated directly — consistent with how outline and
 * notes plugins build queries.
 *
 * Phase 8c: tag types are now promoted type-nodes in the workspace matrix
 * that own a matrix via `matrix.owner`. The registry matrix is dissolved.
 * The canonical tag name is the type-node's label-role column; queries read
 * `matrix.title`, a derived cache core's `updateRow` keeps in sync, to avoid
 * parsing ProseMirror JSON in SQL.
 */

/**
 * Forward lookup: all tag aspects attached to a specific source row.
 * Joins against matrix.owner + promoted_nodes to identify tag type matrixes
 * and uses matrix.title for the tag name.
 *
 * Phase 9.7 Stage C: the former host-matrix scope (`p.matrix_id = wsMatrixId`)
 * is removed — editability is per-cell hydration computed uniformly, so aspects
 * attached to a non-workspace node surface and edit in place too (the §9.6 sharp
 * edge dissolves). The `promoted_nodes` join stays: it distinguishes a genuine
 * tag aspect (an own-join into a promoted type-node's matrix) from other
 * own-edges — a loose own-child or a `view` block marker — which are also
 * `kind='own'` but whose target matrix has no promoted-node owner.
 *
 * @param sourceMatrixId - The matrix containing the tagged row
 * @param sourceRowId - The tagged row's ID
 */
export const buildTagsForRowQuery = (sourceMatrixId: number, sourceRowId: number): string => `
SELECT j.target_matrix_id, j.target_row_id,
       m.title AS tag_type_name
FROM joins j
JOIN matrix m ON m.id = j.target_matrix_id
JOIN promoted_nodes p ON p.matrix_id = m.owner_matrix_id AND p.row_id = m.owner_row_id
WHERE j.source_matrix_id = ${sourceMatrixId}
  AND j.source_row_id = ${sourceRowId}
  AND j.kind = 'own'
`

/**
 * Reverse lookup: all source rows (within a specific source matrix) that
 * have been tagged with a given tag type. Returns joined source row data.
 *
 * `sourceMatrixId` is required because the dynamic `mx_{id}_data` table
 * name must be known at query-build time. Callers needing cross-matrix
 * aggregation run this once per source matrix.
 */
export const buildTaggedRowsQuery = (tagMatrixId: number, sourceMatrixId: number): string => `
SELECT j.source_matrix_id, j.source_row_id, d.*
FROM joins j
JOIN "mx_${sourceMatrixId}_data" d ON j.source_row_id = d.id
WHERE j.target_matrix_id = ${tagMatrixId}
  AND j.source_matrix_id = ${sourceMatrixId}
  AND j.kind = 'own'
`

/**
 * Bulk forward lookup: all tag aspects attached to a set of source rows.
 * Returns one row per (source row, tag type) pair. Used for batched
 * navigation-row property-preview chip hydration (Phase 9.2).
 *
 * Phase 9.7 Stage C: host-matrix scope removed (see `buildTagsForRowQuery`);
 * the `promoted_nodes` join stays to exclude non-tag own-edges.
 *
 * @param sourceMatrixId - The matrix containing the tagged rows
 * @param sourceRowIds - The row IDs to look up (must be non-empty)
 */
export const buildTagsForRowsQuery = (
  sourceMatrixId: number,
  sourceRowIds: number[],
): string => `
SELECT j.source_row_id, j.target_matrix_id, j.target_row_id,
       m.title AS tag_type_name
FROM joins j
JOIN matrix m ON m.id = j.target_matrix_id
JOIN promoted_nodes p ON p.matrix_id = m.owner_matrix_id AND p.row_id = m.owner_row_id
WHERE j.source_matrix_id = ${sourceMatrixId}
  AND j.source_row_id IN (${sourceRowIds.join(',')})
  AND j.kind = 'own'
`

/**
 * Specific aspect lookup: the aspect row for a (source row, tag type) pair.
 * Returns all columns from the tag matrix's data table for the matching
 * aspect row.
 */
export const buildAspectForRowQuery = (
  sourceMatrixId: number,
  sourceRowId: number,
  tagMatrixId: number,
): string => `
SELECT t.*
FROM "mx_${tagMatrixId}_data" t
JOIN joins j ON j.target_matrix_id = ${tagMatrixId} AND j.target_row_id = t.id
WHERE j.source_matrix_id = ${sourceMatrixId}
  AND j.source_row_id = ${sourceRowId}
  AND j.kind = 'own'
`
