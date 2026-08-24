import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { For, type JSX } from 'solid-js'

import type { LegacyOutlineVariant } from '../outline/types'

import OverlaidCards from './OverlaidCards'
import {
  deepChain,
  denseGestalt,
  interPanelGap,
  maxColumns,
  PanelBody,
  rootAncestors,
  type Scenario,
  scenarios,
  type StubPanel,
} from './fixtures'
import type {
  GaugeOptions,
  NotchesEdgeMode,
  NotchesOptions,
  OverlaidCardsTheme,
  ToplinesOptions,
  WipeoutDisplayFont,
} from './types'
import { NOTCHES_DEFAULTS, TOPLINES_DEFAULTS } from './variants/shared'

// ---------------------------------------------------------------------------
// Story args
//
// One flat args shape serves every story: `theme` + `outlineTheme` swap the
// renderer / in-panel outline across identical fixtures, and the per-variant
// dials are flattened in so Storybook controls can drive them directly (the
// stage-3 review surface, especially for NotchesOptions).
// ---------------------------------------------------------------------------

type StoryArgs = {
  theme: OverlaidCardsTheme
  outlineTheme: LegacyOutlineVariant
  // wipeout-notches dials
  edgeMode?: NotchesEdgeMode
  verticalEdges?: NotchesEdgeMode | 'inherit'
  topEdges?: NotchesEdgeMode | 'inherit'
  tabStaggerStep?: number
  ancestorLeftStep?: number
  ancestorTopStep?: number
  tickLengthV?: number
  tickLengthH?: number
  tabTickLength?: number
  cornerGap?: number
  tabTicks?: boolean
  alignAncestorTicksToTabs?: boolean
  ancestorBottomTicks?: boolean
  panelBottomTicks?: boolean
  activeCorners?: NotchesOptions['activeCorners']
  activeEdge?: boolean
  chamfer?: number
  markerWidth?: number
  markerHeight?: number
  ramp?: string[]
  tabMaxWidth?: number
  displayFont?: WipeoutDisplayFont
  // wipeout-toplines dials
  staggerStep?: number
  lineThickness?: number
  // wipeout-gauge dials
  railWidth?: number
  ghostRows?: number
  showNames?: boolean
}

const axis = (value?: NotchesEdgeMode | 'inherit'): NotchesEdgeMode | undefined =>
  value === 'inherit' ? undefined : value

const notchesFromArgs = (args: StoryArgs): Partial<NotchesOptions> => ({
  edgeMode: args.edgeMode,
  verticalEdges: axis(args.verticalEdges),
  topEdges: axis(args.topEdges),
  tabStaggerStep: args.tabStaggerStep,
  ancestorLeftStep: args.ancestorLeftStep,
  ancestorTopStep: args.ancestorTopStep,
  tickLengthV: args.tickLengthV,
  tickLengthH: args.tickLengthH,
  tabTickLength: args.tabTickLength,
  cornerGap: args.cornerGap,
  tabTicks: args.tabTicks,
  alignAncestorTicksToTabs: args.alignAncestorTicksToTabs,
  ancestorBottomTicks: args.ancestorBottomTicks,
  panelBottomTicks: args.panelBottomTicks,
  activeCorners: args.activeCorners,
  activeEdge: args.activeEdge,
  chamfer: args.chamfer,
  markerWidth: args.markerWidth,
  markerHeight: args.markerHeight,
  ramp: args.ramp,
  tabMaxWidth: args.tabMaxWidth,
  displayFont: args.displayFont,
})

const toplinesFromArgs = (args: StoryArgs): Partial<ToplinesOptions> => ({
  staggerStep: args.staggerStep,
  lineThickness: args.lineThickness,
  ramp: args.ramp,
  tabMaxWidth: args.tabMaxWidth,
  displayFont: args.displayFont,
})

const gaugeFromArgs = (args: StoryArgs): Partial<GaugeOptions> => ({
  railWidth: args.railWidth,
  ghostRows: args.ghostRows,
  showNames: args.showNames,
  displayFont: args.displayFont,
})

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

