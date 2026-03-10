import { afterEach, describe, expect, test } from 'vitest'

import type { FaceTypeDefinition } from './face-types'
import {
  registerFaceType,
  getFaceType,
  getAllFaceTypes,
  clearFaceTypeRegistry,
} from './face-registry'

afterEach(() => {
  clearFaceTypeRegistry()
})

const makeFaceType = (overrides: Partial<FaceTypeDefinition> = {}): FaceTypeDefinition => ({
  id: 'test-face',
  name: 'Test Face',
  slots: [],
  traitRequirements: [],
  overflowBehavior: 'none',
  ...overrides,
})

describe('Face type registry', () => {
  test('register and retrieve a face type', () => {
    const def = makeFaceType({ id: 'hila.outline', name: 'Outline' })
    registerFaceType(def)

    const result = getFaceType('hila.outline')
    expect(result).toEqual(def)
  })

  test('getFaceType returns undefined for unregistered ID', () => {
    expect(getFaceType('nonexistent')).toBeUndefined()
  })

  test('getAllFaceTypes returns all registered types', () => {
    registerFaceType(makeFaceType({ id: 'a', name: 'A' }))
    registerFaceType(makeFaceType({ id: 'b', name: 'B' }))

    const all = getAllFaceTypes()
    expect(all).toHaveLength(2)
    expect(all.map((f) => f.id).sort()).toEqual(['a', 'b'])
  })

  test('re-registering the same ID overwrites the previous definition', () => {
    registerFaceType(makeFaceType({ id: 'x', name: 'Old' }))
    registerFaceType(makeFaceType({ id: 'x', name: 'New' }))

    expect(getFaceType('x')!.name).toBe('New')
    expect(getAllFaceTypes()).toHaveLength(1)
  })

  test('clearFaceTypeRegistry empties the registry', () => {
    registerFaceType(makeFaceType({ id: 'a' }))
    registerFaceType(makeFaceType({ id: 'b' }))
    clearFaceTypeRegistry()

    expect(getAllFaceTypes()).toHaveLength(0)
  })
})
