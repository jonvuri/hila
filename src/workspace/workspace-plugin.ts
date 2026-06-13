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
// Reads use the global pre-order scroll index (`scroll_index` table): each
// row's `global_lexkey` is the concatenation of edge_keys from the sentinel
// down to the node. It has the same prefix-ordering properties the old
// recursive CTE derived on-the-fly (a parent's key is a strict prefix of its
// children's), so focus/collapse/after filtering and ORDER BY work unchanged
// — but now as a single keyset range scan on a materialized index.

const nextPrefixHex = (hex: string): string => hex.slice(0, -2) + '01'

const buildFilterClauses = (opts: {
  focusRootHex?: string | null
  collapsedKeyHexes?: string[]
  afterKeyHex?: string | null
}): string => {
  const parts: string[] = []

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

  return parts.join('\n')
}

export type PaginatedOutlineQueryOpts = {
  focusRootHex?: string | null
  collapsedKeyHexes?: string[]
  afterKeyHex?: string | null
  offset?: number
  limit?: number
}

// Phase 9.1: the outline window is now an **index-only** scan over the global
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
       mt.title AS matrix_title,
       CASE WHEN EXISTS (
         SELECT 1 FROM joins ch
         WHERE ch.kind = 'own' AND ch.source_matrix_id = r.matrix_id
           AND ch.source_row_id = r.row_id
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
}

export const buildOutlineCountQuery = (opts: OutlineCountQueryOpts = {}): string => {
  const filterClauses = buildFilterClauses({
    focusRootHex: opts.focusRootHex ?? null,
    collapsedKeyHexes: opts.collapsedKeyHexes,
  })

  return `
SELECT COUNT(*) as row_count
FROM scroll_index r
WHERE 1 = 1
${filterClauses}
`
}

// Ancestor chains for a set of descendant row ids, returned in a single query.
// Uses the global closure table for ancestry and scroll_index for keys/depth.
export const buildAncestryForRowsQuery = (matrixId: number, rowIds: number[]): string => {
  const idList = rowIds.join(', ')
  return `
SELECT c.descendant_row_id AS for_row_id,
       s.global_lexkey AS key, s.depth,
       dt.label, c.ancestor_row_id AS row_id
FROM closure c
JOIN scroll_index s ON s.matrix_id = c.ancestor_matrix_id AND s.row_id = c.ancestor_row_id
JOIN "mx_${matrixId}_data" dt ON c.ancestor_row_id = dt.id
WHERE c.descendant_matrix_id = ${matrixId}
  AND c.descendant_row_id IN (${idList})
  AND c.ancestor_matrix_id = ${matrixId}
ORDER BY c.descendant_row_id, s.depth
`
}

export const buildSingleRowQuery = (matrixId: number, rowId: number): string => `
SELECT d.* FROM "mx_${matrixId}_data" d WHERE d.id = ${rowId}
`

// The global key for a single row: read directly from the scroll index.
export const buildRowGlobalKeyQuery = (matrixId: number, rowId: number): string => `
SELECT global_lexkey AS key FROM scroll_index WHERE matrix_id = ${matrixId} AND row_id = ${rowId}
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
