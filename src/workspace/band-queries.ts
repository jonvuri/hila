/**
 * Query builders for bands (Phase 9.3; see context/Phase-9.3.md).
 *
 * These return SQL strings for use with `useQuery`. Dynamic table names
 * (`mx_{id}_data`) prevent parameterized binding, so IDs are interpolated
 * directly — consistent with the outline / notes / tag query builders.
 */

/**
 * The list subscription: a focal node's bands in display order. Reactive via
 * the SQLite update hook on the `bands` table.
 */
export const buildBandsForNodeQuery = (focalMatrixId: number, focalRowId: number): string => `
SELECT id, focal_matrix_id, focal_row_id, sql, face, integration, "order"
FROM bands
WHERE focal_matrix_id = ${focalMatrixId} AND focal_row_id = ${focalRowId}
ORDER BY "order", id
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
