import type { Meta, StoryObj } from 'storybook-solidjs-vite'

const meta: Meta = {
  title: 'Design/Workspace',
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Forward workspace stories start here. Session 4d will add the theme-neutral Ghost structure.',
      },
    },
  },
}

export default meta

type Story = StoryObj

export const GhostPlaceholder: Story = {
  name: 'Ghost · Placeholder',
  render: () => (
    <p style={{ color: 'var(--c-fg-2)', 'font-family': 'var(--font-sans)' }}>
      Ghost workspace extraction starts in Session 4d.
    </p>
  ),
}
