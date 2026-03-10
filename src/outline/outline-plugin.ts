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

export const buildOutlineQuery = (matrixId: number, focusRootHex: string | null): string => {
  const rangeFilter =
    focusRootHex !== null ?
      `AND r.key >= X'${focusRootHex}' AND r.key < X'${focusRootHex.slice(0, -2)}01'`
    : ''

  return `
SELECT r.key, r.row_id, d.content,
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
${rangeFilter}
ORDER BY r.key
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
    outlinePage: 'buildOutlineQuery(matrixId, focusRootHex)',
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
