import { createMemo, type Accessor } from 'solid-js'

import { useQuery } from './useQuery'

/**
 * Reactive hook that fetches a single row from a matrix data table.
 *
 * Returns `null` while loading, `null` if the row doesn't exist,
 * or the row data as a record. The query re-runs reactively when
 * `matrixId` or `rowId` change, and when the underlying table is
 * updated via the SQLite update hook.
 */
export const useRowData = (
  matrixId: Accessor<number | null>,
  rowId: Accessor<number | null>,
): Accessor<Record<string, unknown> | null> => {
  const queryStr = createMemo(() => {
    const mid = matrixId()
    const rid = rowId()
    if (mid == null || rid == null) return ''
    return `SELECT * FROM "mx_${mid}_data" WHERE id = ${rid}`
  })

  const { result } = useQuery(() => queryStr())

  const row = createMemo(() => {
    const data = result()
    if (!data || data.length === 0) return null
    return data[0] as Record<string, unknown>
  })

  return row
}
