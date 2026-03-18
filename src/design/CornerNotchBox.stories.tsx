import type { Meta, StoryObj } from 'storybook-solidjs-vite'

import { CornerNotchBox } from './CornerNotchBox'

const meta: Meta<typeof CornerNotchBox> = {
  title: 'Design/CornerNotchBox',
  component: CornerNotchBox,
  parameters: { layout: 'padded' },
}

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    maxWidth: '480px',
    children: (
      <div
        style={{
          'font-size': 'var(--text-sm)',
          color: 'var(--c-fg-2)',
          'line-height': '1.6',
        }}
      >
        The outline plugin maintains a closure trait for hierarchical relationships and a rank
        trait for ordering. Both are provisioned on first use and shared across all consumers
        within the same matrix.
      </div>
    ),
  },
}

export const NarrowContent: Story = {
  args: {
    maxWidth: '280px',
    children: (
      <div style={{ 'font-size': 'var(--text-sm)', color: 'var(--c-fg-2)' }}>
        A compact container with corner notch decoration.
      </div>
    ),
  },
}
