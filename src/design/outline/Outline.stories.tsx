import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { For } from 'solid-js'

import { Outline } from './Outline'
import { OutlineNode, OutlineTheme } from './types'

const demoItems: OutlineNode[] = [
  {
    id: '1',
    content: 'Project planning',
    children: [
      {
        id: '1.1',
        content:
          'Define scope and requirements for the initial prototype, including core features and technical constraints that will guide early decisions',
      },
      {
        id: '1.2',
        content: 'Set up environment',
        children: [
          {
            id: '1.2.1',
            content:
              'Install dependencies and configure the build pipeline for both development and production environments',
          },
          { id: '1.2.2', content: 'Configure linting and formatting' },
        ],
      },
      {
        id: '1.3',
        content: 'Timeline',
        children: [
          { id: '1.3.1', content: 'Sprint 1 — discovery and scaffolding' },
          { id: '1.3.2', content: 'Sprint 2 — core feature implementation' },
        ],
      },
    ],
  },
  {
    id: '2',
    content: 'Research',
    children: [
      {
        id: '2.1',
        content:
          'Literature review — survey existing approaches to hierarchical data editing, outliner interfaces, and block-based editors',
      },
      { id: '2.2', content: 'Interview stakeholders' },
      {
        id: '2.3',
        content: 'Competitive analysis',
        children: [
          { id: '2.3.1', content: 'Feature comparison matrix' },
          {
            id: '2.3.2',
            content:
              'UX patterns to adopt or avoid based on usability research findings from comparable tools in the productivity space',
          },
        ],
      },
    ],
  },
  { id: '3', content: 'Design exploration' },
]

const defaultCollapsed = new Set(['1.3'])

const meta: Meta<typeof Outline> = {
  title: 'Design/Outline',
  component: Outline,
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
      options: [
        'workflowy-clone',
        'workflowy-geometric',
        'vector-field',
        'corner-notches',
        'whitespace-only',
      ] satisfies OutlineTheme[],
    },
  },
}

export default meta

type Story = StoryObj<typeof meta>

export const WorkflowyClone: Story = {
  render: () => (
    <Outline theme="workflowy-clone" items={demoItems} initialCollapsed={defaultCollapsed} />
  ),
}

export const WorkflowyGeometric: Story = {
  render: () => (
    <Outline
      theme="workflowy-geometric"
      items={demoItems}
      initialCollapsed={defaultCollapsed}
    />
  ),
}

export const VectorField: Story = {
  render: () => (
    <Outline theme="vector-field" items={demoItems} initialCollapsed={defaultCollapsed} />
  ),
}

export const CornerNotches: Story = {
  render: () => (
    <Outline theme="corner-notches" items={demoItems} initialCollapsed={defaultCollapsed} />
  ),
}

export const WhitespaceOnly: Story = {
  render: () => (
    <Outline theme="whitespace-only" items={demoItems} initialCollapsed={defaultCollapsed} />
  ),
}

const denseItems: OutlineNode[] = [
  {
    id: 'q',
    content: 'Quarterly goals',
    children: [
      {
        id: 'la',
        content: 'Launch alpha',
        children: [
          {
            id: 'ps',
            content: 'Plugin system',
            children: [
              {
                id: 'fs',
                content: 'Face slots',
                children: [
                  { id: 'br', content: 'Binding resolution' },
                  { id: 'fl', content: 'Fallback logic' },
                ],
              },
              { id: 'tp', content: 'Trait provisioning' },
              { id: 'ra', content: 'Registry API' },
            ],
          },
          {
            id: 'ni',
            content: 'Notes integration',
            children: [
              { id: 'wl', content: 'Wiki-links' },
              { id: 'bp', content: 'Backlinks panel' },
            ],
          },
          {
            id: 'tf',
            content: 'Table face',
            children: [
              { id: 'tf1', content: 'Column config' },
              { id: 'tf2', content: 'Row selection' },
              { id: 'tf3', content: 'Sort controls' },
              { id: 'tf4', content: 'Filter bar' },
              { id: 'tf5', content: 'Inline editing' },
            ],
          },
          { id: 'fc', content: 'Formula columns' },
        ],
      },
      {
        id: 'ds',
        content: 'Design system',
        children: [
          { id: 'ts', content: 'Token scale' },
          { id: 'cv', content: 'CSS variables' },
          { id: 'cl', content: 'Component library' },
        ],
      },
      {
        id: 'ut',
        content: 'User testing',
        children: [
          { id: 'ut1', content: 'Scenario scripts' },
          { id: 'ut2', content: 'Recording setup' },
          { id: 'ut3', content: 'Participant recruitment' },
          { id: 'ut4', content: 'Analysis template' },
          { id: 'ut5', content: 'Report format' },
          { id: 'ut6', content: 'Feedback synthesis' },
        ],
      },
      {
        id: 'doc',
        content: 'Documentation',
        children: [
          { id: 'ad', content: 'Architecture docs' },
          { id: 'ar', content: 'API reference' },
        ],
      },
    ],
  },
  {
    id: 'inf',
    content: 'Infrastructure',
    children: [
      {
        id: 'se',
        content: 'Sync engine',
        children: [
          { id: 'ct', content: 'Change tracking' },
          { id: 'cr', content: 'Conflict resolution' },
        ],
      },
      { id: 'fst', content: 'File storage' },
      {
        id: 'dp',
        content: 'Dropbox provider',
        children: [
          { id: 'oa', content: 'OAuth flow' },
          { id: 'lp', content: 'Long-poll sync' },
        ],
      },
    ],
  },
  { id: 'pol', content: 'Polish' },
]

const denseCollapsed = new Set(['tf', 'ut'])

export const VectorFieldDense: Story = {
  render: () => (
    <Outline theme="vector-field" items={denseItems} initialCollapsed={denseCollapsed} />
  ),
}

const allThemes: OutlineTheme[] = [
  'workflowy-clone',
  'workflowy-geometric',
  'vector-field',
  'corner-notches',
  'whitespace-only',
]

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
            <Outline theme={theme} items={demoItems} initialCollapsed={new Set(['1.3'])} />
          </div>
        )}
      </For>
    </div>
  ),
}
