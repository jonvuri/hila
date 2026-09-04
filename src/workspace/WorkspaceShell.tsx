import { For, Show, type JSX } from 'solid-js'

import './WorkspaceShell.css'

export type WorkspaceShellAncestor = {
  id: string
  label: string
  matrixId?: number
  rowId?: number
}

export type WorkspaceShellPanel = {
  id: string
  kind: 'navigation' | 'focus'
  active: boolean
  title: string
  ancestry: readonly WorkspaceShellAncestor[]
}

export type WorkspaceShellProps<Panel extends WorkspaceShellPanel> = {
  ariaLabel?: string
  panels: readonly Panel[]
  renderPanel: (panel: Panel) => JSX.Element
  onAncestorSelect?: (panelIndex: number, ancestor: WorkspaceShellAncestor) => void
}

const WorkspaceShell = <Panel extends WorkspaceShellPanel>(
  props: WorkspaceShellProps<Panel>,
): JSX.Element => (
  <main
    aria-label={props.ariaLabel ?? 'Workspace'}
    class="workspace-shell"
    data-testid="workspace-shell"
  >
    <For each={props.panels}>
      {(panel, index) => (
        <article
          aria-label={panel.title}
          class="workspace-shell-column"
          classList={{ 'workspace-shell-column-active': panel.active }}
          data-active={panel.active ? 'true' : 'false'}
          data-panel-id={panel.id}
          data-panel-kind={panel.kind}
          data-testid="workspace-shell-column"
        >
          <Show when={index() === 0 && panel.kind === 'focus' && panel.ancestry.length > 0}>
            <nav
              aria-label={`${panel.title}: ancestry`}
              class="workspace-shell-breadcrumb"
              data-testid="workspace-shell-breadcrumb"
            >
              <ol>
                <For each={panel.ancestry}>
                  {(ancestor) => (
                    <li>
                      <button
                        type="button"
                        title={ancestor.label}
                        onClick={() => props.onAncestorSelect?.(index(), ancestor)}
                      >
                        {ancestor.label}
                      </button>
                    </li>
                  )}
                </For>
              </ol>
            </nav>
          </Show>
          <div class="workspace-shell-content">{props.renderPanel(panel)}</div>
        </article>
      )}
    </For>
  </main>
)

export default WorkspaceShell
