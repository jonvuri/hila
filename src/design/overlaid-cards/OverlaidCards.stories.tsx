import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { For, type JSX } from 'solid-js'

import OverlaidCards from './OverlaidCards'
import type { OverlaidAncestor, OverlaidCardsTheme } from './types'

// ---------------------------------------------------------------------------
// Stub data + panel renderer
//
// OverlaidCards is presentational: it takes an ordered set of panels plus the
// ancestor gaps between them, and renders the cards + tab layer. Here we feed
// it static fixtures and a stub panel renderer so the design can be iterated
// without the worker/SQLite stack.
// ---------------------------------------------------------------------------

type StubPanel = {
  kind: 'navigation' | 'focus'
  title: string
  body: string[]
}

const anc = (id: number, label: string): OverlaidAncestor => ({
  key: `anc-${id}`,
  label,
  rowId: id,
})

const stubLines = (n: number, seed: number): string[] =>
  Array.from({ length: n }, (_, i) => '\u2014'.repeat(((seed + i * 3) % 5) + 4))

// A lightweight stand-in for the live NavigationPanel / FocusPanel content.
const StubPanelBody = (props: { panel: StubPanel; active: boolean }): JSX.Element => (
  <div
    style={{
      height: '100%',
      padding: '14px 18px',
      'font-family': 'var(--font-sans)',
      color: 'var(--c-fg)',
      'box-sizing': 'border-box',
    }}
  >
    <div
      style={{
        'font-size': '17px',
        'font-weight': 600,
        'letter-spacing': '0.2px',
        color: props.active ? 'var(--c-fg-max)' : 'var(--c-fg)',
        'padding-bottom': '10px',
        'margin-bottom': '12px',
        'border-bottom': '1px solid var(--c-border-2)',
        'white-space': 'nowrap',
        overflow: 'hidden',
        'text-overflow': 'ellipsis',
      }}
    >
      {props.panel.title}
    </div>
    <For each={props.panel.body}>
      {(line) => (
        <div
          style={{
            'font-size': '13px',
            color: 'var(--c-fg-3)',
            'line-height': '1.7',
            'white-space': 'nowrap',
            overflow: 'hidden',
          }}
        >
          {line}
        </div>
      )}
    </For>
  </div>
)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Scenario = {
  label: string
  title: string
  panels: StubPanel[]
  gaps: OverlaidAncestor[][]
}

const focus = (title: string, lines = 5, seed = 0): StubPanel => ({
  kind: 'focus',
  title,
  body: stubLines(lines, seed),
})

const nav = (title: string): StubPanel => ({ kind: 'navigation', title, body: stubLines(6, 2) })

// Root-level ancestors only: a single focus panel preceded by a run of
// root-level ancestor tabs (with the workspace-title tab leading).
const rootAncestors: Scenario = {
  label: 'Root ancestors only',
  title: 'Workspace',
  panels: [focus('Quarterly planning', 6, 1)],
  gaps: [[anc(1, 'Company'), anc(2, 'Product'), anc(3, 'Roadmap')]],
}

// Inter-panel gap: one skipped level rendered as a gap ancestor between two
// focus panels (mirrors the e2e "gap ancestor cards" scenario).
const interPanelGap: Scenario = {
  label: 'Inter-panel gap',
  title: 'Workspace',
  panels: [nav('Outline'), focus('Alpha', 5, 0), focus('Charlie', 6, 3)],
  gaps: [[], [], [anc(10, 'Bravo')]],
}

// Deep multi-gap chain: many ancestors stacked across several gaps -- the
// "bunched-up lines" stress case the edge-fade work targets.
const deepChain: Scenario = {
  label: 'Deep multi-gap chain',
  title: 'Workspace',
  panels: [focus('Origins', 4, 0), focus('Mid-tier', 5, 2), focus('Deep leaf', 6, 4)],
  gaps: [
    [anc(1, 'Vision'), anc(2, 'Strategy'), anc(3, 'Initiatives')],
    [anc(4, 'Epic'), anc(5, 'Story')],
    [anc(6, 'Task'), anc(7, 'Subtask'), anc(8, 'Detail')],
  ],
}

// MAX_COLUMNS: four content columns with the navigation panel shifted off the
// front, so panel 0 carries a hidden-ancestor run led by the workspace title.
const maxColumns: Scenario = {
  label: 'Max columns (4)',
  title: 'Workspace',
  panels: [
    focus('Bravo', 5, 1),
    focus('Charlie', 5, 2),
    focus('Delta', 5, 3),
    focus('Echo', 6, 4),
  ],
  gaps: [[anc(1, 'Alpha')], [], [], []],
}

const scenarios: Scenario[] = [rootAncestors, interPanelGap, deepChain, maxColumns]

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const renderScenario = (scenario: Scenario, theme: OverlaidCardsTheme): JSX.Element => {
  const lastIndex = scenario.panels.length - 1
  return (
    <OverlaidCards<StubPanel>
      panels={scenario.panels}
      panelKind={(p) => p.kind}
      gaps={scenario.gaps}
      title={scenario.title}
      theme={theme}
      renderPanel={(panel, index) => (
        <StubPanelBody panel={panel} active={index === lastIndex} />
      )}
    />
  )
}

const Frame = (props: { height?: string; children: JSX.Element }): JSX.Element => (
  <div style={{ display: 'flex', height: props.height ?? '440px', width: '100%' }}>
    {props.children}
  </div>
)

// `theme` is a swappable argType so both renderers can be compared on the
// identical fixtures below (Storybook controls toolbar).
type StoryArgs = { theme: OverlaidCardsTheme }

const meta: Meta<StoryArgs> = {
  title: 'Design/OverlaidCards',
  parameters: { layout: 'fullscreen' },
  argTypes: {
    theme: {
      control: 'inline-radio',
      options: ['expanded-staircase', 'collapsed-breadcrumb'] satisfies OverlaidCardsTheme[],
      description: 'Which OverlaidCards renderer to use.',
    },
  },
  args: { theme: 'expanded-staircase' },
}

export default meta

type Story = StoryObj<StoryArgs>

export const RootAncestorsOnly: Story = {
  render: (args) => <Frame>{renderScenario(rootAncestors, args.theme)}</Frame>,
}

export const InterPanelGap: Story = {
  render: (args) => <Frame>{renderScenario(interPanelGap, args.theme)}</Frame>,
}

export const DeepMultiGapChain: Story = {
  render: (args) => <Frame>{renderScenario(deepChain, args.theme)}</Frame>,
}

export const MaxColumns: Story = {
  render: (args) => <Frame>{renderScenario(maxColumns, args.theme)}</Frame>,
}

// All scenarios stacked for comparison; the `theme` control swaps both
// renderers across every fixture at once.
export const AllScenarios: Story = {
  render: (args) => (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: 'var(--sp-32)' }}>
      <For each={scenarios}>
        {(scenario) => (
          <div>
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
              {scenario.label}
            </div>
            <Frame height="360px">{renderScenario(scenario, args.theme)}</Frame>
          </div>
        )}
      </For>
    </div>
  ),
}
