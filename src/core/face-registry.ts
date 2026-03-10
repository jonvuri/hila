import type { FaceTypeDefinition } from './face-types'

const registry = new Map<string, FaceTypeDefinition>()

export const registerFaceType = (definition: FaceTypeDefinition): void => {
  registry.set(definition.id, definition)
}

export const getFaceType = (faceTypeId: string): FaceTypeDefinition | undefined => {
  return registry.get(faceTypeId)
}

export const getAllFaceTypes = (): FaceTypeDefinition[] => {
  return [...registry.values()]
}

/** Clear all registered face types. Intended for tests only. */
export const clearFaceTypeRegistry = (): void => {
  registry.clear()
}
