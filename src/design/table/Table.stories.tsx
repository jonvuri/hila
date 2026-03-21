import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { For } from 'solid-js'

import { Table } from './Table'
import type { Column, FlatTableRow, TableTheme } from './types'

const demoColumns: Column[] = [
  { key: 'title', label: 'Title' },
  { key: 'type', label: 'Type' },
  { key: 'status', label: 'Status' },
  { key: 'modified', label: 'Modified' },
]

const demoRows: FlatTableRow[] = [
  {
    id: '1',
    cells: { title: 'Project roadmap', type: 'text', status: 'active', modified: '2026-03-14' },
  },
  {
    id: '2',
    cells: { title: 'Design language', type: 'text', status: 'draft', modified: '2026-03-16' },
  },
  {
    id: '3',
    cells: {
      title: 'Architecture notes',
      type: 'richtext',
      status: 'active',
      modified: '2026-03-12',
    },
  },
  {
    id: '4',
    cells: { title: 'Meeting log', type: 'text', status: 'archived', modified: '2026-02-28' },
  },
]

const meta: Meta<typeof Table> = {
  title: 'Design/Table',
  component: Table,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ 'max-width': '640px' }}>
        <Story />
      </div>
    ),
  ],
  argTypes: {
    theme: {
      control: 'select',
      options: ['thin-line', 'corner-notch', 'cell-dots'] satisfies TableTheme[],
    },
  },
}

export default meta

type Story = StoryObj<typeof meta>

export const ThinLine: Story = {
  render: () => <Table theme="thin-line" columns={demoColumns} rows={demoRows} />,
}

export const CornerNotch: Story = {
  render: () => <Table theme="corner-notch" columns={demoColumns} rows={demoRows} />,
}

export const CellDots: Story = {
  render: () => <Table theme="cell-dots" columns={demoColumns} rows={demoRows} />,
}

const allThemes: TableTheme[] = ['thin-line', 'corner-notch', 'cell-dots']

export const AllThemes: Story = {
  render: () => (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: 'var(--sp-32)' }}>
      <For each={allThemes}>
        {(theme) => (
          <div>
            <div
              style={{
                'font-size': 'var(--text-xs)',
                'font-weight': '600',
                'letter-spacing': '1.5px',
                'text-transform': 'uppercase',
                color: 'var(--c-fg-3)',
                'margin-bottom': 'var(--sp-8)',
              }}
            >
              {theme}
            </div>
            <Table theme={theme} columns={demoColumns} rows={demoRows} />
          </div>
        )}
      </For>
    </div>
  ),
}
