import { For, type JSX, Show } from 'solid-js'

import FocusPanel from './FocusPanel'
import StickyNavigation from './StickyNavigation'
import './workspace.css'
import type { WorkspacePanel, WorkspaceProps } from './types'

export const shouldShowWorkspaceBreadcrumb = (panels: readonly WorkspacePanel[]): boolean =>
  panels[0]?.kind === 'focus'

const Workspace = (props: WorkspaceProps): JSX.Element => (
  <main class="ws-workspace" data-theme-base="ghost" data-testid="workspace-skeleton">
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
                  onAncestrySelect={props.onAncestrySelect}
                />
              )}
            </Show>
            <StickyNavigation
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
  </main>
)

export default Workspace
