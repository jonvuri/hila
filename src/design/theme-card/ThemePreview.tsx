import type { JSX } from 'solid-js'

import { ghostTheme } from './ghost'
import { nullTheme } from './null'
import ThemeCard from './ThemeCard'
import type { ThemeCardThemeInput } from './types'
import { wipeoutTheme } from './wipeout'

export const themePreviewIds = ['ghost', 'null', 'wipeout'] as const

export type ThemePreviewId = (typeof themePreviewIds)[number]

const themePreviewInputs: Record<ThemePreviewId, ThemeCardThemeInput> = {
  ghost: ghostTheme,
  null: nullTheme,
  wipeout: wipeoutTheme,
}

const ThemePreview = (props: { theme: ThemePreviewId }): JSX.Element => (
  <ThemeCard theme={themePreviewInputs[props.theme]} />
)

export default ThemePreview
