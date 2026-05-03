import type { PluginDefinition } from '../core/plugin-types'
import { ensureTagTypesTable } from '../core/client/matrix-client'

export const tagsPlugin: PluginDefinition = {
  id: 'hila.tags',
  name: 'Tags',
  version: '1.0.0',
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
