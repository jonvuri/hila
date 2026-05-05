import type { FaceTypeDefinition } from './face-types'

export type MatrixSpec = {
  key: string // local reference within the plugin
  title: string
  columns: { name: string; type: string }[]
}

export type TraitRequest = {
  type: 'rank' | 'closure'
  matrixKey: string // references MatrixSpec.key
}

export type FaceBinding = {
  key: string
  faceTypeId: string
  matrixKey: string
  slotBindings?: Record<string, string>
  settings?: Record<string, unknown>
}

/**
 * Context provided to a plugin's `init` hook after registration.
 *
 * Deliberately minimal: `matrixIds` maps the plugin's declared matrix
 * keys to their actual IDs. This is sufficient for all current consumers
 * (outline, notes, tags, inline references).
 *
 * `db` is not included because `init` runs on the main thread, not in
 * the worker where the database lives. Plugins interact with the database
 * through the async client layer (`matrix-client.ts`).
 *
 * Event handlers / cross-plugin APIs are not included because plugins
 * interact through shared data (SQL over matrixes and the join table),
 * not through direct API calls. See Plugins.md for the cross-plugin
 * interaction contract.
 *
 * Future extensions (e.g. `schedule()` for Phase 7) will be added when
 * motivated by real consumers.
 */
export type PluginContext = {
  matrixIds: Record<string, number>
}

export type PluginDefinition = {
  id: string
  name: string
  version: string
  faceTypes?: FaceTypeDefinition[]
  matrixes: MatrixSpec[]
  traits: TraitRequest[]
  namedQueries: Record<string, string>
  namedMutations: Record<string, string>
  faceBindings: FaceBinding[]
  init?: (ctx: PluginContext) => void | Promise<void>
  destroy?: () => void | Promise<void>
}

// Serializable subset sent to the worker (no function hooks)
export type PluginRegistration = Omit<PluginDefinition, 'init' | 'destroy'>

export type PluginRow = {
  id: string
  name: string
  version: string
  enabled: number
  metadata: string | null
}
