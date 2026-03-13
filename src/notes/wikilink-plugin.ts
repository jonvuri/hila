import { Plugin, PluginKey } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'

import { execQuery } from '../core/client/sql-client'
import { insertRow } from '../core/client/matrix-client'
import { schema } from '../outline/schema'

type NoteOption = { id: number; title: string }

type AutocompleteState = {
  active: boolean
  /** Doc position right after the `[[` trigger (start of query text) */
  from: number
  query: string
}

const wikilinkPluginKey = new PluginKey<AutocompleteState>('wikilink')

const getAutocompleteState = (view: EditorView): AutocompleteState =>
  wikilinkPluginKey.getState(view.state) ?? { active: false, from: 0, query: '' }

const DROPDOWN_CLASS = 'wikilink-autocomplete'

const createDropdownElement = (): HTMLDivElement => {
  const el = document.createElement('div')
  el.className = DROPDOWN_CLASS
  el.style.display = 'none'
  document.body.appendChild(el)
  return el
}

const positionDropdown = (view: EditorView, dropdown: HTMLDivElement, pos: number) => {
  try {
    const coords = view.coordsAtPos(pos)
    dropdown.style.left = `${coords.left}px`
    dropdown.style.top = `${coords.bottom + 4}px`
  } catch {
    dropdown.style.display = 'none'
  }
}

const renderDropdown = (
  dropdown: HTMLDivElement,
  options: NoteOption[],
  selectedIndex: number,
  query: string,
  onSelect: (option: NoteOption | 'create') => void,
) => {
  dropdown.innerHTML = ''

  for (let i = 0; i < options.length; i++) {
    const opt = options[i]!
    const item = document.createElement('div')
    item.className =
      'wikilink-autocomplete-item' +
      (i === selectedIndex ? ' wikilink-autocomplete-selected' : '')
    item.textContent = opt.title
    item.addEventListener('mousedown', (e) => {
      e.preventDefault()
      onSelect(opt)
    })
    dropdown.appendChild(item)
  }

  if (query.trim().length > 0) {
    const createItem = document.createElement('div')
    createItem.className =
      'wikilink-autocomplete-item wikilink-autocomplete-create' +
      (selectedIndex === options.length ? ' wikilink-autocomplete-selected' : '')
    createItem.textContent = `Create "${query}"`
    createItem.addEventListener('mousedown', (e) => {
      e.preventDefault()
      onSelect('create')
    })
    dropdown.appendChild(createItem)
  }

  dropdown.style.display = dropdown.children.length > 0 ? '' : 'none'
}

