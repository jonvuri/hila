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
        const active = () => index() === props.panels.length - 1
        const showBreadcrumb = () =>
          index() === 0 && shouldShowWorkspaceBreadcrumb(props.panels)

        return (
          <article
            class="ws-column"
            classList={{ 'ws-column-active': active() }}
            data-panel-kind={panel.kind}
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
                />
              )}
            </Show>
            <StickyNavigation
              ariaLabel={[props.ariaLabel, panel.title, 'children'].filter(Boolean).join(': ')}
              title={panel.kind === 'navigation' ? props.workspaceTitle : undefined}
              items={panel.items}
              initialCollapsed={panel.initialCollapsed}
              drillId={panel.drillId}
              drillLabel={props.panels[index() + 1]?.title}
              selectedId={panel.selectedId}
              disabledIds={panel.disabledIds}
              onDrill={(rowId) => props.onDrill?.(panel, rowId)}
            />
          </article>
        )
      }}
    </For>
  </Dynamic>
)

export default Workspace
