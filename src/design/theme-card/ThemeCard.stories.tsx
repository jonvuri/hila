import type { Meta, StoryObj } from 'storybook-solidjs-vite'

import { ghostTheme } from './ghost'
import ThemeCard from './ThemeCard'

const meta: Meta<typeof ThemeCard> = {
  title: 'Design/Theme comparison',
  component: ThemeCard,
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
    docs: {
      description: {
        component:
          'ThemeCard is the fixed comparison grammar for Ghost, Null, and Wipeout. Ghost supplies the shared structure and minimum affordances. Its semantic roles are local exploration inputs. Later cards must preserve its markup, content, and forced states.',
      },
    },
  },
}

export default meta

type Story = StoryObj<typeof meta>

export const Ghost: Story = {
  name: 'Ghost · minimum affordances',
  args: { theme: ghostTheme },
  parameters: {
    docs: {
      description: {
        story:
          'Ghost is the full baseline card. Each section identifies structural marks, semantic state signals, and the deliberate absence of optional decoration.',
      },
    },
  },
}
