import { type Component, type JSX, Show } from 'solid-js'
import { Dynamic } from 'solid-js/web'

import type { FaceConfig, SlotBindingResult } from './face-types'
import { getFaceType } from './face-registry'
import { resolveSlotBindings } from './slot-binding'

export type TemporaryLegacyFaceComponentProps = {
  config: FaceConfig
  bindings: SlotBindingResult
}

type TemporaryLegacyFaceComponent = Component<TemporaryLegacyFaceComponentProps>

const componentMap = new Map<string, TemporaryLegacyFaceComponent>()

/** Temporary whole-component registry for unmigrated Phase 13 consumers. */
export const registerTemporaryLegacyFaceComponent = (
  faceTypeId: string,
  component: TemporaryLegacyFaceComponent,
): void => {
  componentMap.set(faceTypeId, component)
}

/** Clear registered face components. Intended for tests only. */
export const clearTemporaryLegacyFaceComponents = (): void => {
  componentMap.clear()
}

/** Temporary whole-component dispatch. Phase 13 replaces all remaining uses. */
const TemporaryLegacyFaceAdapter: Component<{
  config: FaceConfig
  columns: { id: number; name: string; type: string }[]
  render?: (props: TemporaryLegacyFaceComponentProps) => JSX.Element
}> = (props) => {
  const resolve = (): {
    Comp?: TemporaryLegacyFaceComponent
    bindings: SlotBindingResult
  } | null => {
    const faceType = getFaceType(props.config.faceTypeId)
    const Comp = componentMap.get(props.config.faceTypeId)
    if (!faceType || (!Comp && !props.render)) return null
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
        if (props.render) return props.render({ config: props.config, bindings })
        return <Dynamic component={Comp!} config={props.config} bindings={bindings} />
      }}
    </Show>
  )
}

export default TemporaryLegacyFaceAdapter
