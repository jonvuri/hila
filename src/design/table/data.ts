import type { Column, FlatTableRow, RowDecoration, TableTheme } from './types'

/**
 * Computes per-row decoration data from a contiguous slice of table rows.
 * Theme-selective: only computes what the active theme needs.
 *
 * @param startIndex — global row index of `rows[0]`, used for odd/even parity
 *   in windowed rendering. Defaults to 0.
 */
export const computeTableDecorations = (
  theme: TableTheme,
  columns: ReadonlyArray<Column>,
  rows: ReadonlyArray<FlatTableRow>,
  startIndex = 0,
): RowDecoration[] => {
  const colCount = columns.length

  if (theme !== 'cell-dots') {
    const empty: RowDecoration = {
      cellDecorations: Array.from({ length: colCount }, () => ({})),
    }
    return rows.map(() => empty)
  }

  return rows.map((_, i) => {
    const globalIndex = startIndex + i
    const dotColor = globalIndex % 2 === 0 ? 'var(--c-fg-3)' : 'var(--c-fg-4)'
    return {
      cellDecorations: Array.from({ length: colCount }, () => ({ dotColor })),
    }
  })
}

export const headerDotColor = 'var(--c-fg)'
