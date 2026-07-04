import type { FaceTypeDefinition } from '../core/face-types'
import type { PluginDefinition } from '../core/plugin-types'
import { registerFaceType as registerFaceTypeLocal } from '../core/face-registry'
import {
  registerFaceType as registerFaceTypeWorker,
  seedRow,
} from '../core/client/matrix-client'

const WELCOME_LABEL_JSON = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Welcome to Hila' }] }],
})

const WELCOME_CONTENT_JSON = JSON.stringify({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'This is your workspace. Each row is both an outline bullet and a potential document.',
        },
      ],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Press Enter to create new rows. Tab to indent, Shift-Tab to outdent. Shift-Enter to edit inline content. Click the right arrow or press Cmd/Ctrl+L to open a focus panel. Press Escape or Cmd+Left to navigate back.',
        },
      ],
    },
  ],
})

export const workspaceFaceTypeDefinition: FaceTypeDefinition = {
  id: 'hila.workspace',
  name: 'Workspace',
  slots: [
    { name: 'label', preferredType: 'richtext', required: true },
    { name: 'content', preferredType: 'richtext', required: false },
  ],
  overflowBehavior: 'property-panel',
}

export const registerWorkspaceFaceType = async (): Promise<void> => {
  registerFaceTypeLocal(workspaceFaceTypeDefinition)
  await registerFaceTypeWorker(workspaceFaceTypeDefinition)
}

// -- Query builders -----------------------------------------------------------
//
// The pre-order scroll-index outline builders live in a worker-safe module
// (outline-queries.ts) so the worker's count+slice flattener can import them
// without the client-only plugin wiring; re-exported here so existing
// `from './workspace-plugin'` imports keep resolving.

export {
  buildPaginatedOutlineQuery,
  buildOutlineCountQuery,
  buildHydrationQuery,
  buildInRangeBlockMarkersQuery,
  type PaginatedOutlineQueryOpts,
  type OutlineCountQueryOpts,
} from './outline-queries'

// Ancestor chains for a set of descendant `(matrix_id, row_id)` pairs, returned in
// a single query (Phase 9.5 — boundary-hop panel stack). The global closure table
// already records the cross-matrix own-chain, so a descendant may live in a foreign
// matrix while its ancestors climb back into the workspace.
//
// `labelMatrixId` is the workspace matrix used *only* for the label join: ancestor
// labels are resolved via a workspace-conditioned LEFT JOIN, so workspace ancestors
// get correct labels, and foreign ancestors (only reachable via repeated multi-hop
// drill-in) yield NULL → "Untitled" rather than a wrong-matrix id collision. The
// per-matrix label gather that would resolve foreign ancestor labels is the deferred
// upgrade; the in-scope §9.5 drill-in gestures are single-hop (all ancestors in the
// workspace matrix), so this is correct for everything reachable today.
export const buildAncestryForRowsQuery = (
  labelMatrixId: number,
  pairs: { matrixId: number; rowId: number }[],
): string => {
  const tuples = pairs.map((p) => `(${p.matrixId}, ${p.rowId})`).join(', ')
  return `
SELECT c.descendant_matrix_id AS for_matrix_id, c.descendant_row_id AS for_row_id,
       s.global_lexkey AS key, s.depth,
       c.ancestor_matrix_id AS matrix_id, c.ancestor_row_id AS row_id,
       dt.label
FROM closure c
JOIN scroll_index s ON s.matrix_id = c.ancestor_matrix_id AND s.row_id = c.ancestor_row_id
LEFT JOIN "mx_${labelMatrixId}_data" dt
  ON c.ancestor_matrix_id = ${labelMatrixId} AND c.ancestor_row_id = dt.id
WHERE (c.descendant_matrix_id, c.descendant_row_id) IN (VALUES ${tuples})
ORDER BY c.descendant_matrix_id, c.descendant_row_id, s.depth
`
}

