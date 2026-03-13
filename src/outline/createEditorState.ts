import { EditorState, type Plugin as StatePlugin } from 'prosemirror-state'
import { Node } from 'prosemirror-model'
import { history } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap } from 'prosemirror-commands'
import { inputRules, textblockTypeInputRule, InputRule } from 'prosemirror-inputrules'

import { schema } from './schema'
import { createOutlineKeymap, type OutlineCallbacks } from './keymap'

/**
 * `#`..`######` at start of textblock → heading of corresponding level.
 */
const headingRule = textblockTypeInputRule(/^(#{1,6})\s$/, schema.nodes.heading!, (match) => ({
  level: match[1]!.length,
}))

const markInputRule = (pattern: RegExp, markType: typeof schema.marks.bold) => {
  return new InputRule(pattern, (state, match, start, end) => {
    const captured = match[1]!
    return state.tr
      .delete(start, end)
      .insertText(captured, start)
      .addMark(start, start + captured.length, markType.create())
      .removeStoredMark(markType)
  })
}

const boldRule = markInputRule(/\*\*([^\s*](?:.*[^\s*])?)\*\*$/, schema.marks.bold!)
const italicRule = markInputRule(/(?<![*\w])\*([^\s*](?:.*[^\s*])?)\*$/, schema.marks.italic!)
const codeRule = new InputRule(/`([^`]+)`$/, (state, match, start, end) => {
  const codeMark = schema.marks.code!
  return state.tr
    .delete(start, end)
    .insertText(match[1]!, start)
    .addMark(start, start + match[1]!.length, codeMark.create())
    .removeStoredMark(codeMark)
})

const markdownInputRules = inputRules({
  rules: [headingRule, boldRule, italicRule, codeRule],
})

export const createEditorState = (
  docJson?: unknown,
  callbacks?: OutlineCallbacks,
  extraPlugins?: StatePlugin[],
): EditorState => {
  let doc: Node | undefined
  if (docJson) {
    doc = Node.fromJSON(schema, docJson)
  }

  const plugins: StatePlugin[] = [history(), markdownInputRules]
  if (extraPlugins) {
    plugins.push(...extraPlugins)
  }
  if (callbacks) {
    plugins.push(keymap(createOutlineKeymap(callbacks)))
  }
  plugins.push(keymap(baseKeymap))

  return EditorState.create({ doc, schema, plugins })
}
