import type { Meta, StoryObj } from 'storybook-solidjs-vite'

import { ghostTheme } from './ghost'
import { nullTheme } from './null'
import ThemePreview, { themePreviewIds } from './ThemePreview'
import { wipeoutTheme } from './wipeout'

const meta: Meta<typeof ThemePreview> = {
  title: 'Design/Theme previewer',
  component: ThemePreview,
  args: { theme: 'ghost' },
  argTypes: {
    theme: {
      control: 'inline-radio',
      options: themePreviewIds,
      description: 'Select the approved theme rendered by the shared preview.',
    },
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'ThemePreview renders one approved theme through the fixed ThemeCard grammar. Ghost supplies the shared structure and minimum affordances. Null and Wipeout preserve its markup, content, and forced states.',
      },
    },
  },
}

export default meta

type Story = StoryObj<typeof meta>

export const Preview: Story = {
  name: 'Theme preview',
  parameters: {
    docs: {
      description: {
        story:
          'Use the theme control to switch instantly between the finalized Ghost, Null, and Wipeout treatments. The content, states, and workspace fixtures stay fixed.',
      },
    },
  },
}

export const Ghost: Story = {
  name: 'Ghost · minimum affordances',
  args: { theme: 'ghost' },
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story: `${ghostTheme.intent} ${ghostTheme.delta} Each section identifies structural marks, semantic state signals, and the deliberate absence of optional decoration.`,
      },
    },
  },
}

export const Null: Story = {
  name: 'Null · conventional affordances',
  args: { theme: 'null' },
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story: `${nullTheme.intent} ${nullTheme.delta} Its ledger links each conventional addition to a Ghost ambiguity.`,
      },
    },
  },
}

export const Wipeout: Story = {
  name: 'Wipeout · instrument character',
  args: { theme: 'wipeout' },
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story: `${wipeoutTheme.intent} ${wipeoutTheme.delta} Long-form text keeps the shared body face.`,
      },
    },
  },
}
