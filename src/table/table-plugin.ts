import type { PluginDefinition } from '../core/plugin-types'

import TableFace from './TableFace'
import { tableFaceTypeDefinition } from './table-face-type'

export { tableFaceTypeDefinition } from './table-face-type'

export const tablePlugin: PluginDefinition = {
  id: 'hila.table',
  name: 'Table',
  version: '1.0.0',
  faceTypes: [tableFaceTypeDefinition],
  faceRenderings: [{ faceTypeId: tableFaceTypeDefinition.id, collection: TableFace }],
  matrixes: [],
  namedQueries: {},
  namedMutations: {},
  faceBindings: [],
}
