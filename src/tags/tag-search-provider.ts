import type { AutocompleteOption, TriggerChar } from '../editor/inlineref-plugin'
import { execQuery } from '../core/client/sql-client'
import { getAllTagTypes, createTagType, createDependentRow } from '../core/client/matrix-client'

export type TagAutocompleteOption = AutocompleteOption & {
  matrixId: number
  color: string | null
}

export const searchTagTypes = async (query: string): Promise<TagAutocompleteOption[]> => {
  const tagTypes = await getAllTagTypes()
  const lower = query.toLowerCase()
  const filtered = tagTypes.filter((tt) => tt.name.toLowerCase().includes(lower))
  return filtered.map((tt) => ({
    id: tt.id,
    title: tt.name,
    matrixId: tt.matrixId,
    color: tt.color,
  }))
}

/**
 * Creates a search provider for the inlineref plugin that handles both
 * `@`/`[[` (row title search) and `#` (tag type search) triggers.
 */
export const createTagSearchProvider = (
  matrixId: number,
): ((trigger: TriggerChar, query: string) => Promise<AutocompleteOption[]>) => {
  const defaultSearch = async (query: string): Promise<AutocompleteOption[]> => {
    const escapedQuery = query.replace(/'/g, "''")
    const sql = `SELECT id, title FROM "mx_${matrixId}_data" WHERE title LIKE '%${escapedQuery}%' ORDER BY title LIMIT 20`
    const result = await execQuery(sql)
    return result.map((r) => ({ id: r.id as number, title: r.title as string }))
  }

  return async (trigger: TriggerChar, query: string): Promise<AutocompleteOption[]> => {
    if (trigger === '#') {
      return searchTagTypes(query)
    }
    return defaultSearch(query)
  }
}

/**
 * Handle selection of a tag from `#` autocomplete.
 * Creates the tag type if it doesn't exist, then creates the dependent
 * aspect row via `createDependentRow`.
 *
 * Returns the info needed to insert the inlineref node.
 */
export const handleTagSelection = async (
  option: AutocompleteOption | 'create',
  query: string,
  sourceMatrixId: number,
  sourceRowId: number,
): Promise<{
  targetMatrixId: number
  targetRowId: number
  cachedTitle: string
}> => {
  let tagMatrixId: number
  let tagName: string

  if (option === 'create') {
    const name = query.trim()
    const newTagType = await createTagType(name)
    tagMatrixId = newTagType.matrixId
    tagName = newTagType.name
  } else {
    const tagOption = option as TagAutocompleteOption
    tagMatrixId = tagOption.matrixId
    tagName = tagOption.title
  }

  const targetRowId = await createDependentRow(sourceMatrixId, sourceRowId, tagMatrixId)

  return {
    targetMatrixId: tagMatrixId,
    targetRowId,
    cachedTitle: tagName,
  }
}
