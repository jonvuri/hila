import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { For, Show } from 'solid-js'

import { tagColorFromName, tagBadgeBackground } from '../../tags/tag-color'

import { Outline } from './Outline'
import type { FlatRow, OutlineNode } from './types'
// tag-color is a pure utility with no app deps — acceptable for this prototype

// ─── Stub types ───────────────────────────────────────────────

type Field = { name: string; value: string }

type AspectRowData = {
  id: string
  label: string
  tagType: string
  fields: Field[]
}

type SubTableData = {
  title: string
  columns: string[]
  rows: string[][]
}

type NarrowFieldLayout = 'labels-above' | 'labels-left' | 'labels-aligned'

type LayoutArgs = {
  labelLayout: 'stacked' | 'inline'
  headerMode: 'per-field' | 'block-header'
  narrowFieldLayout: NarrowFieldLayout
  groupIndicator: 'border' | 'tint' | 'none'
  isNarrow: boolean
  fieldCount: 'all' | 'key'
}

// ─── Stub data ────────────────────────────────────────────────

const TASK_ROWS: AspectRowData[] = [
  {
    id: 'a1',
    label: 'Write prototype UI',
    tagType: 'task',
    fields: [
      { name: 'status', value: 'In progress' },
      { name: 'due', value: 'Mon Jun 16' },
      { name: 'priority', value: 'High' },
    ],
  },
  {
    id: 'a2',
    label: 'Document design decisions',
    tagType: 'task',
    fields: [
      { name: 'status', value: 'Todo' },
      { name: 'due', value: 'Wed Jun 18' },
      { name: 'priority', value: 'Medium' },
    ],
  },
]

const REVIEW_ROWS: AspectRowData[] = [
  {
    id: 'a3',
    label: 'Intercom Design System',
    tagType: 'review',
    fields: [
      { name: 'rating', value: '★★★★' },
      { name: 'verdict', value: 'Excellent' },
    ],
  },
]

const SOURCES_TABLE: SubTableData = {
  title: 'Source materials',
  columns: ['title', 'author', 'year'],
  rows: [
    ['A Pattern Language', 'Alexander et al.', '1977'],
    ['The Design of Everyday Things', 'Norman', '2013'],
    ['Envisioning Information', 'Tufte', '1990'],
  ],
}

const EXPERIMENTS_TABLE: SubTableData = {
  title: 'Experiments',
  columns: ['condition', 'result', 'confidence'],
  rows: [
    ['Inline fields', 'Preferred in wide panes', 'High'],
    ['Stacked fields', 'Preferred in narrow panes', 'Medium'],
  ],
}

const SUB_TABLE_MAP: Record<string, SubTableData> = {
  sub1: SOURCES_TABLE,
  sub2: EXPERIMENTS_TABLE,
}

// Subtree: grandchild sub-table (sub1, depth 1) and great-grandchild sub-table (sub2, depth 2)
const OUTLINE_ITEMS: OutlineNode[] = [
  {
    id: 'research',
    content: 'Research directions',
    children: [
      { id: 'sub1', content: '__subtable__' },
      {
        id: 'findings',
        content: 'Core findings',
        children: [
          { id: 'sub2', content: '__subtable__' },
          { id: 'q1', content: 'Quantitative results support the hypothesis' },
          { id: 'q2', content: 'Qualitative interviews add nuance' },
        ],
      },
      { id: 'oq', content: 'Open questions from literature' },
    ],
  },
  { id: 'next', content: 'Next steps' },
  { id: 'openq', content: 'Open questions' },
]

// ─── Type badge bullet ────────────────────────────────────────

const TypeBadge = (props: { typeName: string }) => {
  const color = tagColorFromName(props.typeName)
  return (
    <div
      title={`#${props.typeName}`}
      style={{
        width: '15px',
        height: '15px',
        'border-radius': '3px',
        background: color,
        color: '#fff',
        'font-size': '9px',
        'font-weight': '700',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'flex-shrink': '0',
        'user-select': 'none',
        'margin-top': '7px',
      }}
    >
      {props.typeName[0]!.toUpperCase()}
    </div>
  )
}

