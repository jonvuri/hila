import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
  type Component,
  onCleanup,
} from 'solid-js'

import { useQuery } from '../sql/useQuery'
import { updateRow, getColumns } from '../core/client/matrix-client'
import type { ColumnDefinition } from '../core/matrix'

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

const parseSelectOptions = (optionsJson: string | null): string[] => {
  if (!optionsJson) return []
  try {
    const parsed = JSON.parse(optionsJson) as string[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const FieldEditor: Component<{
  column: ColumnDefinition
  value: string
  onSave: (value: string) => void
}> = (props) => {
  const [localValue, setLocalValue] = createSignal('')

  createEffect(() => {
    setLocalValue(props.value)
  })

  const commitValue = () => {
    const v = localValue()
    if (v !== props.value) {
      props.onSave(v)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      commitValue()
      ;(e.target as HTMLElement).blur()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setLocalValue(props.value)
      ;(e.target as HTMLElement).blur()
    } else {
      e.stopPropagation()
    }
  }

  const displayType = () => props.column.displayType

  return (
    <div class="tag-panel-field">
      <label class="tag-panel-field-label">{props.column.name}</label>
      <Show
        when={displayType() !== 'select' || !props.column.options}
        fallback={
          <select
            class="tag-panel-field-select"
            value={localValue()}
            onChange={(e) => {
              setLocalValue(e.currentTarget.value)
              props.onSave(e.currentTarget.value)
            }}
            onKeyDown={handleKeyDown}
          >
            <option value="">—</option>
            <For each={parseSelectOptions(props.column.options)}>
              {(opt) => <option value={opt}>{opt}</option>}
            </For>
          </select>
        }
      >
        <Show
          when={displayType() !== 'boolean'}
          fallback={
            <input
              class="tag-panel-field-checkbox"
              type="checkbox"
              checked={localValue() === '1' || localValue() === 'true'}
              onChange={(e) => {
                const v = e.currentTarget.checked ? '1' : '0'
                setLocalValue(v)
                props.onSave(v)
              }}
              onKeyDown={handleKeyDown}
            />
          }
        >
          <input
            class="tag-panel-field-input"
            type={
              displayType() === 'number' ? 'number'
              : displayType() === 'date' ?
                'date'
              : 'text'
            }
            value={localValue()}
            onInput={(e) => setLocalValue(e.currentTarget.value)}
            onBlur={() => commitValue()}
            onKeyDown={handleKeyDown}
          />
        </Show>
      </Show>
    </div>
  )
}

const TagPropertyPanel: Component<TagPropertyPanelProps> = (props) => {
  const [columns, setColumns] = createSignal<ColumnDefinition[]>([])

  const rowQuery = createMemo(
    () => `SELECT * FROM "mx_${props.matrixId}_data" WHERE id = ${props.rowId}`,
  )
  const { result: rowResult } = useQuery(() => rowQuery())

  const rowData = createMemo(() => {
    const data = rowResult()
    if (!data || data.length === 0) return null
    return data[0] as Record<string, unknown>
  })

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
