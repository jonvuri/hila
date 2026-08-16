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

export const themeCardSemanticRoleIds = [
  'color-canvas',
  'color-surface',
  'color-overlay',
  'color-text',
  'color-text-muted',
  'color-text-faint',
  'color-accent',
  'color-danger',
  'type-body-family',
  'type-label-family',
  'type-data-family',
  'type-display-family',
  'type-body-size',
  'type-label-size',
  'type-body-weight',
  'type-label-weight',
  'space-unit',
  'space-control-gap',
  'space-section-gap',
  'space-row-height',
  'geometry-control-radius',
  'geometry-surface-radius',
  'geometry-cut-size',
  'line-subtle',
  'line-strong',
  'icon-size',
  'icon-stroke',
  'motion-duration',
  'motion-easing',
  'state-hover',
  'state-selected',
  'state-focus',
  'state-disabled-opacity',
  'state-invalid',
  'state-danger-surface',
] as const

export type ThemeCardSemanticRoleId = (typeof themeCardSemanticRoleIds)[number]

export type ThemeCardSemanticRoles = Partial<Record<ThemeCardSemanticRoleId, string>>

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

export type ThemeCardThemeInput = {
  id: string
  name: string
  intent: string
  delta: string
  roles?: ThemeCardSemanticRoles
  dials?: readonly ThemeCardDial[]
  notes?: readonly ThemeCardNote[]
}
