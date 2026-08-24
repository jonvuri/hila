import type { ThemeCardThemeInput, ThemeCardTreatment } from './types'

export const wipeoutTreatments = [
  {
    section: 'intent',
    kind: 'optional-decoration',
    label: 'Instrument character is limited to type, steps, cuts, ticks, and VFD segments',
  },
  {
    section: 'palette-type',
    kind: 'optional-decoration',
    label: 'Hard brightness steps replace shadows, blur, and translucent depth effects',
  },
  {
    section: 'palette-type',
    kind: 'optional-decoration',
    label: 'Display and mono voices identify structure and data; body text stays neutral',
  },
  {
    section: 'foundations',
    kind: 'optional-decoration',
    label: 'One six-pixel cut is available for filled blocks; resting surfaces stay square',
  },
  {
    section: 'foundations',
    kind: 'optional-decoration',
    label: 'Unlit VFD segments add texture without blur, glow, gradients, or ambient motion',
  },
  {
    section: 'states',
    kind: 'semantic-state',
    label: 'Violet marks focus, selection, and live paths only; red appears only for risk',
  },
  {
    section: 'controls',
    kind: 'optional-decoration',
    label: 'A single chamfer distinguishes filled controls without changing their targets',
  },
  {
    section: 'molecules',
    kind: 'optional-decoration',
    label: 'Header flags, stepped edges, and instrument labels stay outside long-form copy',
  },
  {
    section: 'workspace',
    kind: 'optional-decoration',
    label: 'Brightness steps and small path marks skin the shared sticky-header workspace',
  },
  {
    section: 'dials-notes',
    kind: 'optional-decoration',
    label: 'Type-led framing uses aligned low-poly chrome instead of complete resting borders',
  },
] as const satisfies readonly ThemeCardTreatment[]

export const wipeoutTheme: ThemeCardThemeInput = {
  id: 'wipeout',
  name: 'Wipeout',
  intent:
    'Give the Ghost structure a precise instrument character while keeping dense reading clear.',
  delta:
    'Add hard brightness steps, strict display and data voices, disciplined violet signals, one-cut geometry, ticks, and unlit VFD segments.',
  treatments: wipeoutTreatments,
  notes: [
    {
      label: 'Structural inheritance',
      text: 'Wipeout uses the Ghost markup, content, behavior, targets, and visibility rules.',
    },
    {
      label: 'Accent discipline',
      text: 'Violet means focus, selection, or a live path. It does not decorate resting content.',
    },
    {
      label: 'Text pressure',
      text: 'Instrument faces stay in headings, labels, and data. Long-form copy keeps the body face.',
    },
    {
      label: 'Motion and depth',
      text: 'Transitions are short and linear. Reduced motion shows the final state. No elevation shadow or glow is used.',
    },
    {
      label: 'Approved frame and quirk budget',
      text: 'Type and brightness define groups. Aligned ticks, notches, and chamfers suggest or reinforce container borders.',
    },
  ],
}
