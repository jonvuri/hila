import type { Meta, StoryObj } from 'storybook-solidjs-vite'
import { createSignal, For, type JSX } from 'solid-js'

import {
  ancestrySourcePanels,
  contentStatePanels,
  crossMatrixPanels,
  denseFocusPanels,
  fiveColumnPanels,
  longLabelPanels,
  longWorkspaceTitle,
  rootShiftedPanels,
  workspaceTitle,
} from './fixtures'
import Workspace from './Workspace'
import WorkspaceShellExploration, {
  ResponsiveWorkspaceExploration,
  type WorkspaceDensity,
  type WorkspacePresentation,
  workspacePresentationValues,
} from './WorkspaceShellExploration'
import type { WorkspacePanel } from './types'

type Scenario = 'rooted-stream' | 'launcher-jump' | 'long-labels'

type StoryArgs = {
  activePanel: number
  density: WorkspaceDensity
  focusDepth: number
  focusedWorkflow: boolean
  presentation: WorkspacePresentation
  scenario: Scenario
  viewportWidth: number
}

const scenarioValues: readonly Scenario[] = ['rooted-stream', 'launcher-jump', 'long-labels']
const viewportValues = [390, 500, 720, 1180] as const

const resolvePanels = (args: StoryArgs): readonly WorkspacePanel[] => {
  if (args.scenario === 'launcher-jump') return crossMatrixPanels
  if (args.scenario === 'long-labels') return longLabelPanels.slice(0, args.focusDepth)
  return fiveColumnPanels.slice(0, args.focusDepth)
}

const resolveWorkspaceTitle = (scenario: Scenario): string =>
  scenario === 'long-labels' ? longWorkspaceTitle : workspaceTitle

const Shell = (props: StoryArgs): JSX.Element => (
  <WorkspaceShellExploration
    activePanel={props.activePanel}
    density={props.density}
    focusedWorkflow={props.focusedWorkflow}
    panels={resolvePanels(props)}
    presentation={props.presentation}
    viewportWidth={props.viewportWidth}
    workspaceTitle={resolveWorkspaceTitle(props.scenario)}
  />
)

const ContinuityLab = (): JSX.Element => {
  const [viewportWidth, setViewportWidth] = createSignal(1180)
  const [focusedWorkflow, setFocusedWorkflow] = createSignal(false)

  return (
    <div class="wsx-continuity-lab">
      <div class="wsx-lab-controls" aria-label="Presentation transition controls">
        <button
          type="button"
          aria-pressed={viewportWidth() === 500}
          onClick={() => setViewportWidth(500)}
        >
          Narrow viewport
        </button>
        <button
          type="button"
          aria-pressed={viewportWidth() === 1180}
          onClick={() => setViewportWidth(1180)}
        >
          Wide viewport
        </button>
        <button
          type="button"
          aria-pressed={focusedWorkflow()}
          onClick={() => setFocusedWorkflow((focused) => !focused)}
        >
          Experimental wide focus
        </button>
      </div>
      <output class="wsx-lab-status" aria-live="polite">
        {viewportWidth()}px · {focusedWorkflow() ? 'focused candidate' : 'environmental layout'}{' '}
        · active panel comparison
      </output>
      <ResponsiveWorkspaceExploration
        focusedWorkflow={focusedWorkflow()}
        panels={denseFocusPanels}
        viewportWidth={viewportWidth()}
        workspaceTitle={workspaceTitle}
      />
    </div>
  )
}

const meta: Meta<StoryArgs> = {
  title: 'Design/Workspace/Narrow shell exploration',
  args: {
    activePanel: 4,
    density: 'wide',
    focusDepth: 5,
    focusedWorkflow: false,
    presentation: 'full-width-page',
    scenario: 'rooted-stream',
    viewportWidth: 500,
  },
  argTypes: {
    activePanel: { control: { type: 'range', min: 0, max: 4, step: 1 } },
    density: { control: 'inline-radio', options: ['wide', 'narrow'] },
    focusDepth: { control: { type: 'range', min: 1, max: 5, step: 1 } },
    focusedWorkflow: { control: 'boolean' },
    presentation: { control: 'select', options: workspacePresentationValues },
    scenario: { control: 'select', options: scenarioValues },
    viewportWidth: { control: 'select', options: viewportValues },
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Session 9 fixture exploration. Every concept reads the same rooted panel stack. Viewport narrowness, density, and the explicit focused-workflow input remain separate controls. Prototype chrome does not change production behavior.',
      },
    },
  },
  render: (args) => (
    <div class="wsx-story-frame">
      <Shell {...args} />
    </div>
  ),
}

