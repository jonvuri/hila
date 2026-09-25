import { resolveVisualTheme, type VisualTheme } from './tokens'

export type VisualThemeEnvironment = Readonly<{
  VITE_HILA_VISUAL_THEME?: unknown
}>

export const resolveStartupVisualTheme = (environment: VisualThemeEnvironment): VisualTheme =>
  resolveVisualTheme(environment.VITE_HILA_VISUAL_THEME)

export const injectStartupVisualTheme = (
  html: string,
  environment: VisualThemeEnvironment,
): string => {
  const visualTheme = resolveStartupVisualTheme(environment)
  return html.replace(/<html(?=[\s>])/, `<html data-visual-theme="${visualTheme}"`)
}
