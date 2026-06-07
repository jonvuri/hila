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
  // rank dissolved onto the own-edge (universal infrastructure, not a per-matrix
  // opt-in); closure remains a provisioned-but-derived cache until Phase 8b.
  traitRequirements: [{ type: 'closure' }],
  overflowBehavior: 'property-panel',
}

export const registerWorkspaceFaceType = async (): Promise<void> => {
  registerFaceTypeLocal(workspaceFaceTypeDefinition)
  await registerFaceTypeWorker(workspaceFaceTypeDefinition)
}

// -- Query builders -----------------------------------------------------------
//
// Reads run on a derived global-key recursive CTE over the own-forest: starting
// at the root sentinel (0, 0), each row's `key` is the concatenation of the
// sibling `edge_key`s along its own-edge path. This `key` has exactly the same
// prefix-ordering properties the old `rank` key had (a parent's key is a strict
// prefix of its children's), so focus/collapse/after filtering and ORDER BY are
// unchanged. Phase 8b materializes this as a global pre-order scroll index.

const nextPrefixHex = (hex: string): string => hex.slice(0, -2) + '01'

// The own-forest is global, but the workspace outline shows only this matrix's
// rows: top-level rows are the sentinel's children that live in this matrix,
// and nesting is intra-matrix. (Cross-matrix own-children -- e.g. tag aspect
// rows -- are surfaced elsewhere, not as outline rows.)
const buildPreorderCte = (matrixId: number): string => `
WITH RECURSIVE preorder(row_id, edge_key, key, depth) AS (
  SELECT j.target_row_id, j.edge_key, j.edge_key, 0
  FROM joins j
  WHERE j.kind = 'own' AND j.source_matrix_id = 0 AND j.source_row_id = 0
    AND j.target_matrix_id = ${matrixId}
  UNION ALL
  SELECT j.target_row_id, j.edge_key,
         unhex(hex(p.key) || hex(j.edge_key)), p.depth + 1
  FROM joins j
  JOIN preorder p ON j.source_matrix_id = ${matrixId} AND j.source_row_id = p.row_id
  WHERE j.kind = 'own' AND j.target_matrix_id = ${matrixId}
)`

const buildFilterClauses = (opts: {
  focusRootHex?: string | null
  collapsedKeyHexes?: string[]
  afterKeyHex?: string | null
}): string => {
  const parts: string[] = []

  if (opts.focusRootHex) {
    parts.push(
      `AND r.key >= X'${opts.focusRootHex}' AND r.key < X'${nextPrefixHex(opts.focusRootHex)}'`,
    )
  }

  if (opts.collapsedKeyHexes) {
    for (const hex of opts.collapsedKeyHexes) {
      parts.push(`AND NOT (r.key > X'${hex}' AND r.key < X'${nextPrefixHex(hex)}')`)
    }
  }

  if (opts.afterKeyHex) {
    parts.push(`AND r.key > X'${opts.afterKeyHex}'`)
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

export const buildPaginatedOutlineQuery = (
  matrixId: number,
  opts: PaginatedOutlineQueryOpts = {},
): string => {
  const filterClauses = buildFilterClauses({
    focusRootHex: opts.focusRootHex ?? null,
    collapsedKeyHexes: opts.collapsedKeyHexes,
    afterKeyHex: opts.afterKeyHex ?? null,
  })

  const effectiveLimit = opts.limit ?? 10000
  const limitClause = `LIMIT ${effectiveLimit}`
  const offsetClause =
    opts.offset !== undefined && opts.offset > 0 ? `OFFSET ${opts.offset}` : ''

  return `
${buildPreorderCte(matrixId)}
SELECT r.key, r.row_id, r.edge_key, d.label, d.content, r.depth,
       CASE WHEN EXISTS (
         SELECT 1 FROM joins ch
         WHERE ch.kind = 'own' AND ch.source_matrix_id = ${matrixId}
           AND ch.source_row_id = r.row_id AND ch.target_matrix_id = ${matrixId}
       ) THEN 1 ELSE 0 END as has_children
FROM preorder r
JOIN "mx_${matrixId}_data" d ON r.row_id = d.id
WHERE 1 = 1
${filterClauses}
ORDER BY r.key
${limitClause}${offsetClause ? ` ${offsetClause}` : ''}
`
}

export type OutlineCountQueryOpts = {
  focusRootHex?: string | null
  collapsedKeyHexes?: string[]
}

export const buildOutlineCountQuery = (
  matrixId: number,
  opts: OutlineCountQueryOpts = {},
): string => {
  const filterClauses = buildFilterClauses({
    focusRootHex: opts.focusRootHex ?? null,
    collapsedKeyHexes: opts.collapsedKeyHexes,
  })

  return `
${buildPreorderCte(matrixId)}
SELECT COUNT(*) as row_count
FROM preorder r
WHERE 1 = 1
${filterClauses}
`
}

// Ancestor chains for a set of descendant row ids, returned in a single query.
// Keying by row_id (rather than the derived key) sidesteps panels opened with
// an empty rowKey (e.g. backlink navigation). Each row carries the descendant
// it belongs to (for_row_id) plus the ancestor's key/depth/label/row_id. An
// ancestor is any preorder row whose derived key is a strict prefix of the
// descendant's. Rows are ordered per descendant from shallowest (root) to
// deepest (parent).
export const buildAncestryForRowsQuery = (matrixId: number, rowIds: number[]): string => {
  const idList = rowIds.join(', ')
  return `
${buildPreorderCte(matrixId)}
SELECT d0.row_id AS for_row_id, a.key AS key, a.depth, dt.label, a.row_id AS row_id
FROM preorder d0
JOIN preorder a
  ON length(a.key) < length(d0.key)
  AND substr(d0.key, 1, length(a.key)) = a.key
JOIN "mx_${matrixId}_data" dt ON a.row_id = dt.id
WHERE d0.row_id IN (${idList})
ORDER BY d0.row_id, a.depth
`
}

export const buildSingleRowQuery = (matrixId: number, rowId: number): string => `
SELECT d.* FROM "mx_${matrixId}_data" d WHERE d.id = ${rowId}
`

// The derived global key for a single row: walk UP its own-edge chain to the
// sentinel, prepending each ancestor edge key. Used to resolve a row identity
// (e.g. from a backlink/inlineref) to the pre-order key the panel stack keys on.
export const buildRowGlobalKeyQuery = (matrixId: number, rowId: number): string => `
WITH RECURSIVE up(mx, row, acc) AS (
  SELECT j.source_matrix_id, j.source_row_id, j.edge_key
  FROM joins j
  WHERE j.kind = 'own' AND j.target_matrix_id = ${matrixId} AND j.target_row_id = ${rowId}
  UNION ALL
  SELECT j.source_matrix_id, j.source_row_id, unhex(hex(j.edge_key) || hex(up.acc))
  FROM joins j
  JOIN up ON j.kind = 'own' AND j.target_matrix_id = up.mx AND j.target_row_id = up.row
  WHERE NOT (up.mx = 0 AND up.row = 0)
)
SELECT acc AS key FROM up WHERE mx = 0 AND row = 0 LIMIT 1
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
  traits: [{ type: 'closure', matrixKey: 'root' }],
  namedQueries: {
    outlinePage: 'buildPaginatedOutlineQuery(matrixId, opts)',
    outlineCount: 'buildOutlineCountQuery(matrixId, opts)',
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
