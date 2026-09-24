import type { FaceConfig, FaceTypeDefinition } from '../face-types'
import type { ColumnDefinition, JoinKind, JoinRow } from '../matrix'
import type { RenameHealingReport } from '../../sql/query-spec/durable'
import type {
  MatrixOperationType,
  MatrixOperationMap,
  MatrixClientMessage,
} from '../matrix-types'
import type { PluginContext, PluginDefinition, PluginRow } from '../plugin-types'
import { toPluginRegistration } from '../plugin-types'
import type { TagType } from '../../tags/tag-types'
import type { DiscoveryCatalogEntry, DiscoveryFilter } from '../../discovery/types'
import type { AppearanceProvenance, ResolvedPlaceNavigation } from '../place-navigation'
import type { NodeRef } from '../tree'
import type { CreatedViewBlock } from '../block-marker'
import { commandRegistry } from '../../command-registry'
import {
  registerFaceType as registerFaceTypeLocal,
  getFaceType as getFaceTypeLocal,
} from '../face-registry'

import { postMessage } from './worker-client'
import { pendingRequests } from './matrix-client-promises'

const pluginDestroyers = new Map<string, PluginDefinition['destroy']>()
const pluginGenerations = new Map<string, number>()

export class PluginRegistrationSupersededError extends Error {
  constructor(readonly pluginId: string) {
    super(`Plugin registration for "${pluginId}" was superseded`)
    this.name = 'PluginRegistrationSupersededError'
  }
}

const nextPluginGeneration = (pluginId: string): number => {
  const generation = (pluginGenerations.get(pluginId) ?? 0) + 1
  pluginGenerations.set(pluginId, generation)
  return generation
}

export const workerCall = <K extends MatrixOperationType>(
  type: K,
  params: MatrixOperationMap[K]['params'],
): Promise<MatrixOperationMap[K]['result']> =>
  new Promise((resolve, reject) => {
    const id = crypto.randomUUID()
    pendingRequests.set(id, { resolve, reject })
    postMessage({ type, id, ...params } as MatrixClientMessage)
  })

export const queryDiscoveryCatalog = (input: {
  rootMatrixId: number
  query: string
  filter: DiscoveryFilter
  limit: number
}): Promise<DiscoveryCatalogEntry[]> => workerCall('queryDiscoveryCatalog', input)

export const resolvePlaceNavigation = (
  rootMatrixId: number,
  node: NodeRef,
  provenance?: AppearanceProvenance,
): Promise<ResolvedPlaceNavigation | null> =>
  workerCall('resolvePlaceNavigation', {
    rootMatrixId,
    matrixId: node.matrixId,
    rowId: node.rowId,
    provenanceKey: provenance?.key,
  })

export const createMatrix = (title: string) => workerCall('createMatrix', { title })

export const renameMatrix = (matrixId: number, title: string): Promise<void> =>
  workerCall('renameMatrix', { matrixId, title })

export const addSampleRows = (matrixId: number) => workerCall('addSampleRows', { matrixId })

export const resetDatabase = () => workerCall('resetDatabase', {})

export const insertRow = (
  matrixId: number,
  params?: {
    parentKey?: Uint8Array
    prevKey?: Uint8Array
    nextKey?: Uint8Array
    values?: Record<string, unknown>
  },
) => workerCall('insertRow', { matrixId, ...params })

export const updateRow = (matrixId: number, rowId: number, values: Record<string, unknown>) =>
  workerCall('updateRow', { matrixId, rowId, values })

export const deleteRow = (matrixId: number, rowId: number) =>
  workerCall('deleteRow', { matrixId, rowId })

export const reparentRow = (
  matrixId: number,
  nodeKey: Uint8Array,
  params?: {
    newParentKey?: Uint8Array
    prevSiblingKey?: Uint8Array
    nextSiblingKey?: Uint8Array
  },
) => workerCall('reparentRow', { matrixId, nodeKey, ...params })

export const deleteSubtree = (matrixId: number, key: Uint8Array) =>
  workerCall('deleteSubtree', { matrixId, key })

export const registerPlugin = async (definition: PluginDefinition): Promise<PluginContext> => {
  const generation = nextPluginGeneration(definition.id)
  const preparedCommands = commandRegistry.prepareOwner(
    definition.id,
    definition.commands ?? [],
  )
  let initialized = false

  const assertCurrentGeneration = (): void => {
    if (pluginGenerations.get(definition.id) !== generation) {
      throw new PluginRegistrationSupersededError(definition.id)
    }
  }

  try {
    // Register face types on the main thread before sending to the worker.
    // The worker-side registerPlugin also registers them in its own registry.
    if (definition.faceTypes) {
      for (const ft of definition.faceTypes) {
        if (!getFaceTypeLocal(ft.id)) {
          registerFaceTypeLocal(ft)
        }
      }
    }

    const ctx = await workerCall('registerPlugin', {
      definition: toPluginRegistration(definition),
    })
    assertCurrentGeneration()

    if (definition.init) {
      await definition.init(ctx)
      initialized = true
      assertCurrentGeneration()
    }

    if (!preparedCommands.commit()) {
      throw new PluginRegistrationSupersededError(definition.id)
    }
    pluginDestroyers.set(definition.id, definition.destroy)
    return ctx
  } catch (error) {
    preparedCommands.cancel()
    if (initialized && error instanceof PluginRegistrationSupersededError) {
      await definition.destroy?.()
    }
    throw error
  }
}

