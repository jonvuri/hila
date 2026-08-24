import type { ThemeCardThemeInput, ThemeCardTreatment } from './types'

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
