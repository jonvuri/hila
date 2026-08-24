import type { JSX } from 'solid-js'

import { type Polarity, type VisualTheme, visualThemeValues } from '../tokens'

import { ghostTheme } from './ghost'
import { nullTheme } from './null'
import ThemeCard from './ThemeCard'
import type { ThemeCardThemeInput } from './types'
import { wipeoutTheme } from './wipeout'

export const themePreviewIds = visualThemeValues

const themePreviewInputs: Record<VisualTheme, ThemeCardThemeInput> = {
  ghost: ghostTheme,
  null: nullTheme,
  wipeout: wipeoutTheme,
}

const ThemePreview = (props: {
  polarity?: Polarity
  visualTheme: VisualTheme
}): JSX.Element => (
  <ThemeCard polarity={props.polarity} theme={themePreviewInputs[props.visualTheme]} />
)

export default ThemePreview
