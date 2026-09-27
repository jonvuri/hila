import { JSX } from 'solid-js'

import styles from './CornerNotchBox.module.css'

export type CornerNotchBoxProps = {
  children?: JSX.Element
  class?: string
  decorated?: boolean
  maxWidth?: string
}

export const CornerNotchBox = (props: CornerNotchBoxProps) => (
  <div
    class={props.class}
    classList={{ [styles.box!]: props.decorated !== false }}
    style={{ 'max-width': props.maxWidth }}
  >
    {props.children}
  </div>
)
