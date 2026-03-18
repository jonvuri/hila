import { JSX } from 'solid-js'

import styles from './TabBar.module.css'

export type TabBarProps = {
  children?: JSX.Element
}

export const TabBar = (props: TabBarProps) => <div class={styles.bar}>{props.children}</div>

export type TabProps = {
  active?: boolean
  children?: JSX.Element
  onClick?: () => void
}

export const Tab = (props: TabProps) => (
  <button
    class={`${styles.tab} ${props.active ? styles.active : ''}`}
    onClick={() => props.onClick?.()}
  >
    {props.children}
  </button>
)
