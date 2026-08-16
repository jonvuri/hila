import type { Meta, StoryObj } from 'storybook-solidjs-vite'

import ThemeCard from './ThemeCard'
import type { ThemeCardThemeInput } from './types'

const grammarTheme: ThemeCardThemeInput = {
  id: 'unassigned',
  name: 'Shared theme-card grammar',
  intent:
    'Hold content, density, structure, interaction states, and section order constant across theme comparisons.',
  delta:
    'None. This card defines the specimen grammar only. It does not assign Ghost, Null, or Wipeout values.',
}

const meta: Meta<typeof ThemeCard> = {
  title: 'Design/Theme comparison',
  component: ThemeCard,
  parameters: {
    layout: 'fullscreen',
    controls: { disable: true },
    docs: {
      description: {
        component:
          'ThemeCard is the fixed comparison grammar for Ghost, Null, and Wipeout. Its semantic roles are local exploration inputs. Its markup, content, and forced states remain identical between cards.',
      },
    },
  },
}

export default meta

type Story = StoryObj<typeof meta>

export const Grammar: Story = {
  name: 'Shared grammar · no theme values',
  args: { theme: grammarTheme },
}