export const createWikilinkPlugin = (matrixId: number): Plugin => {
  let dropdown: HTMLDivElement | null = null
  let options: NoteOption[] = []
  let selectedIndex = 0
  let fetchVersion = 0

  const fetchNotes = async (view: EditorView, query: string) => {
    const version = ++fetchVersion
    const escapedQuery = query.replace(/'/g, "''")
    const sql = `SELECT id, title FROM "mx_${matrixId}_data" WHERE title LIKE '%${escapedQuery}%' ORDER BY title LIMIT 20`
    try {
      const result = await execQuery(sql)
      if (version !== fetchVersion) return
      options = result.map((r) => ({ id: r.id as number, title: r.title as string }))
      selectedIndex = 0
      if (dropdown) {
        const state = getAutocompleteState(view)
        renderDropdown(dropdown, options, selectedIndex, state.query, (opt) =>
          handleSelect(view, opt),
        )
      }
    } catch {
      options = []
    }
  }

  const insertWikilinkNode = (view: EditorView, matrixIdAttr: number, rowId: number) => {
    const state = getAutocompleteState(view)
    if (!state.active) return
    const wikilinkType = schema.nodes.wikilink!
    const node = wikilinkType.create({ matrixId: matrixIdAttr, rowId })
    const deleteFrom = state.from - 2
    const deleteTo = state.from + state.query.length
    const tr = view.state.tr.replaceWith(deleteFrom, deleteTo, node)
    tr.setMeta(wikilinkPluginKey, { active: false, from: 0, query: '' })
    view.dispatch(tr)
    view.focus()
  }

  const handleSelect = async (view: EditorView, option: NoteOption | 'create') => {
    const state = getAutocompleteState(view)
    if (!state.active) return

    if (option === 'create') {
      const title = state.query.trim()
      if (!title) return
      try {
        const result = await insertRow(matrixId, {
          values: { title, body: '{"type":"doc","content":[{"type":"paragraph"}]}' },
        })
        insertWikilinkNode(view, matrixId, result.rowId)
      } catch {
        return
      }
    } else {
      insertWikilinkNode(view, matrixId, option.id)
    }

    if (dropdown) dropdown.style.display = 'none'
  }

  const closeAutocomplete = (view: EditorView) => {
    if (dropdown) {
      dropdown.style.display = 'none'
    }
    options = []
    selectedIndex = 0
    fetchVersion++
    const tr = view.state.tr.setMeta(wikilinkPluginKey, { active: false, from: 0, query: '' })
    view.dispatch(tr)
  }

  return new Plugin<AutocompleteState>({
    key: wikilinkPluginKey,

    state: {
      init: () => ({ active: false, from: 0, query: '' }),
      apply(tr, value) {
        const meta = tr.getMeta(wikilinkPluginKey) as AutocompleteState | undefined
        if (meta) return meta
        if (!value.active) return value
        const from = tr.mapping.map(value.from)
        return { ...value, from }
      },
    },

    props: {
      handleTextInput(view, from, _to, text) {
        const state = getAutocompleteState(view)

        if (state.active) {
          if (text === ']') {
            const docText = view.state.doc.textBetween(Math.max(0, from - 1), from)
            if (docText === ']') {
              // Delete the typed ] and close
              const tr = view.state.tr.delete(from - 1, from)
              tr.setMeta(wikilinkPluginKey, { active: false, from: 0, query: '' })
              view.dispatch(tr)
              if (dropdown) dropdown.style.display = 'none'
              return true
            }
          }

          // Insert text ourselves and update query in one transaction
          const newQuery = state.query + text
          const tr = view.state.tr.insertText(text, from)
          tr.setMeta(wikilinkPluginKey, {
            active: true,
            from: state.from,
            query: newQuery,
          })
          view.dispatch(tr)
          void fetchNotes(view, newQuery)
          return true
        }

        // Detect [[ trigger
        if (text === '[') {
          const docText = view.state.doc.textBetween(Math.max(0, from - 1), from)
          if (docText === '[') {
            // Insert the second [ ourselves and activate in one transaction
            const tr = view.state.tr.insertText('[', from)
            tr.setMeta(wikilinkPluginKey, {
              active: true,
              from: from + 1,
              query: '',
            })
            view.dispatch(tr)
            void fetchNotes(view, '')
            return true
          }
        }

        return false
      },

      handleKeyDown(view, event) {
        const state = getAutocompleteState(view)
        if (!state.active) return false

        const totalItems = options.length + (state.query.trim().length > 0 ? 1 : 0)

        switch (event.key) {
          case 'ArrowDown':
            event.preventDefault()
            selectedIndex = (selectedIndex + 1) % Math.max(totalItems, 1)
            if (dropdown) {
              renderDropdown(dropdown, options, selectedIndex, state.query, (opt) =>
                handleSelect(view, opt),
              )
            }
            return true

          case 'ArrowUp':
            event.preventDefault()
            selectedIndex =
              (selectedIndex - 1 + Math.max(totalItems, 1)) % Math.max(totalItems, 1)
            if (dropdown) {
              renderDropdown(dropdown, options, selectedIndex, state.query, (opt) =>
                handleSelect(view, opt),
              )
            }
            return true

          case 'Enter':
            event.preventDefault()
            if (selectedIndex < options.length) {
              void handleSelect(view, options[selectedIndex]!)
            } else if (state.query.trim().length > 0) {
              void handleSelect(view, 'create')
            }
            return true

          case 'Escape':
            event.preventDefault()
            closeAutocomplete(view)
            return true

          case 'Backspace': {
            if (state.query.length === 0) {
              closeAutocomplete(view)
              return false
            }
            const newQuery = state.query.slice(0, -1)
            const deleteFrom = state.from + state.query.length - 1
            const deleteTo = state.from + state.query.length
            const tr = view.state.tr.delete(deleteFrom, deleteTo)
            tr.setMeta(wikilinkPluginKey, {
              active: true,
              from: state.from,
              query: newQuery,
            })
            view.dispatch(tr)
            void fetchNotes(view, newQuery)
            return true
          }

          default:
            return false
        }
      },
    },

    view(view) {
      dropdown = createDropdownElement()

      const handleClickOutside = (e: MouseEvent) => {
        if (dropdown && !dropdown.contains(e.target as HTMLElement)) {
          const state = getAutocompleteState(view)
          if (state.active) {
            closeAutocomplete(view)
          }
        }
      }
      document.addEventListener('mousedown', handleClickOutside)

      return {
        update(view) {
          const state = getAutocompleteState(view)
          if (!state.active || !dropdown) {
            if (dropdown) dropdown.style.display = 'none'
            return
          }
          positionDropdown(view, dropdown, state.from)
          renderDropdown(dropdown, options, selectedIndex, state.query, (opt) =>
            handleSelect(view, opt),
          )
        },
        destroy() {
          document.removeEventListener('mousedown', handleClickOutside)
          if (dropdown) {
            dropdown.remove()
            dropdown = null
          }
        },
      }
    },
  })
}
