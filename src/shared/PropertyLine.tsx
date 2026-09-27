import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
  type Component,
} from 'solid-js'

import { getColumns, updateRow } from '../core/client/matrix-client'
import type { ColumnDefinition } from '../core/matrix'
import type { Density } from '../design/tokens'
import { useRowData } from '../sql/useRowData'

import { PropertyRow } from './PropertyRow'
import styles from './PropertyRow.module.css'

/**
 * Data-owning adapter for one property-line interior.
 *
 * Hosts choose the subject and density. This component owns the row/column hydration and uses the
 * same `PropertyRow` for both registered line renderings and substrate fallbacks, so field editing
 * is never mounted twice. A dry row stays read-only until its source data arrives.
 */
type PropertyLineProps = {
  matrixId: number
  rowId: number
  density: Density
  readOnly?: boolean
  onSave?: (columnName: string, value: string) => void
}

type Subject = Pick<PropertyLineProps, 'matrixId' | 'rowId'>

const HydratedPropertyLine: Component<
  Omit<PropertyLineProps, keyof Subject> & { subject: Subject }
> = (props) => {
  const [columns, setColumns] = createSignal<ColumnDefinition[]>([])
  const [columnsLoading, setColumnsLoading] = createSignal(true)
  const [columnsError, setColumnsError] = createSignal<Error | null>(null)
  let generation = 0

  createEffect(() => {
    const currentGeneration = ++generation
    setColumnsLoading(true)
    setColumnsError(null)
    void getColumns(props.subject.matrixId)
      .then((nextColumns) => {
        if (generation === currentGeneration) setColumns(nextColumns)
      })
      .catch((error: unknown) => {
        if (generation !== currentGeneration) return
        setColumns([])
        setColumnsError(error instanceof Error ? error : new Error(String(error)))
      })
      .finally(() => {
        if (generation === currentGeneration) setColumnsLoading(false)
      })
  })

  onCleanup(() => {
    generation++
  })

  const data = useRowData(
    () => props.subject.matrixId,
    () => props.subject.rowId,
  )

  const save = (columnName: string, value: string) => {
    if (props.onSave) {
      props.onSave(columnName, value)
      return
    }
    void updateRow(props.subject.matrixId, props.subject.rowId, { [columnName]: value })
  }

  return (
    <div
      data-testid="property-line"
      aria-busy={columnsLoading() || data() === null ? 'true' : undefined}
    >
      <Show
        when={!columnsError()}
        fallback={
          <div class={styles.lineError} role="alert">
            Property fields failed to load.
          </div>
        }
      >
        <PropertyRow
          columns={columns()}
          data={data()}
          density={props.density}
          readOnly={props.readOnly}
          onSave={save}
        />
      </Show>
    </div>
  )
}

/**
 * Remount the hydration scope whenever the subject changes. The fresh scope starts with no schema
 * or row data, and its save handler captures that immutable subject. Stale fields therefore cannot
 * remain interactive or write to the next subject while its asynchronous data is loading.
 */
export const PropertyLine: Component<PropertyLineProps> = (props) => {
  const subject = createMemo<Subject>(() => ({ matrixId: props.matrixId, rowId: props.rowId }))

  return (
    <Show keyed when={subject()}>
      {(currentSubject) => (
        <HydratedPropertyLine
          subject={currentSubject}
          density={props.density}
          readOnly={props.readOnly}
          onSave={props.onSave}
        />
      )}
    </Show>
  )
}
