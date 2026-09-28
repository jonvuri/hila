import type { JSX } from 'solid-js'

import { resolveFaceAffinity, type FaceAffinity } from '../core/face-affinity'
import type { FaceRecipe, FaceSubject } from '../core/face-types'
import type { RenderingFidelity } from '../design/tokens'

export const getFocusCollectionRecipeMatrixId = (subject: FaceSubject): number | null =>
  subject.mode === 'container' ? subject.extentMatrixId : null

export const resolveFocusCollectionAffinity = (
  subject: FaceSubject,
  recipe: FaceRecipe | null | undefined,
): FaceAffinity => resolveFaceAffinity(subject.mode === 'container' ? recipe : null)

export type CollectionHostOptions = {
  host?: string
  fidelity?: RenderingFidelity
  view?: {
    name?: string | null
    onDelete: () => void
    onOpen?: () => void
  }
}

export type RenderSubjectCollection = (
  subject: FaceSubject,
  options?: CollectionHostOptions,
) => JSX.Element
