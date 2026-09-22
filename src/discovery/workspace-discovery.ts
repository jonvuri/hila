import {
  commandRegistry,
  type CommandEntry,
  type CommandInvocationContext,
} from '../command-registry'
import { queryDiscoveryCatalog } from '../core/client/matrix-client'

import { rankDiscoveryResults } from './ranking'
import type {
  DiscoveryCatalogEntry,
  DiscoveryFilter,
  DiscoveryRequest,
  DiscoverySearchOutcome,
} from './types'

type DiscoveryServiceDependencies = {
  readonly queryCatalog?: (request: {
    rootMatrixId: number
    query: string
    filter: DiscoveryFilter
    limit: number
  }) => Promise<DiscoveryCatalogEntry[]>
  readonly commandContext?: () => CommandInvocationContext
  readonly commandEntries?: (context: CommandInvocationContext) => readonly CommandEntry[]
}

type QueuedSearch = {
  readonly generation: number
  readonly request: Required<DiscoveryRequest>
  readonly resolve: (outcome: DiscoverySearchOutcome) => void
  readonly reject: (error: unknown) => void
}

const DEFAULT_LIMIT = 12
const MAX_LIMIT = 100

const normalizeRequest = (request: DiscoveryRequest): Required<DiscoveryRequest> => ({
  rootMatrixId: request.rootMatrixId,
  query: request.query,
  filter: request.filter ?? 'all',
  limit: Math.max(1, Math.min(MAX_LIMIT, Math.trunc(request.limit ?? DEFAULT_LIMIT))),
})

/**
 * A per-launcher discovery sequencer. It permits one worker scan and one latest pending request;
 * replaced or overtaken callers resolve as stale and cannot publish results for newer input.
 */
export const createWorkspaceDiscoveryService = (
  dependencies: DiscoveryServiceDependencies = {},
) => {
  const queryCatalog = dependencies.queryCatalog ?? queryDiscoveryCatalog
  const commandEntries =
    dependencies.commandEntries ?? ((context) => commandRegistry.entries(context))
  const commandContext =
    dependencies.commandContext ??
    (() => ({ surface: 'launcher', capabilities: {} }) satisfies CommandInvocationContext)
  let generation = 0
  let active = false
  let pending: QueuedSearch | null = null

  const runNext = async (): Promise<void> => {
    if (active || !pending) return
    const queued = pending
    pending = null
    active = true

    try {
      const catalog =
        queued.request.filter === 'commands' ? [] : await queryCatalog(queued.request)
      if (queued.generation !== generation) {
        queued.resolve({ status: 'stale' })
      } else {
        const commands = commandEntries(commandContext())
        queued.resolve({
          status: 'current',
          results: rankDiscoveryResults(
            catalog,
            commands,
            queued.request.query,
            queued.request.filter,
            queued.request.limit,
          ),
        })
      }
    } catch (error) {
      if (queued.generation !== generation) queued.resolve({ status: 'stale' })
      else queued.reject(error)
    } finally {
      active = false
      void runNext()
    }
  }

  const search = (request: DiscoveryRequest): Promise<DiscoverySearchOutcome> => {
    generation += 1
    pending?.resolve({ status: 'stale' })
    return new Promise((resolve, reject) => {
      pending = { generation, request: normalizeRequest(request), resolve, reject }
      void runNext()
    })
  }

  const cancel = (): void => {
    generation += 1
    pending?.resolve({ status: 'stale' })
    pending = null
  }

  return { search, cancel }
}
