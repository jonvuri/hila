import type { Command } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import type { Schema } from 'prosemirror-model'
import {
  chainCommands,
  toggleMark,
  newlineInCode,
  createParagraphNear,
} from 'prosemirror-commands'

import type { ShortcutDescriptor } from '../shortcuts'

import { schema as defaultSchema } from './schema'

// ProseMirror retains these handlers. The shared descriptor shape lets a help
// surface combine this metadata with `shortcuts.getDescriptors()`.
export const outlineShortcutDescriptors = [
  { id: 'editor.new-row', title: 'New row', key: 'Enter', context: 'editor' },
  {
    id: 'editor.backspace-at-start',
    title: 'Backspace at start',
    key: 'Backspace',
    context: 'editor',
  },
  { id: 'editor.indent', title: 'Indent', key: 'Tab', context: 'editor' },
  { id: 'editor.outdent', title: 'Outdent', key: 'Shift-Tab', context: 'editor' },
  {
    id: 'editor.previous-row',
    title: 'Previous row',
    key: 'ArrowUp',
    context: 'editor',
  },
  {
    id: 'editor.next-row',
    title: 'Next row',
    key: 'ArrowDown',
    context: 'editor',
  },
  { id: 'editor.bold', title: 'Bold', key: 'Mod-b', context: 'editor' },
  { id: 'editor.italic', title: 'Italic', key: 'Mod-i', context: 'editor' },
  { id: 'editor.code', title: 'Inline code', key: 'Mod-e', context: 'editor' },
  { id: 'editor.insert-link', title: 'Insert link', key: 'Mod-k', context: 'editor' },
  {
    id: 'editor.toggle-collapse',
    title: 'Toggle collapse',
    key: 'Mod-Enter',
    context: 'editor',
  },
  {
    id: 'editor.soft-break',
    title: 'Soft line break',
    key: 'Shift-Enter',
    context: 'editor',
  },
  { id: 'editor.open-focus', title: 'Open focus', key: 'Mod-l', context: 'editor' },
] as const satisfies readonly ShortcutDescriptor[]

export type OutlineCallbacks = {
  onEnter: (view: EditorView) => void
  onBackspaceAtStart: (view: EditorView) => void
  onIndent: () => void
  onOutdent: () => void
  onArrowUp: () => void
  onArrowDown: () => void
  onInsertLink: () => void
  onToggleCollapse: () => void
  onShiftEnter?: () => void
  onOpenFocus?: () => void
}

const hardBreak = (s: Schema): Command => {
  const br = s.nodes.hard_break!
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

export const createOutlineKeymap = (
  callbacks: OutlineCallbacks,
  s: Schema = defaultSchema,
): Record<string, Command> => {
  const map: Record<string, Command> = {
    Enter: enterToOutline(callbacks.onEnter),
    Backspace: backspaceAtStart(callbacks.onBackspaceAtStart),
    Tab: tabToOutline(callbacks.onIndent),
    'Shift-Tab': tabToOutline(callbacks.onOutdent),
    ArrowUp: arrowUpToOutline(callbacks.onArrowUp),
    ArrowDown: arrowDownToOutline(callbacks.onArrowDown),
    'Mod-b': toggleMark(s.marks.bold!),
    'Mod-i': toggleMark(s.marks.italic!),
    'Mod-e': toggleMark(s.marks.code!),
    'Mod-k': modKToOutline(callbacks.onInsertLink),
    'Mod-Enter': tabToOutline(callbacks.onToggleCollapse),
  }

  if (callbacks.onShiftEnter) {
    map['Shift-Enter'] = tabToOutline(callbacks.onShiftEnter)
  } else {
    map['Shift-Enter'] = chainCommands(newlineInCode, createParagraphNear, hardBreak(s))
  }

  if (callbacks.onOpenFocus) {
    map['Mod-l'] = tabToOutline(callbacks.onOpenFocus)
  }

  return map
}
