import { createEffect, createMemo, onCleanup, Suspense } from 'solid-js'

import { resolveComponentVariant, type ComponentVariantConfig } from '../design/tokens'
import type { SessionMemoryStore } from '../session/session-memory'

import FocusPanel from './FocusPanel'
import NavigationPanel from './NavigationPanel'
import {
  createStreamController,
  type StreamControllerInput,
  type StreamPanel,
} from './stream-controller'
import WorkspaceShell, {
  type WorkspaceShellAncestor,
  type WorkspaceShellPanel,
} from './WorkspaceShell'

type StreamViewProps = StreamControllerInput & {
  componentConfig?: ComponentVariantConfig
  sessionMemory?: SessionMemoryStore
}

type StreamShellPanel = WorkspaceShellPanel & {
  source: StreamPanel
}

const StreamView = (props: StreamViewProps) => {
  const controller = createStreamController({
    get matrixId() {
      return props.matrixId
    },
    get navigateToPlace() {
      return props.navigateToPlace
    },
    onNavigated: () => props.onNavigated?.(),
    onFocusTransition: (entry) => {
      props.onFocusTransition?.(entry)
      props.sessionMemory?.recordFocus(entry)
    },
  })
  const navigationOutline = createMemo(() =>
    resolveComponentVariant('navigationOutline', props.componentConfig?.navigationOutline),
  )
  const shellPanelBySource = new WeakMap<StreamPanel, StreamShellPanel>()
  const shellPanels = createMemo(() =>
    controller.panels().map((source): StreamShellPanel => {
      const existing = shellPanelBySource.get(source)
      if (existing) return existing

      const shellPanel: StreamShellPanel = {
        source,
        id: source.id,
        get kind() {
          return source.type
        },
        get active() {
          return controller.panels().at(-1)?.id === source.id
        },
        get title() {
          return source.type === 'navigation' ?
              controller.title()
            : (source.label() ?? `Focused row ${source.rowId}`)
        },
        get ancestry() {
          const panelIndex = controller.panels().findIndex((panel) => panel.id === source.id)
          const chain = panelIndex < 0 ? [] : (controller.ancestry()[panelIndex] ?? [])
          if (panelIndex !== 0 || source.type !== 'focus') return chain
          return [
            { id: 'workspace-root', label: controller.title() },
            ...chain,
          ] satisfies readonly WorkspaceShellAncestor[]
        },
      }
      shellPanelBySource.set(source, shellPanel)
      return shellPanel
    }),
  )

  createEffect(() => {
    const entries = controller.focusEntries()
    props.sessionMemory?.setCurrentFocusChain(entries)
    props.sessionMemory?.replaceOnScreen('stream:focus-panels', entries)
  })

  onCleanup(() => {
    props.sessionMemory?.setCurrentFocusChain([])
    props.sessionMemory?.clearOnScreen('stream:focus-panels')
    for (const panel of controller.panels()) {
      props.sessionMemory?.clearOnScreen(`stream:navigation:${panel.id}`)
    }
  })

  const renderPanel = (shellPanel: StreamShellPanel) => {
    const panel = shellPanel.source
    const panelIndex = () =>
      controller.panels().findIndex((candidate) => candidate.id === panel.id)
    if (panel.type === 'navigation') {
      return (
        <NavigationPanel
          matrixId={props.matrixId}
          navigationOutline={navigationOutline()}
          rootKey={panel.rootKey}
          onOpenFocus={(matrixId, rowId, key, label) =>
            controller.appendFocus(panelIndex(), matrixId, rowId, new Uint8Array(key), label)
          }
          onOpenFoldedFocus={(matrixId, rowId) =>
            void controller.openFoldedFocus(panelIndex(), matrixId, rowId)
          }
          focusedRowId={controller.focusedRowForNavigation(panelIndex())}
          onVisibleIdentitiesChange={(identities) =>
            props.sessionMemory?.replaceOnScreen(`stream:navigation:${panel.id}`, identities)
          }
        />
      )
    }

    return (
      <FocusPanel
        rootMatrixId={props.matrixId}
        matrixId={panel.matrixId}
        navigationOutline={navigationOutline()}
        rowId={panel.rowId}
        rowKey={panel.rowKey}
        foldedOrigin={panel.foldedOrigin}
        unresolvedPosition={panel.unresolvedPosition}
        active={shellPanel.active}
        onLabelResolved={(label) => controller.setFocusLabel(panel.id, label)}
        onAppendFocus={(matrixId, rowId, key, label) =>
          controller.appendFocus(panelIndex(), matrixId, rowId, new Uint8Array(key), label)
        }
        onReplaceFocus={(matrixId, rowId, key, label) =>
          controller.replaceFocus(panelIndex(), matrixId, rowId, new Uint8Array(key), label)
        }
        onOpenRowRef={(matrixId, rowId) =>
          void controller.openRowReference(panelIndex(), matrixId, rowId)
        }
        onOpenFoldedFocus={(matrixId, rowId) =>
          void controller.openFoldedFocus(panelIndex(), matrixId, rowId)
        }
        onCollapse={() => controller.closeFrom(panelIndex() + 1)}
        onClose={() => controller.closeFrom(panelIndex())}
      />
    )
  }

  return (
    <Suspense fallback={<div class="workspace-shell-loading">Loading…</div>}>
      <WorkspaceShell
        panels={shellPanels()}
        renderPanel={renderPanel}
        onAncestorSelect={(panelIndex, ancestor) =>
          controller.selectAncestor(panelIndex, ancestor)
        }
      />
    </Suspense>
  )
}

export default StreamView
