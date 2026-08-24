import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import type { JSX } from 'solid-js'

import { polarityValues, type Polarity, type VisualTheme, visualThemeValues } from '../tokens'

import { navigationOutlinePanels, workspaceTitle } from './fixtures'
import Workspace from './Workspace'

type StoryArgs = {
  polarity: Polarity
  showLeafBullets: boolean
  visualTheme: VisualTheme
}

const Frame = (props: StoryArgs & { children: JSX.Element }): JSX.Element => (
  <div
    data-theme={props.polarity}
    data-visual-theme={props.visualTheme}
    style={{ width: '100%', height: '100vh' }}
  >
    {props.children}
  </div>
)

const meta: Meta<StoryArgs> = {
  title: 'Design/Navigation outline',
  args: {
    polarity: 'dark',
    showLeafBullets: false,
    visualTheme: 'ghost',
  },
  argTypes: {
    polarity: { control: 'select', options: polarityValues },
    showLeafBullets: { control: 'boolean' },
    visualTheme: { control: 'select', options: visualThemeValues },
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'This focused specimen uses the forward navigation panel. The outline treatment changes decoration only. Visual theme and polarity remain independent.',
      },
    },
  },
  render: (args) => (
    <Frame {...args}>
      <Workspace
        panels={navigationOutlinePanels}
        workspaceTitle={workspaceTitle}
        navigationOutline="guides"
        showLeafBullets={args.showLeafBullets}
      />
    </Frame>
  ),
}

export default meta

type Story = StoryObj<StoryArgs>

export const Guides: Story = {}
