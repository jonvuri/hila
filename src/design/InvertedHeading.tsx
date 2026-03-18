import { JSX } from 'solid-js'

import styles from './InvertedHeading.module.css'

export type InvertedHeadingSize = 'sm' | 'md' | 'lg'

export type InvertedHeadingProps = {
  children?: JSX.Element
  size?: InvertedHeadingSize
}

export const InvertedHeading = (props: InvertedHeadingProps) => (
  <span class={`${styles.heading} ${styles[props.size ?? 'lg']}`}>{props.children}</span>
)