export default meta

type Story = StoryObj<StoryArgs>

export const SelectedCleanDegradation: Story = {
  name: 'Selected · clean single-column degradation',
  render: () => (
    <div class="wsx-gallery wsx-gallery-baseline">
      <section>
        <h2>Wide · existing four-panel window</h2>
        <ResponsiveWorkspaceExploration
          activePanel={4}
          panels={fiveColumnPanels}
          viewportWidth={1180}
          workspaceTitle={workspaceTitle}
        />
      </section>
      <section>
        <h2>Narrow · same focus, one panel</h2>
        <ResponsiveWorkspaceExploration
          activePanel={4}
          panels={fiveColumnPanels}
          viewportWidth={500}
          workspaceTitle={workspaceTitle}
        />
      </section>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Selected direction: the wide viewport keeps the existing last-four-panel window. The narrow viewport renders only the logically focused panel from that same rooted stack. Because the focused panel becomes the first visible panel, it uses the existing provenance breadcrumb from the root-shifted workspace state. No new navigation chrome or state is introduced.',
      },
    },
  },
}

export const SelectedRootFocus: Story = {
  name: 'Selected · root focused at 500 × 844',
  render: () => (
    <div class="wsx-story-frame">
      <ResponsiveWorkspaceExploration
        activePanel={0}
        panels={fiveColumnPanels}
        viewportWidth={500}
        workspaceTitle={workspaceTitle}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'When the root is focused, the narrow viewport renders the existing root navigation panel. Descendant panels are outside the focused stack, not hidden alternatives.',
      },
    },
  },
}

export const SelectedCrossMatrixFocus: Story = {
  name: 'Selected · cross-matrix focus at 390 × 844',
  render: () => (
    <div class="wsx-story-frame">
      <ResponsiveWorkspaceExploration
        panels={crossMatrixPanels}
        viewportWidth={390}
        workspaceTitle={workspaceTitle}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A reconstructed cross-matrix focus degrades to the same single focus panel and keeps its provenance-resolved root path.',
      },
    },
  },
}

export const InteractiveComparison: Story = {
  name: 'Rejected exploration · shared stack controls',
  parameters: {
    docs: {
      description: {
        story:
          'At 720px and wider, environmental width keeps the current rail unless Focused workflow is enabled. Below 720px, the selected one-column concept applies. Density changes spacing only.',
      },
    },
  },
}

export const CurrentRailBaseline: Story = {
  name: 'Baseline · desktop and 500 × 844',
  render: () => (
    <div class="wsx-gallery wsx-gallery-baseline">
      <section>
        <h2>Desktop · 1180</h2>
        <div class="wsx-baseline-frame" style={{ width: '1180px' }}>
          <Workspace panels={rootShiftedPanels} workspaceTitle={workspaceTitle} />
        </div>
      </section>
      <section>
        <h2>Narrow · 500 × 844</h2>
        <div class="wsx-baseline-frame" style={{ width: '500px' }}>
          <Workspace panels={rootShiftedPanels} workspaceTitle={workspaceTitle} />
        </div>
      </section>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The production analog preserves simultaneous context and spatial order. At 500px, the active panel begins off-screen, parent/child direction depends on horizontal scrolling, and the content column receives only part of the viewport.',
      },
    },
  },
}

export const ContinuityTransitions: Story = {
  name: 'Finalist · continuity transition lab',
  render: () => <ContinuityLab />,
  parameters: {
    docs: {
      description: {
        story:
          'Edit a field, expand or collapse an outline branch, and scroll either region before changing width. The retained four-panel window stays mounted while visibility changes. The wide-focus toggle is comparison evidence, not a selected shipping control.',
      },
    },
  },
}

export const BreakpointAndInputStress: Story = {
  name: 'Finalist · breakpoints, density, and touch',
  render: () => (
    <div class="wsx-gallery wsx-gallery-concepts">
      <For each={[390, 500, 720, 1180] as const}>
        {(viewportWidth) => (
          <section>
            <h2>{viewportWidth}px · dense · touch targets</h2>
            <ResponsiveWorkspaceExploration
              inputMode="touch"
              panels={denseFocusPanels}
              viewportWidth={viewportWidth}
              workspaceTitle={workspaceTitle}
            />
          </section>
        )}
      </For>
    </div>
  ),
}

