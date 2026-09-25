import {
  createMemo,
  createSignal,
  lazy,
  onCleanup,
  onMount,
  Show,
  Suspense,
  type Component,
} from 'solid-js'

import type { FaceConfig } from './core/face-types'
import { FaceFidelityRoot, useFaceFidelity } from './core/face-runtime'
import type { PlaceNavigationTarget } from './core/place-navigation'
import { registerTemporaryLegacyFaceComponent } from './core/TemporaryLegacyFaceAdapter'
import {
  PluginRegistrationSupersededError,
  applyFaceToMatrix,
  disposePlugin,
  getFaceConfigs,
  registerPlugin,
} from './core/client/matrix-client'
import { awaitWorkerReady } from './core/client/worker-client'
import {
  resolveComponentVariant,
  resolveVisualTheme,
  type ComponentVariantConfig,
} from './design/tokens'
import QuickLauncher from './launcher/QuickLauncher'
import { captureLauncherInvocation, type LauncherInvocation } from './launcher/invocation'
import { shortcuts } from './shortcuts'
import { inlineReferencesPlugin } from './editor/inlineref-plugin-def'
import { setPendingNewTable } from './editor/pending-table'
import { insertInlineRefFromInvocation } from './editor/active-editor'
import { tagsPlugin } from './tags/tags-plugin'
import { workspacePlugin } from './workspace/workspace-plugin'
import { registerTableFaceType } from './table/table-plugin'
import { requestGeneratedViewNameFocus } from './workspace/pending-view-name-focus'
import TagPropertyPanel from './tags/TagPropertyPanel'
import { createSessionMemoryStore } from './session/session-memory'
import type { NodeRef } from './core/tree'

const SqlRunner = lazy(() => import('./SqlRunner'))
const MatrixBrowser = lazy(() => import('./admin/MatrixBrowser'))
const FaceConfigPanel = lazy(() => import('./core/FaceConfigPanel'))
const StreamView = lazy(() => import('./workspace/StreamView'))

