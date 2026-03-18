import type { Meta, StoryObj } from 'storybook-solidjs-vite'

import { Divider } from './Divider'

const meta: Meta<typeof Divider> = {
  title: 'Design/Divider',
  component: Divider,
  parameters: { layout: 'padded' },
  argTypes: {
    full: { control: 'boolean' },
  },
}

export default meta

type Story = StoryObj<typeof meta>

export const Short: Story = {
  args: { full: false },
}

export const Full: Story = {
  args: { full: true },
}

export const BetweenContent: Story = {
  render: () => (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: 'var(--sp-16)' }}>
      <p style={{ 'font-size': 'var(--text-sm)', color: 'var(--c-fg-2)' }}>
        Content above the short divider.
      </p>
      <Divider />
      <p style={{ 'font-size': 'var(--text-sm)', color: 'var(--c-fg-2)' }}>
        Content below the short divider.
      </p>
      <Divider full />
      <p style={{ 'font-size': 'var(--text-sm)', color: 'var(--c-fg-2)' }}>
        Content below the full divider.
      </p>
    </div>
  ),
}