// ─── Single field value ───────────────────────────────────────

const FIELD_LABEL_STYLE = {
  'font-size': '9px',
  color: 'var(--c-fg-3)',
  'font-weight': '600',
  'letter-spacing': '0.4px',
  'text-transform': 'uppercase' as const,
  'line-height': '1',
}
const FIELD_VALUE_STYLE = {
  'font-size': '12px',
  color: 'var(--c-fg-2)',
  'line-height': '1.4',
}

const FieldValue = (props: {
  field: Field
  showLabel: boolean
  narrowLayout: NarrowFieldLayout
  isNarrow: boolean
}) => {
  const labelStyle = FIELD_LABEL_STYLE
  const valueStyle = FIELD_VALUE_STYLE

  return (
    <Show
      when={props.isNarrow}
      fallback={
        // Wide: compact column with optional small label above
        <div style={{ 'min-width': '64px', 'flex-shrink': '0' }}>
          <Show when={props.showLabel}>
            <div style={{ ...labelStyle, 'margin-bottom': '2px' }}>{props.field.name}</div>
          </Show>
          <div style={valueStyle}>{props.field.value}</div>
        </div>
      }
    >
      {/* Narrow: vertical layout, two sub-variants */}
      <Show
        when={props.narrowLayout === 'labels-left'}
        fallback={
          // labels-above: name on its own line above value
          <div>
            <div style={{ ...labelStyle, 'margin-bottom': '1px' }}>{props.field.name}</div>
            <div style={valueStyle}>{props.field.value}</div>
          </div>
        }
      >
        {/* labels-left: "name: value" on one line */}
        <div style={{ display: 'flex', gap: '4px', 'align-items': 'baseline' }}>
          <span style={{ ...labelStyle, 'white-space': 'nowrap', 'flex-shrink': '0' }}>
            {props.field.name}:
          </span>
          <span style={valueStyle}>{props.field.value}</span>
        </div>
      </Show>
    </Show>
  )
}

// ─── Field strip ──────────────────────────────────────────────

const FieldStrip = (props: {
  fields: Field[]
  showLabels: boolean
  narrowLayout: NarrowFieldLayout
  isNarrow: boolean
}) => {
  // Narrow + labels-aligned: a 2-column grid so the label column sizes to the
  // widest label and every value starts at the same left edge.
  const isAligned = () => props.isNarrow && props.narrowLayout === 'labels-aligned'

  return (
    <Show
      when={isAligned()}
      fallback={
        <div
          style={{
            display: 'flex',
            'flex-direction': props.isNarrow ? 'column' : 'row',
            gap: props.isNarrow ? '5px' : '16px',
            padding: '2px 0 4px',
          }}
        >
          <For each={props.fields}>
            {(field) => (
              <FieldValue
                field={field}
                showLabel={props.showLabels}
                narrowLayout={props.narrowLayout}
                isNarrow={props.isNarrow}
              />
            )}
          </For>
        </div>
      }
    >
      <div
        style={{
          display: 'grid',
          'grid-template-columns': 'auto 1fr',
          'column-gap': '10px',
          'row-gap': '5px',
          'align-items': 'baseline',
          padding: '2px 0 4px',
        }}
      >
        <For each={props.fields}>
          {(field) => (
            <>
              <span style={{ ...FIELD_LABEL_STYLE, 'white-space': 'nowrap' }}>
                {field.name}
              </span>
              <span style={FIELD_VALUE_STYLE}>{field.value}</span>
            </>
          )}
        </For>
      </div>
    </Show>
  )
}

// ─── Block header (Option 2: block-header mode) ───────────────
// Sticky within the scene's scroll context so it pins when scrolling
// through many rows of the same type. Note: with only 2–3 rows in this
// prototype the sticky effect is subtle — add more TASK_ROWS to test it.