const AppContent: Component = () => {
  const fidelity = useFaceFidelity()
  let disposed = false
  const sessionMemory = createSessionMemoryStore()
  const [sidebarOpen, setSidebarOpen] = createSignal(false)
  const [activePanel, setActivePanel] = createSignal<'matrix' | 'sql'>('matrix')
  const [workspaceFaceConfig, setWorkspaceFaceConfig] = createSignal<FaceConfig | null>(null)
  const [workspaceMatrixId, setWorkspaceMatrixId] = createSignal<number | null>(null)
  const [workspaceNavigateToPlace, setWorkspaceNavigateToPlace] =
    createSignal<PlaceNavigationTarget | null>(null)
  const [launcherInvocation, setLauncherInvocation] = createSignal<LauncherInvocation | null>(
    null,
  )
  const [faceConfigTarget, setFaceConfigTarget] = createSignal<{
    matrixId: number
    initialFaceTypeId?: string
  } | null>(null)

  const [tagPanel, setTagPanel] = createSignal<{
    matrixId: number
    rowId: number
    tagTypeName: string
    anchorRect: DOMRect
  } | null>(null)

  const workspaceComponentConfig = createMemo<ComponentVariantConfig>(() => ({
    navigationOutline: resolveComponentVariant(
      'navigationOutline',
      workspaceFaceConfig()?.settings.navigationOutline,
    ),
  }))

  const toggleSidebar = () => setSidebarOpen((prev) => !prev)

  const toggleLauncher = () => {
    setLauncherInvocation((current) =>
      current ? null : captureLauncherInvocation(document.activeElement),
    )
  }

  const focusCreatedTable = (matrixId: number, subject: NodeRef) => {
    void applyFaceToMatrix('hila.table', matrixId).then(() => {
      setPendingNewTable(matrixId)
      setWorkspaceNavigateToPlace({ type: 'node', node: subject })
    })
  }

  const initPlugins = async (isDisposed: () => boolean = () => disposed) => {
    setLauncherInvocation(null)
    sessionMemory.reset()
    setWorkspaceMatrixId(null)
    setWorkspaceFaceConfig(null)

    await registerTableFaceType()
    if (isDisposed()) return
    const TableFaceComponent = (await import('./table/TableFace')).default
    if (isDisposed()) return
    registerTemporaryLegacyFaceComponent('hila.table', TableFaceComponent)

    await registerPlugin(inlineReferencesPlugin)
    if (isDisposed()) return
    await registerPlugin(tagsPlugin)
    if (isDisposed()) return

    const workspaceCtx = await registerPlugin(workspacePlugin)
    if (isDisposed()) return
    const wsId = workspaceCtx.matrixIds['root']!
    setWorkspaceMatrixId(wsId)

    const configs = await getFaceConfigs(wsId)
    if (isDisposed()) return
    const workspaceConfig = configs.find((c) => c.faceTypeId === 'hila.workspace')
    if (workspaceConfig) setWorkspaceFaceConfig(workspaceConfig)
  }

  const handleTagPanelEvent = (e: Event) => {
    const detail = (e as CustomEvent).detail as {
      matrixId: number
      rowId: number
      tagTypeName: string
      anchorRect: {
        top: number
        left: number
        bottom: number
        right: number
        width: number
        height: number
      }
    }
    if (detail?.matrixId != null && detail?.rowId != null) {
      setTagPanel({
        matrixId: detail.matrixId,
        rowId: detail.rowId,
        tagTypeName: detail.tagTypeName,
        anchorRect: new DOMRect(
          detail.anchorRect.left,
          detail.anchorRect.top,
          detail.anchorRect.width,
          detail.anchorRect.height,
        ),
      })
    }
  }

  onMount(() => {
    disposed = false
    shortcuts.install()

    const unregisterToggle = shortcuts.register({
      id: 'app.toggle-sidebar',
      title: 'Toggle sidebar',
      key: 'Mod-\\',
      handler: () => {
        toggleSidebar()
      },
    })
    const unregisterLauncher = shortcuts.register({
      id: 'app.open-launcher',
      title: 'Open launcher',
      key: 'Mod-k',
      handler: toggleLauncher,
    })

    document.addEventListener('inlineref-open-tag-panel', handleTagPanelEvent)

    const initializePlugins = async () => {
      try {
        await awaitWorkerReady()
        if (!disposed) await initPlugins(() => disposed)
      } catch (error) {
        if (!(disposed && error instanceof PluginRegistrationSupersededError)) {
          console.error('plugin initialization failed', error)
        }
      }
    }

    void initializePlugins()

    onCleanup(() => {
      disposed = true
      unregisterToggle()
      unregisterLauncher()
      shortcuts.uninstall()
      void Promise.all(
        [inlineReferencesPlugin.id, tagsPlugin.id, workspacePlugin.id].map(disposePlugin),
      )
      document.removeEventListener('inlineref-open-tag-panel', handleTagPanelEvent)
    })
  })

  return (
    <div
      class="app-shell"
      data-fidelity={fidelity.fidelity()}
      data-x-ray={fidelity.xray() ? 'true' : undefined}
    >
      <div class="app-main">
        <Suspense fallback={<div class="app-loading">Loading…</div>}>
          <Show when={faceConfigTarget()}>
            {(target) => (
              <div class="face-config-overlay">
                <FaceConfigPanel
                  matrixId={target().matrixId}
                  initialFaceTypeId={target().initialFaceTypeId}
                  onApply={(config) => {
                    setFaceConfigTarget(null)
                    if (config.faceTypeId === 'hila.workspace') {
                      setWorkspaceFaceConfig(config)
                    }
                  }}
                  onCancel={() => setFaceConfigTarget(null)}
                />
              </div>
            )}
          </Show>
          <Show when={workspaceMatrixId()} fallback={<div class="app-loading">Loading…</div>}>
            {(wsId) => (
              <StreamView
                matrixId={wsId()}
                componentConfig={workspaceComponentConfig()}
                navigateToPlace={workspaceNavigateToPlace()}
                onNavigated={() => setWorkspaceNavigateToPlace(null)}
                sessionMemory={sessionMemory}
              />
            )}
          </Show>
        </Suspense>
      </div>

      <Show when={!sidebarOpen()}>
        <button
          class="sidebar-toggle"
          onClick={toggleSidebar}
          title="Toggle dev tools (Cmd/Ctrl+\)"
          aria-label="Toggle dev tools"
        >
          ⚙
        </button>
      </Show>

      <Show when={sidebarOpen()}>
        <div class="app-sidebar">
          <div class="sidebar-header">
            <span class="sidebar-title">Dev Tools</span>
            <button
              class="sidebar-close"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              ×
            </button>
          </div>
          <div class="sidebar-tabs">
            <button
              class="sidebar-tab"
              data-active={activePanel() === 'matrix'}
              onClick={() => setActivePanel('matrix')}
            >
              Matrix Browser
            </button>
            <button
              class="sidebar-tab"
              data-active={activePanel() === 'sql'}
              onClick={() => setActivePanel('sql')}
            >
              SQL Runner
            </button>
          </div>
          <Suspense fallback={<div class="app-loading">Loading…</div>}>
            <div class="sidebar-content">
              {activePanel() === 'matrix' && (
                <MatrixBrowser
                  onReset={initPlugins}
                  onApplyFace={(matrixId) => setFaceConfigTarget({ matrixId })}
                />
              )}
              {activePanel() === 'sql' && <SqlRunner />}
            </div>
          </Suspense>
        </div>
      </Show>

      <Show when={tagPanel()}>
        {(panel) => (
          <TagPropertyPanel
            matrixId={panel().matrixId}
            rowId={panel().rowId}
            tagTypeName={panel().tagTypeName}
            anchorRect={panel().anchorRect}
            onClose={() => setTagPanel(null)}
          />
        )}
      </Show>

      <Show when={launcherInvocation()}>
        {(invocation) => (
          <QuickLauncher
            rootMatrixId={workspaceMatrixId()}
            visualTheme={resolveVisualTheme(document.documentElement.dataset.visualTheme)}
            invocation={invocation()}
            sessionMemory={sessionMemory}
            commandCapabilities={{ focusCreatedTable }}
            insertRef={(target) => {
              const editor = invocation().editor
              if (!editor) return 'Open the launcher from an editor to insert a reference.'
              const result = insertInlineRefFromInvocation(editor, {
                targetMatrixId: target.matrixId,
                targetRowId: target.rowId,
                cachedTitle: target.cachedTitle,
              })
              if (result.ok) return null
              return result.reason === 'editor-unmounted' ?
                  'The invoking editor is no longer open.'
                : 'The invoking editor changed while the launcher was open.'
            }}
            onSavedView={(marker, _generatedName, provenance) => {
              requestGeneratedViewNameFocus(marker)
              setWorkspaceNavigateToPlace({ type: 'node', node: marker, provenance })
            }}
            onNavigate={(target) => {
              setWorkspaceNavigateToPlace(target)
            }}
            onDismiss={() => setLauncherInvocation(null)}
          />
        )}
      </Show>
    </div>
  )
}

const App: Component = () => (
  <FaceFidelityRoot>
    <AppContent />
  </FaceFidelityRoot>
)

export default App
