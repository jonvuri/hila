import { createEffect, createSignal, For, Show, type Component } from 'solid-js'

import type { ColumnDefinition } from '../core/matrix'

const parseSelectOptions = (optionsJson: string | null): string[] => {
  if (!optionsJson) return []
  try {
    const parsed = JSON.parse(optionsJson) as string[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Column-type-aware field editor. Renders a text/number/date input,
 * checkbox, or select dropdown based on the column's `displayType`.
 * Saves on blur or Enter; reverts on Escape.
 */
export const FieldEditor: Component<{
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
