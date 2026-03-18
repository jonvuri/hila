import type { Meta, StoryObj } from 'storybook-solidjs-vite'

import { Button } from './Button'

const meta: Meta<typeof Button> = {
  title: 'Design/Button',
  component: Button,
  parameters: { layout: 'centered' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'destructive', 'icon'],
    },
    disabled: { control: 'boolean' },
  },
}

export default meta

type Story = StoryObj<typeof meta>

export const Primary: Story = {
  args: { variant: 'primary', children: 'Primary' },
}

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Secondary' },
}

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Ghost' },
}

export const Destructive: Story = {
  args: { variant: 'destructive', children: 'Delete' },
}

export const Icon: Story = {
  args: {
    variant: 'icon',
    children: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <line
          x1="8"
          y1="3"
          x2="8"
          y2="13"
          style={{ stroke: 'currentColor', 'stroke-width': '1.5' }}
        />
        <line
          x1="3"
          y1="8"
          x2="13"
          y2="8"
          style={{ stroke: 'currentColor', 'stroke-width': '1.5' }}
        />
      </svg>
    ),
  },
}

export const Disabled: Story = {
  args: { variant: 'primary', disabled: true, children: 'Disabled' },
}

export const AllVariants: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        gap: 'var(--sp-8)',
        'flex-wrap': 'wrap',
        'align-items': 'center',
      }}
    >
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Delete</Button>
      <Button variant="icon">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <line
            x1="8"
            y1="3"
            x2="8"
            y2="13"
            style={{ stroke: 'currentColor', 'stroke-width': '1.5' }}
          />
          <line
            x1="3"
            y1="8"
            x2="13"
            y2="8"
            style={{ stroke: 'currentColor', 'stroke-width': '1.5' }}
          />
        </svg>
      </Button>
    </div>
  ),
}
