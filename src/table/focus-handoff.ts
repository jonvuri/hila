import { createSignal } from 'solid-js'

// The launcher creates and configures a table before its Table face exists. Keep
// the requested matrix identity until that face mounts or updates to match it.
const [pendingTableFaceFocusMatrixId, setPendingTableFaceFocusMatrixId] = createSignal<
  number | null
>(null)

export { pendingTableFaceFocusMatrixId }

export const requestTableFaceFocus = (matrixId: number): void => {
  setPendingTableFaceFocusMatrixId(matrixId)
}

export const clearTableFaceFocusRequest = (matrixId: number): void => {
  if (pendingTableFaceFocusMatrixId() === matrixId) setPendingTableFaceFocusMatrixId(null)
}
