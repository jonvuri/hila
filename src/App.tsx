import {
  createSignal,
  lazy,
  onCleanup,
  onMount,
  Show,
  Suspense,
  type Component,
} from 'solid-js'

import type { FaceConfig } from './core/face-types'
import { registerFaceComponent } from './core/FaceRenderer'
import { getFaceConfigs, registerPlugin } from './core/client/matrix-client'
import { awaitWorkerReady } from './core/client/worker-client'
import { shortcuts } from './shortcuts'
import { inlineReferencesPlugin } from './editor/inlineref-plugin-def'
import { tagsPlugin } from './tags/tags-plugin'
import { workspacePlugin } from './workspace/workspace-plugin'
import { registerTableFaceType } from './table/table-plugin'
import TagPropertyPanel from './tags/TagPropertyPanel'

const SqlRunner = lazy(() => import('./SqlRunner'))
const MatrixBrowser = lazy(() => import('./admin/MatrixBrowser'))
const TableFace = lazy(() => import('./table/TableFace'))
const FaceConfigPanel = lazy(() => import('./core/FaceConfigPanel'))
const TagBrowserFace = lazy(() => import('./tags/TagBrowserFace'))
const StreamView = lazy(() => import('./workspace/StreamView'))

type ActiveView = 'workspace' | 'table' | 'tags'

const App: Component = () => {
  const [sidebarOpen, setSidebarOpen] = createSignal(false)
  const [activePanel, setActivePanel] = createSignal<'matrix' | 'sql'>('matrix')
  const [activeView, setActiveView] = createSignal<ActiveView>('workspace')
  const [tableFaceConfig, setTableFaceConfig] = createSignal<FaceConfig | null>(null)
  const [workspaceMatrixId, setWorkspaceMatrixId] = createSignal<number | null>(null)
  const [workspaceNavigateToRowId, setWorkspaceNavigateToRowId] = createSignal<number | null>(
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
    tagTypeColor: string | null
    anchorRect: DOMRect
  } | null>(null)

  const toggleSidebar = () => setSidebarOpen((prev) => !prev)

  const initPlugins = async () => {
    setWorkspaceMatrixId(null)
    setTableFaceConfig(null)

    await registerTableFaceType()
    const TableFaceComponent = (await import('./table/TableFace')).default
    registerFaceComponent('hila.table', TableFaceComponent)

    await registerPlugin(inlineReferencesPlugin)
    await registerPlugin(tagsPlugin)

    const workspaceCtx = await registerPlugin(workspacePlugin)
    const wsId = workspaceCtx.matrixIds['root']!
    setWorkspaceMatrixId(wsId)

    const configs = await getFaceConfigs(wsId)
    const tableConfig = configs.find((c) => c.faceTypeId === 'hila.table')
    if (tableConfig) setTableFaceConfig(tableConfig)
  }

  const handleTagPanelEvent = (e: Event) => {
    const detail = (e as CustomEvent).detail as {
      matrixId: number
      rowId: number
      tagTypeName: string
      tagTypeColor: string | null
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
        tagTypeColor: detail.tagTypeColor,
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
    shortcuts.install()

    const unregisterToggle = shortcuts.register({
      key: 'Mod-\\',
      handler: () => {
        toggleSidebar()
      },
    })

    document.addEventListener('inlineref-open-tag-panel', handleTagPanelEvent)

    void awaitWorkerReady().then(initPlugins)

    onCleanup(() => {
      unregisterToggle()
      shortcuts.uninstall()
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
              Workspace
            </button>
            <button
              class="view-tab"
              data-active={activeView() === 'table'}
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
                        navigateToRowId={workspaceNavigateToRowId()}
                        onNavigated={() => setWorkspaceNavigateToRowId(null)}
                      />
                    }
                  >
                    {(config) => (
                      <TableFace
                        config={config()}
                        bindings={{ bindings: [], overflowColumns: [] }}
                      />
                    )}
                  </Show>
                }
              >
                <TagBrowserFace
                  workspaceMatrixId={workspaceMatrixId() ?? undefined}
                  onNavigateToWorkspaceRow={(_matrixId, rowId) => {
                    setWorkspaceNavigateToRowId(rowId)
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
            tagTypeColor={panel().tagTypeColor}
            anchorRect={panel().anchorRect}
            onClose={() => setTagPanel(null)}
          />
        )}
      </Show>
    </div>
  )
}

export default App
