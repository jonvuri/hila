import { createEffect, createMemo, createSignal, For, type JSX, Show, untrack } from 'solid-js'

import Workspace from './Workspace'
import type { WorkspaceAncestryItem, WorkspacePanel } from './types'
import './workspace-shell-exploration.css'

export const workspacePresentationValues = [
  'horizontal-rail',
  'full-width-page',
  'edge-peeks',
  'path-rail',
  'stack-switcher',
] as const

export type WorkspacePresentation = (typeof workspacePresentationValues)[number]
export type WorkspaceDensity = 'wide' | 'narrow'

export type WorkspaceShellExplorationProps = {
  activePanel?: number
  density: WorkspaceDensity
  focusedWorkflow: boolean
  panels: readonly WorkspacePanel[]
  presentation: WorkspacePresentation
  viewportWidth: number
  workspaceTitle: string
}

export type ResponsiveWorkspaceExplorationProps = {
  activePanel?: number
  focusedWorkflow?: boolean
  inputMode?: 'keyboard-pointer' | 'touch'
  onAncestrySelect?: (item: WorkspaceAncestryItem) => void
  panels: readonly WorkspacePanel[]
  viewportWidth: number
  workspaceTitle: string
}

export const NARROW_WORKSPACE_MAX_WIDTH = 719
export const WIDE_WORKSPACE_PANEL_LIMIT = 4

const clampPanelIndex = (index: number, panels: readonly WorkspacePanel[]): number =>
  Math.max(0, Math.min(index, panels.length - 1))

export const resolveResponsiveWorkspacePanels = (
  panels: readonly WorkspacePanel[],
  viewportWidth: number,
  activePanel = panels.length - 1,
): readonly WorkspacePanel[] => {
  if (panels.length === 0) return panels

  const activeIndex = clampPanelIndex(activePanel, panels)
  const focusedStack = panels.slice(0, activeIndex + 1)

  return viewportWidth <= NARROW_WORKSPACE_MAX_WIDTH ?
      focusedStack.slice(-1)
    : focusedStack.slice(-WIDE_WORKSPACE_PANEL_LIMIT)
}

export const resolveRetainedWorkspacePanels = (
  panels: readonly WorkspacePanel[],
  activePanel = panels.length - 1,
): readonly WorkspacePanel[] => {
  if (panels.length === 0) return panels

  const activeIndex = clampPanelIndex(activePanel, panels)
  return panels.slice(0, activeIndex + 1).slice(-WIDE_WORKSPACE_PANEL_LIMIT)
}

export const resolveWorkspacePresentation = (input: {
  focusedWorkflow: boolean
  presentation: WorkspacePresentation
  viewportWidth: number
}): WorkspacePresentation =>
  input.focusedWorkflow || input.viewportWidth < 720 ? input.presentation : 'horizontal-rail'

const presentationLabel = (presentation: WorkspacePresentation): string =>
  ({
    'horizontal-rail': 'Current horizontal rail',
    'full-width-page': 'Full-width paging',
    'edge-peeks': 'Compressed edge peeks',
    'path-rail': 'Compact path rail',
    'stack-switcher': 'On-demand stack switcher',
  })[presentation]

const panelAccessibleLabel = (panel: WorkspacePanel, index: number, count: number): string =>
  `${panel.title}, panel ${index + 1} of ${count}`

const SinglePanel = (props: { panel: WorkspacePanel; workspaceTitle: string }): JSX.Element => (
  <Workspace
    ariaLabel={`Focused panel: ${props.panel.title}`}
    panels={[props.panel]}
    workspaceTitle={props.workspaceTitle}
  />
)

export const ResponsiveWorkspaceExploration = (
  props: ResponsiveWorkspaceExplorationProps,
): JSX.Element => {
  const activeIndex = createMemo(() =>
    clampPanelIndex(props.activePanel ?? props.panels.length - 1, props.panels),
  )
  const retainedPanels = createMemo(() =>
    resolveRetainedWorkspacePanels(props.panels, activeIndex()),
  )
  const singlePanel = createMemo(
    () => props.viewportWidth <= NARROW_WORKSPACE_MAX_WIDTH || (props.focusedWorkflow ?? false),
  )
  const visiblePanelIds = createMemo(
    () =>
      new Set(
        singlePanel() ?
          [props.panels[activeIndex()]?.id].filter((id): id is string => Boolean(id))
        : retainedPanels().map((panel) => panel.id),
      ),
  )

  return (
    <section
      class="wsx-responsive-workspace"
      style={{ width: `${props.viewportWidth}px` }}
      data-presentation={singlePanel() ? 'single-column' : 'bounded-rail'}
      data-input-mode={props.inputMode ?? 'keyboard-pointer'}
      aria-label="Responsive workspace degradation"
    >
      <Workspace
        activePanelId={props.panels[activeIndex()]?.id}
        panels={retainedPanels()}
        visiblePanelIds={visiblePanelIds()}
        workspaceTitle={props.workspaceTitle}
        onAncestrySelect={props.onAncestrySelect}
      />
    </section>
  )
}

const PathButtons = (props: {
  activeIndex: number
  panels: readonly WorkspacePanel[]
  onSelect: (index: number) => void
}): JSX.Element => (
  <nav class="wsx-path" aria-label="Focus stack path">
    <ol>
      <For each={props.panels}>
        {(panel, index) => (
          <li>
            <button
              type="button"
              aria-current={index() === props.activeIndex ? 'page' : undefined}
              onClick={() => props.onSelect(index())}
              title={panel.title}
            >
              <span aria-hidden="true">{index() + 1}</span>
              <span>{panel.title}</span>
            </button>
          </li>
        )}
      </For>
    </ol>
  </nav>
)

