import { type Component, type JSX, Show } from 'solid-js'

import type { FaceConfig, SlotBindingResult } from './face-types'
import { getFaceType } from './face-registry'
import { resolveSlotBindings } from './slot-binding'

export type FaceComponentProps = {
  config: FaceConfig
  bindings: SlotBindingResult
}

type FaceComponent = Component<FaceComponentProps>

const componentMap = new Map<string, FaceComponent>()

/** Register a UI component for a face type ID. Called at app startup by plugins. */
export const registerFaceComponent = (faceTypeId: string, component: FaceComponent): void => {
  componentMap.set(faceTypeId, component)
}

/** Clear registered face components. Intended for tests only. */
export const clearFaceComponents = (): void => {
  componentMap.clear()
}

/**
 * Renders the appropriate face component for a given FaceConfig.
 * Resolves slot bindings and passes them alongside the config to the
 * registered face type component.
 */
const FaceRenderer: Component<{
  config: FaceConfig
  columns: { id: number; name: string; type: string }[]
}> = (props) => {
  const resolve = (): { Comp: FaceComponent; bindings: SlotBindingResult } | null => {
    const faceType = getFaceType(props.config.faceTypeId)
    const Comp = componentMap.get(props.config.faceTypeId)
    if (!faceType || !Comp) return null
    const explicit: Record<string, number> = {}
    for (const [slot, colId] of Object.entries(props.config.slotBindings)) {
      if (colId != null) explicit[slot] = colId
    }
    const bindings = resolveSlotBindings(faceType, props.columns, explicit)
    return { Comp, bindings }
  }

  return (
    <Show
      when={resolve()}
      fallback={<div class="face-error">Unknown face type: {props.config.faceTypeId}</div>}
    >
      {(resolved): JSX.Element => {
        const { Comp, bindings } = resolved()
        return <Comp config={props.config} bindings={bindings} />
      }}
    </Show>
  )
}

export default FaceRenderer
