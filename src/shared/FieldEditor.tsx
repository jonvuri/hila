import { createEffect, createSignal, createUniqueId, For, Show, type Component } from 'solid-js'

import type { ColumnDefinition } from '../core/matrix'

import styles from './FieldEditor.module.css'

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
 *
 * `seamless` styles the control to read as plain text (transparent until
 * hover/focus) so it can sit always-live in a composed surface without looking
 * like a form input. `showLabel={false}` suppresses the built-in field-name
 * label, letting a parent (e.g. PropertyRow) own the label placement.
 */
export type FieldEditorProps = {
  column: ColumnDefinition
  value: string
  onSave: (value: string) => void
  seamless?: boolean
  showLabel?: boolean
  invalid?: boolean
  validationMessage?: string
}

export const FieldEditor: Component<FieldEditorProps> = (props) => {
  const [localValue, setLocalValue] = createSignal('')
  const controlId = createUniqueId()
  const errorId = `${controlId}-error`

  createEffect(() => {
    setLocalValue(props.value)
  })

  const fieldClass = () =>
    props.seamless ? `${styles.field} ${styles.seamlessField}` : styles.field
  const controlClass = (base: string) =>
    props.seamless ? `${base} ${styles.seamlessControl}` : base
  const showLabel = () => props.showLabel !== false
  const accessibilityProps = () => ({
    'aria-label': showLabel() ? undefined : props.column.name,
    'aria-invalid': props.invalid ? ('true' as const) : undefined,
    'aria-describedby': props.invalid && props.validationMessage ? errorId : undefined,
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
    <div class={fieldClass()} data-invalid={props.invalid ? '' : undefined}>
      <Show when={showLabel()}>
        <label class={styles.label} for={controlId}>
          {props.column.name}
        </label>
      </Show>
      <Show
        when={displayType() !== 'select' || !props.column.options}
        fallback={
          <select
            id={controlId}
            class={controlClass(styles.select!)}
            data-field-control={props.column.name}
            value={localValue()}
            {...accessibilityProps()}
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
              id={controlId}
              class={styles.checkbox}
              data-field-control={props.column.name}
              type="checkbox"
              checked={localValue() === '1' || localValue() === 'true'}
              {...accessibilityProps()}
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
            id={controlId}
            class={controlClass(styles.input!)}
            data-field-control={props.column.name}
            type={
              displayType() === 'number' ? 'number'
              : displayType() === 'date' ?
                'date'
              : 'text'
            }
            value={localValue()}
            {...accessibilityProps()}
            onInput={(e) => setLocalValue(e.currentTarget.value)}
            onBlur={() => commitValue()}
            onKeyDown={handleKeyDown}
          />
        </Show>
      </Show>
      <Show when={props.invalid && props.validationMessage}>
        <span id={errorId} class={styles.error} role="alert">
          {props.validationMessage}
        </span>
      </Show>
    </div>
  )
}

export const ReadonlyField: Component<{
  column: ColumnDefinition
  value: string
  seamless?: boolean
  showLabel?: boolean
  testId?: string
}> = (props) => {
  const showLabel = () => props.showLabel !== false
  const fieldClass = () =>
    props.seamless ? `${styles.field} ${styles.seamlessField}` : styles.field
  const valueClass = () =>
    props.seamless ? `${styles.readonly} ${styles.seamlessReadonly}` : styles.readonly

  return (
    <div class={fieldClass()} role="group" aria-label={props.column.name}>
      <Show when={showLabel()}>
        <span class={styles.label}>{props.column.name}</span>
      </Show>
      <span class={valueClass()} data-testid={props.testId}>
        {props.value}
      </span>
    </div>
  )
}
