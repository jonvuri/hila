import type { Selection, Transaction } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'

export type InlineRefTarget = {
  targetMatrixId: number | null
  targetRowId: number | null
  cachedTitle?: string
}

type InlineRefInsertion = {
  kind: 'own' | 'ref'
  from?: number
  to?: number
  selection?: Selection
}

/** Build the one canonical transaction that inserts an inline reference. */
export const buildInlineRefInsertion = (
  view: EditorView,
  target: InlineRefTarget,
  insertion: InlineRefInsertion,
): Transaction => {
  const node = view.state.schema.nodes.inlineref!.create({
    targetMatrixId: target.targetMatrixId,
    targetRowId: target.targetRowId,
    kind: insertion.kind,
    cachedTitle: target.cachedTitle ?? null,
  })
  const tr = view.state.tr

  if (insertion.selection) {
    tr.setSelection(insertion.selection)
  }
  return insertion.from === undefined ?
      tr.replaceSelectionWith(node)
    : tr.replaceWith(insertion.from, insertion.to ?? insertion.from, node)
}
