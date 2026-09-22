import { describe, expect, test, vi } from 'vitest'

import { createWorkspaceDiscoveryService } from './workspace-discovery'
import type { DiscoveryCatalogEntry } from './types'

const entry = (id: string, label: string): DiscoveryCatalogEntry => ({
  id,
  family: 'row',
  target: { type: 'node', node: { matrixId: 1, rowId: 1 } },
  label,
  content: '',
  breadcrumb: [],
  navigation: null,
  ownedMatrixIds: [],
  matchTarget: 'label',
  matchQuality: 'exact',
  score: 440,
  structuralDepth: 0,
  structuralOrder: id,
})

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('workspace discovery service', () => {
  test('runs one request plus the latest pending request and marks older outcomes stale', async () => {
    const firstRun = deferred<DiscoveryCatalogEntry[]>()
    const latestRun = deferred<DiscoveryCatalogEntry[]>()
    const queryCatalog = vi
      .fn()
      .mockReturnValueOnce(firstRun.promise)
      .mockReturnValueOnce(latestRun.promise)
    const service = createWorkspaceDiscoveryService({ queryCatalog })

    const first = service.search({ rootMatrixId: 1, query: 'a' })
    const replaced = service.search({ rootMatrixId: 1, query: 'ab' })
    const latest = service.search({ rootMatrixId: 1, query: 'abc' })
    await expect(replaced).resolves.toEqual({ status: 'stale' })
    expect(queryCatalog).toHaveBeenCalledTimes(1)

    firstRun.resolve([entry('row:first', 'a')])
    await expect(first).resolves.toEqual({ status: 'stale' })
    await Promise.resolve()
    expect(queryCatalog).toHaveBeenCalledTimes(2)

    latestRun.resolve([entry('row:latest', 'abc')])
    await expect(latest).resolves.toMatchObject({
      status: 'current',
      results: [{ id: 'row:latest' }],
    })
  })

  test('skips worker discovery for the command family', async () => {
    const queryCatalog = vi.fn()
    const service = createWorkspaceDiscoveryService({
      queryCatalog,
      commandEntries: () => [
        {
          command: {
            id: 'hila.settings',
            label: 'Open settings',
            keywords: ['configure'],
            surfaces: ['launcher'],
            subject: 'none',
            run: vi.fn(),
          },
          unavailableReason: null,
        },
      ],
    })

    await expect(
      service.search({ rootMatrixId: 1, query: 'settings', filter: 'commands' }),
    ).resolves.toMatchObject({ status: 'current', results: [{ commandId: 'hila.settings' }] })
    expect(queryCatalog).not.toHaveBeenCalled()
  })
})
