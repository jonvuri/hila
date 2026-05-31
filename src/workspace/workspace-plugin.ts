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
  traitRequirements: [{ type: 'rank' }, { type: 'closure' }],
  overflowBehavior: 'property-panel',
}

export const registerWorkspaceFaceType = async (): Promise<void> => {
  registerFaceTypeLocal(workspaceFaceTypeDefinition)
  await registerFaceTypeWorker(workspaceFaceTypeDefinition)
}

// -- Query builders -----------------------------------------------------------

const nextPrefixHex = (hex: string): string => hex.slice(0, -2) + '01'

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
SELECT r.key, r.row_id, d.label, d.content,
       COALESCE(c.depth, 0) as depth,
       CASE WHEN ch.ancestor_key IS NOT NULL THEN 1 ELSE 0 END as has_children
FROM rank r
JOIN "mx_${matrixId}_data" d ON r.row_id = d.id
LEFT JOIN (
  SELECT descendant_key, MAX(depth) as depth
  FROM "mx_${matrixId}_closure"
  GROUP BY descendant_key
) c ON r.key = c.descendant_key
LEFT JOIN (
  SELECT DISTINCT ancestor_key
  FROM "mx_${matrixId}_closure"
  WHERE depth = 1
) ch ON r.key = ch.ancestor_key
WHERE r.matrix_id = ${matrixId}
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
SELECT COUNT(*) as row_count
FROM rank r
WHERE r.matrix_id = ${matrixId}
${filterClauses}
`
}

// Ancestor chains for a set of descendant row ids, returned in a single query.
// Keying by row_id (rather than rank key) sidesteps panels opened with an empty
// rowKey (e.g. backlink navigation). Each row carries the descendant it belongs
// to (for_row_id) plus the ancestor's key/depth/label/row_id. Rows are ordered
// per descendant from shallowest (root) to deepest (parent) via depth DESC.
export const buildAncestryForRowsQuery = (matrixId: number, rowIds: number[]): string => {
  const idList = rowIds.join(', ')
  return `
SELECT d0.row_id AS for_row_id, c.ancestor_key AS key, c.depth, dt.label, ar.row_id AS row_id
FROM rank d0
JOIN "mx_${matrixId}_closure" c ON c.descendant_key = d0.key
JOIN rank ar ON ar.key = c.ancestor_key AND ar.matrix_id = ${matrixId}
JOIN "mx_${matrixId}_data" dt ON ar.row_id = dt.id
WHERE d0.matrix_id = ${matrixId} AND d0.row_id IN (${idList}) AND c.depth > 0
ORDER BY d0.row_id, c.depth DESC
`
}

export const buildSingleRowQuery = (matrixId: number, rowId: number): string => `
SELECT d.* FROM "mx_${matrixId}_data" d WHERE d.id = ${rowId}
`

export const buildMatrixTitleQuery = (matrixId: number): string =>
  `SELECT title FROM matrix WHERE id = ${matrixId}`

export const buildBacklinksQuery = (matrixId: number, rowId: number): string => `
SELECT j.source_row_id AS id, j.kind, d.label
FROM joins j
JOIN "mx_${matrixId}_data" d ON j.source_row_id = d.id
WHERE j.target_matrix_id = ${matrixId} AND j.target_row_id = ${rowId}
  AND j.source_matrix_id = ${matrixId}
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
  traits: [
    { type: 'rank', matrixKey: 'root' },
    { type: 'closure', matrixKey: 'root' },
  ],
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
