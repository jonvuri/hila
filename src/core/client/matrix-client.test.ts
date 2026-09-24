import { beforeEach, describe, expect, test, vi, type Mock } from 'vitest'

import type { CommandDescriptor } from '../../command-registry'
import type { PluginDefinition } from '../plugin-types'

vi.mock('./worker-client', () => ({ postMessage: vi.fn() }))

const { commandRegistry } = await import('../../command-registry')
const {
  PluginRegistrationSupersededError,
  createViewBlockAtAppearance,
  disposePlugin,
  registerPlugin,
} = await import('./matrix-client')
const { handleMatrixWorkerMessage } = await import('./matrix-client-handler')
const { pendingRequests } = await import('./matrix-client-promises')
const { postMessage } = await import('./worker-client')

const mockPost = postMessage as Mock

const command = (id: `${string}.${string}`): CommandDescriptor => ({
  id,
  label: id,
  keywords: [],
  surfaces: ['slash'],
  subject: 'none',
  run: vi.fn(),
})

const definition = (
  commands: readonly CommandDescriptor[],
  overrides: Partial<PluginDefinition> = {},
): PluginDefinition => ({
  id: 'test.plugin',
  name: 'Test plugin',
  version: '1.0.0',
  matrixes: [],
  namedQueries: {},
  namedMutations: {},
  faceBindings: [],
  commands,
  ...overrides,
})

const resolveRegistrationMessage = (message: { id: string }): void => {
  handleMatrixWorkerMessage({
    type: 'registerPluginSuccess',
    id: message.id,
    result: { matrixIds: {} },
  })
}

const resolveRegistration = async <T>(promise: Promise<T>): Promise<T> => {
  const message = mockPost.mock.lastCall?.[0] as { id: string }
  resolveRegistrationMessage(message)
  return promise
}

describe('main-thread plugin command contributions', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    pendingRequests.clear()
    await disposePlugin('test.plugin')
    commandRegistry.unregisterOwner('test.other')
  })

  test('keeps command functions out of the worker payload and replaces registrations', async () => {
    const firstRegistration = registerPlugin(
      definition([command('test.first'), command('test.second')]),
    )
    await resolveRegistration(firstRegistration)

    const payload = mockPost.mock.lastCall?.[0] as {
      definition: Record<string, unknown>
    }
    expect(() => structuredClone(payload.definition)).not.toThrow()
    expect(payload.definition).not.toHaveProperty('commands')
    expect(commandRegistry.list().map(({ id }) => id)).toEqual(['test.first', 'test.second'])

    const secondRegistration = registerPlugin(
      definition([command('test.first'), command('test.replacement')]),
    )
    await resolveRegistration(secondRegistration)
    expect(commandRegistry.list().map(({ id }) => id)).toEqual([
      'test.first',
      'test.replacement',
    ])
  })

  test('teardown removes commands before running the plugin destroy hook', async () => {
    const destroy = vi.fn(() => {
      expect(commandRegistry.list()).toEqual([])
    })
    const registration = registerPlugin(definition([command('test.command')], { destroy }))
    await resolveRegistration(registration)

    await disposePlugin('test.plugin')

    expect(destroy).toHaveBeenCalledOnce()
    expect(commandRegistry.list()).toEqual([])
  })

  test('failed initialization does not leave commands registered', async () => {
    const registration = registerPlugin(
      definition([command('test.command')], {
        init: async () => {
          throw new Error('init failed')
        },
      }),
    )

    await expect(resolveRegistration(registration)).rejects.toThrow('init failed')
    expect(commandRegistry.list()).toEqual([])
  })

  test('failed re-initialization preserves the last successful registration', async () => {
    const firstRegistration = registerPlugin(definition([command('test.stable')]))
    await resolveRegistration(firstRegistration)

    const failedRegistration = registerPlugin(
      definition([command('test.replacement')], {
        init: async () => {
          throw new Error('stale init failed')
        },
      }),
    )
    await expect(resolveRegistration(failedRegistration)).rejects.toThrow('stale init failed')

    expect(commandRegistry.list().map(({ id }) => id)).toEqual(['test.stable'])
  })

  test('rejects command conflicts before worker registration or initialization', async () => {
    commandRegistry.replaceOwner('test.other', [command('shared.command')])
    const init = vi.fn()

    await expect(
      registerPlugin(definition([command('shared.command')], { init })),
    ).rejects.toThrow('already registered')

    expect(mockPost).not.toHaveBeenCalled()
    expect(init).not.toHaveBeenCalled()
    expect(commandRegistry.list().map(({ id }) => id)).toEqual(['shared.command'])
  })

  test('does not install commands when teardown supersedes an in-flight registration', async () => {
    const registration = registerPlugin(definition([command('test.stale')]))
    const message = mockPost.mock.lastCall?.[0] as { id: string }

    await disposePlugin('test.plugin')
    const rejection = expect(registration).rejects.toBeInstanceOf(
      PluginRegistrationSupersededError,
    )
    resolveRegistrationMessage(message)
    await rejection

    expect(commandRegistry.list()).toEqual([])
  })

  test('keeps the latest overlapping registration when responses arrive out of order', async () => {
    const firstRegistration = registerPlugin(definition([command('test.first')]))
    const firstMessage = mockPost.mock.lastCall?.[0] as { id: string }
    const secondRegistration = registerPlugin(definition([command('test.second')]))
    const secondMessage = mockPost.mock.lastCall?.[0] as { id: string }

    const firstRejection = expect(firstRegistration).rejects.toBeInstanceOf(
      PluginRegistrationSupersededError,
    )
    resolveRegistrationMessage(secondMessage)
    await secondRegistration
    resolveRegistrationMessage(firstMessage)
    await firstRejection

    expect(commandRegistry.list().map(({ id }) => id)).toEqual(['test.second'])
  })
})

describe('appearance-aware view creation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pendingRequests.clear()
  })

  test('round-trips parent and marker provenance through the worker protocol', async () => {
    const parentProvenance = { key: Uint8Array.of(1, 0, 2, 0) }
    const createdProvenance = { key: Uint8Array.of(1, 0, 2, 0, 3, 0) }
    const creation = createViewBlockAtAppearance(
      2,
      4,
      parentProvenance,
      'SELECT 1',
      'Portal view',
    )
    const message = mockPost.mock.lastCall?.[0] as { id: string }

    expect(message).toMatchObject({
      type: 'createViewBlockAtAppearance',
      focalMatrixId: 2,
      focalRowId: 4,
      provenance: parentProvenance,
      sql: 'SELECT 1',
      name: 'Portal view',
    })

    handleMatrixWorkerMessage({
      type: 'createViewBlockAtAppearanceSuccess',
      id: message.id,
      result: {
        marker: { matrixId: 2, rowId: 91 },
        provenance: createdProvenance,
      },
    })

    await expect(creation).resolves.toEqual({
      marker: { matrixId: 2, rowId: 91 },
      provenance: createdProvenance,
    })
  })
})
