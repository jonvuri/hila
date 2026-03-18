import { JSX } from 'solid-js'

import styles from './ContextMenu.module.css'

export type ContextMenuProps = {
  children?: JSX.Element
}

export const ContextMenu = (props: ContextMenuProps) => (
  <div class={styles.menu}>{props.children}</div>
)

export type ContextMenuItemProps = {
  children?: JSX.Element
  shortcut?: string
  muted?: boolean
  onClick?: () => void
}

export const ContextMenuItem = (props: ContextMenuItemProps) => (
  <button
    class={`${styles.item} ${props.muted ? styles.muted : ''}`}
    onClick={() => props.onClick?.()}
  >
    <span>{props.children}</span>
    {props.shortcut && <span class={styles.shortcut}>{props.shortcut}</span>}
  </button>
)

export const ContextMenuSeparator = () => <div class={styles.separator} />
