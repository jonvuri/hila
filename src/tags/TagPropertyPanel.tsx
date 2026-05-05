import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
  type Component,
  onCleanup,
} from 'solid-js'

import { useRowData } from '../sql/useRowData'
import { updateRow, getColumns } from '../core/client/matrix-client'
import type { ColumnDefinition } from '../core/matrix'
import { FieldEditor } from '../shared/FieldEditor'

import { tagColorFromName, tagBadgeBackground } from './tag-color'

type TagPropertyPanelProps = {
  matrixId: number
  rowId: number
  tagTypeName: string
  tagTypeColor: string | null
  anchorRect: DOMRect
  onClose: () => void
}

const SKIPPED_COLUMNS = new Set(['id'])

const TagPropertyPanel: Component<TagPropertyPanelProps> = (props) => {
  const [columns, setColumns] = createSignal<ColumnDefinition[]>([])

  const rowData = useRowData(
    () => props.matrixId,
    () => props.rowId,
  )

  createEffect(() => {
    void getColumns(props.matrixId).then((cols) => setColumns(cols))
  })

  const editableColumns = createMemo(() =>
    columns().filter((col) => !SKIPPED_COLUMNS.has(col.name) && col.formula == null),
  )

  const formulaColumns = createMemo(() =>
    columns().filter((col) => col.formula != null && !SKIPPED_COLUMNS.has(col.name)),
  )

  const handleSave = (columnName: string, value: string) => {
    void updateRow(props.matrixId, props.rowId, { [columnName]: value })
  }

  const handleEscapeKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      props.onClose()
    }
  }

  const handleOutsideClick = (e: MouseEvent) => {
    const panel = document.querySelector('.tag-property-panel')
    if (panel && !panel.contains(e.target as Node)) {
      props.onClose()
    }
  }

  setTimeout(() => {
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscapeKey, true)
  }, 0)

  onCleanup(() => {
    document.removeEventListener('mousedown', handleOutsideClick)
    document.removeEventListener('keydown', handleEscapeKey, true)
  })

  const badgeColor = () => props.tagTypeColor ?? tagColorFromName(props.tagTypeName)
  const badgeBg = () => tagBadgeBackground(badgeColor())

  const panelStyle = createMemo(() => {
    const rect = props.anchorRect
    const panelWidth = 280
    const panelMaxHeight = 400
    const margin = 4

    let top = rect.bottom + margin
    let left = rect.left

    if (left + panelWidth > window.innerWidth) {
      left = window.innerWidth - panelWidth - margin
    }
    if (left < margin) left = margin

    if (top + panelMaxHeight > window.innerHeight) {
      top = rect.top - panelMaxHeight - margin
      if (top < margin) top = margin
    }

    return {
      position: 'fixed' as const,
      top: `${top}px`,
      left: `${left}px`,
      width: `${panelWidth}px`,
      'max-height': `${panelMaxHeight}px`,
      'z-index': '1100',
    }
  })

  return (
    <div class="tag-property-panel" style={panelStyle()} tabindex="-1">
      <div class="tag-panel-header">
        <span
          class="tag-panel-badge"
          style={{ color: badgeColor(), 'background-color': badgeBg() }}
        >
          #{props.tagTypeName}
        </span>
        <button class="tag-panel-close" onClick={() => props.onClose()} title="Close">
          ×
        </button>
      </div>

      <Show when={rowData()} fallback={<div class="tag-panel-loading">Loading...</div>}>
        <div class="tag-panel-fields">
          <For each={editableColumns()}>
            {(col) => (
              <FieldEditor
                column={col}
                value={String(rowData()![col.name] ?? '')}
                onSave={(v) => handleSave(col.name, v)}
              />
            )}
          </For>

          <Show when={formulaColumns().length > 0}>
            <For each={formulaColumns()}>
              {(col) => (
                <div class="tag-panel-field tag-panel-field-formula">
                  <label class="tag-panel-field-label">{col.name}</label>
                  <span class="tag-panel-field-value-readonly">
                    {String(rowData()![col.name] ?? '')}
                  </span>
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  )
}

export default TagPropertyPanel
