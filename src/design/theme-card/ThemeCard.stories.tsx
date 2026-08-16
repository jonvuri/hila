import type { Meta, StoryObj } from 'storybook-solidjs-vite'

import { ghostTheme } from './ghost'
import { nullTheme } from './null'
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

export const GhostAndNull: Story = {
  name: 'Ghost → Null · consecutive comparison',
  args: { theme: ghostTheme },
  render: () => (
    <div class="tc-comparison-page">
      <ThemeCard theme={ghostTheme} />
      <ThemeCard theme={nullTheme} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Ghost and Null render consecutively with the same component, content, forced states, workspace fixtures, and dial schema. Null changes only local role values and optional decorative primitives.',
      },
    },
  },
}

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

export const Null: Story = {
  name: 'Null · conventional affordances',
  args: { theme: nullTheme },
  parameters: {
    docs: {
      description: {
        story:
          'Null extends Ghost with conventional boundaries, state fills, control surfaces, and elevation. Its ledger links each addition to a Ghost ambiguity.',
      },
    },
  },
}
