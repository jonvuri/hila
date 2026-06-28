import type { EditorView } from 'prosemirror-view'

import { createDependentRow } from '../core/client/matrix-client'
import { searchTagTypes } from '../tags/tag-search-provider'

import type { SlashNode } from './slash-commands'

/**
 * Standalone type picker for the `/attach` launcher (Phase 9 §9.6).
 *
 * `/attach` is argument-free *at the editor*: selecting it deletes the `/…` text
 * and opens **this** menu — a floating overlay with its own text input, fully
 * decoupled from the ProseMirror doc (the search query is never accumulated in
 * the prose). Picking a promoted type instantiates a structurally-anchored
 * own-row of it via `createDependentRow` (the structural complement of an inline
 * `#`-ref). Reuses `searchTagTypes`, the `#`-autocomplete source.
 *
 * The menu owns its lifecycle: it mounts on `document.body`, positions itself at
 * the editor selection, and tears itself down on pick / Escape / click-outside.
 */
export const openSlashTypePicker = (view: EditorView, node: SlashNode): void => {
  const container = document.createElement('div')
  container.className = 'inlineref-autocomplete slash-type-picker'
  container.setAttribute('data-testid', 'slash-type-picker')

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'slash-type-picker-input'
  input.setAttribute('data-testid', 'slash-type-picker-input')
  input.placeholder = 'Attach a typed row…'

  const list = document.createElement('div')
  list.className = 'slash-type-picker-list'

  container.appendChild(input)
  container.appendChild(list)
  document.body.appendChild(container)

  // Anchor at the caret the `/` was triggered from.
  try {
    const coords = view.coordsAtPos(view.state.selection.head)
    container.style.left = `${coords.left}px`
    container.style.top = `${coords.bottom + 4}px`
  } catch {
    // Leave at default flow position if coords are unavailable.
  }

  let items: { typeMatrixId: number; typeName: string }[] = []
  let selectedIndex = 0
  let fetchVersion = 0
  let closed = false

  const close = () => {
    if (closed) return
    closed = true
    document.removeEventListener('mousedown', handleClickOutside)
    container.remove()
    view.focus()
  }

  const pick = (item: { typeMatrixId: number; typeName: string }) => {
    close()
    void createDependentRow(node.matrixId, node.rowId, item.typeMatrixId).catch((e) =>
      console.error('slash /attach failed', e),
    )
  }

  const render = () => {
    list.innerHTML = ''
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!
      const el = document.createElement('div')
      el.className =
        'inlineref-autocomplete-item' +
        (i === selectedIndex ? ' inlineref-autocomplete-selected' : '')
      el.textContent = `# ${item.typeName}`
      el.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        pick(item)
      })
      list.appendChild(el)
    }
  }

  const refresh = async (query: string) => {
    const version = ++fetchVersion
    const types = await searchTagTypes(query)
    if (version !== fetchVersion || closed) return
    items = types.map((t) => ({ typeMatrixId: t.matrixId, typeName: t.title }))
    selectedIndex = 0
    render()
  }

  input.addEventListener('input', () => {
    void refresh(input.value)
  })

  input.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        selectedIndex = (selectedIndex + 1) % Math.max(items.length, 1)
        render()
        break
      case 'ArrowUp':
        e.preventDefault()
        selectedIndex =
          (selectedIndex - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1)
        render()
        break
      case 'Enter': {
        e.preventDefault()
        const item = items[selectedIndex]
        if (item) pick(item)
        break
      }
      case 'Escape':
        e.preventDefault()
        close()
        break
    }
  })

  const handleClickOutside = (e: MouseEvent) => {
    if (!container.contains(e.target as HTMLElement)) close()
  }
  document.addEventListener('mousedown', handleClickOutside)

  void refresh('')
  input.focus()
}
