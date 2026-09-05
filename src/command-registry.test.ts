import { describe, expect, test, vi } from 'vitest'

import {
  CommandUnavailableError,
  createCommandRegistry,
  type CommandDescriptor,
  type CommandInvocationContext,
  type CommandSurface,
} from './command-registry'

const slashContext = (subject = true): CommandInvocationContext => ({
  surface: 'slash',
  subject: subject ? { matrixId: 1, rowId: 2 } : undefined,
  capabilities: {},
})

const descriptor = (
  id: `${string}.${string}`,
  overrides: Partial<CommandDescriptor> = {},
): CommandDescriptor => ({
  id,
  label: id,
  keywords: [],
  surfaces: ['slash', 'launcher'],
  subject: 'none',
  run: vi.fn(),
  ...overrides,
})

describe('command registry', () => {
  test('keeps stable registration order and exposes immutable snapshots', () => {
    const registry = createCommandRegistry()
    registry.replaceOwner('one', [descriptor('one.first'), descriptor('one.second')])
    registry.replaceOwner('two', [descriptor('two.third')])

    const snapshot = registry.list()
    expect(snapshot.map(({ id }) => id)).toEqual(['one.first', 'one.second', 'two.third'])
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(() => (snapshot as CommandDescriptor[]).push(descriptor('bad.mutation'))).toThrow()
    expect(registry.list().map(({ id }) => id)).toEqual([
      'one.first',
      'one.second',
      'two.third',
    ])
  })

  test('copies and freezes descriptor metadata at registration', () => {
    const registry = createCommandRegistry()
    const keywords = ['original']
    const surfaces: CommandSurface[] = ['slash']
    const source = {
      id: 'one.mutable' as const,
      label: 'Original',
      keywords,
      surfaces,
      subject: 'none' as const,
      run: vi.fn(),
    }

    registry.replaceOwner('one', [source])
    source.label = 'Changed'
    keywords.push('changed')
    surfaces.push('launcher')

    const [stored] = registry.list()
    expect(stored).toMatchObject({
      label: 'Original',
      keywords: ['original'],
      surfaces: ['slash'],
    })
    expect(Object.isFrozen(stored)).toBe(true)
    expect(Object.isFrozen(stored?.keywords)).toBe(true)
    expect(Object.isFrozen(stored?.surfaces)).toBe(true)
    const mutableStored = stored as unknown as { label: string }
    expect(() => {
      mutableStored.label = 'Mutated through snapshot'
    }).toThrow()
  })

  test('rejects duplicate IDs without changing existing registrations', () => {
    const registry = createCommandRegistry()
    registry.replaceOwner('one', [descriptor('shared.command')])

    expect(() =>
      registry.replaceOwner('two', [descriptor('two.valid'), descriptor('shared.command')]),
    ).toThrow('already registered')
    expect(registry.list().map(({ id }) => id)).toEqual(['shared.command'])
  })

  test('filters surfaces and matches local IDs, keyword prefixes, and label substrings', () => {
    const registry = createCommandRegistry()
    registry.replaceOwner('owner', [
      descriptor('hila.table', {
        label: 'New table',
        keywords: ['collection'],
        surfaces: ['slash'],
      }),
      descriptor('hila.settings', {
        label: 'Open preferences',
        keywords: ['configuration'],
        surfaces: ['launcher'],
      }),
    ])

    expect(registry.entries(slashContext()).map(({ command }) => command.id)).toEqual([
      'hila.table',
    ])
    expect(registry.match('tab', slashContext()).map(({ command }) => command.id)).toEqual([
      'hila.table',
    ])
    expect(registry.match('coll', slashContext()).map(({ command }) => command.id)).toEqual([
      'hila.table',
    ])
    expect(registry.match('new', slashContext()).map(({ command }) => command.id)).toEqual([
      'hila.table',
    ])
  })

  test('keeps subject-required commands discoverable with a concrete reason', async () => {
    const registry = createCommandRegistry()
    const run = vi.fn()
    registry.replaceOwner('owner', [
      descriptor('hila.node-command', { subject: 'required', run }),
    ])

    const [entry] = registry.entries(slashContext(false))
    expect(entry?.unavailableReason).toBe('This command requires a node.')
    await expect(registry.invoke('hila.node-command', slashContext(false))).rejects.toEqual(
      expect.any(CommandUnavailableError),
    )
    expect(run).not.toHaveBeenCalled()
  })

  test('reports descriptor-specific disabled reasons', async () => {
    const registry = createCommandRegistry()
    registry.replaceOwner('owner', [
      descriptor('hila.capability', {
        unavailableReason: ({ capabilities }) =>
          capabilities.openTypePicker ? null : 'A type picker is unavailable.',
      }),
    ])

    expect(registry.entries(slashContext())[0]?.unavailableReason).toBe(
      'A type picker is unavailable.',
    )
    await expect(registry.invoke('hila.capability', slashContext())).rejects.toThrow(
      'A type picker is unavailable.',
    )
  })

  test('propagates asynchronous command failures', async () => {
    const registry = createCommandRegistry()
    registry.replaceOwner('owner', [
      descriptor('hila.failure', {
        run: async () => {
          throw new Error('operation failed')
        },
      }),
    ])

    await expect(registry.invoke('hila.failure', slashContext())).rejects.toThrow(
      'operation failed',
    )
  })

  test('re-registration replaces an owner in place without duplication', () => {
    const registry = createCommandRegistry()
    const staleDispose = registry.replaceOwner('plugin', [descriptor('plugin.old')])
    registry.replaceOwner('other', [descriptor('other.command')])
    const dispose = registry.replaceOwner('plugin', [
      descriptor('plugin.old', { label: 'Updated' }),
      descriptor('plugin.new'),
    ])

    staleDispose()
    expect(registry.list().map(({ id }) => id)).toEqual([
      'plugin.old',
      'plugin.new',
      'other.command',
    ])

    dispose()
    expect(registry.list().map(({ id }) => id)).toEqual(['other.command'])
  })

  test('reserves IDs without exposing commands before commit', () => {
    const registry = createCommandRegistry()
    const pending = registry.prepareOwner('one', [descriptor('shared.command')])

    expect(registry.list()).toEqual([])
    expect(() => registry.prepareOwner('two', [descriptor('shared.command')])).toThrow(
      'already registered',
    )

    pending.commit()
    expect(registry.list().map(({ id }) => id)).toEqual(['shared.command'])
  })

  test('owner teardown removes only its commands', () => {
    const registry = createCommandRegistry()
    registry.replaceOwner('one', [descriptor('one.command')])
    registry.replaceOwner('two', [descriptor('two.command')])

    registry.unregisterOwner('one')
    expect(registry.list().map(({ id }) => id)).toEqual(['two.command'])
  })
})
