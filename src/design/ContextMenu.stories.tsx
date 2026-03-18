import type { Meta, StoryObj } from 'storybook-solidjs-vite'

import { ContextMenu, ContextMenuItem, ContextMenuSeparator } from './ContextMenu'

const meta: Meta<typeof ContextMenu> = {
  title: 'Design/ContextMenu',
  component: ContextMenu,
  parameters: { layout: 'centered' },
}

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenuItem shortcut="⌘↑">Add row above</ContextMenuItem>
      <ContextMenuItem shortcut="⌘↓">Add row below</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem shortcut="Tab">Indent</ContextMenuItem>
      <ContextMenuItem shortcut="⇧Tab">Outdent</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem shortcut="⌫" muted>
        Delete row
      </ContextMenuItem>
    </ContextMenu>
  ),
}

export const Simple: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenuItem>Copy</ContextMenuItem>
      <ContextMenuItem>Paste</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem muted>Delete</ContextMenuItem>
    </ContextMenu>
  ),
}
