import { JSX } from 'solid-js'

import styles from './Badge.module.css'

export type BadgeProps = {
  children?: JSX.Element
}

export const Badge = (props: BadgeProps) => <span class={styles.badge}>{props.children}</span>