const renderScenario = (scenario: Scenario, args: StoryArgs): JSX.Element => {
  const lastIndex = scenario.panels.length - 1
  return (
    <OverlaidCards<StubPanel>
      panels={scenario.panels}
      panelKind={(p) => p.kind}
      gaps={scenario.gaps}
      title={scenario.title}
      theme={args.theme}
      panelLabel={(p) => p.title}
      notchesOptions={notchesFromArgs(args)}
      toplinesOptions={toplinesFromArgs(args)}
      gaugeOptions={gaugeFromArgs(args)}
      renderPanel={(panel, index) => (
        <PanelBody
          panel={panel}
          active={index === lastIndex}
          outlineTheme={args.outlineTheme ?? 'workflowy-geometric'}
        />
      )}
    />
  )
}

const Frame = (props: { height?: string; children: JSX.Element }): JSX.Element => (
  <div style={{ display: 'flex', height: props.height ?? '440px', width: '100%' }}>
    {props.children}
  </div>
)

const SectionLabel = (props: { children: JSX.Element }): JSX.Element => (
  <div
    style={{
      'font-size': 'var(--text-xs)',
      'font-weight': '600',
      'letter-spacing': '1.5px',
      'text-transform': 'uppercase',
      color: 'var(--c-fg-3)',
      'font-family': 'var(--font-sans)',
      padding: 'var(--sp-8) var(--sp-16)',
    }}
  >
    {props.children}
  </div>
)

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const ALL_THEMES: OverlaidCardsTheme[] = [
  'expanded-staircase',
  'collapsed-breadcrumb',
  'wipeout-notches',
  'wipeout-toplines',
  'wipeout-gauge',
  'null',
  'ultramodern',
]

// 'wipeout-gauge' lives in the archived workspace story group (full-column
// workspace mockups) rather than here.
const VARIANT_THEMES: OverlaidCardsTheme[] = [
  'wipeout-notches',
  'wipeout-toplines',
  'null',
  'ultramodern',
]

const meta: Meta<StoryArgs> = {
  title: 'Archive/Phase 10/Session 4b/Overlaid Cards',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Retired Phase 10 exploration. Keep these variants as design history only. None is a production candidate.',
      },
    },
  },
  argTypes: {
    theme: {
      control: 'select',
      options: ALL_THEMES,
      description: 'Which OverlaidCards renderer to use.',
    },
    outlineTheme: {
      control: 'select',
      options: [
        'workflowy-clone',
        'workflowy-geometric',
        'vector-field',
        'corner-notches',
        'whitespace-only',
      ] satisfies LegacyOutlineVariant[],
      description: 'Outline theme rendered inside the panels (dense fixtures).',
    },
  },
  args: { theme: 'expanded-staircase', outlineTheme: 'workflowy-geometric' },
}

export default meta

type Story = StoryObj<StoryArgs>

// ---------------------------------------------------------------------------
// The dense-gestalt story (stage 1) + the original four scenarios
// ---------------------------------------------------------------------------

export const DenseGestalt: Story = {
  render: (args) => <Frame height="560px">{renderScenario(denseGestalt, args)}</Frame>,
}

export const RootAncestorsOnly: Story = {
  render: (args) => <Frame>{renderScenario(rootAncestors, args)}</Frame>,
}

export const InterPanelGap: Story = {
  render: (args) => <Frame>{renderScenario(interPanelGap, args)}</Frame>,
}

export const DeepMultiGapChain: Story = {
  render: (args) => <Frame>{renderScenario(deepChain, args)}</Frame>,
}

export const MaxColumns: Story = {
  render: (args) => <Frame>{renderScenario(maxColumns, args)}</Frame>,
}

// All scenarios stacked for comparison; the `theme` control swaps every
// renderer across every fixture at once.
export const AllScenarios: Story = {
  render: (args) => (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: 'var(--sp-32)' }}>
      <For each={scenarios}>
        {(scenario) => (
          <div>
            <SectionLabel>{scenario.label}</SectionLabel>
            <Frame height={scenario === denseGestalt ? '520px' : '360px'}>
              {renderScenario(scenario, args)}
            </Frame>
          </div>
        )}
      </For>
    </div>
  ),
}

// ---------------------------------------------------------------------------
// Per-variant stories (stage 2) -- dense fixture + variant dials as controls
// ---------------------------------------------------------------------------

