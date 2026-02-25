import type { Command } from 'prosemirror-state'
import {
  chainCommands,
  toggleMark,
  newlineInCode,
  createParagraphNear,
} from 'prosemirror-commands'

import { schema } from './schema'

export type OutlineCallbacks = {
  onEnter: () => void
  onBackspaceAtStart: () => void
  onIndent: () => void
  onOutdent: () => void
  onInsertLink: () => void
}

const hardBreak = (): Command => {
  const br = schema.nodes.hard_break!
  return (state, dispatch) => {
    dispatch?.(state.tr.replaceSelectionWith(br.create()).scrollIntoView())
    return true
  }
}

const enterToOutline = (callback: () => void): Command => {
  return (_state, _dispatch) => {
    callback()
    return true
  }
}

const backspaceAtStart = (callback: () => void): Command => {
  return (state, _dispatch) => {
    const { $cursor } = state.selection as { $cursor?: { pos: number; parentOffset: number } }
    if (!$cursor || $cursor.parentOffset > 0) return false

    if ($cursor.pos > 1) return false

    callback()
    return true
  }
}

const tabToOutline = (callback: () => void): Command => {
  return (_state, _dispatch) => {
    callback()
    return true
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
    'Mod-b': toggleMark(schema.marks.bold!),
    'Mod-i': toggleMark(schema.marks.italic!),
    'Mod-e': toggleMark(schema.marks.code!),
    'Mod-k': modKToOutline(callbacks.onInsertLink),
  }
}
