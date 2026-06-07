export type SlotDeclaration = {
  name: string
  preferredType: string // 'text' | 'richtext' | 'number' | 'date' | 'boolean' | 'select'
  required: boolean
}

export type FaceTypeDefinition = {
  id: string
  name: string
  slots: SlotDeclaration[]
  overflowBehavior: 'side-columns' | 'property-panel' | 'none'
}

export type FaceConfig = {
  id: string
  faceTypeId: string
  matrixId: number
  query: string
  slotBindings: Record<string, number | null> // slot name → column ID (null if unresolved)
  settings: Record<string, unknown> // non-column-referencing settings only
  createdByPlugin?: string | null
  sort: { columnId: number; direction: 'ASC' | 'DESC' } | null
  filters: { columnId: number; operator: string; value: string }[]
}

export type ResolvedSlotBinding = {
  slotName: string
  columnId: number
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
  slot_bindings: string // JSON (legacy, kept for backward compat)
  settings: string | null // JSON (non-column-referencing settings only)
  created_by_plugin: string | null
}
