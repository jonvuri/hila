import { JSX } from 'solid-js'

import styles from './CornerNotchBox.module.css'

export type CornerNotchBoxProps = {
  children?: JSX.Element
  maxWidth?: string
}

export const CornerNotchBox = (props: CornerNotchBoxProps) => (
  <div class={styles.box} style={{ 'max-width': props.maxWidth }}>
    {props.children}
  </div>
)
