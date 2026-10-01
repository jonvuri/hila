/**
 * Query builders for view-block markers (Phase 9.7 Stage B; see
 * context/Phase-9.7.md §6). The successor to the Phase 9.3 band query builders.
 *
 * These return SQL strings for use with `useQuery`. Dynamic table names
 * (`mx_{id}_data`) prevent parameterized binding, so IDs are interpolated
 * directly — consistent with the outline / notes / tag query builders.
 */

/**
 * A focal node's view-block markers in position (`edge_key`) order. Reactive via
 * the SQLite update hook on `block_sources` / `joins`. Mirrors
 * `getViewBlocksForNode` in src/core/block-marker.ts.
 */
export const buildViewBlocksForNodeQuery = (
  focalMatrixId: number,
  focalRowId: number,
  labelColumn?: string,
): string => `
SELECT bs.marker_matrix_id, bs.marker_row_id, bs.sql
       ${labelColumn ? `, d."${labelColumn.replaceAll('"', '""')}" AS name` : ''}
FROM block_sources bs
JOIN joins j
  ON j.kind = 'own'
 AND j.target_matrix_id = bs.marker_matrix_id
 AND j.target_row_id = bs.marker_row_id
${
  labelColumn ?
    `JOIN "mx_${focalMatrixId}_data" d
  ON d.id = bs.marker_row_id AND bs.marker_matrix_id = ${focalMatrixId}`
  : ''
}
WHERE j.source_matrix_id = ${focalMatrixId} AND j.source_row_id = ${focalRowId}
ORDER BY j.edge_key
`

/** Resolve a marker identity to its sole stored view source. */
export const buildViewSourceQuery = (markerMatrixId: number, markerRowId: number): string => `
SELECT marker_matrix_id, marker_row_id, sql
FROM block_sources
WHERE marker_matrix_id = ${markerMatrixId} AND marker_row_id = ${markerRowId}
`
