export type SlotDeclaration = {
  name: string
  preferredType: string // 'text' | 'richtext' | 'number' | 'date' | 'boolean' | 'select'
  required: boolean
}

export type FaceTypeDefinition = {
  id: string
  name: string
  slots: SlotDeclaration[]
  traitRequirements: { type: 'rank' | 'closure' }[]
  overflowBehavior: 'side-columns' | 'property-panel' | 'none'
}

export type FaceConfig = {
  id: string
  faceTypeId: string
  matrixId: number
  query: string
  slotBindings: Record<string, string> // slot name → column name
  settings: Record<string, unknown>
  createdByPlugin?: string | null
}

export type ResolvedSlotBinding = {
  slotName: string
  columnName: string
  columnType: string
  resolution: 'explicit' | 'name-match' | 'type-position' | 'fallback'
}

export type SlotBindingResult = {
  bindings: ResolvedSlotBinding[]
  overflowColumns: { name: string; type: string }[]
}

export type FaceConfigRow = {
  id: string
  face_type_id: string
  matrix_id: number
  query: string
  slot_bindings: string // JSON
  settings: string | null // JSON
  created_by_plugin: string | null
}
