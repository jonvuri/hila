import { createMemo, Suspense } from 'solid-js'

import { resolveComponentVariant, type ComponentVariantConfig } from '../design/tokens'

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
}

type StreamShellPanel = WorkspaceShellPanel & {
  source: StreamPanel
}

const StreamView = (props: StreamViewProps) => {
  const controller = createStreamController(props)
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
            : `Focused row ${source.rowId}`
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
          onOpenFocus={(matrixId, rowId, key) =>
            controller.appendFocus(panelIndex(), matrixId, rowId, new Uint8Array(key))
          }
          onOpenFoldedFocus={(matrixId, rowId) =>
            void controller.openFoldedFocus(panelIndex(), matrixId, rowId)
          }
          focusedRowId={controller.focusedRowForNavigation(panelIndex())}
        />
      )
    }

    return (
      <FocusPanel
        matrixId={panel.matrixId}
        navigationOutline={navigationOutline()}
        rowId={panel.rowId}
        rowKey={panel.rowKey}
        foldedOrigin={panel.foldedOrigin}
        unresolvedPosition={panel.unresolvedPosition}
        active={shellPanel.active}
        onAppendFocus={(matrixId, rowId, key) =>
          controller.appendFocus(panelIndex(), matrixId, rowId, new Uint8Array(key))
        }
        onReplaceFocus={(matrixId, rowId, key) =>
          controller.replaceFocus(panelIndex(), matrixId, rowId, new Uint8Array(key))
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
