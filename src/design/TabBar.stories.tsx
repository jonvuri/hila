import type { Meta, StoryObj } from 'storybook-solidjs-vite'

import { TabBar, Tab } from './TabBar'

const meta: Meta<typeof TabBar> = {
  title: 'Design/TabBar',
  component: TabBar,
  parameters: { layout: 'padded' },
}

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <TabBar>
      <Tab active>Outline</Tab>
      <Tab>Table</Tab>
      <Tab>Notes</Tab>
      <Tab>Journal</Tab>
    </TabBar>
  ),
}

export const SecondActive: Story = {
  render: () => (
    <TabBar>
      <Tab>Outline</Tab>
      <Tab active>Table</Tab>
      <Tab>Notes</Tab>
      <Tab>Journal</Tab>
    </TabBar>
  ),
}

export const TwoTabs: Story = {
  render: () => (
    <TabBar>
      <Tab active>Tree</Tab>
      <Tab>Table</Tab>
    </TabBar>
  ),
}
