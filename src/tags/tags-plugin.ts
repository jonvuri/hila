import type { FaceTypeDefinition } from '../core/face-types'
import type { PluginDefinition } from '../core/plugin-types'
import { registerFaceType as registerFaceTypeLocal } from '../core/face-registry'
import { registerFaceType as registerFaceTypeWorker } from '../core/client/matrix-client'

let _registryMatrixId: number | null = null

export const getRegistryMatrixId = (): number | null => _registryMatrixId

export const tagBrowserFaceTypeDefinition: FaceTypeDefinition = {
  id: 'hila.tag-browser',
  name: 'Tag Browser',
  slots: [],
  traitRequirements: [],
  overflowBehavior: 'none',
}

export const registerTagBrowserFaceType = async (): Promise<void> => {
  registerFaceTypeLocal(tagBrowserFaceTypeDefinition)
  await registerFaceTypeWorker(tagBrowserFaceTypeDefinition)
}

export const tagsPlugin: PluginDefinition = {
  id: 'hila.tags',
  name: 'Tags',
  version: '1.0.0',
  faceTypes: [tagBrowserFaceTypeDefinition],
  matrixes: [
    {
      key: 'registry',
      title: 'Tag Types',
      columns: [
        { name: 'name', type: 'TEXT', constraints: 'NOT NULL UNIQUE COLLATE NOCASE' },
        { name: 'matrix_id', type: 'INTEGER', constraints: 'NOT NULL' },
        { name: 'color', type: 'TEXT' },
        { name: 'icon', type: 'TEXT' },
      ],
    },
  ],
  traits: [],
  namedQueries: {
    tagsForRow: 'buildTagsForRowQuery(sourceMatrixId, sourceRowId)',
    taggedRows: 'buildTaggedRowsQuery(tagMatrixId, sourceMatrixId)',
    aspectForRow: 'buildAspectForRowQuery(sourceMatrixId, sourceRowId, tagMatrixId)',
  },
  namedMutations: {},
  faceBindings: [],
  init: async (ctx) => {
    _registryMatrixId = ctx.matrixIds['registry']!
  },
}
