import { JSX, splitProps } from 'solid-js'

import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'icon'

export type ButtonProps = {
  variant?: ButtonVariant
  disabled?: boolean
  children?: JSX.Element
  onClick?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>
}

export const Button = (props: ButtonProps) => {
  const [local, rest] = splitProps(props, ['variant', 'disabled', 'children'])

  return (
    <button
      class={`${styles.btn} ${styles[local.variant ?? 'primary']}`}
      disabled={local.disabled}
      {...rest}
    >
      {local.children}
    </button>
  )
}
