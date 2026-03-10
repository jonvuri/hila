import type { FaceTypeDefinition, ResolvedSlotBinding, SlotBindingResult } from './face-types'

type Column = { name: string; type: string }

/**
 * Map from SQLite column types to the semantic slot preferred types they
 * can satisfy. A column can match multiple preferred types (e.g. TEXT can
 * match both 'text' and 'richtext').
 */
const SQLITE_TYPE_TO_PREFERRED: Record<string, string[]> = {
  TEXT: ['text', 'richtext', 'date', 'select'],
  INTEGER: ['number', 'boolean'],
  REAL: ['number'],
  NUMERIC: ['number'],
  BLOB: [],
}

const sqliteTypeMatchesPreferred = (sqliteType: string, preferredType: string): boolean => {
  const upper = sqliteType.toUpperCase()
  const matches = SQLITE_TYPE_TO_PREFERRED[upper]
  return matches !== undefined && matches.includes(preferredType)
}

/**
 * Resolve slot bindings for a face type against a set of columns.
 *
 * Resolution chain (per Plugins.md - Slot binding resolution):
 *   1. Explicit binding -- if explicitBindings[slotName] specifies a column, use it.
 *   2. Name match -- column name matches slot name (case-insensitive).
 *   3. Type + position -- first unbound column matching the slot's preferred type.
 *   4. Fallback -- first unbound column regardless of type.
 *
 * A face always renders something -- never refuses a matrix.
 */
export const resolveSlotBindings = (
  faceType: FaceTypeDefinition,
  columns: Column[],
  explicitBindings?: Record<string, string>,
): SlotBindingResult => {
  const boundColumnNames = new Set<string>()
  const bindings: ResolvedSlotBinding[] = []

  for (const slot of faceType.slots) {
    let binding: ResolvedSlotBinding | undefined

    // 1. Explicit binding
    const explicitColName = explicitBindings?.[slot.name]
    if (explicitColName !== undefined) {
      const col = columns.find((c) => c.name === explicitColName)
      if (col) {
        binding = {
          slotName: slot.name,
          columnName: col.name,
          columnType: col.type,
          resolution: 'explicit',
        }
      }
    }

    // 2. Name match (case-insensitive)
    if (!binding) {
      const col = columns.find(
        (c) =>
          c.name.toLowerCase() === slot.name.toLowerCase() && !boundColumnNames.has(c.name),
      )
      if (col) {
        binding = {
          slotName: slot.name,
          columnName: col.name,
          columnType: col.type,
          resolution: 'name-match',
        }
      }
    }

    // 3. Type + position (first unbound column matching preferred type)
    if (!binding) {
      const col = columns.find(
        (c) =>
          !boundColumnNames.has(c.name) &&
          sqliteTypeMatchesPreferred(c.type, slot.preferredType),
      )
      if (col) {
        binding = {
          slotName: slot.name,
          columnName: col.name,
          columnType: col.type,
          resolution: 'type-position',
        }
      }
    }

    // 4. Fallback (first unbound column regardless of type)
    if (!binding) {
      const col = columns.find((c) => !boundColumnNames.has(c.name))
      if (col) {
        binding = {
          slotName: slot.name,
          columnName: col.name,
          columnType: col.type,
          resolution: 'fallback',
        }
      }
    }

    if (binding) {
      boundColumnNames.add(binding.columnName)
      bindings.push(binding)
    }
  }

  const overflowColumns = columns
    .filter((c) => !boundColumnNames.has(c.name))
    .map((c) => ({ name: c.name, type: c.type }))

  return { bindings, overflowColumns }
}
