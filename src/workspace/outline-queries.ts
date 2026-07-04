// Pure outline query builders (Phase 9.7).
//
// Extracted from workspace-plugin.ts so both the client (usePagedWorkspaceData)
// and the worker (gather-handler — the count+slice flattener runs worker-side)
// can import them without pulling in the client-only plugin wiring
// (matrix-client, face registration). `workspace-plugin.ts` re-exports these, so
// existing `from './workspace-plugin'` imports keep resolving.
//
// Reads use the global pre-order scroll index (`scroll_index`): each row's
// `global_lexkey` is the concatenation of edge_keys from the sentinel down to the
// node, so a parent's key is a strict prefix of its children's — focus/collapse/
// after filtering and ORDER BY are a single keyset range scan on a materialized
// index.

const nextPrefixHex = (hex: string): string => hex.slice(0, -2) + '01'

// Phase 9.7 Stage B: block markers (view/shared-container) are real
// `scroll_index` participants, but their *content* is drawn via count+slice
// flattening (src/workspace/window-flatten.ts), not as a plain loose-outline
// row. Exclude the marker rows themselves from the loose scan so a marker never
// renders as a stray plain row (its content folds in at its position instead).
const EXCLUDE_BLOCK_MARKERS = `AND NOT EXISTS (
  SELECT 1 FROM block_sources bs
  WHERE bs.marker_matrix_id = r.matrix_id AND bs.marker_row_id = r.row_id
)`

const buildFilterClauses = (opts: {
  focusRootHex?: string | null
  collapsedKeyHexes?: string[]
  afterKeyHex?: string | null
  beforeKeyHex?: string | null
}): string => {
  const parts: string[] = [EXCLUDE_BLOCK_MARKERS]

  if (opts.focusRootHex) {
    parts.push(
      `AND r.global_lexkey >= X'${opts.focusRootHex}' AND r.global_lexkey < X'${nextPrefixHex(opts.focusRootHex)}'`,
    )
  }

  if (opts.collapsedKeyHexes) {
    for (const hex of opts.collapsedKeyHexes) {
      parts.push(
        `AND NOT (r.global_lexkey > X'${hex}' AND r.global_lexkey < X'${nextPrefixHex(hex)}')`,
      )
    }
  }

  if (opts.afterKeyHex) {
    parts.push(`AND r.global_lexkey > X'${opts.afterKeyHex}'`)
  }

  // Phase 9.7 Stage C2 — sub-range upper bound. The count+slice flattener carves
  // the loose sequence at each in-range block marker's position; a materialized
  // segment between two markers is this outline query bounded to
  // `(afterKeyHex, beforeKeyHex)`. `beforeKeyHex` = the next marker's key.
  if (opts.beforeKeyHex) {
    parts.push(`AND r.global_lexkey < X'${opts.beforeKeyHex}'`)
  }

  return parts.join('\n')
}

export type PaginatedOutlineQueryOpts = {
  focusRootHex?: string | null
  collapsedKeyHexes?: string[]
  afterKeyHex?: string | null
  beforeKeyHex?: string | null
  offset?: number
  limit?: number
}

