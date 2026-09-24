import type { TagType } from '../tags/tag-types'
import type { RenameHealingReport } from '../sql/query-spec/durable'
import type { DiscoveryCatalogEntry, DiscoveryFilter } from '../discovery/types'

import type { FaceConfig, FaceTypeDefinition } from './face-types'
import type { ColumnDefinition, JoinKind, JoinRow } from './matrix'
import type { AppearanceProvenance, ResolvedPlaceNavigation } from './place-navigation'
import type { PluginContext, PluginRegistration, PluginRow } from './plugin-types'
import type { CreatedViewBlock } from './block-marker'

// Matrix operation registry: maps operation names to request params and response results.
// All message types and the protocol shape are derived from this single declaration.

export type MatrixOperationMap = {
  queryDiscoveryCatalog: {
    params: {
      rootMatrixId: number
      query: string
      filter: DiscoveryFilter
      limit: number
    }
    result: DiscoveryCatalogEntry[]
  }
  resolvePlaceNavigation: {
    params: {
      rootMatrixId: number
      matrixId: number
      rowId: number
      provenanceKey?: Uint8Array
    }
    result: ResolvedPlaceNavigation | null
  }
  createMatrix: {
    params: { title: string }
    result: number
  }
  renameMatrix: {
    params: { matrixId: number; title: string }
    result: void
  }
  addSampleRows: {
    params: { matrixId: number }
    result: void
  }
  resetDatabase: {
    params: Record<string, never>
    result: void
  }
  insertRow: {
    params: {
      matrixId: number
      values?: Record<string, unknown>
      parentKey?: Uint8Array
      prevKey?: Uint8Array
      nextKey?: Uint8Array
    }
    result: { rowId: number; key: Uint8Array | null }
  }
  updateRow: {
    params: { matrixId: number; rowId: number; values: Record<string, unknown> }
    result: void
  }
  deleteRow: {
    params: { matrixId: number; rowId: number }
    result: void
  }
  reparentRow: {
    params: {
      matrixId: number
      nodeKey: Uint8Array
      newParentKey?: Uint8Array
      prevSiblingKey?: Uint8Array
      nextSiblingKey?: Uint8Array
    }
    result: Uint8Array
  }
  deleteSubtree: {
    params: { matrixId: number; key: Uint8Array }
    result: void
  }
  compactChangelog: {
    params: { retentionDays?: number; perRowCap?: number }
    result: number
  }
  registerPlugin: {
    params: { definition: PluginRegistration }
    result: PluginContext
  }
  getPlugins: {
    params: Record<string, never>
    result: PluginRow[]
  }
  applyFaceToMatrix: {
    params: { faceTypeId: string; matrixId: number; pluginId?: string }
    result: FaceConfig
  }
  saveFaceConfig: {
    params: { config: FaceConfig }
    result: void
  }
  getFaceConfigs: {
    params: { matrixId: number }
    result: FaceConfig[]
  }
  seedWelcomeRow: {
    params: { matrixId: number; content: string }
    result: void
  }
  seedRow: {
    params: { matrixId: number; values: Record<string, unknown> }
    result: void
  }
  registerFaceType: {
    params: { definition: FaceTypeDefinition }
    result: void
  }
  addColumn: {
    params: {
      matrixId: number
      name: string
      columnType: string
      displayType?: string
      options?: string
      constraints?: string
      role?: 'label' | 'content'
    }
    result: number
  }
  addFormulaColumn: {
    params: {
      matrixId: number
      name: string
      formula: string
    }
    result: number
  }
  removeColumn: {
    params: { matrixId: number; columnName: string; force?: boolean }
    result: void
  }
  renameColumn: {
    params: { matrixId: number; oldName: string; newName: string; force?: boolean }
    result: RenameHealingReport
  }
  getColumns: {
    params: { matrixId: number }
    result: ColumnDefinition[]
  }
  updateColumnDisplayType: {
    params: { matrixId: number; columnName: string; displayType: string }
    result: void
  }
  updateColumnOptions: {
    params: { matrixId: number; columnName: string; options: string | null }
    result: void
  }
  updateColumnRole: {
    params: { matrixId: number; columnName: string; role: 'label' | 'content' | null }
    result: void
  }
  reorderColumns: {
    params: { matrixId: number; columnNames: string[] }
    result: void
  }
  insertJoin: {
    params: {
      sourceMatrixId: number
      sourceRowId: number
      targetMatrixId: number
      targetRowId: number
      kind?: JoinKind
    }
    result: void
  }
  deleteJoin: {
    params: {
      sourceMatrixId: number
      sourceRowId: number
      targetMatrixId: number
      targetRowId: number
    }
    result: void
  }
  getTargets: {
    params: { sourceMatrixId: number; sourceRowId: number }
    result: { targetMatrixId: number; targetRowId: number; kind: JoinKind }[]
  }
  getSources: {
    params: { targetMatrixId: number; targetRowId: number }
    result: { sourceMatrixId: number; sourceRowId: number; kind: JoinKind }[]
  }
  createDependentRow: {
    params: {
      sourceMatrixId: number
      sourceRowId: number
      targetMatrixId: number
      columnValues?: Record<string, unknown>
    }
    result: number
  }
  createOwnedMatrix: {
    params: {
      ownerMatrixId: number
      ownerRowId: number
      title: string
      columns?: {
        name: string
        type: string
        constraints?: string
        role?: 'label' | 'content'
      }[]
    }
    result: number
  }
  deleteOwnedTarget: {
    params: { targetMatrixId: number; targetRowId: number }
    result: void
  }
  deleteJoinByTarget: {
    params: { targetMatrixId: number; targetRowId: number }
    result: JoinRow | null
  }
  createViewBlock: {
    params: { focalMatrixId: number; focalRowId: number; sql: string; name?: string }
    result: { matrixId: number; rowId: number }
  }
  createViewBlockAtAppearance: {
    params: {
      focalMatrixId: number
      focalRowId: number
      provenance: AppearanceProvenance
      sql: string
      name?: string
    }
    result: CreatedViewBlock
  }
  updateViewBlock: {
    params: { markerMatrixId: number; markerRowId: number; sql: string }
    result: void
  }
  deleteViewBlock: {
    params: { markerMatrixId: number; markerRowId: number }
    result: void
  }
  // Phase 9.7 Stage C — portal / move-owner / two-tier-delete gestures.
  // Ownership stays single (the one `own`-edge); a portal is a non-owning extra
  // position. See src/core/portal.ts.
  addPortal: {
    params: {
      hostMatrixId: number
      hostRowId: number
      targetMatrixId: number
      targetRowId: number
    }
    result: void
  }
  removePortal: {
    params: {
      hostMatrixId: number
      hostRowId: number
      targetMatrixId: number
      targetRowId: number
    }
    result: void
  }
  moveOwner: {
    params: {
      matrixId: number
      rowId: number
      newParentMatrixId: number
      newParentRowId: number
      prevSiblingKey?: Uint8Array
      nextSiblingKey?: Uint8Array
    }
    result: void
  }
  // Default home-delete: cascades the home subtree, ghosts surviving portals.
  deleteHomeGhostingPortals: {
    params: { matrixId: number; rowId: number }
    result: number
  }
  // The escalation tier: cascade everywhere (home + every portal), no ghosts.
  hardDeleteIncludingRefs: {
    params: { matrixId: number; rowId: number }
    result: void
  }
  // Legacy sticky-row home resolution. Place navigation uses the richer operation above.
  resolveDrillInPosition: {
    params: { matrixId: number; rowId: number }
    result: { key: Uint8Array; isHome: boolean } | null
  }
  createTagType: {
    params: { name: string; columns?: { name: string; type: string }[] }
    result: TagType
  }
  getTagType: {
    params: { name: string }
    result: TagType | null
  }
  getAllTagTypes: {
    params: Record<string, never>
    result: TagType[]
  }
  updateTagType: {
    params: { tagTypeId: number; name?: string }
    result: void
  }
  deleteTagType: {
    params: { tagTypeId: number }
    result: void
  }
}

export type MatrixOperationType = keyof MatrixOperationMap

// Request messages (client → worker): { type, id, ...params }
export type MatrixClientMessage = {
  [K in MatrixOperationType]: { type: K; id: string } & MatrixOperationMap[K]['params']
}[MatrixOperationType]

// Response messages (worker → client)
export type MatrixSuccessMessage = {
  [K in MatrixOperationType]: {
    type: `${K}Success`
    id: string
    result: MatrixOperationMap[K]['result']
  }
}[MatrixOperationType]

export type MatrixErrorMessage = {
  [K in MatrixOperationType]: { type: `${K}Error`; id: string; error: Error }
}[MatrixOperationType]

export type MatrixWorkerMessage = MatrixSuccessMessage | MatrixErrorMessage
