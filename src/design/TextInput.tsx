import { JSX, splitProps } from 'solid-js'

import styles from './TextInput.module.css'

export type TextInputProps = {
  placeholder?: string
  value?: string
  onInput?: JSX.InputEventHandlerUnion<HTMLInputElement, InputEvent>
  fullWidth?: boolean
}

export const TextInput = (props: TextInputProps) => {
  const [local, rest] = splitProps(props, ['placeholder', 'value', 'fullWidth'])

  return (
    <div class={styles.wrapper} style={local.fullWidth ? { display: 'block' } : undefined}>
      <input
        class={styles.input}
        type="text"
        placeholder={local.placeholder}
        value={local.value ?? ''}
        style={local.fullWidth ? { width: '100%' } : undefined}
        {...rest}
      />
    </div>
  )
}
