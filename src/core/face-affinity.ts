import type { FaceRecipe } from './face-types'

export type FaceAffinity =
  | { readonly source: 'intentional'; readonly recipe: FaceRecipe }
  | { readonly source: 'substrate'; readonly recipe: null }

export const SUBSTRATE_FACE_AFFINITY: FaceAffinity = Object.freeze({
  source: 'substrate',
  recipe: null,
})

/** Resolve the one stored rendering choice before falling through to host infrastructure. */
export const resolveFaceAffinity = (recipe: FaceRecipe | null | undefined): FaceAffinity =>
  recipe ? { source: 'intentional', recipe } : SUBSTRATE_FACE_AFFINITY
