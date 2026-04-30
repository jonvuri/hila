import type { PluginDefinition } from '../core/plugin-types'
import { ensureTagTypesTable } from '../core/client/matrix-client'

export const tagsPlugin: PluginDefinition = {
  id: 'hila.tags',
  name: 'Tags',
  version: '1.0.0',
  matrixes: [],
  traits: [],
  namedQueries: {},
  namedMutations: {},
  faceBindings: [],
  init: async () => {
    await ensureTagTypesTable()
  },
}
