import type { ColumnDefinition } from '../core/matrix'
import { tagColorFromName } from '../tags/tag-color'

export const SKIPPED_PROPERTY_COLUMNS = new Set(['id'])

/** Conventional identity/label column names, used as a fallback for matrixes
 *  that predate explicit column roles (`role: 'label' | 'content'`). */
export const LABEL_LIKE_COLUMNS = new Set(['id', 'label', 'content', 'title', 'name'])

export const MAX_KEY_PROPERTY_FIELDS = 2

/** A column is "label-like" — an identity/label/content slot excluded from the
 *  property overflow and key-field previews — if it carries an explicit
 *  `label`/`content` role, or (fallback) matches a conventional label-like name.
 *  Explicit roles are authoritative; the name set only covers pre-role matrixes.
 *  This is the shared role logic the schema-adaptive row renderer builds on. */
export const isLabelLikeColumn = (col: ColumnDefinition): boolean =>
  col.role === 'label' || col.role === 'content' || LABEL_LIKE_COLUMNS.has(col.name)

export type AspectAttachment = {
  target_matrix_id: number
  target_row_id: number
  tag_type_name: string
}

export type AspectPreviewField = {
  name: string
  value: string
}

export type AspectPreview = {
  tagName: string
  color: string
  fields: AspectPreviewField[]
}

export const filterEditableColumns = (columns: ColumnDefinition[]): ColumnDefinition[] =>
  columns.filter((col) => !SKIPPED_PROPERTY_COLUMNS.has(col.name) && col.formula == null)

export const filterFormulaColumns = (columns: ColumnDefinition[]): ColumnDefinition[] =>
  columns.filter((col) => col.formula != null && !SKIPPED_PROPERTY_COLUMNS.has(col.name))

export const filterIntrinsicOverflowColumns = (
  columns: ColumnDefinition[],
): ColumnDefinition[] => columns.filter((col) => !isLabelLikeColumn(col) && col.formula == null)

export const getKeyPropertyColumns = (
  columns: ColumnDefinition[],
  max = MAX_KEY_PROPERTY_FIELDS,
): ColumnDefinition[] =>
  columns.filter((col) => !isLabelLikeColumn(col) && col.formula == null).slice(0, max)

export type PropertyColumnPartition = {
  /** The identity/label column rendered prominently (role `label`, else the
   *  first conventional label-like name), or null if the row has none. */
  label: ColumnDefinition | null
  /** Role-less, non-formula columns rendered as the editable field strip. */
  fields: ColumnDefinition[]
  /** Formula/derived columns rendered read-only. */
  formula: ColumnDefinition[]
}

/** Split a matrix's columns into the parts the schema-adaptive row renderer
 *  ([PropertyRow]) lays out: a prominent label, an editable field strip, and
 *  read-only formula columns. The shared partition keeps the renderer, the
 *  property overflow, and key-field previews consistent. */
export const partitionPropertyColumns = (
  columns: ColumnDefinition[],
): PropertyColumnPartition => ({
  label:
    columns.find((col) => col.role === 'label') ??
    columns.find((col) => isLabelLikeColumn(col) && !SKIPPED_PROPERTY_COLUMNS.has(col.name)) ??
    null,
  fields: filterIntrinsicOverflowColumns(columns),
  formula: filterFormulaColumns(columns),
})

export const buildAspectPreviewFields = (
  columns: ColumnDefinition[],
  row: Record<string, unknown> | null | undefined,
  max = MAX_KEY_PROPERTY_FIELDS,
): AspectPreviewField[] => {
  if (!row) return []
  const result: AspectPreviewField[] = []
  for (const col of getKeyPropertyColumns(columns, max)) {
    const val = row[col.name]
    if (val != null && val !== '') {
      result.push({ name: col.name, value: String(val) })
    }
  }
  return result
}

export const buildAspectPreview = (
  tagTypeName: string,
  columns: ColumnDefinition[],
  row: Record<string, unknown> | null | undefined,
): AspectPreview => ({
  tagName: tagTypeName,
  color: tagColorFromName(tagTypeName),
  fields: buildAspectPreviewFields(columns, row),
})
