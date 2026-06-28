import { createSignal } from 'solid-js'

/**
 * Pending new-table handoff (Phase 9 §9.6 — the argument-free `/table` launcher).
 *
 * `/table` is a pure side-effect launcher: picking it immediately creates a new
 * dedicated sub-table, then attention should land on that table's name input
 * (primed for the next keystrokes). But the creating editor and the consuming
 * `SubTableBand` are decoupled — the band may not even be mounted yet when the
 * op fires (e.g. run from an outline row, not the focus panel). So `/table` sets
 * this module-scoped signal to the new matrix id; the matching `EmbeddedSubTable`
 * consumes it on mount (scroll into view, focus + accent-highlight its name
 * input) and clears it. The signal **persists until consumed**, bridging the gap.
 *
 * Mirrors the module-scoped signal pattern of `aspect-tether.ts`.
 */

const [pendingNewTableMatrixId, setPending] = createSignal<number | null>(null)

export { pendingNewTableMatrixId }

export const setPendingNewTable = (matrixId: number): void => {
  setPending(matrixId)
}

/** Clear only if `matrixId` is the one currently pending (avoids a late consumer
 *  stomping a newer pending table). */
export const clearPendingNewTable = (matrixId: number): void => {
  if (pendingNewTableMatrixId() === matrixId) setPending(null)
}
