import { EditorState, type Plugin as StatePlugin } from 'prosemirror-state'
import type { Node, Schema } from 'prosemirror-model'
import { Node as PmNode } from 'prosemirror-model'
import { history } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap } from 'prosemirror-commands'
import { inputRules, textblockTypeInputRule, InputRule } from 'prosemirror-inputrules'

import { schema } from './schema'
import { labelSchema } from './label-schema'
import { createOutlineKeymap, type OutlineCallbacks } from './keymap'

// ---------------------------------------------------------------------------
// Input rules
// ---------------------------------------------------------------------------

const headingRule = textblockTypeInputRule(/^(#{1,6})\s$/, schema.nodes.heading!, (match) => ({
  level: match[1]!.length,
}))

const markInputRule = (pattern: RegExp, markType: Schema['marks'][string]) =>
  new InputRule(pattern, (state, match, start, end) => {
    const captured = match[1]!
    return state.tr
      .delete(start, end)
      .insertText(captured, start)
      .addMark(start, start + captured.length, markType.create())
      .removeStoredMark(markType)
  })

const makeBoldRule = (s: Schema) =>
  markInputRule(/\*\*([^\s*](?:.*[^\s*])?)\*\*$/, s.marks.bold!)
const makeItalicRule = (s: Schema) =>
  markInputRule(/(?<![*\w])\*([^\s*](?:.*[^\s*])?)\*$/, s.marks.italic!)
const makeCodeRule = (s: Schema) =>
  new InputRule(/`([^`]+)`$/, (state, match, start, end) => {
    const codeMark = s.marks.code!
    return state.tr
      .delete(start, end)
      .insertText(match[1]!, start)
      .addMark(start, start + match[1]!.length, codeMark.create())
      .removeStoredMark(codeMark)
  })

const contentInputRules = inputRules({
  rules: [headingRule, makeBoldRule(schema), makeItalicRule(schema), makeCodeRule(schema)],
})

const labelInputRules = inputRules({
  rules: [makeBoldRule(labelSchema), makeItalicRule(labelSchema), makeCodeRule(labelSchema)],
})

// ---------------------------------------------------------------------------
// Label editor state (single-paragraph schema, outline keybindings)
// ---------------------------------------------------------------------------

export const createLabelEditorState = (
  docJson?: unknown,
  callbacks?: OutlineCallbacks,
  extraPlugins?: StatePlugin[],
): EditorState => {
  let doc: PmNode | undefined
  if (docJson) {
    doc = PmNode.fromJSON(labelSchema, docJson)
  }

  const plugins: StatePlugin[] = [history(), labelInputRules]
  if (extraPlugins) {
    plugins.push(...extraPlugins)
  }
  if (callbacks) {
    plugins.push(keymap(createOutlineKeymap(callbacks, labelSchema)))
  }
  plugins.push(keymap(baseKeymap))

  return EditorState.create({ doc, schema: labelSchema, plugins })
}

// ---------------------------------------------------------------------------
// Content editor state (full multi-block schema)
// ---------------------------------------------------------------------------

export const createContentEditorState = (
  docJson?: unknown,
  extraPlugins?: StatePlugin[],
): EditorState => {
  let doc: PmNode | undefined
  if (docJson) {
    doc = PmNode.fromJSON(schema, docJson)
  }

  const plugins: StatePlugin[] = [history(), contentInputRules]
  if (extraPlugins) {
    plugins.push(...extraPlugins)
  }
  plugins.push(keymap(baseKeymap))

  return EditorState.create({ doc, schema, plugins })
}

// ---------------------------------------------------------------------------
// Debounced save
// ---------------------------------------------------------------------------

export type DebouncedSaveHandle = {
  schedule: (doc: Node) => void
  flush: () => void
  destroy: () => void
}

export const createDebouncedSave = (
  saveFn: (doc: Node) => void,
  debounceMs = 300,
): DebouncedSaveHandle => {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Node | undefined

  const flush = () => {
    clearTimeout(timer)
    if (pending !== undefined) {
      const doc = pending
      pending = undefined
      saveFn(doc)
    }
  }

  const schedule = (doc: Node) => {
    pending = doc
    clearTimeout(timer)
    timer = setTimeout(flush, debounceMs)
  }

  const destroy = () => {
    flush()
  }

  return { schedule, flush, destroy }
}

export { schema as contentSchema, labelSchema }