const WorkspaceShellExploration = (props: WorkspaceShellExplorationProps): JSX.Element => {
  const [activeIndex, setActiveIndex] = createSignal(
    untrack(() => clampPanelIndex(props.activePanel ?? props.panels.length - 1, props.panels)),
  )
  const [switcherOpen, setSwitcherOpen] = createSignal(false)

  createEffect(() => {
    setActiveIndex(clampPanelIndex(props.activePanel ?? props.panels.length - 1, props.panels))
  })

  const resolvedPresentation = createMemo(() =>
    resolveWorkspacePresentation({
      focusedWorkflow: props.focusedWorkflow,
      presentation: props.presentation,
      viewportWidth: props.viewportWidth,
    }),
  )
  const activePanel = createMemo(() => props.panels[activeIndex()] ?? props.panels[0])
  const selectPanel = (index: number) => {
    setActiveIndex(clampPanelIndex(index, props.panels))
    setSwitcherOpen(false)
  }
  const goBack = () => selectPanel(activeIndex() - 1)
  const goForward = () => selectPanel(activeIndex() + 1)

  return (
    <section
      class="wsx-viewport"
      style={{ width: `${props.viewportWidth}px` }}
      data-density={props.density}
      data-focused-workflow={props.focusedWorkflow ? 'true' : 'false'}
      data-presentation={resolvedPresentation()}
      aria-label={`${presentationLabel(resolvedPresentation())} workspace exploration`}
    >
      <header class="wsx-toolbar">
        <div class="wsx-toolbar-actions" aria-label="Local navigation">
          <button
            type="button"
            disabled={activeIndex() === 0}
            aria-label="Back one panel"
            onClick={goBack}
          >
            ←
          </button>
          <button
            type="button"
            disabled={activeIndex() === props.panels.length - 1}
            aria-label="Forward one panel"
            onClick={goForward}
          >
            →
          </button>
          <button type="button" onClick={() => selectPanel(0)}>
            Root
          </button>
        </div>
        <div class="wsx-status" aria-live="polite">
          <strong>{presentationLabel(resolvedPresentation())}</strong>
          <span>
            {panelAccessibleLabel(activePanel()!, activeIndex(), props.panels.length)}
          </span>
        </div>
        <button type="button" class="wsx-launcher" aria-label="Open launcher">
          ⌘K
        </button>
      </header>

      <Show
        when={resolvedPresentation() !== 'horizontal-rail'}
        fallback={
          <div class="wsx-rail" data-testid="exploration-horizontal-rail">
            <Workspace
              activePanelId={activePanel()?.id}
              panels={props.panels
                .slice(0, activeIndex() + 1)
                .slice(-WIDE_WORKSPACE_PANEL_LIMIT)}
              workspaceTitle={props.workspaceTitle}
            />
          </div>
        }
      >
        <Show when={resolvedPresentation() === 'path-rail'}>
          <PathButtons
            activeIndex={activeIndex()}
            panels={props.panels}
            onSelect={selectPanel}
          />
        </Show>

        <Show when={resolvedPresentation() === 'stack-switcher'}>
          <div class="wsx-switcher-row">
            <button
              type="button"
              aria-expanded={switcherOpen()}
              aria-controls="workspace-stack-switcher"
              onClick={() => setSwitcherOpen((open) => !open)}
            >
              Stack · {activeIndex() + 1}/{props.panels.length}
            </button>
            <span title={activePanel()?.title}>{activePanel()?.title}</span>
          </div>
          <Show when={switcherOpen()}>
            <div
              id="workspace-stack-switcher"
              class="wsx-switcher"
              role="dialog"
              aria-label="Focus stack switcher"
            >
              <ol>
                <For each={props.panels}>
                  {(panel, index) => (
                    <li>
                      <button
                        type="button"
                        aria-current={index() === activeIndex() ? 'page' : undefined}
                        onClick={() => selectPanel(index())}
                      >
                        <span>{index() + 1}</span>
                        <span>{panel.title}</span>
                      </button>
                    </li>
                  )}
                </For>
              </ol>
            </div>
          </Show>
        </Show>

        <Show when={resolvedPresentation() === 'edge-peeks'}>
          <div class="wsx-peek-layout">
            <button
              type="button"
              class="wsx-peek wsx-peek-previous"
              disabled={activeIndex() === 0}
              aria-label={
                activeIndex() === 0 ? 'No parent panel' : (
                  `Show ${props.panels[activeIndex() - 1]?.title}`
                )
              }
              onClick={goBack}
            >
              <span aria-hidden="true">‹</span>
              <span>{props.panels[activeIndex() - 1]?.title ?? 'Root'}</span>
            </button>
            <div class="wsx-single-panel">
              <SinglePanel panel={activePanel()!} workspaceTitle={props.workspaceTitle} />
            </div>
            <button
              type="button"
              class="wsx-peek wsx-peek-next"
              disabled={activeIndex() === props.panels.length - 1}
              aria-label={
                activeIndex() === props.panels.length - 1 ?
                  'No child panel'
                : `Show ${props.panels[activeIndex() + 1]?.title}`
              }
              onClick={goForward}
            >
              <span aria-hidden="true">›</span>
              <span>{props.panels[activeIndex() + 1]?.title ?? 'End'}</span>
            </button>
          </div>
        </Show>

        <Show
          when={
            resolvedPresentation() === 'full-width-page' ||
            resolvedPresentation() === 'path-rail' ||
            resolvedPresentation() === 'stack-switcher'
          }
        >
          <div class="wsx-single-panel">
            <SinglePanel panel={activePanel()!} workspaceTitle={props.workspaceTitle} />
          </div>
        </Show>
      </Show>
    </section>
  )
}

export default WorkspaceShellExploration