export const AncestrySourceStress: Story = {
  name: 'Finalist · ancestry resolution sources',
  render: () => (
    <div class="wsx-gallery wsx-gallery-concepts">
      <For each={Object.values(ancestrySourcePanels)}>
        {(panel) => (
          <section>
            <h2>{panel.ancestry?.source}</h2>
            <ResponsiveWorkspaceExploration
              panels={[panel]}
              viewportWidth={390}
              workspaceTitle={workspaceTitle}
            />
          </section>
        )}
      </For>
      <section>
        <h2>cross-matrix provenance</h2>
        <ResponsiveWorkspaceExploration
          panels={crossMatrixPanels}
          viewportWidth={390}
          workspaceTitle={workspaceTitle}
        />
      </section>
    </div>
  ),
}

export const ContentStateStress: Story = {
  name: 'Finalist · loading, empty, and error states',
  render: () => (
    <div class="wsx-gallery wsx-gallery-concepts">
      <For each={contentStatePanels}>
        {(panel) => (
          <section>
            <h2>{panel.state?.kind}</h2>
            <ResponsiveWorkspaceExploration
              panels={[panel]}
              viewportWidth={390}
              workspaceTitle={workspaceTitle}
            />
          </section>
        )}
      </For>
    </div>
  ),
}

const directConcepts = workspacePresentationValues.filter(
  (presentation): presentation is Exclude<WorkspacePresentation, 'horizontal-rail'> =>
    presentation !== 'horizontal-rail',
)

export const DirectAnalogGallery: Story = {
  name: 'Rejected exploration · direct analogs',
  globals: { visualTheme: 'ghost' },
  render: () => (
    <div class="wsx-gallery wsx-gallery-concepts">
      <For each={directConcepts}>
        {(presentation) => (
          <section>
            <h2>{presentation.replaceAll('-', ' ')}</h2>
            <WorkspaceShellExploration
              activePanel={4}
              density="wide"
              focusedWorkflow
              panels={fiveColumnPanels}
              presentation={presentation}
              viewportWidth={500}
              workspaceTitle={workspaceTitle}
            />
          </section>
        )}
      </For>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Rejected comparison evidence. Each concept spends scarce one-column space or adds navigation chrome without enough value over showing the focused panel directly.',
      },
    },
  },
}

export const DecisionReviewPage: Story = {
  name: 'Review · baseline, selected, and rejected concepts',
  globals: { visualTheme: 'ghost' },
  render: () => (
    <div class="wsx-gallery wsx-gallery-concepts">
      <section>
        <h2>baseline · bounded rail at 500</h2>
        <div class="wsx-baseline-frame" style={{ width: '500px' }}>
          <Workspace panels={rootShiftedPanels} workspaceTitle={workspaceTitle} />
        </div>
      </section>
      <section>
        <h2>selected · focused panel at 500</h2>
        <ResponsiveWorkspaceExploration
          panels={fiveColumnPanels}
          viewportWidth={500}
          workspaceTitle={workspaceTitle}
        />
      </section>
      <For each={directConcepts}>
        {(presentation) => (
          <section>
            <h2>rejected · {presentation.replaceAll('-', ' ')}</h2>
            <WorkspaceShellExploration
              activePanel={4}
              density="wide"
              focusedWorkflow
              panels={fiveColumnPanels}
              presentation={presentation}
              viewportWidth={500}
              workspaceTitle={workspaceTitle}
            />
          </section>
        )}
      </For>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'One like-for-like review page over the same five-step focus path. The baseline shows the current bounded rail, the selected direction shows its active panel without added shell chrome, and the four rejected concepts preserve the comparison evidence.',
      },
    },
  },
}

export const LauncherReconstruction: Story = {
  name: 'State · launcher cross-matrix reconstruction',
  args: {
    activePanel: 0,
    focusDepth: 1,
    focusedWorkflow: true,
    presentation: 'path-rail',
    scenario: 'launcher-jump',
  },
  parameters: {
    docs: {
      description: {
        story:
          'A launcher destination remains one panel backed by a provenance-resolved ancestry path. The shell adds no parallel root and does not infer a portal.',
      },
    },
  },
}

export const LongLabels: Story = {
  name: 'State · long labels',
  args: {
    activePanel: 2,
    focusDepth: 3,
    focusedWorkflow: true,
    presentation: 'stack-switcher',
    scenario: 'long-labels',
    viewportWidth: 390,
  },
}
