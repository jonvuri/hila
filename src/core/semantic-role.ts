export type SemanticColumnRole = 'label' | 'content'

export const assertSemanticRoleEligible = (
  column: { name: string; type: string; formula: string | null },
  role: SemanticColumnRole | null | undefined,
): void => {
  if (role == null) return
  if (column.formula !== null) {
    throw new Error(`Formula column "${column.name}" cannot have semantic role '${role}'`)
  }
  if (column.type.trim().toUpperCase() !== 'TEXT') {
    throw new Error(
      `Column "${column.name}" must use TEXT storage to have semantic role '${role}'`,
    )
  }
}
