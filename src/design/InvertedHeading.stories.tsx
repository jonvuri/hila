import type { Meta, StoryObj } from 'storybook-solidjs-vite'

import { InvertedHeading } from './InvertedHeading'

const meta: Meta<typeof InvertedHeading> = {
  title: 'Design/InvertedHeading',
  component: InvertedHeading,
  parameters: { layout: 'padded' },
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
  },
}

export default meta

type Story = StoryObj<typeof meta>

export const Large: Story = {
  args: { size: 'lg', children: 'Project roadmap' },
}

export const Medium: Story = {
  args: { size: 'md', children: 'Outline' },
}

export const Small: Story = {
  args: { size: 'sm', children: 'What is a face?' },
}

export const AllSizes: Story = {
  render: () => (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: 'var(--sp-16)' }}>
      <InvertedHeading size="lg">Large — Project roadmap</InvertedHeading>
      <InvertedHeading size="md">Medium — Outline</InvertedHeading>
      <InvertedHeading size="sm">Small — Architecture notes</InvertedHeading>
    </div>
  ),
}
