import type { Command } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import {
  chainCommands,
  toggleMark,
  newlineInCode,
  createParagraphNear,
} from 'prosemirror-commands'

import { schema } from './schema'

export type OutlineCallbacks = {
  onEnter: (view: EditorView) => void
  onBackspaceAtStart: (view: EditorView) => void
  onIndent: () => void
  onOutdent: () => void
  onArrowUp: () => void
  onArrowDown: () => void
  onInsertLink: () => void
  onToggleCollapse: () => void
}

const hardBreak = (): Command => {
  const br = schema.nodes.hard_break!
  return (state, dispatch) => {
    dispatch?.(state.tr.replaceSelectionWith(br.create()).scrollIntoView())
    return true
  }
}

const enterToOutline = (callback: (view: EditorView) => void): Command => {
  return (_state, _dispatch, view) => {
    if (view) callback(view)
    return true
  }
}

const backspaceAtStart = (callback: (view: EditorView) => void): Command => {
  return (state, _dispatch, view) => {
    const { $cursor } = state.selection as { $cursor?: { pos: number; parentOffset: number } }
    if (!$cursor || $cursor.parentOffset > 0) return false

    if ($cursor.pos > 1) return false

    if (view) callback(view)
    return true
  }
}

const tabToOutline = (callback: () => void): Command => {
  return (_state, _dispatch) => {
    callback()
    return true
  }
}

const arrowUpToOutline = (callback: () => void): Command => {
  return (state, _dispatch, view) => {
    if (!view) return false
    const { $from } = state.selection
    if ($from.depth < 1) return false
    const isFirstBlock = $from.start(1) === 1
    if (isFirstBlock && view.endOfTextblock('up')) {
      callback()
      return true
    }
    return false
  }
}

const arrowDownToOutline = (callback: () => void): Command => {
  return (state, _dispatch, view) => {
    if (!view) return false
    const { $from } = state.selection
    if ($from.depth < 1) return false
    const isLastBlock = $from.end(1) === state.doc.content.size - 1
    if (isLastBlock && view.endOfTextblock('down')) {
      callback()
      return true
    }
    return false
  }
}

const modKToOutline = (callback: () => void): Command => {
  return (_state, _dispatch) => {
    callback()
    return true
  }
}

export const createOutlineKeymap = (callbacks: OutlineCallbacks): Record<string, Command> => {
  return {
    'Shift-Enter': chainCommands(newlineInCode, createParagraphNear, hardBreak()),
    Enter: enterToOutline(callbacks.onEnter),
    Backspace: backspaceAtStart(callbacks.onBackspaceAtStart),
    Tab: tabToOutline(callbacks.onIndent),
    'Shift-Tab': tabToOutline(callbacks.onOutdent),
    ArrowUp: arrowUpToOutline(callbacks.onArrowUp),
    ArrowDown: arrowDownToOutline(callbacks.onArrowDown),
    'Mod-b': toggleMark(schema.marks.bold!),
    'Mod-i': toggleMark(schema.marks.italic!),
    'Mod-e': toggleMark(schema.marks.code!),
    'Mod-k': modKToOutline(callbacks.onInsertLink),
    'Mod-Enter': tabToOutline(callbacks.onToggleCollapse),
  }
}
