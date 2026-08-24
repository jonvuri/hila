import type { ThemeCardSemanticRoleId, ThemeCardThemeInput, ThemeCardTreatment } from './types'

export const ghostRoles = {
  'color-canvas': 'var(--c-bg)',
  'color-surface': 'var(--c-surface)',
  'color-overlay': 'var(--c-elevated)',
  'color-text': 'var(--c-fg)',
  'color-text-muted': 'var(--c-fg-2)',
  'color-text-faint': 'var(--c-fg-3)',
  'color-accent': 'var(--c-accent)',
  'color-danger': 'var(--tc-ghost-danger)',
  'type-body-family': 'var(--font-sans)',
  'type-label-family': 'var(--font-mono)',
  'type-data-family': 'var(--font-mono)',
  'type-display-family': 'var(--font-sans)',
  'type-body-size': 'var(--text-base)',
  'type-label-size': 'var(--text-xs)',
  'type-body-weight': '400',
  'type-label-weight': '500',
  'space-unit': '4px',
  'space-control-gap': '8px',
  'space-section-gap': '32px',
  'space-row-height': '32px',
  'geometry-control-radius': '0',
  'geometry-surface-radius': '0',
  'geometry-cut-size': '0',
  'line-subtle': '1px solid var(--c-border-2)',
  'line-strong': '1px solid var(--c-border)',
  'icon-size': '16px',
  'icon-stroke': '1.5',
  'motion-duration': '120ms',
  'motion-easing': 'ease-out',
  'state-hover': 'var(--c-hover)',
  'state-selected': 'var(--c-active)',
  'state-focus': 'var(--c-accent)',
  'state-disabled-opacity': '0.45',
  'state-invalid': 'var(--tc-ghost-danger)',
  'state-danger-surface':
    'color-mix(in srgb, var(--tc-ghost-danger) 14%, var(--tc-color-canvas))',
} satisfies Record<ThemeCardSemanticRoleId, string>

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
  roles: ghostRoles,
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
      text: 'Local roles follow the Storybook light and dark foundations. Danger changes by polarity.',
    },
    {
      label: 'Approved resting state',
      text: 'Nonessential borders recede. Hover, focus, selection, risk, and the active column remain explicit.',
    },
  ],
}
