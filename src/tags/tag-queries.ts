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
 * Tag browser list: all promoted type-nodes with their instance counts.
 * Instance count is the number of own-kind joins targeting the type's
 * owned matrix. The tag name comes from `matrix.title` (kept in sync).
 *
 * @param wsMatrixId - The workspace matrix ID (contains the type-nodes)
 */
export const buildTagTypesWithCountsQuery = (wsMatrixId: number): string => `
SELECT p.row_id AS id, m.title AS name, m.id AS matrix_id,
       (SELECT COUNT(*) FROM joins j
        WHERE j.target_matrix_id = m.id AND j.kind = 'own') AS instance_count
FROM promoted_nodes p
JOIN matrix m ON m.owner_matrix_id = p.matrix_id AND m.owner_row_id = p.row_id
WHERE p.matrix_id = ${wsMatrixId}
ORDER BY m.title
`

/**
 * Forward lookup: all tag aspects attached to a specific source row.
 * Joins against matrix.owner + promoted_nodes to identify tag type matrixes
 * and uses matrix.title for the tag name.
 *
 * @param wsMatrixId - The workspace matrix ID
 * @param sourceMatrixId - The matrix containing the tagged row
 * @param sourceRowId - The tagged row's ID
 */
export const buildTagsForRowQuery = (
  wsMatrixId: number,
  sourceMatrixId: number,
  sourceRowId: number,
): string => `
SELECT j.target_matrix_id, j.target_row_id,
       m.title AS tag_type_name
FROM joins j
JOIN matrix m ON m.id = j.target_matrix_id
JOIN promoted_nodes p ON p.matrix_id = m.owner_matrix_id AND p.row_id = m.owner_row_id
WHERE j.source_matrix_id = ${sourceMatrixId}
  AND j.source_row_id = ${sourceRowId}
  AND j.kind = 'own'
  AND p.matrix_id = ${wsMatrixId}
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
 * Tag instances with source context: all own-kind join instances for a tag
 * type, with the source matrix name. Returns one row per instance across
 * all source matrixes (no dynamic table name needed).
 */
export const buildTagInstancesQuery = (tagMatrixId: number): string => `
SELECT j.source_matrix_id, j.source_row_id, j.target_row_id,
       m.title AS source_matrix_name
FROM joins j
JOIN matrix m ON m.id = j.source_matrix_id
WHERE j.target_matrix_id = ${tagMatrixId}
  AND j.kind = 'own'
ORDER BY m.title, j.source_row_id
`

/**
 * Source row content snippet: fetches a single source row's first text
 * column content. Used by the tag browser to display a preview alongside
 * each instance.
 */
export const buildSourceRowSnippetQuery = (
  sourceMatrixId: number,
  sourceRowId: number,
): string => `
SELECT * FROM "mx_${sourceMatrixId}_data" WHERE id = ${sourceRowId}
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
