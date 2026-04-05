import { Plugin, PluginKey } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'

import { execQuery } from '../core/client/sql-client'
import { schema } from '../editor/schema'

type NoteOption = { id: number; title: string }

type AutocompleteState = {
  active: boolean
  /** Doc position right after the trigger (start of query text) */
  from: number
  query: string
  trigger: '@' | '[[' | null
}

const inlinerefPluginKey = new PluginKey<AutocompleteState>('inlineref')

const getAutocompleteState = (view: EditorView): AutocompleteState =>
  inlinerefPluginKey.getState(view.state) ?? {
    active: false,
    from: 0,
    query: '',
    trigger: null,
  }

const DROPDOWN_CLASS = 'inlineref-autocomplete'

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
      'inlineref-autocomplete-item' +
      (i === selectedIndex ? ' inlineref-autocomplete-selected' : '')
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
      'inlineref-autocomplete-item inlineref-autocomplete-create' +
      (selectedIndex === options.length ? ' inlineref-autocomplete-selected' : '')
    createItem.textContent = `Create "${query}"`
    createItem.addEventListener('mousedown', (e) => {
      e.preventDefault()
      onSelect('create')
    })
    dropdown.appendChild(createItem)
  }

  dropdown.style.display = dropdown.children.length > 0 ? '' : 'none'
}

export const createInlinerefPlugin = (matrixId: number): Plugin => {
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

  const insertInlinerefNode = (
    view: EditorView,
    attrs: { targetMatrixId: number | null; targetRowId: number | null; cachedTitle?: string },
  ) => {
    const state = getAutocompleteState(view)
    if (!state.active) return
    const inlinerefType = schema.nodes.inlineref!
    const node = inlinerefType.create({
      targetMatrixId: attrs.targetMatrixId,
      targetRowId: attrs.targetRowId,
      kind: 'ref',
      cachedTitle: attrs.cachedTitle ?? null,
    })
    const triggerLength = state.trigger === '@' ? 1 : 2
    const deleteFrom = state.from - triggerLength
    const deleteTo = state.from + state.query.length
    const tr = view.state.tr.replaceWith(deleteFrom, deleteTo, node)
    tr.setMeta(inlinerefPluginKey, { active: false, from: 0, query: '', trigger: null })
    view.dispatch(tr)
    view.focus()
  }

  const handleSelect = async (view: EditorView, option: NoteOption | 'create') => {
    const state = getAutocompleteState(view)
    if (!state.active) return

    if (option === 'create') {
      const title = state.query.trim()
      if (!title) return
      insertInlinerefNode(view, {
        targetMatrixId: null,
        targetRowId: null,
        cachedTitle: title,
      })
    } else {
      insertInlinerefNode(view, {
        targetMatrixId: matrixId,
        targetRowId: option.id,
      })
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
    const tr = view.state.tr.setMeta(inlinerefPluginKey, {
      active: false,
      from: 0,
      query: '',
      trigger: null,
    })
    view.dispatch(tr)
  }

  return new Plugin<AutocompleteState>({
    key: inlinerefPluginKey,

    state: {
      init: () => ({ active: false, from: 0, query: '', trigger: null }),
      apply(tr, value) {
        const meta = tr.getMeta(inlinerefPluginKey) as AutocompleteState | undefined
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
          // Handle ]] close only for [[ trigger
          if (text === ']' && state.trigger === '[[') {
            const docText = view.state.doc.textBetween(Math.max(0, from - 1), from)
            if (docText === ']') {
              const tr = view.state.tr.delete(from - 1, from)
              tr.setMeta(inlinerefPluginKey, {
                active: false,
                from: 0,
                query: '',
                trigger: null,
              })
              view.dispatch(tr)
              if (dropdown) dropdown.style.display = 'none'
              return true
            }
          }

          const newQuery = state.query + text
          const tr = view.state.tr.insertText(text, from)
          tr.setMeta(inlinerefPluginKey, {
            active: true,
            from: state.from,
            query: newQuery,
            trigger: state.trigger,
          })
          view.dispatch(tr)
          void fetchNotes(view, newQuery)
          return true
        }

        // Detect [[ trigger
        if (text === '[') {
          const docText = view.state.doc.textBetween(Math.max(0, from - 1), from)
          if (docText === '[') {
            const tr = view.state.tr.insertText('[', from)
            tr.setMeta(inlinerefPluginKey, {
              active: true,
              from: from + 1,
              query: '',
              trigger: '[[',
            })
            view.dispatch(tr)
            void fetchNotes(view, '')
            return true
          }
        }

        // Detect @ trigger
        if (text === '@') {
          const tr = view.state.tr.insertText('@', from)
          tr.setMeta(inlinerefPluginKey, {
            active: true,
            from: from + 1,
            query: '',
            trigger: '@',
          })
          view.dispatch(tr)
          void fetchNotes(view, '')
          return true
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
            tr.setMeta(inlinerefPluginKey, {
              active: true,
              from: state.from,
              query: newQuery,
              trigger: state.trigger,
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
