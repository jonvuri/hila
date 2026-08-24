import type { ThemeCardThemeInput, ThemeCardTreatment } from './types'

export const ghostTreatments = [
  {
    section: 'intent',
    kind: 'structural',
    label: 'Fixed section order and shared Reading queue content',
  },
  {
    section: 'intent',
    kind: 'optional-decoration',
    label: 'No decorative theme layer',
  },
  {
    section: 'palette-type',
    kind: 'structural',
    label: 'Canvas, surface, overlay, and three text contrast levels',
  },
  {
    section: 'palette-type',
    kind: 'semantic-state',
    label: 'Accent is reserved for focus and selected inputs; danger is reserved for risk',
  },
  {
    section: 'palette-type',
    kind: 'optional-decoration',
    label: 'No display face or ornamental color role',
  },
  {
    section: 'foundations',
    kind: 'structural',
    label: 'Four-pixel spacing base, 32-pixel rows, square geometry, and one-pixel lines',
  },
  {
    section: 'foundations',
    kind: 'semantic-state',
    label: 'Short motion confirms a change; reduced motion shows the final position',
  },
  {
    section: 'foundations',
    kind: 'optional-decoration',
    label: 'No radius, cut, texture, shadow, or continuous ambient motion',
  },
  {
    section: 'states',
    kind: 'semantic-state',
    label:
      'Hover, keyboard focus, selection, disabled, invalid, and armed danger stay distinct',
  },
  {
    section: 'controls',
    kind: 'structural',
    label: 'Visible boundaries, labels, and 32-pixel targets identify each control',
  },
  {
    section: 'controls',
    kind: 'semantic-state',
    label: 'Keyboard focus uses an offset outline on every interactive control',
  },
  {
    section: 'controls',
    kind: 'optional-decoration',
    label: 'No control elevation or ornamental shape',
  },
  {
    section: 'molecules',
    kind: 'structural',
    label: 'Lines separate rows, sticky headers, properties, table cells, and launcher regions',
  },
  {
    section: 'molecules',
    kind: 'semantic-state',
    label: 'Selection and validation use the same signals as atomic controls',
  },
  {
    section: 'molecules',
    kind: 'optional-decoration',
    label: 'The overlay uses a brightness step without a shadow',
  },
  {
    section: 'workspace',
    kind: 'structural',
    label:
      'Column lines, sticky headers, edit targets, collapse, drill, and conditional ancestry',
  },
  {
    section: 'workspace',
    kind: 'semantic-state',
    label: 'Active, selected, disabled, hover, and keyboard-focus signals stay visible',
  },
  {
    section: 'workspace',
    kind: 'optional-decoration',
    label: 'No panel elevation, tab silhouette, texture, notch, or gauge',
  },
  {
    section: 'dials-notes',
    kind: 'structural',
    label: 'The baseline records settled minimums before later theme deltas',
  },
  {
    section: 'dials-notes',
    kind: 'optional-decoration',
    label: 'Resting borders recede without hiding state or behavior',
  },
] as const satisfies readonly ThemeCardTreatment[]

export const ghostTheme: ThemeCardThemeInput = {
  id: 'ghost',
  name: 'Ghost',
  intent:
    'Expose the shared workspace structure, behavior, and minimum affordances without theme character.',
  delta:
    'Assign the least visual treatment that keeps hierarchy, interaction targets, and semantic states clear.',
  treatments: ghostTreatments,
  notes: [
    {
      label: 'Baseline',
      text: 'Null and Wipeout must preserve this structure, content, behavior, and state meaning.',
    },
    {
      label: 'Decoration budget',
      text: 'Ghost adds no optional decoration. Ledger entries name intentional absences.',
    },
    {
      label: 'Polarity',
      text: 'Canonical roles follow the Storybook light and dark polarity. Danger changes by polarity.',
    },
    {
      label: 'Approved resting state',
      text: 'Nonessential borders recede. Hover, focus, selection, risk, and the active column remain explicit.',
    },
  ],
}
