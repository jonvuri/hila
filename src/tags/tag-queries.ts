/**
 * Query builders for tag lookup operations.
 *
 * These return SQL strings for use with `useQuery` / `execQuery`.
 * Dynamic table names (`mx_{id}_data`) prevent parameterized binding,
 * so IDs are interpolated directly — consistent with how outline and
 * notes plugins build queries.
 */

/**
 * Tag browser list: all registered tag types with their instance counts.
 * Instance count is the number of own-kind joins targeting each tag type's matrix.
 */
export const buildTagTypesWithCountsQuery = (): string => `
SELECT tt.id, tt.name, tt.matrix_id, tt.color, tt.icon,
       (SELECT COUNT(*) FROM joins j
        WHERE j.target_matrix_id = tt.matrix_id AND j.kind = 'own') AS instance_count
FROM tag_types tt
ORDER BY tt.name
`

/**
 * Forward lookup: all tag aspects attached to a specific source row,
 * with tag type metadata (name, color) from the `tag_types` registry.
 */
export const buildTagsForRowQuery = (sourceMatrixId: number, sourceRowId: number): string => `
SELECT j.target_matrix_id, j.target_row_id, tt.name AS tag_type_name, tt.color
FROM joins j
JOIN tag_types tt ON tt.matrix_id = j.target_matrix_id
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
