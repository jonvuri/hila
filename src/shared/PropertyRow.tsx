import { createMemo, For, Show, type Component } from 'solid-js'

import type { ColumnDefinition } from '../core/matrix'

import { FieldEditor } from './FieldEditor'
import { partitionPropertyColumns } from './property-surface'

/**
 * Schema-adaptive row renderer (Phase 9.2; see context/Phase-9.2.md).
 *
 * Renders one matrix row's columns as a composed property row: a prominent
 * label, an editable field strip, and read-only formula columns. Columns are
 * split by `partitionPropertyColumns` (role-aware), and every editable field is
 * an always-live seamless `FieldEditor` so the row reads the same whether or not
 * a field is focused.
 *
 * `density` picks the composed layout corners settled in the prototype
 * (`src/design/outline/AspectRowPrototype.stories.tsx`):
 *  - `wide`   — label line, then a per-field-labeled horizontal strip below.
 *  - `narrow` — labels-aligned: a 2-col grid so every value starts at one edge.
 *
 * The rich-text / ProseMirror branch (for `content`-role columns) is not built
 * yet — no aspect carries one today; it lands when this renderer is reused for
 * §9.1 heterogeneous outline rows.
 *
 * Editability is decided **per cell**. `isEditable`, when provided, is the
 * authority — a column renders as an always-live `FieldEditor` iff it returns
 * true, else as a read-only display span (reusing the formula partition's
 * read-only styling). This is how Phase 9.3 query bands light up only the
 * recognized-updatable cells while derived/aggregate cells stay read-only. When
 * `isEditable` is absent, `readOnly` is the row-level fallback: all cells
 * read-only when true, all editable when false (the aspect-band default).
 * `onSave` is never called for a read-only cell (and may be omitted).
 */
export const PropertyRow: Component<{
  columns: ColumnDefinition[]
  data: Record<string, unknown> | null
  density: 'wide' | 'narrow'
  onSave?: (columnName: string, value: string) => void
  readOnly?: boolean
  /** Per-cell editability predicate; overrides `readOnly` when provided. */
  isEditable?: (col: ColumnDefinition) => boolean
}> = (props) => {
  const partition = createMemo(() => partitionPropertyColumns(props.columns))
  const valueOf = (col: ColumnDefinition) => String(props.data?.[col.name] ?? '')

  const cellEditable = (col: ColumnDefinition): boolean =>
    props.isEditable ? props.isEditable(col) : !props.readOnly

  const FieldName = (p: { name: string }) => (
    <span
      style={{
        'font-size': '9px',
        'font-weight': '600',
        color: 'var(--c-fg-3, #888)',
        'letter-spacing': '0.4px',
        'text-transform': 'uppercase',
        'line-height': '1',
        'white-space': 'nowrap',
      }}
    >
      {p.name}
    </span>
  )

  // `<Show>` (not a bare ternary) so the cell re-renders if editability resolves
  // reactively — e.g. a query band marking cells editable once the base catalog
  // loads. A ternary would capture the choice at first render and never update.
  const Field = (p: { col: ColumnDefinition }) => (
    <Show
      when={cellEditable(p.col)}
      fallback={
        <span class="tag-panel-field-value-readonly" data-testid="property-row-readonly-cell">
          {valueOf(p.col)}
        </span>
      }
    >
      <FieldEditor
        column={p.col}
        value={valueOf(p.col)}
        seamless
        showLabel={false}
        onSave={(v) => props.onSave?.(p.col.name, v)}
      />
    </Show>
  )

  return (
    <div class="property-row" data-testid="property-row">
      {/* Label — prominent, but still an always-live seamless editor. */}
      <Show when={partition().label}>
        {(labelCol) => (
          <div class="property-row-label">
            <Field col={labelCol()} />
          </div>
        )}
      </Show>

      {/* Editable field strip. */}
      <Show when={partition().fields.length > 0}>
        <Show
          when={props.density === 'narrow'}
          fallback={
            <div
              style={{
                display: 'flex',
                'flex-wrap': 'wrap',
                'align-items': 'flex-start',
                gap: '6px 16px',
                padding: '2px 0',
              }}
            >
              <For each={partition().fields}>
                {(col) => (
                  <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
                    <FieldName name={col.name} />
                    <Field col={col} />
                  </div>
                )}
              </For>
            </div>
          }
        >
          {/* narrow: labels-aligned 2-col grid */}
          <div
            style={{
              display: 'grid',
              'grid-template-columns': 'auto 1fr',
              'column-gap': '10px',
              'row-gap': '4px',
              'align-items': 'baseline',
              padding: '2px 0',
            }}
          >
            <For each={partition().fields}>
              {(col) => (
                <>
                  <FieldName name={col.name} />
                  <Field col={col} />
                </>
              )}
            </For>
          </div>
        </Show>
      </Show>

      {/* Read-only formula columns. */}
      <Show when={partition().formula.length > 0}>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
          <For each={partition().formula}>
            {(col) => (
              <div class="tag-panel-field tag-panel-field-formula">
                <label class="tag-panel-field-label">{col.name}</label>
                <span class="tag-panel-field-value-readonly">{valueOf(col)}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
