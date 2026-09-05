import type { EditorView } from 'prosemirror-view'

import { commandRegistry, type CommandInvocationContext } from '../command-registry'
import type { NodeRef } from '../core/tree'

import { setPendingNewTable } from './pending-table'
import { openSlashTypePicker } from './slash-type-picker'

export type SlashNode = NodeRef

export type SlashCommand = {
  id: string
  label: string
}

const invocationContext = (node: SlashNode, view: EditorView): CommandInvocationContext => ({
  surface: 'slash',
  subject: node,
  capabilities: {
    focusCreatedTable: setPendingNewTable,
    openTypePicker: (subject) => openSlashTypePicker(view, subject),
  },
})

/** Adapt the shared registry to the slash menu without exposing EditorView to it. */
export const matchCommands = (
  query: string,
  node: SlashNode,
  view: EditorView,
): readonly SlashCommand[] =>
  commandRegistry
    .match(query, invocationContext(node, view))
    .filter(({ unavailableReason }) => unavailableReason === null)
    .map(({ command }) => ({ id: command.id, label: command.label }))

export const runSlashCommand = (id: string, node: SlashNode, view: EditorView): Promise<void> =>
  commandRegistry.invoke(id, invocationContext(node, view))
