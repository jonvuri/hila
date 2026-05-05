import type { FaceTypeDefinition } from '../core/face-types'
import type { PluginDefinition } from '../core/plugin-types'
import { registerFaceType as registerFaceTypeLocal } from '../core/face-registry'
import {
  ensureTagTypesTable,
  registerFaceType as registerFaceTypeWorker,
} from '../core/client/matrix-client'

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
  matrixes: [],
  traits: [],
  namedQueries: {
    tagsForRow: 'buildTagsForRowQuery(sourceMatrixId, sourceRowId)',
    taggedRows: 'buildTaggedRowsQuery(tagMatrixId, sourceMatrixId)',
    aspectForRow: 'buildAspectForRowQuery(sourceMatrixId, sourceRowId, tagMatrixId)',
  },
  namedMutations: {},
  faceBindings: [],
  init: async () => {
    await ensureTagTypesTable()
  },
}
