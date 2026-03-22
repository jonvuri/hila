import type { FaceTypeDefinition } from '../core/face-types'
import type { PluginDefinition } from '../core/plugin-types'
import { registerFaceType as registerFaceTypeLocal } from '../core/face-registry'
import {
  registerFaceType as registerFaceTypeWorker,
  seedWelcomeRow,
} from '../core/client/matrix-client'

const WELCOME_DOC_JSON = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Welcome to Hila' }] }],
})

export const outlineFaceTypeDefinition: FaceTypeDefinition = {
  id: 'hila.outline',
  name: 'Outline',
  slots: [{ name: 'primary_content', preferredType: 'richtext', required: true }],
  traitRequirements: [{ type: 'rank' }, { type: 'closure' }],
  overflowBehavior: 'side-columns',
}

export const registerOutlineFaceType = async (): Promise<void> => {
  registerFaceTypeLocal(outlineFaceTypeDefinition)
  await registerFaceTypeWorker(outlineFaceTypeDefinition)
}

export const buildOutlineQuery = (
  matrixId: number,
  focusRootHex: string | null,
  contentColumn = 'content',
): string => {
  return buildPaginatedOutlineQuery(matrixId, { focusRootHex, contentColumn })
}

// Increment final 0x00 terminator (as two hex chars) to 0x01 for subtree upper bound.
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
  limit?: number
  contentColumn?: string
}

export const buildPaginatedOutlineQuery = (
  matrixId: number,
  opts: PaginatedOutlineQueryOpts = {},
): string => {
  const contentColumn = opts.contentColumn ?? 'content'
  const contentExpr =
    contentColumn === 'content' ? 'd.content' : `d."${contentColumn}" as content`

  const filterClauses = buildFilterClauses({
    focusRootHex: opts.focusRootHex ?? null,
    collapsedKeyHexes: opts.collapsedKeyHexes,
    afterKeyHex: opts.afterKeyHex ?? null,
  })

  const limitClause = opts.limit !== undefined ? `LIMIT ${opts.limit}` : ''

  return `
SELECT r.key, r.row_id, ${contentExpr},
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
${limitClause}
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
SELECT COUNT(*) as count
FROM rank r
WHERE r.matrix_id = ${matrixId}
${filterClauses}
`
}

export const buildBreadcrumbQuery = (matrixId: number, focusRootHex: string): string => `
SELECT c.ancestor_key as key, c.depth, d.content, r.row_id
FROM "mx_${matrixId}_closure" c
JOIN rank r ON r.key = c.ancestor_key AND r.matrix_id = ${matrixId}
JOIN "mx_${matrixId}_data" d ON r.row_id = d.id
WHERE c.descendant_key = X'${focusRootHex}' AND c.depth > 0
ORDER BY c.depth DESC
`

export const outlinePlugin: PluginDefinition = {
  id: 'hila.outline',
  name: 'Outline',
  version: '1.0.0',
  matrixes: [
    {
      key: 'root',
      title: 'Outline',
      columns: [{ name: 'content', type: 'TEXT' }],
    },
  ],
  traits: [
    { type: 'rank', matrixKey: 'root' },
    { type: 'closure', matrixKey: 'root' },
  ],
  namedQueries: {
    outlinePage: 'buildPaginatedOutlineQuery(matrixId, opts)',
    outlineCount: 'buildOutlineCountQuery(matrixId, opts)',
    breadcrumbs: 'buildBreadcrumbQuery(matrixId, focusRootHex)',
  },
  namedMutations: {},
  faceBindings: [
    {
      key: 'main',
      faceTypeId: 'hila.outline',
      matrixKey: 'root',
    },
  ],
  init: async (ctx) => {
    const matrixId = ctx.matrixIds['root']
    if (matrixId !== undefined) {
      await seedWelcomeRow(matrixId, WELCOME_DOC_JSON)
    }
  },
}
