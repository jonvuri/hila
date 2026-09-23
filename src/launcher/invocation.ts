import type { AppearanceProvenance } from '../core/place-navigation'
import type { NodeRef } from '../core/tree'

export type LauncherInvocation = {
  readonly focusElement?: HTMLElement
  readonly subject?: NodeRef
  readonly subjectLabel?: string
  readonly provenance?: AppearanceProvenance
}

const bytesFromHex = (hex: string | undefined): Uint8Array | undefined => {
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return undefined
  return Uint8Array.from(
    Array.from({ length: hex.length / 2 }, (_, index) =>
      Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
    ),
  )
}

export const captureLauncherInvocation = (
  activeElement: Element | null = document.activeElement,
): LauncherInvocation => {
  const focusElement = activeElement instanceof HTMLElement ? activeElement : undefined
  const host = focusElement?.closest<HTMLElement>('[data-launcher-subject]')
  if (!host) return { focusElement }

  const matrixId = Number(host.dataset.launcherMatrixId)
  const rowId = Number(host.dataset.launcherRowId)
  if (
    !Number.isSafeInteger(matrixId) ||
    matrixId <= 0 ||
    !Number.isSafeInteger(rowId) ||
    rowId <= 0
  ) {
    return { focusElement }
  }

  const provenanceKey = bytesFromHex(host.dataset.launcherProvenance)
  const subjectLabel = host.dataset.launcherSubjectLabel?.trim() || undefined
  return {
    focusElement,
    subject: { matrixId, rowId },
    subjectLabel,
    provenance: provenanceKey ? { key: provenanceKey } : undefined,
  }
}
