import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
  type Component,
} from 'solid-js'
import { Portal } from 'solid-js/web'

import type { FaceComponentProps } from '../core/FaceRenderer'
import {
  updateRow,
  insertRow,
  deleteRow,
  addColumn,
  addFormulaColumn,
  removeColumn,
  renameColumn,
  updateColumnDisplayType,
  saveFaceConfig,
  reorderColumns,
  insertJoin,
  deleteJoin,
  deleteOwnedTarget,
} from '../core/client/matrix-client'
import { execQuery } from '../core/client/sql-client'
import { useQuery } from '../sql/useQuery'
import type { SqlResult } from '../sql/types'
import type { ColumnDefinition, JoinKind } from '../core/matrix'

import {
  buildTableQuery,
  type SortConfig,
  type FilterConfig,
  type FilterOperator,
  FILTER_OPERATORS,
} from './table-query'
import styles from './TableFace.module.css'

// -- Column type system -------------------------------------------------------

export type ColumnDisplayType = 'text' | 'number' | 'date' | 'boolean' | 'select' | 'reference'

const COLUMN_TYPES: {
  value: ColumnDisplayType
  label: string
  icon: string
  sqliteType: string
}[] = [
  { value: 'text', label: 'Text', icon: 'T', sqliteType: 'TEXT' },
  { value: 'number', label: 'Number', icon: '#', sqliteType: 'REAL' },
  { value: 'date', label: 'Date', icon: 'D', sqliteType: 'TEXT' },
  { value: 'boolean', label: 'Boolean', icon: '?', sqliteType: 'INTEGER' },
  { value: 'select', label: 'Select', icon: 'S', sqliteType: 'TEXT' },
  { value: 'reference', label: 'Reference', icon: '→', sqliteType: 'TEXT' },
]

export const getColumnTypeInfo = (displayType: string) =>
  COLUMN_TYPES.find((t) => t.value === displayType) ?? COLUMN_TYPES[0]!

// -- Reference cell value helpers ---------------------------------------------

export type ReferenceCellValue = {
  targetMatrixId: number
  targetRowId: number
  kind: JoinKind
}

export type ReferenceColumnConfig = {
  targetMatrixId: number
  defaultKind: JoinKind
}

