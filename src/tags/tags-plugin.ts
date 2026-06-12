import type { FaceTypeDefinition } from '../core/face-types'
import type { PluginDefinition } from '../core/plugin-types'
import { registerFaceType as registerFaceTypeLocal } from '../core/face-registry'
import { registerFaceType as registerFaceTypeWorker } from '../core/client/matrix-client'

export const tagBrowserFaceTypeDefinition: FaceTypeDefinition = {
  id: 'hila.tag-browser',
  name: 'Tag Browser',
  slots: [],
  overflowBehavior: 'none',
}

export const registerTagBrowserFaceType = async (): Promise<void> => {
  registerFaceTypeLocal(tagBrowserFaceTypeDefinition)
  await registerFaceTypeWorker(tagBrowserFaceTypeDefinition)
}

/**
 * The tags plugin owns no matrixes itself: tag types are promoted type-nodes
 * living in the workspace matrix (Phase 8c §4).
 *
 * Hard dependency: every tag-type operation (`createTagType`, lookups, the
 * `#` autocomplete) resolves the workspace matrix via the `hila.workspace`
 * plugin's registration metadata, so the workspace plugin must be registered
 * before any tag operation runs. Registration order of the plugins themselves
 * does not matter (registering `hila.tags` performs no workspace lookups).
 */
export const tagsPlugin: PluginDefinition = {
  id: 'hila.tags',
  name: 'Tags',
  version: '1.0.0',
  faceTypes: [tagBrowserFaceTypeDefinition],
  matrixes: [],
  namedQueries: {
    tagsForRow: 'buildTagsForRowQuery(wsMatrixId, sourceMatrixId, sourceRowId)',
    taggedRows: 'buildTaggedRowsQuery(tagMatrixId, sourceMatrixId)',
    aspectForRow: 'buildAspectForRowQuery(sourceMatrixId, sourceRowId, tagMatrixId)',
  },
  namedMutations: {},
  faceBindings: [],
  init: async () => {
    // No registry matrix to track -- type-nodes live in the workspace matrix
    // and are discovered via the promoted_nodes table.
  },
}
