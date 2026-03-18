import { JSX } from 'solid-js'

import styles from './Grid.module.css'

export type GridContainerProps = {
  children?: JSX.Element
}

export const GridContainer = (props: GridContainerProps) => (
  <div class={styles.container}>{props.children}</div>
)

export type GridRowProps = {
  children?: JSX.Element
}

export const GridRow = (props: GridRowProps) => <div class={styles.row}>{props.children}</div>

export type GridColProps = {
  span?: number
  smSpan?: number
  mdSpan?: number
  children?: JSX.Element
}

export const GridCol = (props: GridColProps) => {
  const classes = () => {
    const c: string[] = []
    const colClass = styles[`col-${props.span ?? 1}` as keyof typeof styles]
    if (colClass) c.push(colClass)
    if (props.smSpan) {
      const smClass = styles[`sm-${props.smSpan}` as keyof typeof styles]
      if (smClass) c.push(smClass)
    }
    if (props.mdSpan) {
      const mdClass = styles[`md-${props.mdSpan}` as keyof typeof styles]
      if (mdClass) c.push(mdClass)
    }
    return c.join(' ')
  }

  return <div class={classes()}>{props.children}</div>
}
