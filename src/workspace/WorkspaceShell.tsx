import { createEffect, createSignal, For, onCleanup, onMount, Show, type JSX } from 'solid-js'

import WorkspacePathHeader, { type WorkspacePathSegment } from './WorkspacePathHeader'

import './WorkspaceShell.css'

export type WorkspaceShellAncestor = WorkspacePathSegment

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
  let rail!: HTMLDivElement
  let focusCheckGeneration = 0
  const [presentation, setPresentation] =
    createSignal<WorkspaceShellPresentation>('bounded-rail')
  const [presentationReady, setPresentationReady] = createSignal(false)
  const [announcement, setAnnouncement] = createSignal('')
  const [rootOriginVisible, setRootOriginVisible] = createSignal(true)
  const [leadingVisiblePanelId, setLeadingVisiblePanelId] = createSignal<string>()

  const pathHeaderEntry = () => {
    const index = (() => {
      if (presentation() === 'single-panel') {
        return props.panels.findIndex((panel) => panel.active)
      }
      if (props.panels[0]?.kind === 'navigation' && rootOriginVisible()) return -1
      const leadingId = leadingVisiblePanelId()
      const leadingIndex = props.panels.findIndex((panel) => panel.id === leadingId)
      return leadingIndex >= 0 ? leadingIndex : (
          props.panels.findIndex((panel) => panel.kind === 'focus')
        )
    })()
    const panel = props.panels[index]
    return panel?.kind === 'focus' && panel.ancestry.length > 0 ? { index, panel } : null
  }

  const updateRailVisibility = (): void => {
    if (presentation() !== 'bounded-rail') return
    const railBounds = rail.getBoundingClientRect()
    if (railBounds.width <= 0) return
    const columns = [
      ...rail.querySelectorAll<HTMLElement>('[data-testid="workspace-shell-column"]'),
    ]
    const intersectsRail = (element: HTMLElement): boolean => {
      const bounds = element.getBoundingClientRect()
      return bounds.right > railBounds.left && bounds.left < railBounds.right
    }
    const rootColumn = columns.find((column) => column.dataset.panelKind === 'navigation')
    const rootIndicator = rootColumn?.querySelector<HTMLElement>(
      '[data-workspace-root-indicator]',
    )
    const rootIndicatorBounds = rootIndicator?.getBoundingClientRect()
    const originVisible =
      rootColumn != null &&
      (rootIndicatorBounds != null && rootIndicatorBounds.width > 0 ?
        rootIndicatorBounds.left >= railBounds.left &&
        rootIndicatorBounds.right <= railBounds.right
      : intersectsRail(rootColumn))
    setRootOriginVisible(originVisible)
    setLeadingVisiblePanelId(
      originVisible ? undefined : (
        columns.find((column) => column.dataset.panelKind === 'focus' && intersectsRail(column))
          ?.dataset.panelId
      ),
    )
  }

  const updatePresentation = (hostWidth: number): void => {
    if (hostWidth <= 0) return
    setPresentation(resolveWorkspaceShellPresentation(hostWidth))
    setPresentationReady(true)
  }

  onMount(() => {
    updatePresentation(shell.getBoundingClientRect().width)
    updateRailVisibility()
    rail.addEventListener('scroll', updateRailVisibility, { passive: true })
    onCleanup(() => rail.removeEventListener('scroll', updateRailVisibility))
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      const entry = entries.find(({ target }) => target === shell)
      if (entry) updatePresentation(entry.contentRect.width)
      queueMicrotask(updateRailVisibility)
    })
    observer.observe(shell)
    onCleanup(() => observer.disconnect())
  })

  createEffect(() => {
    void props.panels
    void presentation()
    queueMicrotask(updateRailVisibility)
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
      <Show when={pathHeaderEntry()}>
        {(entry) => (
          <div class="workspace-shell-path-header">
            <WorkspacePathHeader
              ariaLabel={`${entry().panel.title}: ancestry`}
              launcherOrigin={true}
              rootLabel={entry().panel.ancestry[0]!.label}
              segments={entry().panel.ancestry.slice(1)}
              testId="workspace-shell-breadcrumb"
              onRootSelect={() =>
                props.onAncestorSelect?.(entry().index, entry().panel.ancestry[0]!)
              }
              onSegmentSelect={(ancestor) => props.onAncestorSelect?.(entry().index, ancestor)}
            />
          </div>
        )}
      </Show>
      <div class="workspace-shell-rail" ref={rail}>
        <For each={props.panels}>
          {(panel) => {
            const visible = () => presentation() === 'bounded-rail' || panel.active

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
                data-launcher-origin={
                  (
                    panel.kind === 'navigation' &&
                    visible() &&
                    (presentation() === 'single-panel' || rootOriginVisible())
                  ) ?
                    'true'
                  : undefined
                }
                hidden={!visible()}
                ref={(element) => {
                  createEffect(() => element.toggleAttribute('inert', !visible()))
                }}
                tabindex={-1}
                onKeyDown={(event) => {
                  if (
                    event.key !== 'Tab' ||
                    event.shiftKey ||
                    event.target !== event.currentTarget ||
                    pathHeaderEntry()?.panel.id !== panel.id
                  ) {
                    return
                  }
                  const firstPathAction = shell.querySelector<HTMLElement>(
                    '[data-testid="workspace-shell-breadcrumb"] button',
                  )
                  if (!firstPathAction) return
                  event.preventDefault()
                  firstPathAction.focus()
                }}
              >
                <div class="workspace-shell-content">{props.renderPanel(panel)}</div>
              </article>
            )
          }}
        </For>
      </div>
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
