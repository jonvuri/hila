import { createMemo, For, JSX, Show } from 'solid-js'

import { CornerNotchBox } from '../CornerNotchBox'

import { computeTableDecorations, headerDotColor } from './data'
import styles from './Table.module.css'
import type { Column, FlatTableRow, TableProps, TableRowProps, TableTheme } from './types'

export type { TableProps, TableRowProps }
export type { Column, FlatTableRow, TableTheme, RowDecoration, CellDecoration } from './types'
export { computeTableDecorations } from './data'

/**
 * Returns the combined CSS class string for a table container.
 * Apply this to the `<table>` element that wraps `TableRow` instances
 * so that theme-scoped CSS rules take effect.
 */
export const tableThemeClass = (theme: TableTheme): string => {
  const map: Record<string, string> = {
    'thin-line': styles.themeThinLine,
    'corner-notch': styles.themeCornerNotch,
    'cell-dots': styles.themeCellDots,
  }
  return `${styles.table} ${map[theme] ?? ''}`
}

/* ============================================================
   TableHeaderRow — column header cells
   ============================================================ */

export const TableHeaderRow = (props: { theme: TableTheme; columns: Column[] }) => (
  <tr>
    <For each={props.columns}>
      {(col) => (
        <th>
          <Show when={props.theme === 'cell-dots'}>
            <span class={styles.cellDot} style={{ background: headerDotColor }} />
          </Show>
          {col.label}
        </th>
      )}
    </For>
  </tr>
)

/* ============================================================
   TableRow — primary row component
   ============================================================ */

export const TableRow = (props: TableRowProps) => {
  const renderCell = (col: Column, row: FlatTableRow): JSX.Element =>
    props.renderCell ? props.renderCell(col, row) : <>{row.cells[col.key] ?? ''}</>

  return (
    <tr>
      <For each={props.columns}>
        {(col, i) => (
          <td>
            <Show when={props.theme === 'cell-dots'}>
              <span
                class={styles.cellDot}
                style={{ background: props.decoration.cellDecorations[i()]?.dotColor }}
              />
            </Show>
            {renderCell(col, props.row)}
          </td>
        )}
      </For>
    </tr>
  )
}

/* ============================================================
   Table — convenience wrapper for non-virtualized use
   ============================================================ */

export const Table = (props: TableProps) => {
  const decorations = createMemo(() =>
    computeTableDecorations(props.theme, props.columns, props.rows),
  )

  const table = () => (
    <table class={tableThemeClass(props.theme)}>
      <thead>
        <TableHeaderRow theme={props.theme} columns={props.columns} />
      </thead>
      <tbody>
        <For each={props.rows}>
          {(row, i) => (
            <TableRow
              theme={props.theme}
              columns={props.columns}
              row={row}
              decoration={decorations()[i()]!}
              renderCell={props.renderCell}
            />
          )}
        </For>
      </tbody>
    </table>
  )

  return (
    <Show when={props.theme === 'corner-notch'} fallback={table()}>
      <CornerNotchBox>{table()}</CornerNotchBox>
    </Show>
  )
}
