import { createEffect, createSignal, For, onCleanup, onMount, Show, type JSX } from 'solid-js'

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

export const NARROW_WORKSPACE_MAX_WIDTH = 719

export type WorkspaceShellPresentation = 'bounded-rail' | 'single-panel'

export const resolveWorkspaceShellPresentation = (
  hostWidth: number,
): WorkspaceShellPresentation =>
  hostWidth <= NARROW_WORKSPACE_MAX_WIDTH ? 'single-panel' : 'bounded-rail'

export type WorkspaceShellProps<Panel extends WorkspaceShellPanel> = {
  ariaLabel?: string
  panels: readonly Panel[]
  renderPanel: (panel: Panel) => JSX.Element
  onAncestorSelect?: (panelIndex: number, ancestor: WorkspaceShellAncestor) => void
}

const WorkspaceShell = <Panel extends WorkspaceShellPanel>(
  props: WorkspaceShellProps<Panel>,
): JSX.Element => {
  let shell!: HTMLElement
  let focusCheckGeneration = 0
  const [presentation, setPresentation] =
    createSignal<WorkspaceShellPresentation>('bounded-rail')
  const [presentationReady, setPresentationReady] = createSignal(false)
  const [announcement, setAnnouncement] = createSignal('')

  const updatePresentation = (hostWidth: number): void => {
    if (hostWidth <= 0) return
    setPresentation(resolveWorkspaceShellPresentation(hostWidth))
    setPresentationReady(true)
  }

  onMount(() => {
    updatePresentation(shell.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      const entry = entries.find(({ target }) => target === shell)
      if (entry) updatePresentation(entry.contentRect.width)
    })
    observer.observe(shell)
    onCleanup(() => observer.disconnect())
  })

  createEffect(() => {
    if (!presentationReady()) return
    const currentPresentation = presentation()
    const activeId = props.panels.find((panel) => panel.active)?.id
    const generation = ++focusCheckGeneration
    setAnnouncement('')

    queueMicrotask(() => {
      if (generation !== focusCheckGeneration || currentPresentation !== 'single-panel') return
      const focused = document.activeElement
      if (!(focused instanceof HTMLElement) || !shell.contains(focused)) return
      const focusedPanel = focused.closest<HTMLElement>(
        '[data-testid="workspace-shell-column"]',
      )
      if (!focusedPanel?.hidden) return
      const activePanel = [
        ...shell.querySelectorAll<HTMLElement>('[data-testid="workspace-shell-column"]'),
      ].find((panel) => panel.dataset.panelId === activeId)
      if (!activePanel) return
      activePanel.focus({ preventScroll: true })
      setAnnouncement(`Single-panel workspace. Focus moved to ${activePanel.ariaLabel}.`)
    })
  })

  onCleanup(() => {
    focusCheckGeneration++
  })

  return (
    <main
      ref={shell}
      aria-label={props.ariaLabel ?? 'Workspace'}
      class="workspace-shell"
      data-shell-presentation={presentation()}
      data-testid="workspace-shell"
    >
      <For each={props.panels}>
        {(panel, index) => {
          const visible = () => presentation() === 'bounded-rail' || panel.active
          const showBreadcrumb = () =>
            panel.kind === 'focus' &&
            panel.ancestry.length > 0 &&
            (presentation() === 'single-panel' ? panel.active : index() === 0)

          return (
            <article
              aria-hidden={visible() ? undefined : 'true'}
              aria-label={panel.title}
              class="workspace-shell-column"
              classList={{ 'workspace-shell-column-active': panel.active }}
              data-active={panel.active ? 'true' : 'false'}
              data-panel-id={panel.id}
              data-panel-kind={panel.kind}
              data-testid="workspace-shell-column"
              data-visible={visible() ? 'true' : 'false'}
              hidden={!visible()}
              ref={(element) => {
                createEffect(() => element.toggleAttribute('inert', !visible()))
              }}
              tabindex={-1}
            >
              <Show when={showBreadcrumb()}>
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
          )
        }}
      </For>
      <div
        aria-atomic="true"
        aria-live="polite"
        class="workspace-shell-announcement"
        role="status"
      >
        {announcement()}
      </div>
    </main>
  )
}

export default WorkspaceShell
