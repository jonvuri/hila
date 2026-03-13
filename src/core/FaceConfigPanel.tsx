import { createSignal, createMemo, For, Show, type Component } from 'solid-js'

import { useQuery } from '../sql/useQuery'

import type { FaceConfig, FaceTypeDefinition, SlotBindingResult } from './face-types'
import { getAllFaceTypes, getFaceType } from './face-registry'
import { resolveSlotBindings } from './slot-binding'
import { applyFaceToMatrix, saveFaceConfig } from './client/matrix-client'
import type { ColumnDefinition } from './matrix'

export type FaceConfigPanelProps = {
  matrixId: number
  initialFaceTypeId?: string
  onApply?: (config: FaceConfig) => void
  onCancel?: () => void
}

const FaceConfigPanel: Component<FaceConfigPanelProps> = (props) => {
  const [selectedFaceTypeId, setSelectedFaceTypeId] = createSignal<string>(
    props.initialFaceTypeId ?? '',
  )
  const [overrides, setOverrides] = createSignal<Record<string, string>>({})
  const [applying, setApplying] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const { result: columnsResult } = useQuery(
    () =>
      `SELECT name, type, display_type, "order", options, formula FROM matrix_columns WHERE matrix_id = ${props.matrixId} ORDER BY "order"`,
  )

  const columns = createMemo((): ColumnDefinition[] => {
    const raw = columnsResult()
    if (!raw || !Array.isArray(raw)) return []
    return raw as unknown as ColumnDefinition[]
  })

  const faceTypes = createMemo(() => getAllFaceTypes())

  const selectedFaceType = createMemo((): FaceTypeDefinition | undefined => {
    const id = selectedFaceTypeId()
    return id ? getFaceType(id) : undefined
  })

  const resolvedBindings = createMemo((): SlotBindingResult => {
    const ft = selectedFaceType()
    const cols = columns()
    if (!ft || cols.length === 0) return { bindings: [], overflowColumns: [] }
    const colsForBinding = cols.map((c) => ({ name: c.name, type: c.type }))
    return resolveSlotBindings(ft, colsForBinding, overrides())
  })

  const handleFaceTypeChange = (faceTypeId: string) => {
    setSelectedFaceTypeId(faceTypeId)
    setOverrides({})
    setError(null)
  }

  const handleSlotBindingChange = (slotName: string, columnName: string) => {
    setOverrides((prev) => {
      if (columnName === '') {
        const next = { ...prev }
        delete next[slotName]
        return next
      }
      return { ...prev, [slotName]: columnName }
    })
  }

  const handleApply = async () => {
    const faceTypeId = selectedFaceTypeId()
    if (!faceTypeId) return

    setApplying(true)
    setError(null)

    try {
      const config = await applyFaceToMatrix(faceTypeId, props.matrixId)

      const currentOverrides = overrides()
      if (Object.keys(currentOverrides).length > 0) {
        const merged = { ...config.slotBindings, ...currentOverrides }
        const updatedConfig: FaceConfig = { ...config, slotBindings: merged }
        await saveFaceConfig(updatedConfig)
        props.onApply?.(updatedConfig)
      } else {
        props.onApply?.(config)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }

  return (
    <div class="face-config-panel" data-testid="face-config-panel">
      <div class="face-config-header">
        <h3 class="face-config-title">Configure Face</h3>
        <Show when={props.onCancel}>
          <button
            class="face-config-close"
            onClick={() => props.onCancel?.()}
            aria-label="Close"
          >
            ×
          </button>
        </Show>
      </div>

      {/* Face type picker */}
      <div class="face-config-section">
        <label class="face-config-label">Face type</label>
        <select
          class="face-config-select"
          value={selectedFaceTypeId()}
          onChange={(e) => handleFaceTypeChange(e.currentTarget.value)}
          data-testid="face-type-picker"
        >
          <option value="">Select a face type...</option>
          <For each={faceTypes()}>
            {(ft) => (
              <option value={ft.id}>
                {ft.name}
                {ft.slots.length > 0 ?
                  ` (${ft.slots.map((s) => s.name).join(', ')})`
                : ' (no slots)'}
              </option>
            )}
          </For>
        </select>
      </div>

      <Show when={selectedFaceType()}>
        {(faceType) => (
          <>
            {/* Face type info */}
            <div class="face-config-section">
              <div class="face-config-meta">
                <Show when={faceType().traitRequirements.length > 0}>
                  <span class="face-config-badge">
                    Traits:{' '}
                    {faceType()
                      .traitRequirements.map((r) => r.type)
                      .join(', ')}
                  </span>
                </Show>
                <span class="face-config-badge">Overflow: {faceType().overflowBehavior}</span>
              </div>
            </div>

            {/* Slot bindings */}
            <Show when={faceType().slots.length > 0}>
              <div class="face-config-section">
                <label class="face-config-label">Slot bindings</label>
                <div class="face-config-bindings">
                  <div class="face-config-binding-header">
                    <span>Slot</span>
                    <span>Preferred type</span>
                    <span>Bound column</span>
                  </div>
                  <For each={resolvedBindings().bindings}>
                    {(binding) => {
                      const slot = faceType().slots.find((s) => s.name === binding.slotName)
                      return (
                        <div class="face-config-binding-row" data-testid="slot-binding-row">
                          <span class="face-config-slot-name">
                            {binding.slotName}
                            <Show when={slot?.required}>
                              <span class="face-config-required">*</span>
                            </Show>
                          </span>
                          <span class="face-config-slot-type">
                            {slot?.preferredType ?? '—'}
                          </span>
                          <select
                            class="face-config-binding-select"
                            value={overrides()[binding.slotName] ?? binding.columnName}
                            onChange={(e) =>
                              handleSlotBindingChange(binding.slotName, e.currentTarget.value)
                            }
                            data-testid={`slot-binding-${binding.slotName}`}
                          >
                            <For each={columns()}>
                              {(col) => (
                                <option value={col.name}>
                                  {col.name} ({col.type})
                                </option>
                              )}
                            </For>
                          </select>
                          <span
                            class="face-config-resolution"
                            title={`Resolved via: ${binding.resolution}`}
                          >
                            {binding.resolution === 'explicit' ?
                              'manual'
                            : binding.resolution === 'name-match' ?
                              'name'
                            : binding.resolution === 'type-position' ?
                              'type'
                            : 'fallback'}
                          </span>
                        </div>
                      )
                    }}
                  </For>
                </div>
              </div>
            </Show>

            {/* Overflow columns */}
            <Show when={resolvedBindings().overflowColumns.length > 0}>
              <div class="face-config-section">
                <label class="face-config-label">Overflow columns (unbound)</label>
                <div class="face-config-overflow">
                  <For each={resolvedBindings().overflowColumns}>
                    {(col) => (
                      <span class="face-config-overflow-item" data-testid="overflow-column">
                        {col.name}
                        <span class="face-config-overflow-type">{col.type}</span>
                      </span>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            {/* Error */}
            <Show when={error()}>
              <div class="face-config-error">{error()}</div>
            </Show>

            {/* Actions */}
            <div class="face-config-actions">
              <Show when={props.onCancel}>
                <button
                  class="face-config-btn face-config-btn-cancel"
                  onClick={() => props.onCancel?.()}
                >
                  Cancel
                </button>
              </Show>
              <button
                class="face-config-btn face-config-btn-apply"
                onClick={handleApply}
                disabled={applying() || !selectedFaceTypeId()}
                data-testid="face-config-apply"
              >
                {applying() ? 'Applying...' : 'Apply Face'}
              </button>
            </div>
          </>
        )}
      </Show>
    </div>
  )
}

export default FaceConfigPanel
