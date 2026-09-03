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

/**
 * The "in this subtree" snippet: all rows of type `typeMatrixId` whose host is
 * in the focal node's subtree. Scope = {node} ∪ descendants(node).
 *
 * Closure has NO self-pairs (it starts at depth 1; see src/core/closure.ts), so
 * the host test unions the node's own direct hosts with its closure descendants
 * — otherwise rows hosted directly by the focal node would be missed.
 *
 * Shape: a **single-table `FROM`** (`mx_<T>_data d`) with all host/closure
 * scoping pushed into a correlated `EXISTS`. This is semantically identical to a
 * `JOIN joins` formulation but keeps the top-level relation single-table, so the
 * Session-2 recognizer (`src/sql/recognize-updatable.ts`) can mark the type's
 * own columns editable — a live view you can write back through. `d.*` also
 * carries `id`, satisfying the recognizer's row-identity gate.
 */
export const buildTypeInSubtreeQuery = (
  typeMatrixId: number,
  focalMatrixId: number,
  focalRowId: number,
): string => `SELECT d.*
FROM "mx_${typeMatrixId}_data" d
WHERE EXISTS (
  SELECT 1 FROM joins j
  WHERE j.target_matrix_id = ${typeMatrixId}
    AND j.target_row_id = d.id
    AND j.kind = 'own'
    AND (
      (j.source_matrix_id = ${focalMatrixId} AND j.source_row_id = ${focalRowId})
      OR EXISTS (
        SELECT 1 FROM closure c
        WHERE c.ancestor_matrix_id = ${focalMatrixId} AND c.ancestor_row_id = ${focalRowId}
          AND c.descendant_matrix_id = j.source_matrix_id
          AND c.descendant_row_id = j.source_row_id
      )
    )
)`