// Whether a node has own-children (gates the children nav panel in the focus panel).
// Phase 9.5: counts own-edges out of the node regardless of the target matrix, so a
// boundary-hop row whose children live in another matrix isn't miscounted — the
// children NavigationPanel it gates is already cross-matrix.
export const buildChildCountQuery = (matrixId: number, rowId: number): string =>
  `SELECT COUNT(*) as cnt FROM joins ch
   WHERE ch.kind = 'own'
     AND ch.source_matrix_id = ${matrixId} AND ch.source_row_id = ${rowId}
     AND NOT EXISTS (
       SELECT 1 FROM block_sources bs
       WHERE bs.marker_matrix_id = ch.target_matrix_id
         AND bs.marker_row_id = ch.target_row_id
     )`

export const buildSingleRowQuery = (matrixId: number, rowId: number): string => `
SELECT d.* FROM "mx_${matrixId}_data" d WHERE d.id = ${rowId}
`

// The global key for a single row: read directly from the scroll index.
export const buildRowGlobalKeyQuery = (matrixId: number, rowId: number): string => `
SELECT global_lexkey AS key FROM scroll_index WHERE matrix_id = ${matrixId} AND row_id = ${rowId}
`

/**
 * The dedicated sub-tables a node owns (Phase 9.4; see context/Phase-9.md §9.4).
 *
 * A node's own-matrixes split into *shared* (tag types: rows owned by various
 * hosts) and *dedicated* (private sub-tables: matrix-owner == every row-owner,
 * Phase 8c §3). This returns only the dedicated ones — the structural signature
 * is "no `own`-edge into the matrix comes from a non-owner" (the SQL twin of
 * `isSharedMatrix`). A freshly created, still-empty owned matrix has no inbound
 * own-edges, so it qualifies as dedicated.
 *
 * Ownership is the sole source of truth here: the embedded sub-table band is
 * *live-derived* from `matrix.owner` rather than persisted (consistent with the
 * aspect band, and with "ownership is an input, never an output"). Ordering by
 * `m.id` gives a stable derived position among the node's bands for v1;
 * persisted reordering / meshing into §9.1 children is deferred.
 */
export const buildDedicatedSubtablesQuery = (
  focalMatrixId: number,
  focalRowId: number,
): string => `
SELECT m.id, m.title
FROM matrix m
WHERE m.owner_matrix_id = ${focalMatrixId} AND m.owner_row_id = ${focalRowId}
  AND NOT EXISTS (
    SELECT 1 FROM joins j
    WHERE j.target_matrix_id = m.id AND j.kind = 'own'
      AND NOT (j.source_matrix_id = m.owner_matrix_id AND j.source_row_id = m.owner_row_id)
  )
ORDER BY m.id
`

export const buildMatrixTitleQuery = (matrixId: number): string =>
  `SELECT title FROM matrix WHERE id = ${matrixId}`

export const buildBacklinksQuery = (matrixId: number, rowId: number): string => `
SELECT j.source_row_id AS id, j.kind, d.label
FROM joins j
JOIN "mx_${matrixId}_data" d ON j.source_row_id = d.id
WHERE j.target_matrix_id = ${matrixId} AND j.target_row_id = ${rowId}
  AND j.source_matrix_id = ${matrixId}
  AND j.kind = 'ref'
ORDER BY d.label
`

// -- Plugin definition --------------------------------------------------------

export const workspacePlugin: PluginDefinition = {
  id: 'hila.workspace',
  name: 'Workspace',
  version: '1.0.0',
  faceTypes: [workspaceFaceTypeDefinition],
  matrixes: [
    {
      key: 'root',
      title: 'Workspace',
      columns: [
        { name: 'label', type: 'TEXT', role: 'label' },
        { name: 'content', type: 'TEXT', role: 'content' },
      ],
    },
  ],
  namedQueries: {
    outlinePage: 'buildPaginatedOutlineQuery(opts)',
    outlineCount: 'buildOutlineCountQuery(opts)',
    singleRow: 'buildSingleRowQuery(matrixId, rowId)',
    backlinks: 'buildBacklinksQuery(matrixId, rowId)',
  },
  namedMutations: {},
  faceBindings: [
    {
      key: 'main',
      faceTypeId: 'hila.workspace',
      matrixKey: 'root',
    },
  ],
  init: async (ctx) => {
    const matrixId = ctx.matrixIds['root']
    if (matrixId !== undefined) {
      await seedRow(matrixId, { label: WELCOME_LABEL_JSON, content: WELCOME_CONTENT_JSON })
    }
  },
}
