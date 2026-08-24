import type { VisualTheme } from '../tokens'
export const themeCardSectionIds = [
  'intent',
  'palette-type',
  'foundations',
  'states',
  'controls',
  'molecules',
  'workspace',
  'dials-notes',
] as const

export type ThemeCardSectionId = (typeof themeCardSectionIds)[number]

export const themeCardStateIds = [
  'default',
  'hover',
  'keyboard-focus',
  'selected',
  'disabled',
  'invalid',
  'armed-danger',
] as const

export type ThemeCardStateId = (typeof themeCardStateIds)[number]

export type ThemeCardDialOption = {
  id: string
  label: string
}

export type ThemeCardDial = {
  id: string
  label: string
  description: string
  options: readonly ThemeCardDialOption[]
  value: string
  onChange?: (value: string) => void
}

export type ThemeCardNote = {
  label: string
  text: string
}

export const themeCardTreatmentKindIds = [
  'structural',
  'semantic-state',
  'optional-decoration',
] as const

export type ThemeCardTreatmentKind = (typeof themeCardTreatmentKindIds)[number]

export type ThemeCardTreatment = {
  section: ThemeCardSectionId
  kind: ThemeCardTreatmentKind
  label: string
}

export type ThemeCardThemeInput = {
  id: VisualTheme
  name: string
  intent: string
  delta: string
  dials?: readonly ThemeCardDial[]
  notes?: readonly ThemeCardNote[]
  treatments?: readonly ThemeCardTreatment[]
}