const BlockHeader = (props: { fieldNames: string[]; labelLayout: 'stacked' | 'inline' }) => (
  <div
    style={{
      display: 'flex',
      'flex-direction': 'row',
      gap: '16px',
      padding: '2px 0 4px',
      'border-bottom': '1px solid var(--c-border)',
      'margin-bottom': '2px',
      position: 'sticky',
      top: '0',
      background: 'var(--c-bg)',
      'z-index': '2',
    }}
  >
    <Show when={props.labelLayout === 'inline'}>
      <span
        style={{
          'font-size': '9px',
          color: 'var(--c-fg-3)',
          'font-weight': '600',
          'letter-spacing': '0.4px',
          'text-transform': 'uppercase',
          flex: '0 0 55%',
          'padding-right': '8px',
        }}
      >
        label
      </span>
    </Show>
    <For each={props.fieldNames}>
      {(name) => (
        <span
          style={{
            'font-size': '9px',
            color: 'var(--c-fg-3)',
            'font-weight': '600',
            'letter-spacing': '0.4px',
            'text-transform': 'uppercase',
            'min-width': '64px',
            'flex-shrink': '0',
            'white-space': 'nowrap',
          }}
        >
          {name}
        </span>
      )}
    </For>
  </div>
)

// ─── Aspect row ───────────────────────────────────────────────

