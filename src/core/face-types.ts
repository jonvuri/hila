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

export type FaceRecipe = {
  faceTypeId: string
  slotBindings: Record<string, number | null> // slot name → column ID (null if unresolved)
  settings: Record<string, unknown> // non-column-referencing settings only
}

export type FaceConfig = FaceRecipe & {
  id: string
  matrixId: number
  createdByPlugin?: string | null
  sort: { columnId: number; direction: 'ASC' | 'DESC' } | null
  filters: { id?: string; columnId: number; operator: string; value: string; order?: number }[]
}

export type LooseSubject = {
  mode: 'loose'
  matrixId: number
  rowId: number
}

export type ContainerSubject = {
  mode: 'container'
  matrixId: number
  rowId: number
  extentMatrixId: number
}

export type ViewSubject = {
  mode: 'view'
  matrixId: number
  rowId: number
  sql: string
}

export type FaceSubject = LooseSubject | ContainerSubject | ViewSubject

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
  slot_bindings: string // JSON (legacy, kept for backward compat)
  settings: string | null // JSON (non-column-referencing settings only)
  created_by_plugin: string | null
}
