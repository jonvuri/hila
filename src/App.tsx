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
import type { PlaceNavigationTarget } from './core/place-navigation'
import TemporaryLegacyFaceAdapter, {
  registerTemporaryLegacyFaceComponent,
} from './core/TemporaryLegacyFaceAdapter'
import {
  PluginRegistrationSupersededError,
  disposePlugin,
  getFaceConfigs,
  registerPlugin,
} from './core/client/matrix-client'
import { awaitWorkerReady } from './core/client/worker-client'
import { resolveComponentVariant, type ComponentVariantConfig } from './design/tokens'
import { useQuery } from './sql/useQuery'
import { shortcuts } from './shortcuts'
import { inlineReferencesPlugin } from './editor/inlineref-plugin-def'
import { tagsPlugin } from './tags/tags-plugin'
import { workspacePlugin, buildMatrixTitleQuery } from './workspace/workspace-plugin'
import { registerTableFaceType } from './table/table-plugin'
import TagPropertyPanel from './tags/TagPropertyPanel'

const SqlRunner = lazy(() => import('./SqlRunner'))
const MatrixBrowser = lazy(() => import('./admin/MatrixBrowser'))
const FaceConfigPanel = lazy(() => import('./core/FaceConfigPanel'))
const TagBrowserFace = lazy(() => import('./tags/TagBrowserFace'))
const StreamView = lazy(() => import('./workspace/StreamView'))

type ActiveView = 'workspace' | 'table' | 'tags'

const App: Component = () => {
  let disposed = false
  const [sidebarOpen, setSidebarOpen] = createSignal(false)
  const [activePanel, setActivePanel] = createSignal<'matrix' | 'sql'>('matrix')
  const [activeView, setActiveView] = createSignal<ActiveView>('workspace')
  const [tableFaceConfig, setTableFaceConfig] = createSignal<FaceConfig | null>(null)
  const [workspaceFaceConfig, setWorkspaceFaceConfig] = createSignal<FaceConfig | null>(null)
  const [workspaceMatrixId, setWorkspaceMatrixId] = createSignal<number | null>(null)
  const [workspaceNavigateToPlace, setWorkspaceNavigateToPlace] =
    createSignal<PlaceNavigationTarget | null>(null)
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

  // Reactive workspace title for the tab label
  const wsTitleQuery = createMemo(() => {
    const wsId = workspaceMatrixId()
    return wsId ? buildMatrixTitleQuery(wsId) : ''
  })
  const { result: wsTitleResult } = useQuery(() => wsTitleQuery())
  const workspaceTabLabel = createMemo(
    () => (wsTitleResult()?.[0] as { title: string } | undefined)?.title || 'Workspace',
  )
  const workspaceComponentConfig = createMemo<ComponentVariantConfig>(() => ({
    navigationOutline: resolveComponentVariant(
      'navigationOutline',
      workspaceFaceConfig()?.settings.navigationOutline,
    ),
  }))

  const toggleSidebar = () => setSidebarOpen((prev) => !prev)

  const initPlugins = async (isDisposed: () => boolean = () => disposed) => {
    setWorkspaceMatrixId(null)
    setTableFaceConfig(null)
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
    const tableConfig = configs.find((c) => c.faceTypeId === 'hila.table')
    if (workspaceConfig) setWorkspaceFaceConfig(workspaceConfig)
    if (tableConfig) setTableFaceConfig(tableConfig)
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
      shortcuts.uninstall()
      void Promise.all(
        [inlineReferencesPlugin.id, tagsPlugin.id, workspacePlugin.id].map(disposePlugin),
      )
      document.removeEventListener('inlineref-open-tag-panel', handleTagPanelEvent)
    })
  })

  return (
    <div class="app-shell">
      <div class="app-main">
        <Show when={workspaceMatrixId()}>
          <div class="view-switcher">
            <button
              class="view-tab"
              data-active={activeView() === 'workspace'}
              data-testid="workspace-tab"
              onClick={() => setActiveView('workspace')}
            >
              {workspaceTabLabel()}
            </button>
            <button
              class="view-tab"
              data-active={activeView() === 'table'}
              data-testid="table-tab"
              onClick={() => setActiveView('table')}
            >
              Table
            </button>
            <button
              class="view-tab"
              data-active={activeView() === 'tags'}
              data-testid="tags-tab"
              onClick={() => setActiveView('tags')}
            >
              Tags
            </button>
            <button
              class="view-tab view-as-btn"
              onClick={() => {
                const mid = workspaceMatrixId()
                if (mid) setFaceConfigTarget({ matrixId: mid })
              }}
              data-testid="view-as-button"
            >
              View as…
            </button>
          </div>
        </Show>
        <Suspense fallback={<div class="app-loading">Loading…</div>}>
          <Show when={faceConfigTarget()}>
            {(target) => (
              <div class="face-config-overlay">
                <FaceConfigPanel
                  matrixId={target().matrixId}
                  initialFaceTypeId={target().initialFaceTypeId}
                  onApply={(config) => {
                    setFaceConfigTarget(null)
                    if (config.faceTypeId === 'hila.table') {
                      setTableFaceConfig(config)
                      setActiveView('table')
                    } else if (config.faceTypeId === 'hila.workspace') {
                      setWorkspaceFaceConfig(config)
                      setActiveView('workspace')
                    }
                  }}
                  onCancel={() => setFaceConfigTarget(null)}
                />
              </div>
            )}
          </Show>
          <Show when={workspaceMatrixId()} fallback={<div class="app-loading">Loading…</div>}>
            {(wsId) => (
              <Show
                when={activeView() === 'tags'}
                fallback={
                  <Show
                    when={activeView() === 'table' && tableFaceConfig()}
                    fallback={
                      <StreamView
                        matrixId={wsId()}
                        componentConfig={workspaceComponentConfig()}
                        navigateToPlace={workspaceNavigateToPlace()}
                        onNavigated={() => setWorkspaceNavigateToPlace(null)}
                      />
                    }
                  >
                    {(config) => <TemporaryLegacyFaceAdapter config={config()} columns={[]} />}
                  </Show>
                }
              >
                <TagBrowserFace
                  workspaceMatrixId={workspaceMatrixId() ?? undefined}
                  onNavigateToWorkspaceRow={(matrixId, rowId) => {
                    setWorkspaceNavigateToPlace({
                      type: 'node',
                      node: { matrixId, rowId },
                    })
                    setActiveView('workspace')
                  }}
                  onOpenTableFace={(targetMatrixId) => {
                    void getFaceConfigs(targetMatrixId).then((configs) => {
                      const tableConfig = configs.find((c) => c.faceTypeId === 'hila.table')
                      if (tableConfig) {
                        setTableFaceConfig(tableConfig)
                        setActiveView('table')
                      }
                    })
                  }}
                />
              </Show>
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
    </div>
  )
}

export default App
