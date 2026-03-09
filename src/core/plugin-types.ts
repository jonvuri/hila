export type MatrixSpec = {
  key: string // local reference within the plugin
  title: string
  columns: { name: string; type: string }[]
}

export type TraitRequest = {
  type: 'rank' | 'closure'
  matrixKey: string // references MatrixSpec.key
  scopeName: string
}

export type FaceBinding = {
  key: string
  faceTypeId: string
  matrixKey: string
  slotBindings?: Record<string, string>
  settings?: Record<string, unknown>
}

export type PluginContext = {
  matrixIds: Record<string, number> // matrixKey → actual matrixId
}

export type PluginDefinition = {
  id: string
  name: string
  version: string
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
