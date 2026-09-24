type MarkerIdentity = { matrixId: number; rowId: number }

let pendingMarker: MarkerIdentity | null = null

/** Request one marker-specific focus/select handoff after save navigation. */
export const requestGeneratedViewNameFocus = (marker: MarkerIdentity): void => {
  pendingMarker = { ...marker }
}

export const hasGeneratedViewNameFocusRequest = (marker: MarkerIdentity): boolean =>
  pendingMarker?.matrixId === marker.matrixId && pendingMarker.rowId === marker.rowId

/** Only the matching label editor can consume the handoff, and only once. */
export const consumeGeneratedViewNameFocus = (marker: MarkerIdentity): boolean => {
  if (!hasGeneratedViewNameFocusRequest(marker)) return false
  pendingMarker = null
  return true
}

export const resetGeneratedViewNameFocusForTest = (): void => {
  pendingMarker = null
}
