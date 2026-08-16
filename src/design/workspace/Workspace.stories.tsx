import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import type { JSX } from 'solid-js'

import Workspace from './Workspace'
import {
  crossMatrixPanels,
  fourColumnPanels,
  longLabelPanels,
  longWorkspaceTitle,
  rootShiftedPanels,
  rootVisiblePanels,
  workspaceTitle,
} from './fixtures'
import type { WorkspacePanel } from './types'

type StoryArgs = {
  panels: readonly WorkspacePanel[]
  workspaceTitle: string
}

const Frame = (props: { children: JSX.Element }): JSX.Element => (
  <div style={{ width: '100%', height: '100vh' }}>{props.children}</div>
)

const meta: Meta<StoryArgs> = {
  title: 'Design/Workspace',
  args: { workspaceTitle },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Ghost defines the shared workspace structure and minimum affordances. It has column boundaries, editable fields, collapse and drill controls, sticky state, keyboard focus, disabled rows, and active selection. Later themes must preserve this markup and behavior.',
      },
    },
  },
  render: (args) => (
    <Frame>
      <Workspace panels={args.panels} workspaceTitle={args.workspaceTitle} />
    </Frame>
  ),
}

export default meta

type Story = StoryObj<StoryArgs>

export const RootVisible: Story = {
  name: 'Ghost · Root visible',
  args: { panels: rootVisiblePanels },
  parameters: {
    docs: {
      description: {
        story:
          'The global-root navigation column is visible. No ancestry breadcrumb appears on a focus panel.',
      },
    },
  },
}

export const ExactlyFourColumns: Story = {
  name: 'Ghost · Exactly four columns',
  args: { panels: fourColumnPanels },
  parameters: {
    docs: {
      description: {
        story:
          'The bounded desktop window holds one root column and three focus columns. The root remains visible.',
      },
    },
  },
}

export const RootShiftedOffscreen: Story = {
  name: 'Ghost · Root shifted offscreen',
  args: { panels: rootShiftedPanels },
  parameters: {
    docs: {
      description: {
        story:
          'The fifth column removes the root column. One provenance breadcrumb appears only above the leftmost focus title.',
      },
    },
  },
}

export const LongLabels: Story = {
  name: 'Ghost · Long labels',
  args: { panels: longLabelPanels, workspaceTitle: longWorkspaceTitle },
  parameters: {
    docs: {
      description: {
        story:
          'Long workspace, panel, and row labels stay inside their columns. Controls remain reachable.',
      },
    },
  },
}

export const CrossMatrixAncestry: Story = {
  name: 'Ghost · Cross-matrix ancestry',
  args: { panels: crossMatrixPanels },
  parameters: {
    docs: {
      description: {
        story:
          'A provenance-resolved breadcrumb crosses from the workspace matrix into the task matrix without changing the panel structure.',
      },
    },
  },
}
