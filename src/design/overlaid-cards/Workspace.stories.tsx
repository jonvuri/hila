import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { type JSX } from 'solid-js'

import { Outline } from '../outline/Outline'
import type { LegacyOutlineVariant } from '../outline/types'

import OverlaidCards from './OverlaidCards'
import { workspacePanels, workspaceTitle, type WorkspacePanel } from './fixtures'
import type { GaugeOptions, WipeoutDisplayFont } from './types'
import { GAUGE_DEFAULTS } from './variants/shared'
import WorkspaceFocusPanel from './variants/WorkspaceFocusPanel'
import WorkspaceSticky from './variants/WorkspaceSticky'

// ---------------------------------------------------------------------------
// Archived full-screen workspace mockups from session 4b.
//
// Where Design/OverlaidCards iterates on the card/tab chrome in isolation,
// these stories mock the whole workspace column stream the way the wired app
// composes it: drill-down columns are a FocusPanel above their children
// navigation panel, over the shared "Reading queue" fixture. Wipeout theme
// only.
// ---------------------------------------------------------------------------

type StoryArgs = {
  outlineTheme: LegacyOutlineVariant
  displayFont: WipeoutDisplayFont
  // FocusPanel story
  active?: boolean
  // wipeout-gauge dials
  railWidth?: number
  ghostRows?: number
  showNames?: boolean
}

const Frame = (props: { children: JSX.Element }): JSX.Element => (
  <div style={{ display: 'flex', height: '100vh', width: '100%' }}>{props.children}</div>
)

const meta: Meta<StoryArgs> = {
  title: 'Archive/Phase 10/Session 4b/Workspace',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Retired Phase 10 exploration. Sticky Headers is the source reference for the forward workspace structure. Its Wipeout styling is not the forward base.',
      },
    },
  },
  argTypes: {
    outlineTheme: {
      control: 'select',
      options: [
        'workflowy-clone',
        'workflowy-geometric',
        'vector-field',
        'corner-notches',
        'whitespace-only',
      ] satisfies LegacyOutlineVariant[],
      description: 'Outline theme rendered inside the navigation panels.',
    },
    displayFont: {
      control: 'inline-radio',
      options: ['chakra-petch', 'orbitron'] satisfies WipeoutDisplayFont[],
      description: 'Display voice (Orbitron = the user-liked alternate).',
    },
  },
  args: { outlineTheme: 'workflowy-geometric', displayFont: 'chakra-petch' },
}

export default meta

type Story = StoryObj<StoryArgs>

// The DDIA drill-down column: the panel every focus-panel mockup story leans on.
const ddiaPanel = workspacePanels[1]!

/**
 * The FocusPanel mockup in isolation, composed the way a drill-down column
 * composes it in the wired app: title, content prose, Properties, Backlinks
 * -- with the children navigation panel below.
 */
export const FocusPanel: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Archived Wipeout FocusPanel mockup. It is not the forward Ghost implementation.',
      },
    },
  },
  argTypes: {
    active: {
      control: 'boolean',
      description: 'Rightmost-panel treatment: accent flag + full-strength title.',
    },
  },
  args: { active: true },
  render: (args) => (
    <Frame>
      <div
        class="wo-cards wo-wsp"
        classList={{ 'wo-font-orbitron': args.displayFont === 'orbitron' }}
        style={{ 'max-width': '440px', 'border-right': '1px solid var(--wo-line-2)' }}
      >
        <div class="wo-wsp-col">
          <WorkspaceFocusPanel
            title={ddiaPanel.title}
            meta={ddiaPanel.focus!}
            active={args.active}
          />
          <div class="wo-wsp-plainnav wo-wsp-outline">
            <Outline
              theme={args.outlineTheme}
              items={ddiaPanel.items}
              initialCollapsed={ddiaPanel.initialCollapsed}
            />
          </div>
        </div>
      </div>
    </Frame>
  ),
}

/**
 * Sticky headers as the breadcrumbs. No tab layer at all: each navigation
 * panel's sticky header stack IS the breadcrumb -- pinned gap ancestors up
 * top, VS Code-style stuck ancestors below them as you scroll, and the
 * focus-drill row (the row drilled into for the next column) accented with a
 * throughline off the column's right edge, pinned to both the top stack and
 * the bottom edge so it is always visible.
 */
export const StickyHeaders: Story = {
  name: 'Wipeout · Sticky headers',
  parameters: {
    docs: {
      description: {
        story:
          'Source reference for the forward workspace structure. Preserve its layout and hierarchy behavior, but do not treat its Wipeout styling as the Ghost base.',
      },
    },
  },
  render: (args) => (
    <Frame>
      <WorkspaceSticky
        panels={workspacePanels}
        title={workspaceTitle}
        outlineTheme={args.outlineTheme}
        displayFont={args.displayFont}
      />
    </Frame>
  ),
}

/**
 * OC-B: the whole chain as a vertical ladder in a fixed left rail -- narrow
 * dim cell = collapsed ancestor, wide = open panel, wide accent = active,
 * ghost = depth not yet opened (the VFD move). Columns carry only a mono
 * level index pointing back at the gauge -- now with the FocusPanel mockup
 * above each drill-down column's children outline, as in the wired app.
 * Noted future idea (not built): a collapsed micro-gauge riding the shell
 * status strip.
 */
export const DepthGauge: Story = {
  name: 'Wipeout · Depth gauge (OC-B)',
  parameters: {
    docs: {
      description: {
        story:
          'Archived depth-gauge alternative. It is not part of the forward workspace direction.',
      },
    },
  },
  argTypes: {
    showNames: {
      control: 'boolean',
      description: 'Level names in the rail (vs indices-only).',
    },
  },
  args: { ...GAUGE_DEFAULTS },
  render: (args) => {
    const gaugeOptions: Partial<GaugeOptions> = {
      railWidth: args.railWidth,
      ghostRows: args.ghostRows,
      showNames: args.showNames,
      displayFont: args.displayFont,
    }
    const lastIndex = workspacePanels.length - 1
    return (
      <Frame>
        <OverlaidCards<WorkspacePanel>
          panels={workspacePanels}
          panelKind={(panel) => panel.kind}
          gaps={workspacePanels.map((panel) => panel.gap)}
          title={workspaceTitle}
          theme="wipeout-gauge"
          panelLabel={(panel) => panel.title}
          gaugeOptions={gaugeOptions}
          renderPanel={(panel, index) => (
            <>
              {panel.kind === 'focus' && panel.focus ?
                <WorkspaceFocusPanel
                  title={panel.title}
                  meta={panel.focus}
                  active={index === lastIndex}
                />
              : null}
              <div class="wo-wsp-outline">
                <Outline
                  theme={args.outlineTheme}
                  items={panel.items}
                  initialCollapsed={panel.initialCollapsed}
                />
              </div>
            </>
          )}
        />
      </Frame>
    )
  },
}
