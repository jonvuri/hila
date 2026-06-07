import type { FaceTypeDefinition } from '../core/face-types'
import { registerFaceType as registerFaceTypeLocal } from '../core/face-registry'
import { registerFaceType as registerFaceTypeWorker } from '../core/client/matrix-client'

export const tableFaceTypeDefinition: FaceTypeDefinition = {
  id: 'hila.table',
  name: 'Table',
  slots: [],
  overflowBehavior: 'none',
}

export const registerTableFaceType = async (): Promise<void> => {
  registerFaceTypeLocal(tableFaceTypeDefinition)
  await registerFaceTypeWorker(tableFaceTypeDefinition)
}