const parseRefCellValue = (value: unknown): ReferenceCellValue | null => {
  if (value == null || value === '') return null
  try {
    const parsed = JSON.parse(String(value)) as ReferenceCellValue
    if (
      typeof parsed.targetMatrixId === 'number' &&
      typeof parsed.targetRowId === 'number' &&
      (parsed.kind === 'ref' || parsed.kind === 'own')
    ) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

const parseRefColumnConfig = (options: string | null): ReferenceColumnConfig | null => {
  if (!options) return null
  try {
    const parsed = JSON.parse(options) as ReferenceColumnConfig
    if (typeof parsed.targetMatrixId === 'number') {
      return { targetMatrixId: parsed.targetMatrixId, defaultKind: parsed.defaultKind ?? 'ref' }
    }
    return null
  } catch {
    return null
  }
}

const canCoerce = (value: unknown, targetType: ColumnDisplayType): boolean => {
  if (value === null || value === undefined || value === '') return true
  const s = String(value)
  switch (targetType) {
    case 'number':
      return !isNaN(Number(s))
    case 'boolean':
      return s === '0' || s === '1' || s === 'true' || s === 'false'
    case 'date':
      return !isNaN(Date.parse(s))
    default:
      return true
  }
}

const formatValue = (value: unknown, displayType: string): string => {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (displayType === 'date' && s) {
    const d = new Date(s)
    return isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { timeZone: 'UTC' })
  }
  if (displayType === 'boolean') {
    return s === '1' || s === 'true' ? 'true' : 'false'
  }
  return s
}

// -- Component ----------------------------------------------------------------

type CellAddress = { row: number; col: number }

const TableFace: Component<FaceComponentProps> = (props) => {
  const matrixId = () => props.config.matrixId

  // -- Settings from face config -------
  const settingsSort = (): SortConfig | null => {
    const s = props.config.settings as { sort?: SortConfig }
    return s.sort ?? null
  }
  const settingsFilters = (): FilterConfig[] => {
    const s = props.config.settings as { filters?: FilterConfig[] }
    return s.filters ?? []
  }

  const [sort, setSort] = createSignal<SortConfig | null>(settingsSort())
  const [filters, setFilters] = createSignal<FilterConfig[]>(settingsFilters())

  // -- Reactive queries -------
  const columnsQuery = () =>
    `SELECT id, name, type, display_type AS displayType, "order", options, formula FROM matrix_columns WHERE matrix_id = ${matrixId()} ORDER BY "order"`
  const { result: columnsResult } = useQuery(columnsQuery)

  const columns = createMemo<ColumnDefinition[]>(() => {
    const r = columnsResult()
    if (!r) return []
    return r as unknown as ColumnDefinition[]
  })

  const dataQuery = () => {
    const cols = columns()
    const colNames = new Set(cols.map((c) => c.name))
    const validSort = sort() && colNames.has(sort()!.column) ? sort() : null
    const validFilters = filters().filter((f) => colNames.has(f.column))
    return buildTableQuery(matrixId(), validSort, validFilters, cols)
  }
  const { result: dataResult } = useQuery(dataQuery)

  const rows = createMemo<SqlResult>(() => dataResult() ?? [])

  // -- Selection and editing state -------
  const [selectedCell, setSelectedCell] = createSignal<CellAddress | null>(null)
  const [editingCell, setEditingCell] = createSignal<CellAddress | null>(null)
  const [editValue, setEditValue] = createSignal<string>('')
  const [renamingCol, setRenamingCol] = createSignal<string | null>(null)
  const [renameValue, setRenameValue] = createSignal<string>('')
  const [contextMenu, setContextMenu] = createSignal<{
    x: number
    y: number
    column: ColumnDefinition
  } | null>(null)
  const [addingFilter, setAddingFilter] = createSignal(false)
  const [showTypePicker, setShowTypePicker] = createSignal(false)
  const [showFormulaDialog, setShowFormulaDialog] = createSignal(false)
  const [formulaName, setFormulaName] = createSignal('')
  const [formulaExpr, setFormulaExpr] = createSignal('')
  const [formulaError, setFormulaError] = createSignal<string | null>(null)
  const [showRefColumnDialog, setShowRefColumnDialog] = createSignal(false)

  const matricesQuery = () =>
    showRefColumnDialog() ? 'SELECT id, title FROM matrix ORDER BY title' : ''
  const { result: matricesResult } = useQuery(matricesQuery)

  // -- Column drag reorder state -------
  const [dragCol, setDragCol] = createSignal<string | null>(null)
  const [dropTarget, setDropTarget] = createSignal<string | null>(null)

  // -- Persist settings -------
  const persistSettings = async (newSort: SortConfig | null, newFilters: FilterConfig[]) => {
    const updated = {
      ...props.config,
      settings: {
        ...props.config.settings,
        sort: newSort ?? undefined,
        filters: newFilters.length > 0 ? newFilters : undefined,
      },
    }
    await saveFaceConfig(updated)
  }

  // -- Sort/filter actions -------
  const toggleSort = async (columnName: string) => {
    const current = sort()
    let next: SortConfig | null
    if (current?.column === columnName) {
      next = current.direction === 'ASC' ? { column: columnName, direction: 'DESC' } : null
    } else {
      next = { column: columnName, direction: 'ASC' }
    }
    setSort(next)
    await persistSettings(next, filters())
  }

  const addFilter = async (f: FilterConfig) => {
    const next = [...filters(), f]
    setFilters(next)
    setAddingFilter(false)
    await persistSettings(sort(), next)
  }

  const removeFilter = async (index: number) => {
    const next = filters().filter((_, i) => i !== index)
    setFilters(next)
    await persistSettings(sort(), next)
  }

  // -- Cell editing -------
  const startEditing = (row: number, col: number) => {
    const colDef = columns()[col]
    const rowData = rows()[row]
    if (!colDef || !rowData) return
    if (colDef.formula !== null) return
    if (colDef.displayType === 'reference') return

    const rawValue = rowData[colDef.name]
    setEditValue(rawValue === null || rawValue === undefined ? '' : String(rawValue))
    setEditingCell({ row, col })
  }

  const commitEdit = async () => {
    const cell = editingCell()
    if (!cell) return

    const colDef = columns()[cell.col]
    const rowData = rows()[cell.row]
    if (!colDef || !rowData) return

    const rowId = rowData['id'] as number
    const value = editValue()

    let coerced: unknown = value
    if (colDef.displayType === 'number' && value !== '') {
      coerced = Number(value)
    } else if (colDef.displayType === 'boolean') {
      coerced = value === 'true' || value === '1' ? 1 : 0
    } else if (value === '') {
      coerced = null
    }

    setEditingCell(null)
    await updateRow(matrixId(), rowId, { [colDef.name]: coerced })
  }

  const cancelEdit = () => {
    setEditingCell(null)
  }

  const handleTabFromCell = async (row: number, col: number, shift: boolean) => {
    await commitEdit()
    const colCount = columns().length
    const rowCount = rows().length
    const next =
      shift ?
        col > 0 ? { row, col: col - 1 }
        : row > 0 ? { row: row - 1, col: colCount - 1 }
        : { row, col }
      : col < colCount - 1 ? { row, col: col + 1 }
      : row < rowCount - 1 ? { row: row + 1, col: 0 }
      : { row, col }
    setSelectedCell(next)
  }

  const handleBooleanToggle = async (row: number, col: number) => {
    const colDef = columns()[col]
    const rowData = rows()[row]
    if (!colDef || !rowData) return
    const rowId = rowData['id'] as number
    const current = rowData[colDef.name]
    const next = current === 1 || current === 'true' ? 0 : 1
    await updateRow(matrixId(), rowId, { [colDef.name]: next })
  }

  // -- Row operations -------
  const addRow = async () => {
    await insertRow(matrixId())
  }

  const deleteSelectedRow = async () => {
    const sel = selectedCell()
    if (!sel) return
    const rowData = rows()[sel.row]
    if (!rowData) return

    const rowId = rowData['id'] as number
    await deleteRow(matrixId(), rowId)
  }

  // -- Column operations -------
  const handleAddColumn = async (displayType: ColumnDisplayType) => {
    setShowTypePicker(false)
    if (displayType === 'reference') {
      setShowRefColumnDialog(true)
      return
    }
    const colInfo = COLUMN_TYPES.find((t) => t.value === displayType)!
    const existingNames = new Set(columns().map((c) => c.name))
    let name = 'New Column'
    let i = 1
    while (existingNames.has(name)) {
      name = `New Column ${i++}`
    }
    await addColumn(matrixId(), name, colInfo.sqliteType, displayType)
  }

  const handleAddRefColumn = async (targetMatrixId: number) => {
    setShowRefColumnDialog(false)
    const existingNames = new Set(columns().map((c) => c.name))
    let name = 'Reference'
    let i = 1
    while (existingNames.has(name)) {
      name = `Reference ${i++}`
    }
    const options = JSON.stringify({ targetMatrixId, defaultKind: 'ref' })
    await addColumn(matrixId(), name, 'TEXT', 'reference', options)
  }

  const handleSetReference = async (
    rowId: number,
    colDef: ColumnDefinition,
    oldValue: unknown,
    newRef: ReferenceCellValue | null,
  ) => {
    const oldRef = parseRefCellValue(oldValue)

    if (oldRef) {
      await deleteJoin(matrixId(), rowId, oldRef.targetMatrixId, oldRef.targetRowId)
      if (oldRef.kind === 'own') {
        await deleteOwnedTarget(oldRef.targetMatrixId, oldRef.targetRowId)
      }
    }

    if (newRef) {
      await insertJoin(
        matrixId(),
        rowId,
        newRef.targetMatrixId,
        newRef.targetRowId,
        newRef.kind,
      )
      await updateRow(matrixId(), rowId, { [colDef.name]: JSON.stringify(newRef) })
    } else {
      await updateRow(matrixId(), rowId, { [colDef.name]: null })
    }
  }

  const handleAddFormulaColumn = async () => {
    const name = formulaName().trim()
    const formula = formulaExpr().trim()
    if (!name || !formula) return

    try {
      await addFormulaColumn(matrixId(), name, formula)
      setShowFormulaDialog(false)
      setFormulaName('')
      setFormulaExpr('')
      setFormulaError(null)
    } catch (err) {
      setFormulaError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleRemoveColumn = async (columnName: string) => {
    setContextMenu(null)
    if (sort()?.column === columnName) {
      setSort(null)
    }
    const updatedFilters = filters().filter((f) => f.column !== columnName)
    setFilters(updatedFilters)

    await removeColumn(matrixId(), columnName)
    await persistSettings(sort(), updatedFilters)
  }

  const handleRenameColumn = async (oldName: string) => {
    if (renamingCol() === null) return
    const newName = renameValue().trim()
    setRenamingCol(null)
    if (!newName || newName === oldName) return

    await renameColumn(matrixId(), oldName, newName)

    if (sort()?.column === oldName) {
      setSort({ ...sort()!, column: newName })
    }
    const updatedFilters = filters().map((f) =>
      f.column === oldName ? { ...f, column: newName } : f,
    )
    setFilters(updatedFilters)
    await persistSettings(sort(), updatedFilters)
  }

  const handleChangeType = async (columnName: string, newType: ColumnDisplayType) => {
    setContextMenu(null)
    await updateColumnDisplayType(matrixId(), columnName, newType)
  }

  const startRenameColumn = (col: ColumnDefinition) => {
    setContextMenu(null)
    setRenamingCol(col.name)
    setRenameValue(col.name)
  }

  // -- Column drag reorder -------
  const handleColumnDragStart = (columnName: string, e: DragEvent) => {
    setDragCol(columnName)
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
    }
  }

  const handleColumnDragOver = (columnName: string, e: DragEvent) => {
    e.preventDefault()
    if (dragCol() && dragCol() !== columnName) {
      setDropTarget(columnName)
    }
  }

  const handleColumnDragEnd = async () => {
    const from = dragCol()
    const to = dropTarget()
    setDragCol(null)
    setDropTarget(null)

    if (!from || !to || from === to) return

    const names = columns().map((c) => c.name)
    const fromIdx = names.indexOf(from)
    const toIdx = names.indexOf(to)
    if (fromIdx === -1 || toIdx === -1) return

    const reordered = [...names]
    reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, from)
    await reorderColumns(matrixId(), reordered)
  }

  // -- Keyboard navigation -------
  const handleKeyDown = (e: KeyboardEvent) => {
    if (editingCell()) return
    if (renamingCol()) return
    if (addingFilter()) return

    const sel = selectedCell()
    if (!sel) return

    const colCount = columns().length
    const rowCount = rows().length

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        if (sel.row > 0) setSelectedCell({ row: sel.row - 1, col: sel.col })
        break
      case 'ArrowDown':
        e.preventDefault()
        if (sel.row < rowCount - 1) setSelectedCell({ row: sel.row + 1, col: sel.col })
        break
      case 'ArrowLeft':
        e.preventDefault()
        if (sel.col > 0) setSelectedCell({ row: sel.row, col: sel.col - 1 })
        break
      case 'ArrowRight':
        e.preventDefault()
        if (sel.col < colCount - 1) setSelectedCell({ row: sel.row, col: sel.col + 1 })
        break
      case 'Enter':
        e.preventDefault()
        startEditing(sel.row, sel.col)
        break
      case 'Tab': {
        e.preventDefault()
        const next =
          e.shiftKey ?
            sel.col > 0 ? { row: sel.row, col: sel.col - 1 }
            : sel.row > 0 ? { row: sel.row - 1, col: colCount - 1 }
            : sel
          : sel.col < colCount - 1 ? { row: sel.row, col: sel.col + 1 }
          : sel.row < rowCount - 1 ? { row: sel.row + 1, col: 0 }
          : sel
        setSelectedCell(next)
        break
      }
      case 'Delete':
      case 'Backspace':
        void deleteSelectedRow()
        break
      default:
        // Start editing if a printable character is typed
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const colDef = columns()[sel.col]
          if (
            colDef &&
            colDef.displayType !== 'boolean' &&
            colDef.displayType !== 'reference' &&
            colDef.formula === null
          ) {
            setEditValue(e.key)
            setEditingCell({ row: sel.row, col: sel.col })
            e.preventDefault()
          }
        }
    }
  }

  let tableRef: HTMLDivElement | undefined

  createEffect(() => {
    const el = tableRef
    if (!el) return
    el.addEventListener('keydown', handleKeyDown)
    onCleanup(() => el.removeEventListener('keydown', handleKeyDown))
  })

  // Close context menu on outside click
  createEffect(() => {
    if (contextMenu()) {
      const handleClick = () => setContextMenu(null)
      document.addEventListener('click', handleClick)
      onCleanup(() => document.removeEventListener('click', handleClick))
    }
  })

  // Close type picker on outside click
  createEffect(() => {
    if (showTypePicker()) {
      const handleClick = () => setShowTypePicker(false)
      setTimeout(() => document.addEventListener('click', handleClick))
      onCleanup(() => document.removeEventListener('click', handleClick))
    }
  })

  // Close formula dialog on outside click
  createEffect(() => {
    if (showFormulaDialog()) {
      const handleClick = () => {
        setShowFormulaDialog(false)
        setFormulaError(null)
      }
      setTimeout(() => document.addEventListener('click', handleClick))
      onCleanup(() => document.removeEventListener('click', handleClick))
    }
  })

  // Close reference column dialog on outside click
  createEffect(() => {
    if (showRefColumnDialog()) {
      const handleClick = () => setShowRefColumnDialog(false)
      setTimeout(() => document.addEventListener('click', handleClick))
      onCleanup(() => document.removeEventListener('click', handleClick))
    }
  })

  // -- Render helpers -------
  const isSelected = (row: number, col: number) => {
    const s = selectedCell()
    return s?.row === row && s?.col === col
  }

  const isEditing = (row: number, col: number) => {
    const e = editingCell()
    return e?.row === row && e?.col === col
  }

  return (
    <div class={styles.tableFace} ref={tableRef} tabindex="-1">
      {/* Toolbar / filter bar */}
      <div class={styles.toolbar}>
        <For each={filters()}>
          {(f, i) => (
            <span class={styles.filterTag}>
              {f.column} {f.operator} {f.value}
              <button onClick={() => void removeFilter(i())} aria-label="Remove filter">
                ×
              </button>
            </span>
          )}
        </For>
        <div style={{ position: 'relative' }}>
          <button class={styles.addFilterBtn} onClick={() => setAddingFilter(!addingFilter())}>
            + Filter
          </button>
          <Show when={addingFilter()}>
            <FilterPopover
              columns={columns()}
              defaultColumn={columns()[0]?.name ?? ''}
              onAdd={(f) => void addFilter(f)}
              onClose={() => setAddingFilter(false)}
            />
          </Show>
        </div>
      </div>

      {/* Table */}
      <div class={styles.tableContainer}>
        <table class={styles.table}>
          <thead>
            <tr>
              <th class={styles.thRowId}>#</th>
              <For each={columns()}>
                {(col) => (
                  <th
                    class={styles.th}
                    classList={{
                      [styles.dragging!]: dragCol() === col.name,
                      [styles.dropTarget!]: dropTarget() === col.name,
                      [styles.thFormula!]: col.formula !== null,
                    }}
                    draggable={renamingCol() !== col.name}
                    onDragStart={(e) => handleColumnDragStart(col.name, e)}
                    onDragOver={(e) => handleColumnDragOver(col.name, e)}
                    onDragEnd={() => void handleColumnDragEnd()}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setContextMenu({ x: e.clientX, y: e.clientY, column: col })
                    }}
                  >
                    <Show
                      when={renamingCol() !== col.name}
                      fallback={
                        <input
                          class={styles.thInput}
                          value={renameValue()}
                          onInput={(e) => setRenameValue(e.currentTarget.value)}
                          onBlur={() => void handleRenameColumn(col.name)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleRenameColumn(col.name)
                            if (e.key === 'Escape') setRenamingCol(null)
                          }}
                          ref={(el) => setTimeout(() => el.focus())}
                        />
                      }
                    >
                      <div
                        class={styles.thContent}
                        onClick={() => void toggleSort(col.name)}
                        onDblClick={() => startRenameColumn(col)}
                      >
                        <span>{col.name}</span>
                        <Show when={col.formula !== null}>
                          <span class={styles.formulaIcon} title={`Formula: ${col.formula}`}>
                            fx
                          </span>
                        </Show>
                        <span class={styles.typeLabel}>
                          {col.formula !== null ? 'formula' : col.displayType}
                        </span>
                        <Show when={sort()?.column === col.name}>
                          <span class={styles.sortIndicator}>
                            {sort()?.direction === 'ASC' ? '▲' : '▼'}
                          </span>
                        </Show>
                      </div>
                    </Show>
                  </th>
                )}
              </For>
              <th class={styles.thAddColumn}>
                <div style={{ position: 'relative' }}>
                  <button
                    class={styles.addColumnBtn}
                    onClick={() => setShowTypePicker(!showTypePicker())}
                    title="Add column"
                  >
                    +
                  </button>
                  <Show when={showTypePicker()}>
                    <div class={styles.typePicker}>
                      <For each={COLUMN_TYPES}>
                        {(t) => (
                          <button
                            class={styles.typePickerItem}
                            onClick={() => void handleAddColumn(t.value)}
                          >
                            <span class={styles.typePickerIcon}>{t.icon}</span>
                            <span>{t.label}</span>
                          </button>
                        )}
                      </For>
                      <button
                        class={styles.typePickerItem}
                        onClick={() => {
                          setShowTypePicker(false)
                          setShowFormulaDialog(true)
                          setFormulaError(null)
                        }}
                      >
                        <span class={styles.typePickerIcon}>fx</span>
                        <span>Formula</span>
                      </button>
                    </div>
                  </Show>
                  <Show when={showFormulaDialog()}>
                    <FormulaDialog
                      error={formulaError()}
                      name={formulaName()}
                      expr={formulaExpr()}
                      onNameInput={setFormulaName}
                      onExprInput={setFormulaExpr}
                      onAdd={() => void handleAddFormulaColumn()}
                      onClose={() => {
                        setShowFormulaDialog(false)
                        setFormulaError(null)
                      }}
                    />
                  </Show>
                  <Show when={showRefColumnDialog()}>
                    <ReferenceColumnDialog
                      matrices={(matricesResult() ?? []) as { id: number; title: string }[]}
                      onAdd={(targetMatrixId) => void handleAddRefColumn(targetMatrixId)}
                      onClose={() => setShowRefColumnDialog(false)}
                    />
                  </Show>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <For each={rows()}>
              {(row, rowIdx) => (
                <tr>
                  <td class={styles.rowIdCell}>{rowIdx() + 1}</td>
                  <For each={columns()}>
                    {(col, colIdx) => {
                      const value = () => row[col.name]
                      const editing = () => isEditing(rowIdx(), colIdx())
                      const selected = () => isSelected(rowIdx(), colIdx())
                      const isFormula = col.formula !== null

                      return (
                        <td class={styles.td}>
                          <Show
                            when={col.displayType !== 'reference'}
                            fallback={
                              <ReferenceCellDisplay
                                value={value()}
                                options={col.options}
                                selected={selected()}
                                matrixId={matrixId()}
                                rowId={row['id'] as number}
                                colDef={col}
                                onClick={() =>
                                  setSelectedCell({ row: rowIdx(), col: colIdx() })
                                }
                                onSetReference={(ref) =>
                                  void handleSetReference(
                                    row['id'] as number,
                                    col,
                                    value(),
                                    ref,
                                  )
                                }
                              />
                            }
                          >
                            <Show
                              when={editing() && !isFormula}
                              fallback={
                                <CellDisplay
                                  value={value()}
                                  displayType={col.displayType}
                                  options={col.options}
                                  selected={selected()}
                                  isFormula={isFormula}
                                  onClick={() =>
                                    setSelectedCell({ row: rowIdx(), col: colIdx() })
                                  }
                                  onDblClick={() => {
                                    if (isFormula) return
                                    if (col.displayType === 'boolean') {
                                      void handleBooleanToggle(rowIdx(), colIdx())
                                    } else {
                                      startEditing(rowIdx(), colIdx())
                                    }
                                  }}
                                  onBooleanToggle={() =>
                                    void handleBooleanToggle(rowIdx(), colIdx())
                                  }
                                />
                              }
                            >
                              <CellEditor
                                value={editValue()}
                                displayType={col.displayType}
                                options={col.options}
                                onInput={(v) => setEditValue(v)}
                                onCommit={() => void commitEdit()}
                                onCancel={cancelEdit}
                                onTab={(shift) => {
                                  void handleTabFromCell(rowIdx(), colIdx(), shift)
                                }}
                              />
                            </Show>
                          </Show>
                        </td>
                      )
                    }}
                  </For>
                  <td />
                </tr>
              )}
            </For>
            <tr class={styles.addRowTr}>
              <td colspan={columns().length + 2}>
                <button class={styles.addRowBtn} onClick={() => void addRow()}>
                  + New Row
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Context menu */}
      <Show when={contextMenu()}>
        {(menu) => (
          <div
            class={styles.contextMenu}
            style={{ top: `${menu().y}px`, left: `${menu().x}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              class={styles.contextMenuItem}
              onClick={() => startRenameColumn(menu().column)}
            >
              Rename
            </button>
            <div class={styles.contextMenuSub}>
              <div style={{ 'font-size': '11px', color: '#999', padding: '2px 0' }}>Type</div>
              <For each={COLUMN_TYPES}>
                {(t) => (
                  <label>
                    <input
                      type="radio"
                      name="col-type"
                      checked={menu().column.displayType === t.value}
                      onChange={() => void handleChangeType(menu().column.name, t.value)}
                    />
                    {t.label}
                  </label>
                )}
              </For>
            </div>
            <button
              class={`${styles.contextMenuItem} ${styles.contextMenuDanger}`}
              onClick={() => void handleRemoveColumn(menu().column.name)}
            >
              Delete Column
            </button>
          </div>
        )}
      </Show>
    </div>
  )
}

// -- Sub-components -----------------------------------------------------------

const CellDisplay: Component<{
  value: unknown
  displayType: string
  options: string | null
  selected: boolean
  isFormula?: boolean
  onClick: () => void
  onDblClick: () => void
  onBooleanToggle: () => void
}> = (props) => {
  const displayType = () => props.displayType as ColumnDisplayType

  return (
    <div
      class={styles.cell}
      classList={{
        [styles.cellSelected!]: props.selected,
        [styles.cellNumber!]: displayType() === 'number',
        [styles.cellBoolean!]: displayType() === 'boolean',
        [styles.cellDate!]: displayType() === 'date',
        [styles.cellSelect!]: displayType() === 'select',
        [styles.cellFormula!]: !!props.isFormula,
      }}
      onClick={() => props.onClick()}
      onDblClick={() => props.onDblClick()}
    >
      <Show
        when={canCoerce(props.value, displayType())}
        fallback={<span class={styles.coercionError}>{String(props.value ?? '')}</span>}
      >
        <Show
          when={displayType() !== 'boolean'}
          fallback={
            <input
              type="checkbox"
              checked={props.value === 1 || props.value === 'true'}
              onChange={() => props.onBooleanToggle()}
            />
          }
        >
          <Show
            when={displayType() !== 'select'}
            fallback={
              <Show when={props.value != null && String(props.value) !== ''}>
                <span class={styles.badge}>{String(props.value)}</span>
              </Show>
            }
          >
            {formatValue(props.value, props.displayType)}
          </Show>
        </Show>
      </Show>
    </div>
  )
}

const CellEditor: Component<{
  value: string
  displayType: string
  options: string | null
  onInput: (v: string) => void
  onCommit: () => void
  onCancel: () => void
  onTab: (shift: boolean) => void
}> = (props) => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      props.onCommit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      props.onCancel()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      props.onTab(e.shiftKey)
    }
  }

  return (
    <div class={`${styles.cell} ${styles.cellEditing}`}>
      <Show
        when={props.displayType !== 'select' || !props.options}
        fallback={
          <select
            value={props.value}
            onChange={(e) => {
              props.onInput(e.currentTarget.value)
              props.onCommit()
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => props.onCommit()}
            ref={(el) => setTimeout(() => el.focus())}
          >
            <option value="">—</option>
            <For each={parseOptions(props.options)}>
              {(opt) => <option value={opt}>{opt}</option>}
            </For>
          </select>
        }
      >
        <input
          type={
            props.displayType === 'number' ? 'number'
            : props.displayType === 'date' ?
              'date'
            : 'text'
          }
          value={props.value}
          onInput={(e) => props.onInput(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => props.onCommit()}
          ref={(el) => setTimeout(() => el.focus())}
        />
      </Show>
    </div>
  )
}

const parseOptions = (optionsJson: string | null): string[] => {
  if (!optionsJson) return []
  try {
    const parsed = JSON.parse(optionsJson) as string[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const FormulaDialog: Component<{
  error: string | null
  name: string
  expr: string
  onNameInput: (v: string) => void
  onExprInput: (v: string) => void
  onAdd: () => void
  onClose: () => void
}> = (props) => (
  <div class={styles.filterPopover} onClick={(e) => e.stopPropagation()}>
    <input
      type="text"
      value={props.name}
      onInput={(e) => props.onNameInput(e.currentTarget.value)}
      placeholder="Column name"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && props.name && props.expr) props.onAdd()
        if (e.key === 'Escape') props.onClose()
      }}
      ref={(el) => setTimeout(() => el.focus())}
    />
    <input
      type="text"
      value={props.expr}
      onInput={(e) => props.onExprInput(e.currentTarget.value)}
      placeholder="SQL expression, e.g. length(title)"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && props.name && props.expr) props.onAdd()
        if (e.key === 'Escape') props.onClose()
      }}
      style={{ 'min-width': '200px' }}
    />
    <button style={{ background: '#2563eb', color: '#fff' }} onClick={() => props.onAdd()}>
      Add
    </button>
    <button style={{ background: '#f0f0f0', color: '#333' }} onClick={() => props.onClose()}>
      Cancel
    </button>
    <Show when={props.error}>
      <span style={{ color: '#dc2626', 'font-size': '11px' }}>{props.error}</span>
    </Show>
  </div>
)

const FilterPopover: Component<{
  columns: ColumnDefinition[]
  defaultColumn: string
  onAdd: (f: FilterConfig) => void
  onClose: () => void
}> = (props) => {
  const [column, setColumn] = createSignal(props.defaultColumn)
  const [operator, setOperator] = createSignal<FilterOperator>('=')
  const [value, setValue] = createSignal('')

  return (
    <div class={styles.filterPopover} onClick={(e) => e.stopPropagation()}>
      <select value={column()} onChange={(e) => setColumn(e.currentTarget.value)}>
        <For each={props.columns}>{(c) => <option value={c.name}>{c.name}</option>}</For>
      </select>
      <select
        value={operator()}
        onChange={(e) => setOperator(e.currentTarget.value as FilterOperator)}
      >
        <For each={FILTER_OPERATORS}>
          {(op) => <option value={op.value}>{op.label}</option>}
        </For>
      </select>
      <input
        type="text"
        value={value()}
        onInput={(e) => setValue(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && column()) {
            props.onAdd({ column: column(), operator: operator(), value: value() })
          }
          if (e.key === 'Escape') props.onClose()
        }}
        placeholder="value"
        ref={(el) => setTimeout(() => el.focus())}
      />
      <button
        style={{ background: '#2563eb', color: '#fff' }}
        onClick={() => {
          if (column()) props.onAdd({ column: column(), operator: operator(), value: value() })
        }}
      >
        Add
      </button>
      <button style={{ background: '#f0f0f0', color: '#333' }} onClick={() => props.onClose()}>
        Cancel
      </button>
    </div>
  )
}

// -- Reference cell components ------------------------------------------------

const ReferenceCellDisplay: Component<{
  value: unknown
  options: string | null
  selected: boolean
  matrixId: number
  rowId: number
  colDef: ColumnDefinition
  onClick: () => void
  onSetReference: (ref: ReferenceCellValue | null) => void
}> = (props) => {
  const ref = createMemo(() => parseRefCellValue(props.value))
  const config = createMemo(() => parseRefColumnConfig(props.options))

  const titleQuery = createMemo(() => {
    const r = ref()
    if (!r) return ''
    return `SELECT title FROM "mx_${r.targetMatrixId}_data" WHERE id = ${r.targetRowId}`
  })
  const { result: titleResult } = useQuery(() => titleQuery())

  const resolvedTitle = createMemo(() => {
    const data = titleResult()
    if (!data || data.length === 0) return null
    return (data[0] as { title: string }).title
  })

  const isGhost = createMemo(
    () => ref() !== null && titleResult() !== null && titleResult()!.length === 0,
  )

  const displayTitle = createMemo(() => {
    if (!ref()) return null
    if (isGhost()) return '(deleted)'
    return resolvedTitle() || 'Untitled'
  })

  const [showSearch, setShowSearch] = createSignal(false)
  const [dropdownPos, setDropdownPos] = createSignal<{ top: number; left: number } | null>(null)
  let cellRef: HTMLDivElement | undefined

  const openSearch = () => {
    if (cellRef) {
      const rect = cellRef.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 2, left: rect.left })
    }
    setShowSearch(true)
  }

  const handleClear = (e: MouseEvent) => {
    e.stopPropagation()
    props.onSetReference(null)
  }

  return (
    <div
      class={styles.cell}
      classList={{
        [styles.cellSelected!]: props.selected,
        [styles.cellReference!]: true,
      }}
      ref={cellRef}
      onClick={() => props.onClick()}
      onDblClick={openSearch}
    >
      <Show
        when={ref()}
        fallback={
          <span class={styles.refEmpty} onClick={openSearch}>
            Empty
          </span>
        }
      >
        <span class={styles.refBadge} classList={{ [styles.refGhost!]: isGhost() }}>
          {displayTitle()}
        </span>
        <button class={styles.refClearBtn} onClick={handleClear} aria-label="Clear reference">
          ×
        </button>
      </Show>
      <Show when={showSearch() && dropdownPos()}>
        <Portal>
          <ReferenceSearchDropdown
            targetMatrixId={config()?.targetMatrixId ?? null}
            defaultKind={config()?.defaultKind ?? 'ref'}
            position={dropdownPos()!}
            onSelect={(selected) => {
              setShowSearch(false)
              props.onSetReference(selected)
            }}
            onClose={() => setShowSearch(false)}
          />
        </Portal>
      </Show>
    </div>
  )
}

const ReferenceSearchDropdown: Component<{
  targetMatrixId: number | null
  defaultKind: JoinKind
  position: { top: number; left: number }
  onSelect: (ref: ReferenceCellValue) => void
  onClose: () => void
}> = (props) => {
  const [query, setQuery] = createSignal('')
  const [results, setResults] = createSignal<{ id: number; title: string; matrixId: number }[]>(
    [],
  )
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  let fetchVersion = 0

  const fetchResults = async (q: string) => {
    const version = ++fetchVersion
    const escapedQuery = q.replace(/'/g, "''")
    const targetMid = props.targetMatrixId
    let sql: string

    if (targetMid != null) {
      sql = `SELECT id, title FROM "mx_${targetMid}_data" WHERE title LIKE '%${escapedQuery}%' ORDER BY title LIMIT 20`
    } else {
      sql = `SELECT m.id AS matrixId, m.title AS matrixTitle FROM matrix m ORDER BY m.title`
    }

    try {
      const result = await execQuery(sql)
      if (version !== fetchVersion) return
      if (targetMid != null) {
        setResults(
          result.map((r) => ({
            id: r.id as number,
            title: (r.title as string) || 'Untitled',
            matrixId: targetMid,
          })),
        )
      } else {
        setResults(
          result.map((r) => ({
            id: r.id as number,
            title: `${r.matrixTitle as string} #${r.id as number}`,
            matrixId: r.matrixId as number,
          })),
        )
      }
      setSelectedIndex(0)
    } catch {
      setResults([])
    }
  }

  createEffect(() => {
    void fetchResults(query())
  })

  createEffect(() => {
    const handleClickOutside = () => props.onClose()
    setTimeout(() => document.addEventListener('mousedown', handleClickOutside))
    onCleanup(() => document.removeEventListener('mousedown', handleClickOutside))
  })

  const handleKeyDown = (e: KeyboardEvent) => {
    const items = results()
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((i) => (i + 1) % Math.max(items.length, 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((i) => (i - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1))
        break
      case 'Enter':
        e.preventDefault()
        if (items[selectedIndex()]) {
          const item = items[selectedIndex()]!
          props.onSelect({
            targetMatrixId: item.matrixId,
            targetRowId: item.id,
            kind: props.defaultKind,
          })
        }
        break
      case 'Escape':
        e.preventDefault()
        props.onClose()
        break
    }
  }

  return (
    <div
      class={styles.refSearchDropdown}
      style={{
        position: 'fixed',
        top: `${props.position.top}px`,
        left: `${props.position.left}px`,
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        class={styles.refSearchInput}
        type="text"
        value={query()}
        onInput={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search rows…"
        ref={(el) => setTimeout(() => el.focus())}
      />
      <div class={styles.refSearchResults}>
        <For each={results()}>
          {(item, i) => (
            <div
              class={styles.refSearchItem}
              classList={{ [styles.refSearchItemSelected!]: i() === selectedIndex() }}
              onMouseDown={(e) => {
                e.preventDefault()
                props.onSelect({
                  targetMatrixId: item.matrixId,
                  targetRowId: item.id,
                  kind: props.defaultKind,
                })
              }}
            >
              {item.title}
            </div>
          )}
        </For>
        <Show when={results().length === 0}>
          <div class={styles.refSearchEmpty}>No results</div>
        </Show>
      </div>
    </div>
  )
}

const ReferenceColumnDialog: Component<{
  matrices: { id: number; title: string }[]
  onAdd: (targetMatrixId: number) => void
  onClose: () => void
}> = (props) => {
  const [selectedMatrix, setSelectedMatrix] = createSignal<number | null>(null)

  createEffect(() => {
    if (selectedMatrix() === null && props.matrices.length > 0) {
      setSelectedMatrix(props.matrices[0]!.id)
    }
  })

  return (
    <div class={styles.filterPopover} onClick={(e) => e.stopPropagation()}>
      <div style={{ 'font-size': '12px', color: '#555' }}>Target matrix:</div>
      <select
        value={selectedMatrix() ?? ''}
        onChange={(e) => setSelectedMatrix(Number(e.currentTarget.value))}
        ref={(el) => setTimeout(() => el.focus())}
      >
        <For each={props.matrices}>
          {(m) => (
            <option value={m.id}>
              {m.title} (#{m.id})
            </option>
          )}
        </For>
      </select>
      <button
        style={{ background: '#2563eb', color: '#fff' }}
        disabled={selectedMatrix() == null}
        onClick={() => {
          if (selectedMatrix() != null) props.onAdd(selectedMatrix()!)
        }}
      >
        Add
      </button>
      <button style={{ background: '#f0f0f0', color: '#333' }} onClick={() => props.onClose()}>
        Cancel
      </button>
    </div>
  )
}

export default TableFace