export const disposePlugin = async (pluginId: string): Promise<void> => {
  nextPluginGeneration(pluginId)
  commandRegistry.unregisterOwner(pluginId)
  const destroy = pluginDestroyers.get(pluginId)
  pluginDestroyers.delete(pluginId)
  await destroy?.()
}

export const getPlugins = (): Promise<PluginRow[]> => workerCall('getPlugins', {})

export const applyFaceToMatrix = (
  faceTypeId: string,
  matrixId: number,
  pluginId?: string,
): Promise<FaceConfig> => workerCall('applyFaceToMatrix', { faceTypeId, matrixId, pluginId })

export const saveFaceConfig = (config: FaceConfig): Promise<void> =>
  workerCall('saveFaceConfig', { config })

export const getFaceConfigs = (matrixId: number): Promise<FaceConfig[]> =>
  workerCall('getFaceConfigs', { matrixId })

export const seedWelcomeRow = (matrixId: number, content: string): Promise<void> =>
  workerCall('seedWelcomeRow', { matrixId, content })

export const seedRow = (matrixId: number, values: Record<string, unknown>): Promise<void> =>
  workerCall('seedRow', { matrixId, values })

export const registerFaceType = (definition: FaceTypeDefinition): Promise<void> =>
  workerCall('registerFaceType', { definition })

export const addColumn = (
  matrixId: number,
  name: string,
  columnType: string,
  displayType?: string,
  options?: string,
  constraints?: string,
): Promise<number> =>
  workerCall('addColumn', { matrixId, name, columnType, displayType, options, constraints })

export const addFormulaColumn = (
  matrixId: number,
  name: string,
  formula: string,
): Promise<number> => workerCall('addFormulaColumn', { matrixId, name, formula })

export const removeColumn = (
  matrixId: number,
  columnName: string,
  force?: boolean,
): Promise<void> => workerCall('removeColumn', { matrixId, columnName, force })

export const renameColumn = (
  matrixId: number,
  oldName: string,
  newName: string,
  force?: boolean,
): Promise<RenameHealingReport> =>
  workerCall('renameColumn', { matrixId, oldName, newName, force })

export const getColumns = (matrixId: number): Promise<ColumnDefinition[]> =>
  workerCall('getColumns', { matrixId })

export const updateColumnDisplayType = (
  matrixId: number,
  columnName: string,
  displayType: string,
): Promise<void> => workerCall('updateColumnDisplayType', { matrixId, columnName, displayType })

export const updateColumnOptions = (
  matrixId: number,
  columnName: string,
  options: string | null,
): Promise<void> => workerCall('updateColumnOptions', { matrixId, columnName, options })

export const updateColumnRole = (
  matrixId: number,
  columnName: string,
  role: 'label' | 'content' | null,
): Promise<void> => workerCall('updateColumnRole', { matrixId, columnName, role })

export const reorderColumns = (matrixId: number, columnNames: string[]): Promise<void> =>
  workerCall('reorderColumns', { matrixId, columnNames })

export const insertJoin = (
  sourceMatrixId: number,
  sourceRowId: number,
  targetMatrixId: number,
  targetRowId: number,
  kind?: JoinKind,
): Promise<void> =>
  workerCall('insertJoin', { sourceMatrixId, sourceRowId, targetMatrixId, targetRowId, kind })

export const createRefJoin = (
  sourceMatrixId: number,
  sourceRowId: number,
  targetMatrixId: number,
  targetRowId: number,
): Promise<void> =>
  workerCall('insertJoin', {
    sourceMatrixId,
    sourceRowId,
    targetMatrixId,
    targetRowId,
    kind: 'ref',
  })

export const deleteJoin = (
  sourceMatrixId: number,
  sourceRowId: number,
  targetMatrixId: number,
  targetRowId: number,
): Promise<void> =>
  workerCall('deleteJoin', { sourceMatrixId, sourceRowId, targetMatrixId, targetRowId })

export const getTargets = (
  sourceMatrixId: number,
  sourceRowId: number,
): Promise<{ targetMatrixId: number; targetRowId: number; kind: JoinKind }[]> =>
  workerCall('getTargets', { sourceMatrixId, sourceRowId })

export const getSources = (
  targetMatrixId: number,
  targetRowId: number,
): Promise<{ sourceMatrixId: number; sourceRowId: number; kind: JoinKind }[]> =>
  workerCall('getSources', { targetMatrixId, targetRowId })

export const createDependentRow = (
  sourceMatrixId: number,
  sourceRowId: number,
  targetMatrixId: number,
  columnValues?: Record<string, unknown>,
): Promise<number> =>
  workerCall('createDependentRow', {
    sourceMatrixId,
    sourceRowId,
    targetMatrixId,
    columnValues,
  })