const wipeoutFontArgType = {
  displayFont: {
    control: 'inline-radio' as const,
    options: ['chakra-petch', 'orbitron'] satisfies WipeoutDisplayFont[],
    description: 'Display voice (Orbitron = the user-liked alternate).',
  },
}

/**
 * OC-A1 + OC-A3 combined: the column-locked instrument strip with card chrome
 * dialable from full edge lines down to disconnected ticks. Every change made
 * during prototyping is a control here -- this is the stage-3 review surface.
 */
export const WipeoutNotches: Story = {
  name: 'Wipeout · Notches (OC-A1+A3)',
  render: (args) => <Frame height="560px">{renderScenario(denseGestalt, args)}</Frame>,
  argTypes: {
    edgeMode: { control: 'inline-radio', options: ['lines', 'ticks'] },
    verticalEdges: {
      control: 'inline-radio',
      options: ['inherit', 'lines', 'ticks'],
      description: 'Per-axis override of edgeMode for vertical edges.',
    },
    topEdges: {
      control: 'inline-radio',
      options: ['inherit', 'lines', 'ticks'],
      description: 'Per-axis override of edgeMode for panel top rules.',
    },
    activeCorners: { control: 'inline-radio', options: ['top', 'four', 'brackets3'] },
    ramp: {
      control: 'object',
      description: 'Depth brightness ramp: ordered Wipeout token names, shallowest first.',
    },
    ...wipeoutFontArgType,
  },
  args: {
    theme: 'wipeout-notches',
    ...NOTCHES_DEFAULTS,
    verticalEdges: 'inherit',
    topEdges: 'inherit',
    ramp: [...NOTCHES_DEFAULTS.ramp],
  },
}

/**
 * OC-A2: no vertical edges; each tab extends its baseline leftward, nesting
 * into terraced card tops. The marker's accent line IS the active panel's
 * rule. Needs the larger stagger to read (3px smeared in the prototypes).
 */
export const WipeoutToplines: Story = {
  name: 'Wipeout · Top lines (OC-A2)',
  render: (args) => <Frame height="560px">{renderScenario(denseGestalt, args)}</Frame>,
  argTypes: {
    ramp: {
      control: 'object',
      description: 'Depth brightness ramp: ordered Wipeout token names, shallowest first.',
    },
    ...wipeoutFontArgType,
  },
  args: {
    theme: 'wipeout-toplines',
    ...TOPLINES_DEFAULTS,
    ramp: [...TOPLINES_DEFAULTS.ramp],
  },
}

// The 'wipeout-gauge' (OC-B) story moved to Design/Workspace, composed with
// the FocusPanel mockup at full-screen scale.

/**
 * Catalog N5b: per-column breadcrumb runs (hover = dotted underline; bold
 * terminal segment; accent dot on the active column) over plain hairline
 * surface cards. Quirk budget: the margin tick. Deliberate Resolution-B
 * break: titles appear in both crumb and panel.
 */
export const NullTheme: Story = {
  name: 'Null (N5b)',
  render: (args) => <Frame height="560px">{renderScenario(denseGestalt, args)}</Frame>,
  args: { theme: 'null' },
}

/**
 * Catalog U5b: glass panes at altitudes -- ancestors peek from behind as
 * slivers, overlaps show through the glass, the active pane catches the
 * accent light; column-locked glass pill groups above. Open question for
 * review: backdrop-filter cost at dozens of panes (candidate fallback:
 * glass rationed to overlays only).
 */
export const Ultramodern: Story = {
  name: 'Ultramodern (U5b)',
  render: (args) => <Frame height="560px">{renderScenario(denseGestalt, args)}</Frame>,
  args: { theme: 'ultramodern' },
}

// ---------------------------------------------------------------------------
// AllVariants -- the five session-4b variants (plus the live baseline) on the
// identical dense fixture, stacked for side-by-side comparison.
// ---------------------------------------------------------------------------

export const AllVariants: Story = {
  render: (args) => (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: 'var(--sp-32)' }}>
      <For each={['expanded-staircase' as OverlaidCardsTheme, ...VARIANT_THEMES]}>
        {(theme) => (
          <div>
            <SectionLabel>{theme}</SectionLabel>
            <Frame height="520px">{renderScenario(denseGestalt, { ...args, theme })}</Frame>
          </div>
        )}
      </For>
    </div>
  ),
}
