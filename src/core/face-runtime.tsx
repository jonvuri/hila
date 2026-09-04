import { createMemo, Show, type Component, type JSX } from 'solid-js'
import { Dynamic } from 'solid-js/web'

import type { FaceRecipe, FaceSubject } from './face-types'

export type FaceRenderingKind = 'line' | 'collection'

export type FaceRenderingProps = {
  subject: FaceSubject
  recipe: FaceRecipe
}

export type FaceRenderRegistration = Partial<
  Record<FaceRenderingKind, Component<FaceRenderingProps>>
>

const renderings = new Map<string, FaceRenderRegistration>()

export const registerFaceRenderings = (
  faceTypeId: string,
  registration: FaceRenderRegistration,
): void => {
  renderings.set(faceTypeId, { ...renderings.get(faceTypeId), ...registration })
}

export const getFaceRendering = (
  faceTypeId: string,
  kind: FaceRenderingKind,
): Component<FaceRenderingProps> | undefined => renderings.get(faceTypeId)?.[kind]

export const clearFaceRenderings = (): void => {
  renderings.clear()
}

/**
 * A host-owned slot requests one face interior. The host keeps the wrapper,
 * fidelity, sizing, recursion, navigation, and insertion policy.
 */
export const FaceHostSlot: Component<{
  host: string
  kind: FaceRenderingKind
  subject: FaceSubject
  recipe: FaceRecipe
  fidelity: 'composed' | 'substrate' | 'x-ray'
  fallback?: JSX.Element
}> = (props) => {
  const Rendering = createMemo(() => getFaceRendering(props.recipe.faceTypeId, props.kind))

  return (
    <div
      data-testid="face-host-slot"
      data-face-rendering={props.kind}
      data-fidelity={props.fidelity}
      data-host={props.host}
      data-subject-mode={props.subject.mode}
    >
      <Show when={Rendering()} fallback={props.fallback}>
        {(rendering) => (
          <Dynamic component={rendering()} subject={props.subject} recipe={props.recipe} />
        )}
      </Show>
    </div>
  )
}
