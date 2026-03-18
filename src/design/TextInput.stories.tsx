import type { Meta, StoryObj } from 'storybook-solidjs-vite'

import { TextInput } from './TextInput'

const meta: Meta<typeof TextInput> = {
  title: 'Design/TextInput',
  component: TextInput,
  parameters: { layout: 'centered' },
  argTypes: {
    fullWidth: { control: 'boolean' },
  },
}

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { placeholder: 'Search matrixes…' },
}

export const WithValue: Story = {
  args: { value: 'Outline' },
}

export const FullWidth: Story = {
  args: { placeholder: 'Quick entry…', fullWidth: true },
  parameters: { layout: 'padded' },
}
