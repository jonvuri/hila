import type { Meta, StoryObj } from 'storybook-solidjs-vite'

import { ghostTheme } from './ghost'
import { nullTheme } from './null'
import ThemeCard from './ThemeCard'
import { wipeoutTheme } from './wipeout'

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

export const Comparison: Story = {
  name: 'Ghost → Null → Wipeout · consecutive comparison',
  args: { theme: ghostTheme },
  render: () => (
    <div class="tc-comparison-page">
      <ThemeCard theme={ghostTheme} />
      <ThemeCard theme={nullTheme} />
      <ThemeCard theme={wipeoutTheme} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Ghost, Null, and Wipeout render consecutively with the same component, content, forced states, workspace fixtures, and dial schema. Themes change only local role values and optional decorative primitives.',
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

export const Wipeout: Story = {
  name: 'Wipeout · instrument character',
  args: { theme: wipeoutTheme },
  parameters: {
    docs: {
      description: {
        story:
          'Wipeout extends Ghost with hard brightness steps, instrument type, disciplined accent, one-cut geometry, ticks, and VFD segment texture. Long-form text keeps the shared body face.',
      },
    },
  },
}
