import { JSX } from 'solid-js'

import styles from './SectionHeading.module.css'

export type SectionHeadingProps = {
  children?: JSX.Element
}

export const SectionHeading = (props: SectionHeadingProps) => (
  <span class={styles.heading}>{props.children}</span>
)
