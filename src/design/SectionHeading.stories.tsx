import type { Meta, StoryObj } from 'storybook-solidjs-vite'

import { SectionHeading } from './SectionHeading'

const meta: Meta<typeof SectionHeading> = {
  title: 'Design/SectionHeading',
  component: SectionHeading,
  parameters: { layout: 'padded' },
}

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { children: 'Research & analysis' },
}

export const WithContext: Story = {
  render: () => (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: 'var(--space-8)' }}>
      <SectionHeading>Matrix registry</SectionHeading>
      <p
        style={{
          'font-size': 'var(--type-body-small-size)',
          color: 'var(--color-text-faint)',
          'max-width': '640px',
          'line-height': '1.5',
        }}
      >
        Large font, light weight, secondary color — for organizational sections.
      </p>
    </div>
  ),
}
