import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { For } from 'solid-js'

import type { ColumnDefinition } from '../core/matrix'
import type { Density, RenderingFidelity } from '../design/tokens'
import {
  InlineReferenceBadge,
  type InlineReferenceState,
} from '../editor/nodeviews/InlineRefView'
import { tagBadgeBackground, tagColorFromName } from '../tags/tag-color'

import { FieldEditor } from './FieldEditor'
import { PropertyRow } from './PropertyRow'

type StoryArgs = {
  density: Density
  fidelity: RenderingFidelity
}

const column = (name: string, overrides: Partial<ColumnDefinition> = {}): ColumnDefinition => ({
  id: name.length,
  name,
  type: 'TEXT',
  displayType: 'text',
  order: 0,
  options: null,
  formula: null,
  constraints: null,
  managedBy: null,
  role: null,
  ...overrides,
})

const columns = [
  column('title', { role: 'label' }),
  column('status', { displayType: 'select', options: '["todo","doing","done"]' }),
  column('due', { displayType: 'date' }),
  column('score', { formula: '1 + 1' }),
]

const row = {
  title: 'Review line participation',
  status: 'doing',
  due: '2026-09-30',
  score: '2',
}

const referenceStates: readonly {
  kind: 'ref' | 'own'
  state: InlineReferenceState
  title: string
}[] = [
  { kind: 'ref', state: 'live', title: 'Architecture notes' },
  { kind: 'own', state: 'live', title: '#task' },
  { kind: 'ref', state: 'empty', title: 'Unresolved note' },
  { kind: 'own', state: 'ghost', title: '#deleted-task' },
]

const Surface = (props: StoryArgs) => {
  const tagColor = tagColorFromName('task')
  return (
    <main
      data-fidelity={props.fidelity}
      style={{
        display: 'grid',
        gap: 'var(--space-section-gap)',
        width: props.density === 'narrow' ? '360px' : '720px',
        'max-width': '100%',
        padding: 'var(--space-content-inset)',
        background: 'var(--color-canvas)',
        color: 'var(--color-text)',
      }}
    >
      <section style={{ display: 'grid', gap: 'var(--space-control-gap)' }}>
        <h2 style={{ margin: 0, 'font-size': 'var(--type-display-small-size)' }}>
          Property line
        </h2>
        <PropertyRow columns={columns} data={row} density={props.density} onSave={() => {}} />
        <PropertyRow columns={columns} data={null} density={props.density} onSave={() => {}} />
      </section>

      <section style={{ display: 'grid', gap: 'var(--space-control-gap)' }}>
        <h2 style={{ margin: 0, 'font-size': 'var(--type-display-small-size)' }}>
          Field states
        </h2>
        <FieldEditor
          column={column('estimate', { displayType: 'number' })}
          value="later"
          invalid
          validationMessage="Estimate must be a number."
          onSave={() => {}}
        />
      </section>

      <section style={{ display: 'grid', gap: 'var(--space-control-gap)' }}>
        <h2 style={{ margin: 0, 'font-size': 'var(--type-display-small-size)' }}>
          Inline references
        </h2>
        <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: 'var(--space-control-gap)' }}>
          <For each={referenceStates}>
            {(reference) => (
              <InlineReferenceBadge
                {...reference}
                keyProps={
                  reference.kind === 'own' && reference.state === 'live' ?
                    [
                      { label: 'status', value: 'doing' },
                      { label: 'priority', value: 'high' },
                    ]
                  : undefined
                }
                color={
                  reference.kind === 'own' && reference.state === 'live' ? tagColor : undefined
                }
                backgroundColor={
                  reference.kind === 'own' && reference.state === 'live' ?
                    tagBadgeBackground(tagColor)
                  : undefined
                }
              />
            )}
          </For>
        </div>
      </section>
    </main>
  )
}

const meta: Meta<StoryArgs> = {
  title: 'Live/Property and inline surfaces',
  args: { density: 'wide', fidelity: 'composed' },
  argTypes: {
    density: { control: 'inline-radio', options: ['wide', 'narrow'] },
    fidelity: { control: 'inline-radio', options: ['composed', 'substrate'] },
  },
  parameters: { layout: 'centered' },
  render: (args) => <Surface {...args} />,
}

export default meta

type Story = StoryObj<StoryArgs>

export const States: Story = {}

export const NarrowSubstrate: Story = {
  args: { density: 'narrow', fidelity: 'substrate' },
}