const AspectRow = (props: {
  row: AspectRowData
  layout: LayoutArgs
  isFirstInBlock: boolean
}) => {
  const fields = () =>
    props.layout.fieldCount === 'key' ? props.row.fields.slice(0, 2) : props.row.fields

  // Block-header mode suppresses per-field labels; narrow mode always shows them
  const showPerFieldLabels = () =>
    props.layout.headerMode === 'per-field' || props.layout.isNarrow

  // Inline layout collapses to stacked in narrow mode
  const isInline = () => props.layout.labelLayout === 'inline' && !props.layout.isNarrow
  const isBlockHeader = () =>
    props.layout.headerMode === 'block-header' && !props.layout.isNarrow

  return (
    <div>
      <Show when={isBlockHeader() && props.isFirstInBlock}>
        <BlockHeader
          fieldNames={fields().map((f) => f.name)}
          labelLayout={props.layout.labelLayout}
        />
      </Show>

      {/* Fallback notice when inline collapses in narrow */}
      <Show
        when={
          props.layout.isNarrow && props.layout.labelLayout === 'inline' && props.isFirstInBlock
        }
      >
        <div
          style={{
            'font-size': '10px',
            color: 'var(--c-fg-3)',
            'font-style': 'italic',
            'padding-bottom': '2px',
          }}
        >
          inline → stacked (narrow)
        </div>
      </Show>

      <div
        style={{
          display: 'flex',
          'flex-direction': isInline() ? 'row' : 'column',
          'align-items': isInline() ? 'baseline' : 'stretch',
          'min-height': '28px',
          padding: '2px 0',
        }}
      >
        {/* Label */}
        <div
          style={{
            flex: isInline() ? '0 0 55%' : undefined,
            'min-width': '0',
            'font-size': 'var(--text-base)',
            color: 'var(--c-fg)',
            'line-height': '1.6',
            overflow: isInline() ? 'hidden' : undefined,
            'text-overflow': isInline() ? 'ellipsis' : undefined,
            'white-space': isInline() ? 'nowrap' : undefined,
            'padding-right': isInline() ? '12px' : undefined,
          }}
        >
          {props.row.label}
        </div>

        {/* Fields */}
        <div style={{ flex: isInline() ? '1' : undefined, 'min-width': '0' }}>
          <FieldStrip
            fields={fields()}
            showLabels={showPerFieldLabels()}
            narrowLayout={props.layout.narrowFieldLayout}
            isNarrow={props.layout.isNarrow}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Aspect block ─────────────────────────────────────────────

const AspectBlock = (props: { rows: AspectRowData[]; layout: LayoutArgs }) => {
  const color = tagColorFromName(props.rows[0]!.tagType)
  const tintBg = tagBadgeBackground(color)

  const blockStyle = () => {
    switch (props.layout.groupIndicator) {
      case 'border':
        return { 'border-left': `2px solid ${color}`, 'padding-left': '8px' }
      case 'tint':
        return { 'padding-left': '2px' }
      case 'none':
        return { 'padding-left': '2px' }
    }
  }

  return (
    <div style={{ ...blockStyle(), margin: '3px 0' }}>
      <For each={props.rows}>
        {(row, i) => (
          <div
            style={{
              display: 'flex',
              gap: '8px',
              'align-items': 'flex-start',
              background: props.layout.groupIndicator === 'tint' ? tintBg : undefined,
              'border-radius': props.layout.groupIndicator === 'tint' ? '3px' : undefined,
              padding: props.layout.groupIndicator === 'tint' ? '0 4px' : undefined,
            }}
          >
            <TypeBadge typeName={row.tagType} />
            <div style={{ flex: '1', 'min-width': '0' }}>
              <AspectRow row={row} layout={props.layout} isFirstInBlock={i() === 0} />
            </div>
          </div>
        )}
      </For>
    </div>
  )
}

// ─── Sub-table embed ──────────────────────────────────────────

const SubTableEmbed = (props: { data: SubTableData }) => {
  const baseCellStyle = {
    padding: '3px 8px',
    'font-size': '12px',
    overflow: 'hidden',
    'text-overflow': 'ellipsis',
    'white-space': 'nowrap',
  }

  return (
    <div
      style={{
        margin: '2px 0',
        border: '1px solid var(--c-border-2)',
        'border-radius': '4px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '3px 8px',
          'font-size': '10px',
          'font-weight': '600',
          color: 'var(--c-fg-3)',
          'letter-spacing': '0.3px',
          'text-transform': 'uppercase',
          background: 'var(--c-surface)',
          'border-bottom': '1px solid var(--c-border-2)',
        }}
      >
        {props.data.title}
      </div>
      {/* Column headers */}
      <div
        style={{
          display: 'flex',
          background: 'var(--c-surface)',
          'border-bottom': '1px solid var(--c-border)',
        }}
      >
        <For each={props.data.columns}>
          {(col, j) => (
            <div
              style={{
                ...baseCellStyle,
                flex: j() === 0 ? '2' : '1',
                'font-weight': '600',
                'font-size': '10px',
                'letter-spacing': '0.3px',
                'text-transform': 'uppercase',
                color: 'var(--c-fg-3)',
              }}
            >
              {col}
            </div>
          )}
        </For>
      </div>
      {/* Data rows */}
      <For each={props.data.rows}>
        {(row, i) => (
          <div
            style={{
              display: 'flex',
              background: i() % 2 === 0 ? 'var(--c-bg)' : 'var(--c-surface)',
            }}
          >
            <For each={row}>
              {(cell, j) => (
                <div
                  style={{
                    ...baseCellStyle,
                    flex: j() === 0 ? '2' : '1',
                    color: j() === 0 ? 'var(--c-fg)' : 'var(--c-fg-2)',
                  }}
                >
                  {cell}
                </div>
              )}
            </For>
          </div>
        )}
      </For>
    </div>
  )
}

// ─── Prototype scene ──────────────────────────────────────────

type PrototypeSceneProps = {
  labelLayout: 'stacked' | 'inline'
  headerMode: 'per-field' | 'block-header'
  narrowFieldLayout: 'labels-above' | 'labels-left'
  groupIndicator: 'border' | 'tint' | 'none'
  containerWidth: 'wide' | 'narrow'
  fieldCount: 'all' | 'key'
}

const renderContent = (row: FlatRow) => {
  const subTable = SUB_TABLE_MAP[row.id]
  if (subTable) return <SubTableEmbed data={subTable} />
  return (
    <span
      style={{
        'font-size': 'var(--text-base)',
        'line-height': '1.6',
        padding: '4px 0',
        display: 'block',
        color: 'var(--c-fg)',
      }}
    >
      {row.content}
    </span>
  )
}

const PrototypeScene = (props: PrototypeSceneProps) => {
  const isNarrow = () => props.containerWidth === 'narrow'

  const layout = (): LayoutArgs => ({
    labelLayout: props.labelLayout,
    headerMode: props.headerMode,
    narrowFieldLayout: props.narrowFieldLayout,
    groupIndicator: props.groupIndicator,
    isNarrow: isNarrow(),
    fieldCount: props.fieldCount,
  })

  return (
    <div
      style={{
        width: isNarrow() ? '280px' : '680px',
        'max-width': '100%',
        'font-family': 'var(--font-sans)',
        background: 'var(--c-bg)',
        border: '1px solid var(--c-border)',
        'border-radius': '6px',
        overflow: 'hidden',
        display: 'flex',
        'flex-direction': 'column',
        'max-height': '580px',
      }}
    >
      {/* Focused node header — mirrors the focus panel label + content area */}
      <div
        style={{
          padding: '14px 16px 12px',
          'border-bottom': '1px solid var(--c-border-2)',
          'flex-shrink': '0',
        }}
      >
        <div
          style={{
            'font-size': 'var(--text-lg)',
            'font-weight': '600',
            color: 'var(--c-fg-max)',
            'line-height': '1.4',
          }}
        >
          Design exploration notes
        </div>
        <div
          style={{
            'font-size': 'var(--text-sm)',
            color: 'var(--c-fg-3)',
            'margin-top': '6px',
            'line-height': '1.5',
          }}
        >
          Investigating multi-field display for{' '}
          <span
            style={{
              background: tagBadgeBackground(tagColorFromName('task')),
              color: tagColorFromName('task'),
              padding: '0 4px',
              'border-radius': '3px',
              'font-size': '11px',
              'font-weight': '600',
            }}
          >
            #task
          </span>{' '}
          and{' '}
          <span
            style={{
              background: tagBadgeBackground(tagColorFromName('review')),
              color: tagColorFromName('review'),
              padding: '0 4px',
              'border-radius': '3px',
              'font-size': '11px',
              'font-weight': '600',
            }}
          >
            #review
          </span>{' '}
          aspect rows.
        </div>
      </div>

      {/* Aspect block section — between node content and children nav panel.
          Scroll context here so block-header sticky works within this zone. */}
      <div
        style={{
          padding: '8px 16px',
          'border-bottom': '1px solid var(--c-border-2)',
          'flex-shrink': '0',
          'overflow-y': 'auto',
        }}
      >
        <AspectBlock rows={TASK_ROWS} layout={layout()} />
        <div style={{ height: '4px' }} />
        <AspectBlock rows={REVIEW_ROWS} layout={layout()} />
      </div>

      {/* Children nav panel */}
      <div style={{ 'overflow-y': 'auto', flex: '1' }}>
        <Outline theme="workflowy-clone" items={OUTLINE_ITEMS} renderContent={renderContent} />
      </div>
    </div>
  )
}

// ─── Meta ─────────────────────────────────────────────────────

const meta: Meta<PrototypeSceneProps> = {
  title: 'Design/Outline/AspectRowPrototype',
  parameters: { layout: 'centered' },
  argTypes: {
    labelLayout: {
      control: 'radio',
      options: ['stacked', 'inline'],
      description:
        'Option 1 — stacked: label on its own full-width line, field strip below. ' +
        'inline: label as first column (~55% width), fields alongside it in the same row. ' +
        'Automatically falls back to stacked in narrow mode.',
    },
    headerMode: {
      control: 'radio',
      options: ['per-field', 'block-header'],
      description:
        'Option 2 — per-field: small column name above each field value (reads as a form). ' +
        'block-header: one shared sticky header above each contiguous same-type block ' +
        '(reads as a table header). Degrades to per-field in narrow mode.',
    },
    narrowFieldLayout: {
      control: 'radio',
      options: ['labels-above', 'labels-left', 'labels-aligned'],
      description:
        'Option 3 (narrow mode only) — when fields go vertical, ' +
        'labels-above puts the column name on its own line above the value; ' +
        'labels-left shows "name: value" as an inline pair, pairs stacking vertically; ' +
        'labels-aligned puts labels in a left column so every value starts at the same left edge ' +
        '(2-col grid, label column sized to the widest label).',
    },
    groupIndicator: {
      control: 'radio',
      options: ['border', 'tint', 'none'],
      description:
        'How ownership is signaled at the block level. ' +
        'border: 2px colored left border on the group. ' +
        'tint: light type-color background on each row. ' +
        'none: no block-level color — only the type badge bullet signals type.',
    },
    containerWidth: {
      control: 'radio',
      options: ['wide', 'narrow'],
      description:
        'wide ≈ 680px (full-size panel). narrow ≈ 280px (stream-view pane / mobile).',
    },
    fieldCount: {
      control: 'radio',
      options: ['all', 'key'],
      description:
        'all: show every column from the aspect schema. ' +
        'key: show only the first 2 columns (the "key properties" preview).',
    },
  },
  args: {
    labelLayout: 'stacked',
    headerMode: 'per-field',
    narrowFieldLayout: 'labels-left',
    groupIndicator: 'border',
    containerWidth: 'wide',
    fieldCount: 'all',
  },
}

export default meta
type Story = StoryObj<typeof meta>

const render = (args: PrototypeSceneProps) => <PrototypeScene {...args} />

// Interactive story — use the controls panel to toggle all options
export const Prototype: Story = { render }

// Preset snapshots for key combinations

export const StackedPerField: Story = {
  name: 'Stacked + Per-field (wide)',
  args: {
    labelLayout: 'stacked',
    headerMode: 'per-field',
    containerWidth: 'wide',
    fieldCount: 'all',
    groupIndicator: 'border',
  },
  render,
}

export const InlineBlockHeader: Story = {
  name: 'Inline + Block header (wide)',
  args: {
    labelLayout: 'inline',
    headerMode: 'block-header',
    containerWidth: 'wide',
    fieldCount: 'all',
    groupIndicator: 'border',
  },
  render,
}

export const NarrowLabelsLeft: Story = {
  name: 'Narrow — labels-left',
  args: {
    labelLayout: 'stacked',
    headerMode: 'per-field',
    containerWidth: 'narrow',
    narrowFieldLayout: 'labels-left',
    fieldCount: 'all',
    groupIndicator: 'border',
  },
  render,
}

export const NarrowLabelsAbove: Story = {
  name: 'Narrow — labels-above',
  args: {
    labelLayout: 'stacked',
    headerMode: 'per-field',
    containerWidth: 'narrow',
    narrowFieldLayout: 'labels-above',
    fieldCount: 'all',
    groupIndicator: 'border',
  },
  render,
}

export const NarrowLabelsAligned: Story = {
  name: 'Narrow — labels-aligned',
  args: {
    labelLayout: 'stacked',
    headerMode: 'per-field',
    containerWidth: 'narrow',
    narrowFieldLayout: 'labels-aligned',
    fieldCount: 'all',
    groupIndicator: 'border',
  },
  render,
}

export const KeyFieldsOnly: Story = {
  name: 'Key fields (2 cols, inline)',
  args: {
    labelLayout: 'inline',
    headerMode: 'block-header',
    containerWidth: 'wide',
    fieldCount: 'key',
    groupIndicator: 'none',
  },
  render,
}

export const TintIndicator: Story = {
  name: 'Tint group indicator',
  args: {
    labelLayout: 'stacked',
    headerMode: 'per-field',
    containerWidth: 'wide',
    fieldCount: 'all',
    groupIndicator: 'tint',
  },
  render,
}
