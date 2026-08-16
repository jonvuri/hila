import { ghostRoles } from './ghost'
import type { ThemeCardSemanticRoleId, ThemeCardThemeInput, ThemeCardTreatment } from './types'

export const nullRoles = {
  ...ghostRoles,
  'color-accent': 'var(--tc-null-accent)',
  'color-danger': 'var(--tc-null-danger)',
  'geometry-control-radius': '6px',
  'geometry-surface-radius': '10px',
  'line-subtle': '1px solid color-mix(in srgb, var(--tc-color-text) 12%, transparent)',
  'line-strong': '1px solid color-mix(in srgb, var(--tc-color-text) 22%, transparent)',
  'motion-duration': '160ms',
  'motion-easing': 'cubic-bezier(0.2, 0, 0, 1)',
  'state-hover': 'color-mix(in srgb, var(--tc-color-accent) 8%, var(--tc-color-surface))',
  'state-selected': 'color-mix(in srgb, var(--tc-color-accent) 14%, var(--tc-color-surface))',
  'state-focus': 'var(--tc-color-accent)',
  'state-invalid': 'var(--tc-null-danger)',
  'state-danger-surface':
    'color-mix(in srgb, var(--tc-null-danger) 12%, var(--tc-color-surface))',
} satisfies Record<ThemeCardSemanticRoleId, string>

export const nullTreatments = [
  {
    section: 'palette-type',
    kind: 'optional-decoration',
    label: 'Ghost ambiguity: neutral layers can merge; familiar tonal steps separate hierarchy',
  },
  {
    section: 'foundations',
    kind: 'optional-decoration',
    label: 'Ghost ambiguity: square regions can look unfinished; modest radii group surfaces',
  },
  {
    section: 'states',
    kind: 'semantic-state',
    label:
      'Ghost ambiguity: hover and selection can merge; low and medium accent fills separate them',
  },
  {
    section: 'states',
    kind: 'semantic-state',
    label:
      'Ghost ambiguity: focus can resemble selection; the accent outline stays independent',
  },
  {
    section: 'states',
    kind: 'semantic-state',
    label:
      'Ghost ambiguity: invalid and danger can merge; red text, border, and fill show severity',
  },
  {
    section: 'controls',
    kind: 'optional-decoration',
    label:
      'Ghost ambiguity: transparent controls can resemble text; surface fills reinforce targets',
  },
  {
    section: 'molecules',
    kind: 'optional-decoration',
    label:
      'Ghost ambiguity: an overlay can merge with content; a soft shadow confirms elevation',
  },
  {
    section: 'workspace',
    kind: 'optional-decoration',
    label:
      'Ghost ambiguity: sticky regions can merge with rows; a small shadow fixes their layer',
  },
] as const satisfies readonly ThemeCardTreatment[]

export const nullTheme: ThemeCardThemeInput = {
  id: 'null',
  name: 'Null',
  intent:
    'Make the Ghost structure immediately familiar through restrained, conventional interface signals.',
  delta:
    'Add moderate radius, accent state fills, filled controls, and soft elevation only where Ghost can be ambiguous.',
  roles: nullRoles,
  treatments: nullTreatments,
  notes: [
    {
      label: 'Structural inheritance',
      text: 'Null uses the Ghost markup, content, behavior, and visibility rules without substitution.',
    },
    {
      label: 'Conventional signals',
      text: 'Radius, fills, and shadows clarify targets and layers. They do not add theme flourish.',
    },
    {
      label: 'Polarity',
      text: 'Accent, danger, surface steps, and shadow strength adjust for the Storybook polarity.',
    },
  ],
}
