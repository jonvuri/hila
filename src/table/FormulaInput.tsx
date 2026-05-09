import { createSignal, For, Show, createMemo, createEffect, type Component } from 'solid-js'

import type { ColumnDefinition } from '../core/matrix'

import styles from './FormulaInput.module.css'

type FormulaInputProps = {
  value: string
  columns: ColumnDefinition[]
  onInput: (value: string) => void
  placeholder?: string
}

type Token =
  | { type: 'text'; value: string }
  | { type: 'ref'; columnId: number; columnName: string }

const tokenize = (formula: string, columns: ColumnDefinition[]): Token[] => {
  const byId = new Map(columns.map((c) => [c.id, c.name]))
  const tokens: Token[] = []
  const re = /\{\{(\d+)\}\}/g
  let lastIndex = 0
  let match

  while ((match = re.exec(formula)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: formula.slice(lastIndex, match.index) })
    }
    const id = Number(match[1])
    const name = byId.get(id)
    tokens.push({
      type: 'ref',
      columnId: id,
      columnName: name ?? `#${id}`,
    })
    lastIndex = re.lastIndex
  }

  if (lastIndex < formula.length) {
    tokens.push({ type: 'text', value: formula.slice(lastIndex) })
  }

  return tokens
}

const tokensToFormula = (tokens: Token[]): string =>
  tokens.map((t) => (t.type === 'ref' ? `{{${t.columnId}}}` : t.value)).join('')

const FormulaInput: Component<FormulaInputProps> = (props) => {
  const [showAutocomplete, setShowAutocomplete] = createSignal(false)
  const [autocompleteIndex, setAutocompleteIndex] = createSignal(0)
  const [caretSegment, setCaretSegment] = createSignal<number | null>(null)
  let containerRef: HTMLDivElement | undefined
  let inputRef: HTMLInputElement | undefined

  const tokens = createMemo(() => tokenize(props.value, props.columns))

  // Available columns for autocomplete: exclude formula columns to prevent cycles
  const availableColumns = createMemo(() => props.columns.filter((c) => c.formula === null))

  const filteredColumns = createMemo(() => {
    const t = tokens()
    const seg = caretSegment()
    if (seg === null) return availableColumns()

    const token = t[seg]
    if (!token || token.type !== 'text') return availableColumns()

    const text = token.value.trim().toLowerCase()
    if (!text) return availableColumns()

    return availableColumns().filter((c) => c.name.toLowerCase().includes(text))
  })

  createEffect(() => {
    if (filteredColumns().length === 0) {
      setShowAutocomplete(false)
    }
  })

  const insertColumnRef = (col: ColumnDefinition) => {
    const t = [...tokens()]
    const seg = caretSegment()

    if (seg !== null && t[seg]?.type === 'text') {
      // Replace the text segment's trailing word with the ref
      const textToken = t[seg] as { type: 'text'; value: string }
      const trimmed = textToken.value.trimEnd()
      const lastSpace = trimmed.lastIndexOf(' ')
      const before = lastSpace >= 0 ? trimmed.slice(0, lastSpace + 1) : ''

      const newTokens: Token[] = [
        ...t.slice(0, seg),
        ...(before ? [{ type: 'text' as const, value: before }] : []),
        { type: 'ref', columnId: col.id, columnName: col.name },
        { type: 'text', value: ' ' },
        ...t.slice(seg + 1),
      ]

      props.onInput(tokensToFormula(newTokens))
    } else {
      props.onInput(props.value + `{{${col.id}}} `)
    }

    setShowAutocomplete(false)
    inputRef?.focus()
  }

  const removeToken = (index: number) => {
    const t = [...tokens()]
    t.splice(index, 1)
    props.onInput(tokensToFormula(t))
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (showAutocomplete()) {
      const items = filteredColumns()
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setAutocompleteIndex((i) => (i + 1) % Math.max(items.length, 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setAutocompleteIndex(
          (i) => (i - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1),
        )
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (items[autocompleteIndex()]) {
          e.preventDefault()
          insertColumnRef(items[autocompleteIndex()]!)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setShowAutocomplete(false)
      }
    }
  }

  const handleRawInput = (e: InputEvent) => {
    const target = e.currentTarget as HTMLInputElement
    props.onInput(target.value)
  }

  return (
    <div class={styles.formulaInput} ref={containerRef}>
      <div class={styles.tokenDisplay}>
        <For each={tokens()}>
          {(token, i) => (
            <Show
              when={token.type === 'ref'}
              fallback={
                <span class={styles.textSegment}>
                  {(token as { type: 'text'; value: string }).value}
                </span>
              }
            >
              <span class={styles.refToken}>
                {(token as { type: 'ref'; columnName: string }).columnName}
                <button
                  class={styles.refTokenRemove}
                  onClick={() => removeToken(i())}
                  aria-label="Remove column reference"
                >
                  ×
                </button>
              </span>
            </Show>
          )}
        </For>
      </div>
      <div class={styles.inputRow}>
        <input
          ref={inputRef}
          class={styles.rawInput}
          type="text"
          value={props.value}
          onInput={handleRawInput}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setCaretSegment(tokens().length - 1)
            if (availableColumns().length > 0) {
              setShowAutocomplete(true)
              setAutocompleteIndex(0)
            }
          }}
          onBlur={() => setTimeout(() => setShowAutocomplete(false), 200)}
          placeholder={props.placeholder ?? 'e.g. {{123}} * 2 + {{456}}'}
        />
        <button
          class={styles.columnPickerBtn}
          type="button"
          title="Insert column reference"
          onClick={() => {
            setShowAutocomplete(!showAutocomplete())
            setAutocompleteIndex(0)
            inputRef?.focus()
          }}
        >
          +col
        </button>
      </div>
      <Show when={showAutocomplete() && filteredColumns().length > 0}>
        <div class={styles.autocomplete}>
          <For each={filteredColumns()}>
            {(col, idx) => (
              <div
                class={styles.autocompleteItem}
                classList={{
                  [styles.autocompleteItemSelected!]: idx() === autocompleteIndex(),
                }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertColumnRef(col)
                }}
              >
                <span class={styles.autocompleteColName}>{col.name}</span>
                <span class={styles.autocompleteColType}>{col.displayType}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

export default FormulaInput
