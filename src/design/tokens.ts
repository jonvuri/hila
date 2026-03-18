export const spacing = {
  1: '1px',
  2: '2px',
  4: '4px',
  8: '8px',
  16: '16px',
  32: '32px',
  64: '64px',
} as const

export type SpacingKey = keyof typeof spacing

export const fontSize = {
  xs: '10px',
  sm: '11px',
  base: '13px',
  md: '15px',
  lg: '18px',
  xl: '22px',
  '2xl': '26px',
  '3xl': '32px',
} as const

export type FontSizeKey = keyof typeof fontSize

export const fontFamily = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
} as const

export type FontFamilyKey = keyof typeof fontFamily

export const colorTokenNames = [
  'bg',
  'surface',
  'elevated',
  'fg',
  'fg-2',
  'fg-3',
  'fg-4',
  'border',
  'border-2',
  'hover',
  'active',
  'invert-bg',
  'invert-fg',
  'accent',
  'accent-2',
  'accent-3',
  'accent-border',
] as const

export type ColorTokenName = (typeof colorTokenNames)[number]

export const colorVar = (name: ColorTokenName) => `var(--c-${name})` as const
