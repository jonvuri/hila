import { Plugin, PluginKey } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'

import {
  getInitialSelectableListId,
  getSelectableListAction,
} from '../design/overlay/SelectableList'

import {
  type SlashCommand,
  type SlashNode,
  matchCommands,
  runSlashCommand,
} from './slash-commands'
import { createSlashMenu, type SlashMenu } from './slash-menu'

/**
 * Slash-command ProseMirror plugin (Phase 9 §9.6 — the unified creation gesture).
 *
 * A sibling of the inlineref plugin (`@`/`[[`/`#`): it shares the trigger →
 * dropdown → keyboard-nav shape, but where inlineref *inserts a node* on select,
 * a slash command **deletes the `/…` text and runs a side-effecting op**. See
 * `slash-commands.ts` for the command registry and dispatch; this file is the
 * editor glue.
 *
 * The flow is **single-stage**: trigger `/`, filter shared commands by the typed
 * text, and on select run the command immediately (an argument-free launcher).
 * Any follow-up interaction lives elsewhere — a second menu (`/attach`) or an
 * input on the created object (`/table`) — never as text typed after the command.
 */

export type SlashPluginConfig = {
  matrixId: number
  rowIdAccessor: () => number
}

type SlashState = {
  active: boolean
  /** Doc position right after the `/` (start of the query text). */
  from: number
  query: string
}

const slashPluginKey = new PluginKey<SlashState>('slash')

const INACTIVE: SlashState = { active: false, from: 0, query: '' }

const getSlashState = (view: EditorView): SlashState =>
  slashPluginKey.getState(view.state) ?? INACTIVE

export const createSlashPlugin = (config: SlashPluginConfig): Plugin<SlashState> => {
  const { matrixId, rowIdAccessor } = config
  let menu: SlashMenu | null = null
  let items: readonly SlashCommand[] = []
  let selectedId: string | null = null

  const node = (): SlashNode => ({ matrixId, rowId: rowIdAccessor() })

  const renderIfOpen = (view: EditorView) => {
    if (!menu) return
    const state = getSlashState(view)
    if (!state.active || items.length === 0) {
      menu.update({
        open: false,
        anchor: { left: 0, right: 0, top: 0, bottom: 0 },
        items,
        selectedId,
      })
      return
    }
    try {
      const coords = view.coordsAtPos(state.from)
      menu.update({
        open: true,
        anchor: {
          left: coords.left,
          right: coords.right,
          top: coords.top,
          bottom: coords.bottom,
        },
        items,
        selectedId,
      })
    } catch {
      menu.update({
        open: false,
        anchor: { left: 0, right: 0, top: 0, bottom: 0 },
        items,
        selectedId,
      })
    }
  }

  const close = (view: EditorView) => {
    items = []
    selectedId = null
    view.dispatch(view.state.tr.setMeta(slashPluginKey, INACTIVE))
  }

  /** Delete the active `/…` text and run the chosen command (argument-free). */
  const commit = (view: EditorView, cmd: SlashCommand) => {
    const state = getSlashState(view)
    if (!state.active) return
    const deleteFrom = state.from - 1 // the `/`
    const deleteTo = state.from + state.query.length
    const target = node()
    const tr = view.state.tr.delete(deleteFrom, deleteTo)
    tr.setMeta(slashPluginKey, INACTIVE)
    view.dispatch(tr)
    // Selecting via a dropdown click leaves focus off the editor; restore it
    // before the command runs (so a launcher that hands focus elsewhere starts
    // from a known state).
    view.focus()
    void runSlashCommand(cmd.id, target, view).catch((error) =>
      console.error(`slash /${cmd.id.slice(cmd.id.lastIndexOf('.') + 1)} failed`, error),
    )
  }

  const refresh = (view: EditorView) => {
    const state = getSlashState(view)
    if (!state.active) return
    items = matchCommands(state.query, node(), view)
    selectedId = getInitialSelectableListId(items)
    renderIfOpen(view)
  }

  return new Plugin<SlashState>({
    key: slashPluginKey,

    state: {
      init: () => INACTIVE,
      apply(tr, value) {
        const meta = tr.getMeta(slashPluginKey) as SlashState | undefined
        if (meta) return meta
        if (!value.active) return value
        return { ...value, from: tr.mapping.map(value.from) }
      },
    },

    props: {
      handleTextInput(view, from, _to, text) {
        const state = getSlashState(view)

        if (state.active) {
          const newQuery = state.query + text
          const tr = view.state.tr.insertText(text, from)
          tr.setMeta(slashPluginKey, { active: true, from: state.from, query: newQuery })
          view.dispatch(tr)
          refresh(view)
          return true
        }

        // Detect a `/` trigger at a word boundary (block start or after whitespace),
        // so paths like `and/or` typed mid-word don't open the menu.
        if (text === '/') {
          const $from = view.state.selection.$from
          const atBoundary =
            $from.parentOffset === 0 || /\s/.test(view.state.doc.textBetween(from - 1, from))
          if (atBoundary) {
            const tr = view.state.tr.insertText('/', from)
            tr.setMeta(slashPluginKey, { active: true, from: from + 1, query: '' })
            view.dispatch(tr)
            refresh(view)
            return true
          }
        }
        return false
      },

      handleKeyDown(view, event) {
        const state = getSlashState(view)
        if (!state.active) return false

        switch (event.key) {
          case 'ArrowDown':
            event.preventDefault()
            selectedId =
              getSelectableListAction(items, selectedId, 'ArrowDown')?.id ?? selectedId
            renderIfOpen(view)
            return true

          case 'ArrowUp':
            event.preventDefault()
            selectedId = getSelectableListAction(items, selectedId, 'ArrowUp')?.id ?? selectedId
            renderIfOpen(view)
            return true

          case 'Enter': {
            event.preventDefault()
            const item = items.find((candidate) => candidate.id === selectedId)
            if (item) commit(view, item)
            return true
          }

          case 'Escape':
            event.preventDefault()
            close(view)
            return true

          case 'Backspace': {
            if (state.query.length === 0) {
              close(view)
              return false
            }
            const newQuery = state.query.slice(0, -1)
            const deleteFrom = state.from + state.query.length - 1
            const deleteTo = state.from + state.query.length
            const tr = view.state.tr.delete(deleteFrom, deleteTo)
            tr.setMeta(slashPluginKey, { active: true, from: state.from, query: newQuery })
            view.dispatch(tr)
            refresh(view)
            return true
          }

          default:
            return false
        }
      },
    },

    view(view) {
      menu = createSlashMenu({
        focusOwner: () => view.dom,
        onSelectedIdChange: (id) => {
          selectedId = id
          renderIfOpen(view)
        },
        onActivate: (id) => {
          const item = items.find((candidate) => candidate.id === id)
          if (item) commit(view, item)
        },
        onDismiss: () => {
          if (getSlashState(view).active) close(view)
        },
      })

      return {
        update(view) {
          renderIfOpen(view)
        },
        destroy() {
          menu?.destroy()
          menu = null
        },
      }
    },
  })
}
