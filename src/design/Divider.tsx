import styles from './Divider.module.css'

export type DividerProps = {
  full?: boolean
}

export const Divider = (props: DividerProps) => (
  <hr class={`${styles.divider} ${props.full ? styles.full : styles.short}`} />
)
