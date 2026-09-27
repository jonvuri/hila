import { createEffect, createMemo, createSignal, For, Show, type Component } from 'solid-js'

import { useRowData } from '../sql/useRowData'
import { updateRow, getColumns } from '../core/client/matrix-client'
import type { ColumnDefinition } from '../core/matrix'
import { FieldEditor, ReadonlyField } from '../shared/FieldEditor'
import { filterEditableColumns, filterFormulaColumns } from '../shared/property-surface'
import { AnchoredOverlay } from '../design/overlay/Overlay'

import { tagColorFromName, tagBadgeBackground } from './tag-color'
import styles from './TagPropertyPanel.module.css'

type TagPropertyPanelProps = {
  matrixId: number
  rowId: number
  tagTypeName: string
  anchorRect: DOMRect
  restoreFocusTo: HTMLElement
  onClose: () => void
}

const TagPropertyPanel: Component<TagPropertyPanelProps> = (props) => {
  const [columns, setColumns] = createSignal<ColumnDefinition[]>([])

  const rowData = useRowData(
    () => props.matrixId,
    () => props.rowId,
  )

  createEffect(() => {
    void getColumns(props.matrixId).then((cols) => setColumns(cols))
  })

  const editableColumns = createMemo(() => filterEditableColumns(columns()))

  const formulaColumns = createMemo(() => filterFormulaColumns(columns()))

  const handleSave = (columnName: string, value: string) => {
    void updateRow(props.matrixId, props.rowId, { [columnName]: value })
  }

  const badgeColor = () => tagColorFromName(props.tagTypeName)
  const badgeBg = () => tagBadgeBackground(badgeColor())

  return (
    <AnchoredOverlay
      anchor={props.anchorRect}
      restoreFocusTo={props.restoreFocusTo}
      class={styles.panel}
      role="dialog"
      ariaLabel={`Properties for #${props.tagTypeName}`}
      width={280}
      maxHeight={400}
      testId="tag-property-panel"
      onDismiss={() => props.onClose()}
    >
      <div class={styles.header}>
        <span
          class={styles.badge}
          style={{ color: badgeColor(), 'background-color': badgeBg() }}
        >
          #{props.tagTypeName}
        </span>
        <button
          type="button"
          class={styles.close}
          onClick={() => props.onClose()}
          aria-label="Close tag properties"
          title="Close"
        >
          ×
        </button>
      </div>

      <Show when={rowData()} fallback={<div class={styles.loading}>Loading…</div>}>
        <div class={styles.fields}>
          <For each={editableColumns()}>
            {(col) => (
              <FieldEditor
                column={col}
                value={String(rowData()![col.name] ?? '')}
                onSave={(v) => handleSave(col.name, v)}
              />
            )}
          </For>

          <Show when={formulaColumns().length > 0}>
            <For each={formulaColumns()}>
              {(col) => (
                <ReadonlyField column={col} value={String(rowData()![col.name] ?? '')} />
              )}
            </For>
          </Show>
        </div>
      </Show>
    </AnchoredOverlay>
  )
}

export default TagPropertyPanel