// Phase 9.1: the outline window is an **index-only** scan over the global
// pre-order `scroll_index`, spanning every matrix in the reachable own-forest.
// It no longer joins a single `mx_{id}_data` table (heterogeneous children come
// from different matrixes); the caller hydrates the returned `(matrix_id, row_id)`
// pairs via a multi-table gather (`buildHydrationQuery`, batched by matrix).
//
//   - `has_children` counts own-children in *any* matrix (cross-matrix children).
//   - `is_type_node` flags promoted type-nodes so the renderer can present them
//     distinctly at the workspace root (Phase 8c carry-over).
export const buildPaginatedOutlineQuery = (opts: PaginatedOutlineQueryOpts = {}): string => {
  const filterClauses = buildFilterClauses({
    focusRootHex: opts.focusRootHex ?? null,
    collapsedKeyHexes: opts.collapsedKeyHexes,
    afterKeyHex: opts.afterKeyHex ?? null,
    beforeKeyHex: opts.beforeKeyHex ?? null,
  })

  const effectiveLimit = opts.limit ?? 10000
  const limitClause = `LIMIT ${effectiveLimit}`
  const offsetClause =
    opts.offset !== undefined && opts.offset > 0 ? `OFFSET ${opts.offset}` : ''

  // The row's matrix title travels inline (a join to the global `matrix` table)
  // so the renderer's type chip resolves without a second subscription — this
  // avoids cross-query id-type/timing mismatches between panels.
  return `
SELECT r.global_lexkey AS key, r.matrix_id, r.row_id, r.depth,
       r.is_ghost,
       mt.title AS matrix_title,
       CASE WHEN EXISTS (
         SELECT 1 FROM joins ch
         WHERE ch.kind = 'own' AND ch.source_matrix_id = r.matrix_id
           AND ch.source_row_id = r.row_id
           AND NOT EXISTS (
             SELECT 1 FROM block_sources bs
             WHERE bs.marker_matrix_id = ch.target_matrix_id
               AND bs.marker_row_id = ch.target_row_id
           )
       ) THEN 1 ELSE 0 END as has_children,
       CASE WHEN EXISTS (
         SELECT 1 FROM promoted_nodes p
         WHERE p.matrix_id = r.matrix_id AND p.row_id = r.row_id
       ) THEN 1 ELSE 0 END as is_type_node
FROM scroll_index r
LEFT JOIN matrix mt ON mt.id = r.matrix_id
WHERE 1 = 1
${filterClauses}
ORDER BY r.global_lexkey
${limitClause}${offsetClause ? ` ${offsetClause}` : ''}
`
}

// Hydrate a window's rows for a single matrix: one batched query per distinct
// matrix in the window (the Phase 8b §5 multi-table gather bound). Schemas differ
// across matrixes, so each matrix is fetched separately rather than UNION-ed.
export const buildHydrationQuery = (matrixId: number, rowIds: number[]): string =>
  `SELECT * FROM "mx_${matrixId}_data" WHERE id IN (${rowIds.join(', ')})`

export type OutlineCountQueryOpts = {
  focusRootHex?: string | null
  collapsedKeyHexes?: string[]
  afterKeyHex?: string | null
  beforeKeyHex?: string | null
}

export const buildOutlineCountQuery = (opts: OutlineCountQueryOpts = {}): string => {
  const filterClauses = buildFilterClauses({
    focusRootHex: opts.focusRootHex ?? null,
    collapsedKeyHexes: opts.collapsedKeyHexes,
    afterKeyHex: opts.afterKeyHex ?? null,
    beforeKeyHex: opts.beforeKeyHex ?? null,
  })

  return `
SELECT COUNT(*) as row_count
FROM scroll_index r
WHERE 1 = 1
${filterClauses}
`
}

// Phase 9.7 Stage C2 — in-range block-marker discovery.
//
// A block marker is a real `scroll_index` participant whose identity carries a
// `block_sources` row (a `view`). Folding its content inline needs the set of
// markers within the focus scope (respecting collapse), each with its key
// (position), depth, and SQL. Reactive via scroll_index / block_sources.
// (Shared-container markers — discovered via `matrix.owner` — are the additive
// path; v1 folds `view` blocks, which are the concretely creatable kind.)
export const buildInRangeBlockMarkersQuery = (opts: {
  focusRootHex?: string | null
  collapsedKeyHexes?: string[]
}): string => {
  const parts: string[] = []
  if (opts.focusRootHex) {
    parts.push(
      `AND r.global_lexkey >= X'${opts.focusRootHex}' AND r.global_lexkey < X'${nextPrefixHex(opts.focusRootHex)}'`,
    )
  }
  for (const hex of opts.collapsedKeyHexes ?? []) {
    parts.push(
      `AND NOT (r.global_lexkey > X'${hex}' AND r.global_lexkey < X'${nextPrefixHex(hex)}')`,
    )
  }
  return `
SELECT r.global_lexkey AS key, r.matrix_id AS marker_matrix_id, r.row_id AS marker_row_id,
       r.depth, bs.sql
FROM scroll_index r
JOIN block_sources bs
  ON bs.marker_matrix_id = r.matrix_id AND bs.marker_row_id = r.row_id
WHERE 1 = 1
${parts.join('\n')}
ORDER BY r.global_lexkey
`
}
