export const spacingValues = {
  1: '1px',
  2: '2px',
  4: '4px',
  8: '8px',
  16: '16px',
  32: '32px',
  64: '64px',
} as const

export type SpacingValueKey = keyof typeof spacingValues

export const fontSizeValues = {
  10: '10px',
  11: '11px',
  13: '13px',
  15: '15px',
  18: '18px',
  22: '22px',
  26: '26px',
  32: '32px',
} as const

export type FontSizeValueKey = keyof typeof fontSizeValues

export const fundamentalTokenNames = [
  'palette-neutral-0',
  'palette-neutral-50',
  'palette-neutral-200',
  'palette-neutral-400',
  'palette-neutral-600',
  'palette-neutral-700',
  'palette-neutral-800',
  'palette-neutral-850',
  'palette-neutral-950',
  'palette-blue-500',
  'palette-violet-500',
  'palette-red-500',
  'palette-shadow-soft',
  'palette-shadow-raised',
  'palette-state-hover',
  'palette-state-selected',
  'palette-state-danger-surface',
  'space-1',
  'space-2',
  'space-4',
  'space-8',
  'space-16',
  'space-32',
  'space-64',
  'font-family-sans',
  'font-family-mono',
  'font-family-instrument-data',
  'font-family-instrument-display',
  'font-size-10',
  'font-size-11',
  'font-size-13',
  'font-size-15',
  'font-size-18',
  'font-size-22',
  'font-size-26',
  'font-size-32',
  'font-weight-300',
  'font-weight-400',
  'font-weight-500',
  'font-weight-600',
  'font-weight-700',
  'line-height-tight',
  'line-height-control',
  'line-height-body',
  'letter-spacing-normal',
  'letter-spacing-label',
  'letter-spacing-display',
  'size-16',
  'size-24',
  'size-32',
  'radius-0',
  'radius-6',
  'radius-10',
  'cut-0',
  'cut-6',
  'line-width-1',
  'line-width-2',
  'line-style-solid',
  'line-style-dotted',
  'duration-0',
  'duration-90',
  'duration-120',
  'duration-160',
  'easing-linear',
  'easing-direct',
  'easing-conventional',
  'shadow-none',
  'shadow-soft',
  'shadow-raised',
  'decoration-size-0',
  'decoration-size-6',
  'decoration-opacity-0',
  'decoration-opacity-8',
] as const

export type FundamentalTokenName = (typeof fundamentalTokenNames)[number]

export const fundamentalVar = (name: FundamentalTokenName) => `var(--${name})` as const

export const polarityValues = ['dark', 'light'] as const
export type Polarity = (typeof polarityValues)[number]

export const visualThemeValues = ['ghost', 'null', 'wipeout'] as const
export type VisualTheme = (typeof visualThemeValues)[number]

export const densityValues = ['narrow', 'wide'] as const
export type Density = (typeof densityValues)[number]

export const renderingFidelityValues = ['composed', 'substrate'] as const
export type RenderingFidelity = (typeof renderingFidelityValues)[number]

export const navigationOutlineValues = [
  'workflowy',
  'geometric',
  'vector',
  'notches',
  'whitespace',
  'hover-guides',
  'toggle-gutter',
] as const
export type NavigationOutlineVariant = (typeof navigationOutlineValues)[number]

export const tableTreatmentValues = ['thin-line', 'corner-notch', 'cell-dots'] as const
export type TableTreatmentVariant = (typeof tableTreatmentValues)[number]

export type ComponentVariantValues = {
  navigationOutline: NavigationOutlineVariant
  tableTreatment: TableTreatmentVariant
}

export type ComponentVariantConfig = Partial<ComponentVariantValues>

export type ComponentVariantDefinition<Value extends string> = {
  values: readonly Value[]
  defaultValue: Value
}

export type ComponentVariantRegistry = {
  [Key in keyof ComponentVariantValues]: ComponentVariantDefinition<ComponentVariantValues[Key]>
}

export const componentVariantRegistry = {
  navigationOutline: {
    values: navigationOutlineValues,
    defaultValue: 'workflowy',
  },
  tableTreatment: {
    values: tableTreatmentValues,
    defaultValue: 'thin-line',
  },
} as const satisfies ComponentVariantRegistry

