import type { JSX } from 'solid-js'

export type TableTheme = 'thin-line' | 'corner-notch' | 'cell-dots'

export type Column = {
  key: string
  label: string
}

export type FlatTableRow = {
  id: string
  cells: Record<string, string>
}

export type CellDecoration = {
  dotColor?: string
}

export type RowDecoration = {
  cellDecorations: CellDecoration[]
}

export type TableRowProps = {
  theme: TableTheme
  columns: Column[]
  row: FlatTableRow
  decoration: RowDecoration
  renderCell?: (column: Column, row: FlatTableRow) => JSX.Element
}

export type TableProps = {
  columns: Column[]
  rows: FlatTableRow[]
  theme: TableTheme
  renderCell?: (column: Column, row: FlatTableRow) => JSX.Element
}
