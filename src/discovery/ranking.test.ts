import { describe, expect, test, vi } from 'vitest'

import type { CommandEntry } from '../command-registry'

import { matchDiscoveryNode, matchQuality, rankDiscoveryResults } from './ranking'
import type { DiscoveryCatalogEntry, DiscoveryFilter } from './types'

const catalogEntry = (
  id: string,
  label: string,
  content: string,
  options: {
    query?: string
    filter?: DiscoveryFilter
    overrides?: Partial<DiscoveryCatalogEntry>
  } = {},
): DiscoveryCatalogEntry => {
  const { query = '', filter = 'all', overrides = {} } = options
  const match = matchDiscoveryNode(label, content, query, filter)
  if (!match) throw new Error(`Expected ${id} to match`)
  return {
    id,
    family: 'row',
    target: { type: 'node', node: { matrixId: 1, rowId: Number(id.replace(/\D/g, '')) || 1 } },
    label,
    content,
    breadcrumb: [],
    navigation: null,
    ownedMatrixIds: [],
    structuralDepth: 1,
    structuralOrder: id,
    ...match,
    ...overrides,
  }
}

const command = (id: `${string}.${string}`, label: string): CommandEntry => ({
  command: {
    id,
    label,
    keywords: ['configure'],
    surfaces: ['launcher'],
    subject: 'none',
    run: vi.fn(),
  },
  unavailableReason: null,
})

describe('discovery matching and ranking', () => {
  test('classifies exact, prefix, word-prefix, and substring matches', () => {
    expect(matchQuality('task', 'task')).toBe('exact')
    expect(matchQuality('Task board', 'task')).toBe('prefix')
    expect(matchQuality('Open task board', 'task')).toBe('word-prefix')
    expect(matchQuality('Multitasking', 'task')).toBe('substring')
    expect(matchQuality('Other', 'task')).toBeNull()
  })

  test('uses label weight without making labels a hard result band', () => {
    const results = rankDiscoveryResults(
      [
        catalogEntry('node:1', 'Task board', '', { query: 'task' }),
        catalogEntry('node:2', 'Other', 'task', { query: 'task' }),
      ],
      [],
      'task',
      'all',
      12,
    )
    expect(results.map(({ id }) => id)).toEqual(['node:2', 'node:1'])
    expect(results[0]).toMatchObject({ matchTarget: 'content', matchQuality: 'exact' })
  })

  test('applies stable structural tie-breaks', () => {
    const catalog = [
      catalogEntry('node:2', 'Alpha', '', {
        overrides: { structuralDepth: 2, structuralOrder: 'a' },
      }),
      catalogEntry('node:1', 'Bravo', '', {
        overrides: { structuralDepth: 1, structuralOrder: 'z' },
      }),
      catalogEntry('node:3', 'Delta', '', {
        overrides: { structuralDepth: 1, structuralOrder: 'b' },
      }),
    ]
    const first = rankDiscoveryResults(catalog, [], '', 'all', 12).map(({ id }) => id)
    const second = rankDiscoveryResults([...catalog].reverse(), [], '', 'all', 12).map(
      ({ id }) => id,
    )
    expect(first).toEqual(['node:3', 'node:1', 'node:2'])
    expect(second).toEqual(first)
  })

  test('uses typed family filters and merges command identity', () => {
    const browseCatalog = [
      catalogEntry('type:1', 'Task', '', {
        filter: 'containers',
        overrides: { family: 'type' },
      }),
      catalogEntry('container:2', 'Projects', '', {
        filter: 'containers',
        overrides: { family: 'container' },
      }),
    ]
    const commands = [command('hila.settings', 'Open settings')]

    expect(
      rankDiscoveryResults(browseCatalog, commands, '', 'containers', 12).map(
        ({ family }) => family,
      ),
    ).toEqual(['type', 'container'])
    const contentCatalog = [
      catalogEntry('row:3', 'Task notes', 'private task details', { query: 'private' }),
    ]
    expect(rankDiscoveryResults(contentCatalog, [], 'private', 'named', 12)).toEqual([])
  })

  test('limits named command matching to visible labels', () => {
    const commands = [command('hila.settings', 'Open settings')]

    expect(rankDiscoveryResults([], commands, 'configure', 'named', 12)).toEqual([])
    expect(rankDiscoveryResults([], commands, 'settings', 'named', 12)[0]).toMatchObject({
      family: 'command',
      commandId: 'hila.settings',
      matchTarget: 'command-label',
    })
    expect(rankDiscoveryResults([], commands, 'config', 'commands', 12)[0]).toMatchObject({
      family: 'command',
      commandId: 'hila.settings',
      matchTarget: 'command-keyword',
    })
    expect(
      rankDiscoveryResults([], commands, 'hila.settings', 'commands', 12)[0],
    ).toMatchObject({
      commandId: 'hila.settings',
      matchTarget: 'command-keyword',
    })
  })
})