const resolveValue = <Value extends string>(
  values: readonly Value[],
  value: unknown,
  fallback: Value,
): Value =>
  typeof value === 'string' && values.includes(value as Value) ? (value as Value) : fallback

export const resolvePolarity = (value: unknown): Polarity =>
  resolveValue(polarityValues, value, 'dark')

export const resolveVisualTheme = (value: unknown): VisualTheme =>
  resolveValue(visualThemeValues, value, 'ghost')

export const resolveDensity = (value: unknown): Density =>
  resolveValue(densityValues, value, 'wide')

export const resolveRenderingFidelity = (value: unknown): RenderingFidelity =>
  resolveValue(renderingFidelityValues, value, 'composed')

export const resolveThemeScope = (
  input: { polarity?: unknown; visualTheme?: unknown },
  inherited: { polarity: Polarity; visualTheme: VisualTheme } = {
    polarity: 'dark',
    visualTheme: 'ghost',
  },
): { polarity: Polarity; visualTheme: VisualTheme } => ({
  polarity: input.polarity === undefined ? inherited.polarity : resolvePolarity(input.polarity),
  visualTheme:
    input.visualTheme === undefined ?
      inherited.visualTheme
    : resolveVisualTheme(input.visualTheme),
})

export const resolveFidelity = (input: {
  fidelity?: unknown
  inheritedFidelity?: RenderingFidelity
  xray?: boolean
}): RenderingFidelity => {
  if (input.xray) return 'substrate'
  if (input.fidelity !== undefined) return resolveRenderingFidelity(input.fidelity)
  return input.inheritedFidelity ?? 'composed'
}

export const resolveComponentVariant = <Key extends keyof ComponentVariantValues>(
  key: Key,
  value: unknown,
): ComponentVariantValues[Key] => {
  const registry: ComponentVariantRegistry = componentVariantRegistry
  const definition = registry[key]
  return resolveValue<ComponentVariantValues[Key]>(
    definition.values,
    value,
    definition.defaultValue,
  )
}

export const semanticTokenNames = [
  'color-canvas',
  'color-surface',
  'color-overlay',
  'color-text-strong',
  'color-text',
  'color-text-muted',
  'color-text-faint',
  'color-inverse-surface',
  'color-inverse-text',
  'color-accent',
  'color-danger',
  'type-body-family',
  'type-body-small-size',
  'type-body-size',
  'type-body-large-size',
  'type-body-weight',
  'type-body-line-height',
  'type-label-family',
  'type-label-size',
  'type-label-weight',
  'type-label-line-height',
  'type-label-letter-spacing',
  'type-data-family',
  'type-data-size',
  'type-data-weight',
  'type-display-family',
  'type-display-small-size',
  'type-display-size',
  'type-display-light-weight',
  'type-display-weight',
  'type-display-line-height',
  'type-display-letter-spacing',
  'space-control-gap',
  'space-control-inset-block',
  'space-control-inset-inline',
  'space-compact-inset',
  'space-label-inset',
  'space-section-gap',
  'space-panel-gap',
  'space-content-inset',
  'size-control',
  'size-row',
  'size-icon',
  'radius-control',
  'radius-surface',
  'cut-surface',
  'color-line-subtle',
  'color-line-strong',
  'width-line',
  'width-icon-stroke',
  'border-subtle',
  'border-strong',
  'duration-feedback',
  'easing-feedback',
  'elevation-none',
  'elevation-surface',
  'elevation-sticky',
  'elevation-overlay',
  'color-state-hover',
  'color-state-selected',
  'color-state-focus',
  'opacity-state-disabled',
  'color-state-invalid',
  'color-state-danger-surface',
  'width-focus-ring',
  'offset-focus-ring',
  'color-decoration',
  'color-decoration-texture',
  'size-decoration-cut',
  'opacity-decoration-texture',
] as const

export type SemanticTokenName = (typeof semanticTokenNames)[number]

export const semanticVar = (name: SemanticTokenName) => `var(--${name})` as const
