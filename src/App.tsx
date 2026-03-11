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
import { outlinePlugin, registerOutlineFaceType } from './outline/outline-plugin'
import { registerTableFaceType } from './table/table-plugin'

const SqlRunner = lazy(() => import('./SqlRunner'))
const MatrixDebug = lazy(() => import('./MatrixDebug'))
const OutlineFace = lazy(() => import('./outline/OutlineFace'))
const TableFace = lazy(() => import('./table/TableFace'))

const App: Component = () => {
  const [sidebarOpen, setSidebarOpen] = createSignal(false)
  const [activePanel, setActivePanel] = createSignal<'matrix' | 'sql'>('matrix')
  const [outlineMatrixId, setOutlineMatrixId] = createSignal<number | null>(null)
  const [activeView, setActiveView] = createSignal<'outline' | 'table'>('outline')
  const [tableFaceConfig, setTableFaceConfig] = createSignal<FaceConfig | null>(null)

  const toggleSidebar = () => setSidebarOpen((prev) => !prev)

  const initPlugins = async () => {
    await registerTableFaceType()
    const TableFaceComponent = (await import('./table/TableFace')).default
    registerFaceComponent('hila.table', TableFaceComponent)

    await registerOutlineFaceType()
    const ctx = await registerPlugin(outlinePlugin)
    const matrixId = ctx.matrixIds['root']!
    setOutlineMatrixId(matrixId)

    const configs = await getFaceConfigs(matrixId)
    const tableConfig = configs.find((c) => c.faceTypeId === 'hila.table')
    if (tableConfig) setTableFaceConfig(tableConfig)
  }

  onMount(() => {
    shortcuts.install()

    const unregisterToggle = shortcuts.register({
      key: 'Mod-\\',
      handler: () => {
        toggleSidebar()
      },
    })

    void awaitWorkerReady().then(initPlugins)

    onCleanup(() => {
      unregisterToggle()
      shortcuts.uninstall()
    })
  })

  return (
    <div class="app-shell">
      <div class="app-main">
        <Show when={outlineMatrixId()}>
          <div class="view-switcher">
            <button
              class="view-tab"
              data-active={activeView() === 'outline'}
              onClick={() => setActiveView('outline')}
            >
              Outline
            </button>
            <button
              class="view-tab"
              data-active={activeView() === 'table'}
              onClick={() => setActiveView('table')}
            >
              Table
            </button>
          </div>
        </Show>
        <Suspense fallback={<div class="app-loading">Loading…</div>}>
          <Show when={outlineMatrixId()} fallback={<div class="app-loading">Loading…</div>}>
            {(matrixId) => (
              <Show
                when={activeView() === 'table' && tableFaceConfig()}
                fallback={<OutlineFace matrixId={matrixId()} />}
              >
                {(config) => (
                  <TableFace
                    config={config()}
                    bindings={{ bindings: [], overflowColumns: [] }}
                  />
                )}
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
              Matrix Debug
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
              {activePanel() === 'matrix' && <MatrixDebug onReset={initPlugins} />}
              {activePanel() === 'sql' && <SqlRunner />}
            </div>
          </Suspense>
        </div>
      </Show>
    </div>
  )
}

export default App
