import { For, type JSX, Show } from 'solid-js'
import { Dynamic } from 'solid-js/web'

import FocusPanel from './FocusPanel'
import StickyNavigation from './StickyNavigation'
import './workspace.css'
import type { WorkspacePanel, WorkspaceProps } from './types'

export const shouldShowWorkspaceBreadcrumb = (panels: readonly WorkspacePanel[]): boolean =>
  panels[0]?.kind === 'focus'

const Workspace = (props: WorkspaceProps): JSX.Element => (
  <Dynamic
    component={props.as ?? 'main'}
    aria-label={props.ariaLabel}
    class="ws-workspace"
    data-theme-base="ghost"
    data-testid="workspace-skeleton"
  >
    <For each={props.panels}>
      {(panel, index) => {
        const active = () =>
          props.activePanelId ?
            panel.id === props.activePanelId
          : index() === props.panels.length - 1
        const visible = () => props.visiblePanelIds?.has(panel.id) ?? true
        const firstVisible = () =>
          props.panels.findIndex(
            (candidate) => props.visiblePanelIds?.has(candidate.id) ?? true,
          ) === index()
        const showBreadcrumb = () => firstVisible() && panel.kind === 'focus'

        return (
          <article
            class="ws-column"
            classList={{ 'ws-column-active': active() }}
            aria-hidden={visible() ? undefined : 'true'}
            data-panel-id={panel.id}
            data-panel-kind={panel.kind}
            data-visible={visible() ? 'true' : 'false'}
            data-testid="workspace-column"
          >
            <Show when={panel.kind === 'focus' && panel.focus}>
              {(focus) => (
                <FocusPanel
                  title={panel.title}
                  content={focus()}
                  active={active()}
                  ancestry={showBreadcrumb() ? panel.ancestry : undefined}
                  landmarkLabelPrefix={props.ariaLabel}
                  onAncestrySelect={props.onAncestrySelect}
                  state={panel.state}
                />
              )}
            </Show>
            <Show when={!panel.state}>
              <StickyNavigation
                ariaLabel={[props.ariaLabel, panel.title, 'children']
                  .filter(Boolean)
                  .join(': ')}
                title={panel.kind === 'navigation' ? props.workspaceTitle : undefined}
                items={panel.items}
                initialCollapsed={panel.initialCollapsed}
                drillId={panel.drillId}
                drillLabel={props.panels[index() + 1]?.title}
                selectedId={panel.selectedId}
                disabledIds={panel.disabledIds}
                navigationOutline={props.navigationOutline}
                showLeafBullets={props.showLeafBullets}
                onDrill={(rowId) => props.onDrill?.(panel, rowId)}
              />
            </Show>
          </article>
        )
      }}
    </For>
  </Dynamic>
)

export default Workspace
