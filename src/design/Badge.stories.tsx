import type { Meta, StoryObj } from 'storybook-solidjs-vite'

import { Badge } from './Badge'

const meta: Meta<typeof Badge> = {
  title: 'Design/Badge',
  component: Badge,
  parameters: { layout: 'centered' },
}

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { children: 'text' },
}

export const AllTypes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 'var(--sp-8)', 'align-items': 'center' }}>
      <Badge>text</Badge>
      <Badge>richtext</Badge>
      <Badge>number</Badge>
      <Badge>date</Badge>
      <Badge>formula</Badge>
    </div>
  ),
}
