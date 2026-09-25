import { updateRow, updateTagType } from '../core/client/matrix-client'
import { extractTextFromPmDoc } from '../editor/pm-text'
import { refreshCachedTitles } from '../editor/inlineref-sync'

type EditableRowLabelTarget = {
  matrixId: number
  rowId: number
  column: string
  isTypeNode: boolean
}

/** Persist an editable row label through the mutation that owns its invariants. */
export const updateEditableRowLabel = async (
  target: EditableRowLabelTarget,
  docJson: Record<string, unknown>,
): Promise<void> => {
  const updated = await refreshCachedTitles(docJson)
  const label = JSON.stringify(updated)

  if (target.isTypeNode) {
    await updateTagType(target.rowId, { name: extractTextFromPmDoc(label) })
    return
  }

  await updateRow(target.matrixId, target.rowId, { [target.column]: label })
}