export const createOwnedMatrix = (
  owner: { matrixId: number; rowId: number },
  title: string,
  columns?: { name: string; type: string; constraints?: string; role?: 'label' | 'content' }[],
): Promise<number> =>
  workerCall('createOwnedMatrix', {
    ownerMatrixId: owner.matrixId,
    ownerRowId: owner.rowId,
    title,
    columns,
  })

export const deleteOwnedTarget = (targetMatrixId: number, targetRowId: number): Promise<void> =>
  workerCall('deleteOwnedTarget', { targetMatrixId, targetRowId })

export const deleteJoinByTarget = (
  targetMatrixId: number,
  targetRowId: number,
): Promise<JoinRow | null> => workerCall('deleteJoinByTarget', { targetMatrixId, targetRowId })

export const createViewBlock = (
  focalMatrixId: number,
  focalRowId: number,
  sql: string,
  name?: string,
): Promise<{ matrixId: number; rowId: number }> =>
  workerCall('createViewBlock', { focalMatrixId, focalRowId, sql, name })

export const createViewBlockAtAppearance = (
  focalMatrixId: number,
  focalRowId: number,
  provenance: AppearanceProvenance,
  sql: string,
  name?: string,
): Promise<CreatedViewBlock> =>
  workerCall('createViewBlockAtAppearance', {
    focalMatrixId,
    focalRowId,
    provenance,
    sql,
    name,
  })

export const updateViewBlock = (
  markerMatrixId: number,
  markerRowId: number,
  sql: string,
): Promise<void> => workerCall('updateViewBlock', { markerMatrixId, markerRowId, sql })

export const deleteViewBlock = (markerMatrixId: number, markerRowId: number): Promise<void> =>
  workerCall('deleteViewBlock', { markerMatrixId, markerRowId })

// Phase 9.7 Stage C — portal / move-owner / two-tier-delete gestures.

/** Mirror `target` under `host`: a non-owning extra position (opt-in, deep). */
export const addPortal = (
  host: { matrixId: number; rowId: number },
  target: { matrixId: number; rowId: number },
): Promise<void> =>
  workerCall('addPortal', {
    hostMatrixId: host.matrixId,
    hostRowId: host.rowId,
    targetMatrixId: target.matrixId,
    targetRowId: target.rowId,
  })

/** Detach a portal (non-destructive): the home and other portals survive. */
export const removePortal = (
  host: { matrixId: number; rowId: number },
  target: { matrixId: number; rowId: number },
): Promise<void> =>
  workerCall('removePortal', {
    hostMatrixId: host.matrixId,
    hostRowId: host.rowId,
    targetMatrixId: target.matrixId,
    targetRowId: target.rowId,
  })

/** Relocate a node's home to `newParent`, leaving a portal behind (promotion). */
export const moveOwner = (
  node: { matrixId: number; rowId: number },
  newParent: { matrixId: number; rowId: number },
  positioning?: { prevSiblingKey?: Uint8Array; nextSiblingKey?: Uint8Array },
): Promise<void> =>
  workerCall('moveOwner', {
    matrixId: node.matrixId,
    rowId: node.rowId,
    newParentMatrixId: newParent.matrixId,
    newParentRowId: newParent.rowId,
    prevSiblingKey: positioning?.prevSiblingKey,
    nextSiblingKey: positioning?.nextSiblingKey,
  })

/** Default home-delete: cascade the home subtree, ghost surviving portals. */
export const deleteHomeGhostingPortals = (matrixId: number, rowId: number): Promise<number> =>
  workerCall('deleteHomeGhostingPortals', { matrixId, rowId })

/** The escalation: cascade everywhere (home + every portal appearance), no ghosts. */
export const hardDeleteIncludingRefs = (matrixId: number, rowId: number): Promise<void> =>
  workerCall('hardDeleteIncludingRefs', { matrixId, rowId })

/**
 * Resolve a render-only row's live ownership home for sticky-row compatibility. Place navigation
 * uses `resolvePlaceNavigation`; identity alone never selects a portal.
 */
export const resolveDrillInPosition = (
  matrixId: number,
  rowId: number,
): Promise<{ key: Uint8Array; isHome: boolean } | null> =>
  workerCall('resolveDrillInPosition', { matrixId, rowId })

export const createTagType = (
  name: string,
  columns?: { name: string; type: string }[],
): Promise<TagType> => workerCall('createTagType', { name, columns })

export const getTagType = (name: string): Promise<TagType | null> =>
  workerCall('getTagType', { name })

export const getAllTagTypes = (): Promise<TagType[]> => workerCall('getAllTagTypes', {})

export const updateTagType = (tagTypeId: number, updates: { name?: string }): Promise<void> =>
  workerCall('updateTagType', { tagTypeId, ...updates })

export const deleteTagType = (tagTypeId: number): Promise<void> =>
  workerCall('deleteTagType', { tagTypeId })
